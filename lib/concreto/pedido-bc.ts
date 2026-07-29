import type sqlModule from 'mssql';
import { sql } from '@/lib/db-adelantedb';
import { getBCToken, bcConfigured } from '@/lib/bc-client';
import type {
  CrearPedidoEnsambladoBCResponse,
  LineaPedidoEnsamblado,
  OpcionesCrearPedidoBC,
  PreviewPedidoEnsambladoBC,
} from './tipos-deps';
import { MAP_ADITIVO_POSICION_A_CODIGO_BC, resolverCodigoBcDeArido } from './mapeo-materiales';

/**
 * Lógica de dominio para crear un Pedido de Ensamblado (Assembly Order) en
 * Business Central a partir de una colada de la planta.
 *
 * Portado de `pedido-ensamblado-bc-dominio.ts` + `obtener-colada.ts` de la app
 * original. La construcción de líneas de materiales (conversión de unidades) y
 * la línea de recurso BC son EXACTAS al repo.
 *
 * Reúso de infra BC: token y check de configuración salen de `@/lib/bc-client`
 * (getBCToken, bcConfigured). Las rutas OData V4 de AssemblyOrder se arman acá
 * porque el web service de ensamblado usa el path `Company('NOMBRE')/...` (no el
 * `api/adelante/project/v1.0/companies(GUID)` que usa el resto de bc-client).
 *
 * Mapping colada → BC:
 *   - Header.Item_No        → recetas_bc.codigo_bc (M10-xxxx) de la colada.
 *   - Header.Quantity       → coladas.m3_producidos.
 *   - Header.Location_Code  → almacén destino (input; default obra_works_no).
 *   - Header.Posting/Due    → fecha de registro (default hoy).
 *   - Líneas                → BC las genera automático desde la BOM del Item.
 *
 * Idempotencia: si la colada ya tiene `numero_pedido_ensamblado_bc`, se lanza
 * ErrorPedidoBC con codigo 'YA_TIENE_PEDIDO_BC' (409).
 */

export class ErrorPedidoBC extends Error {
  status: number;
  codigo: string;
  detalles: unknown;
  constructor(status: number, codigo: string, mensaje: string, detalles: unknown = undefined) {
    super(mensaje);
    this.name = 'ErrorPedidoBC';
    this.status = status;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

// =============================================================================
// Cliente OData V4 de BC (reúsa el token cacheado de bc-client)
// =============================================================================

/** Raíz del entorno BC — misma convención que lib/bc-client.ts. */
function bcRoot(): string {
  return (
    process.env.BC_BASE_URL ??
    `https://api.businesscentral.dynamics.com/v2.0/${process.env.BC_TENANT_ID}/${process.env.BC_ENVIRONMENT}`
  );
}

/**
 * URL prefijada con Company('NOMBRE') para los web services OData del ensamblado.
 * Requiere BC_COMPANY (nombre exacto de la empresa en BC, ej.
 * ADELANTE_DESARROLLOS_NUEVA). Nota: es distinto de BC_COMPANY_ID (GUID) que usa
 * el resto de bc-client para el API estándar.
 */
function urlEmpresaBC(): string {
  const company = process.env.BC_COMPANY;
  if (!company) {
    throw new ErrorPedidoBC(
      501,
      'CONFIG_INCOMPLETA',
      'Falta BC_COMPANY (nombre de la empresa en BC) para el pedido de ensamblado.',
    );
  }
  return `${bcRoot()}/ODataV4/Company('${encodeURIComponent(company)}')`;
}

interface OpcionesFetchBC {
  metodo?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Llama a un endpoint OData de BC con auth bearer (token de bc-client).
 * 2xx → JSON (o {} si vacío); otros → ErrorPedidoBC con el body de BC.
 */
async function llamarBC<T = unknown>(ruta: string, opciones: OpcionesFetchBC = {}): Promise<T> {
  const token = await getBCToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...(opciones.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...opciones.headers,
  };

  const r = await fetch(ruta, {
    method: opciones.metodo ?? 'GET',
    headers,
    body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
    cache: 'no-store',
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    let bodyParseado: unknown = txt;
    try {
      bodyParseado = JSON.parse(txt);
    } catch {
      /* no era JSON */
    }
    const mensajeBC =
      (bodyParseado as { error?: { message?: string } })?.error?.message ??
      `BC respondió ${r.status}`;
    const codigoBC =
      (bodyParseado as { error?: { code?: string } })?.error?.code ?? 'BC_ERROR';
    throw new ErrorPedidoBC(r.status, codigoBC, `BC rechazó la operación: ${mensajeBC}`, bodyParseado);
  }

  if (r.status === 204) return {} as T;
  const texto = await r.text();
  if (!texto) return {} as T;
  return JSON.parse(texto) as T;
}

/** Deep-link a la página del pedido en BC (null si falta config). */
function deepLinkPedidoEnsamblado(numeroPedido: string): string | null {
  const tenant = process.env.BC_TENANT_ID;
  const environment = process.env.BC_ENVIRONMENT;
  const company = process.env.BC_COMPANY;
  if (!tenant || !environment || !company) return null;
  const baseUI = `https://businesscentral.dynamics.com/${tenant}/${environment}`;
  const params = new URLSearchParams({
    company,
    page: '900', // Assembly Order
    filter: `'No.' IS '${numeroPedido}'`,
  });
  return `${baseUI}/?${params.toString()}`;
}

// =============================================================================
// Lectura de la colada
// =============================================================================

interface FilaColadaBC {
  id_colada: number;
  codigo_interno: number;
  fecha_inicio: Date;
  m3_producidos: number;
  numero_pedido_ensamblado_bc: string | null;
  obra_works_no: string | null;
  obra_display_name: string | null;
  codigo_bc: string | null;
  descripcion_receta_bc: string | null;
  codigo_recurso_bc: string | null;
  recurso_bc_descripcion: string | null;
}

/**
 * Lee la colada + receta_bc + obra en una sola query. Devuelve null si no
 * existe. Nota: la PK de hor.coladas es `id_colada` (excepción histórica) y el
 * JOIN con bi.dim_obra necesita COLLATE DATABASE_DEFAULT en ambos lados.
 */
async function leerColadaParaBC(
  pool: sqlModule.ConnectionPool,
  idColada: number,
): Promise<FilaColadaBC | null> {
  const r = await pool
    .request()
    .input('id', sql.Int, idColada)
    .query<FilaColadaBC>(`
      SELECT
        c.id_colada,
        c.codigo_interno,
        c.fecha_inicio,
        c.m3_producidos,
        c.numero_pedido_ensamblado_bc,
        c.obra_works_no,
        obra.display_name AS obra_display_name,
        rbc.codigo_bc,
        rbc.descripcion AS descripcion_receta_bc,
        rbc.codigo_recurso_bc,
        rbc.recurso_bc_descripcion
      FROM hor.coladas c
      LEFT JOIN hor.recetas_bc rbc
        ON rbc.id = c.id_receta_bc
      LEFT JOIN bi.dim_obra obra
        ON obra.works_no COLLATE DATABASE_DEFAULT = c.obra_works_no COLLATE DATABASE_DEFAULT
      WHERE c.id_colada = @id
    `);
  return r.recordset[0] ?? null;
}

// =============================================================================
// Construcción de líneas de materiales (EXACTO al repo obtener-colada.ts)
// =============================================================================

interface MaterialRow {
  id: number;
  codigoBc: string;
  nombre: string;
  tipo: string;
  unidad_bc: string;
  unidad_blend: string;
  densidad_kg_m3: number | null;
}

function redondear(n: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
}

/**
 * Construye una línea con la conversión de unidad si corresponde. Si
 * unidad_bc='m3' y unidad_blend='kg', divide por densidad_kg_m3 (si NULL → no
 * convierte, deja kg).
 */
function armarLinea(
  mat: MaterialRow,
  totalBlend: number,
  m3ProducidosColada: number,
): LineaPedidoEnsamblado {
  let cantidadFinal = totalBlend;
  if (mat.unidad_bc === 'm3' && mat.unidad_blend === 'kg' && mat.densidad_kg_m3) {
    cantidadFinal = totalBlend / Number(mat.densidad_kg_m3);
  }
  const ratio = m3ProducidosColada > 0 ? cantidadFinal / m3ProducidosColada : 0;
  return {
    codigo_bc: mat.codigoBc,
    descripcion_bc: mat.nombre,
    um_bc: mat.unidad_bc,
    cantidad_total_consumida: redondear(cantidadFinal, 4),
    ratio_por_m3: redondear(ratio, 4),
    cantidad_total_teorica: null,
    desviacion_pct: null,
  };
}

function agregarLineaArido(args: {
  lineas: LineaPedidoEnsamblado[];
  nombreCsv: string | null;
  totalKg: number;
  matsPorCodigoBc: Map<string, MaterialRow>;
  m3ProducidosColada: number;
}): void {
  const codigoBc = resolverCodigoBcDeArido(args.nombreCsv);
  if (!codigoBc) {
    if (args.nombreCsv && args.totalKg > 0) {
      console.warn(
        `pedido-bc: árido "${args.nombreCsv}" no matchea ningún material BC. Línea omitida.`,
      );
    }
    return;
  }
  const mat = args.matsPorCodigoBc.get(codigoBc);
  if (!mat) return;
  args.lineas.push(armarLinea(mat, args.totalKg, args.m3ProducidosColada));
}

function agregarLineaPorTipo(args: {
  lineas: LineaPedidoEnsamblado[];
  tipo: string;
  totalBlend: number;
  matsPorTipo: Map<string, MaterialRow>;
  m3ProducidosColada: number;
}): void {
  const mat = args.matsPorTipo.get(args.tipo);
  if (!mat) return;
  args.lineas.push(armarLinea(mat, args.totalBlend, args.m3ProducidosColada));
}

/**
 * Suma consumos por columna física (batches NO excluidos) y arma las líneas de
 * materiales (áridos A/B, cemento, agua, aditivos posicionales).
 */
async function construirLineasPedido(
  pool: sqlModule.ConnectionPool,
  args: { idColada: number; m3ProducidosColada: number },
): Promise<LineaPedidoEnsamblado[]> {
  const { idColada, m3ProducidosColada } = args;

  const rConsumos = await pool
    .request()
    .input('id', sql.Int, idColada)
    .query<{
      arido_a_nombre: string | null;
      arido_a_total_kg: number | null;
      arido_b_nombre: string | null;
      arido_b_total_kg: number | null;
      cemento_total_kg: number | null;
      agua_total_l: number | null;
      aditivo1_total_l: number | null;
      aditivo2_total_l: number | null;
      aditivo3_total_l: number | null;
    }>(`
      SELECT
        (SELECT TOP 1 b.arido_a_nombre
         FROM hor.batches b
         JOIN hor.colada_batches cb ON cb.id_batch = b.id
         WHERE cb.id_colada = @id AND cb.excluido = 0 AND b.arido_a_nombre IS NOT NULL
         ORDER BY b.fecha_inicio)                                    AS arido_a_nombre,
        SUM(CASE WHEN cb.excluido = 0 THEN b.arido_a_kg ELSE 0 END)  AS arido_a_total_kg,
        (SELECT TOP 1 b.arido_b_nombre
         FROM hor.batches b
         JOIN hor.colada_batches cb ON cb.id_batch = b.id
         WHERE cb.id_colada = @id AND cb.excluido = 0 AND b.arido_b_nombre IS NOT NULL
         ORDER BY b.fecha_inicio)                                    AS arido_b_nombre,
        SUM(CASE WHEN cb.excluido = 0 THEN b.arido_b_kg ELSE 0 END)  AS arido_b_total_kg,
        SUM(CASE WHEN cb.excluido = 0 THEN b.cemento_kg ELSE 0 END)  AS cemento_total_kg,
        SUM(CASE WHEN cb.excluido = 0 THEN b.agua_l ELSE 0 END)      AS agua_total_l,
        SUM(CASE WHEN cb.excluido = 0 THEN b.aditivo1_l ELSE 0 END)  AS aditivo1_total_l,
        SUM(CASE WHEN cb.excluido = 0 THEN b.aditivo2_l ELSE 0 END)  AS aditivo2_total_l,
        SUM(CASE WHEN cb.excluido = 0 THEN b.aditivo3_l ELSE 0 END)  AS aditivo3_total_l
      FROM hor.batches b
      JOIN hor.colada_batches cb ON cb.id_batch = b.id
      WHERE cb.id_colada = @id
    `);

  const consumos = rConsumos.recordset[0];
  if (!consumos) return [];

  const rMats = await pool.request().query<MaterialRow>(`
    SELECT id, codigo_bc AS codigoBc, nombre, tipo, unidad_bc, unidad_blend, densidad_kg_m3
    FROM hor.materiales
    WHERE activo = 1
  `);
  const matsPorCodigoBc = new Map<string, MaterialRow>();
  const matsPorTipo = new Map<string, MaterialRow>();
  for (const m of rMats.recordset) {
    matsPorCodigoBc.set(m.codigoBc, m);
    matsPorTipo.set(m.tipo, m);
  }

  const lineas: LineaPedidoEnsamblado[] = [];

  agregarLineaArido({
    lineas,
    nombreCsv: consumos.arido_a_nombre,
    totalKg: Number(consumos.arido_a_total_kg ?? 0),
    matsPorCodigoBc,
    m3ProducidosColada,
  });
  agregarLineaArido({
    lineas,
    nombreCsv: consumos.arido_b_nombre,
    totalKg: Number(consumos.arido_b_total_kg ?? 0),
    matsPorCodigoBc,
    m3ProducidosColada,
  });
  agregarLineaPorTipo({
    lineas,
    tipo: 'cemento',
    totalBlend: Number(consumos.cemento_total_kg ?? 0),
    matsPorTipo,
    m3ProducidosColada,
  });
  agregarLineaPorTipo({
    lineas,
    tipo: 'agua',
    totalBlend: Number(consumos.agua_total_l ?? 0),
    matsPorTipo,
    m3ProducidosColada,
  });

  const aditivos: Array<{ slot: 1 | 2 | 3; total: number }> = [
    { slot: 1, total: Number(consumos.aditivo1_total_l ?? 0) },
    { slot: 2, total: Number(consumos.aditivo2_total_l ?? 0) },
    { slot: 3, total: Number(consumos.aditivo3_total_l ?? 0) },
  ];
  for (const { slot, total } of aditivos) {
    const codigoBc = MAP_ADITIVO_POSICION_A_CODIGO_BC.get(slot);
    if (!codigoBc) continue; // slot 2 no tiene material asociado
    const mat = matsPorCodigoBc.get(codigoBc);
    if (!mat) continue;
    lineas.push(armarLinea(mat, total, m3ProducidosColada));
  }

  return lineas;
}

// =============================================================================
// Preview
// =============================================================================

/**
 * Arma el preview de lo que se enviará a BC (sin llamar a BC): header resuelto
 * + líneas de materiales + bloqueantes. Devuelve null si la colada no existe.
 */
export async function previewPedidoEnsamblado(
  pool: sqlModule.ConnectionPool,
  idColada: number,
): Promise<PreviewPedidoEnsambladoBC | null> {
  const c = await leerColadaParaBC(pool, idColada);
  if (!c) return null;

  const m3 = Number(c.m3_producidos);

  const bloqueantes: string[] = [];
  if (!c.codigo_bc) {
    bloqueantes.push('La colada no tiene receta BC mapeada (no hay producto M10 asociado).');
  }
  if (!(m3 > 0)) {
    bloqueantes.push('La cantidad total de m³ de la colada es 0 o inválida.');
  }
  if (!c.obra_works_no) {
    bloqueantes.push('La colada no tiene obra asignada. Se necesita para el almacén destino.');
  }
  if (c.numero_pedido_ensamblado_bc) {
    bloqueantes.push(`La colada ya tiene el pedido BC ${c.numero_pedido_ensamblado_bc}.`);
  }

  const lineas = await construirLineasPedido(pool, {
    idColada,
    m3ProducidosColada: m3,
  });

  // Línea de Recurso BC al final (sale de la receta_bc, no de la planta).
  if (c.codigo_recurso_bc && c.codigo_recurso_bc.trim() !== '') {
    lineas.push({
      codigo_bc: c.codigo_recurso_bc,
      descripcion_bc: c.recurso_bc_descripcion ?? c.codigo_recurso_bc,
      um_bc: 'm3',
      cantidad_total_consumida: redondear(m3, 4),
      ratio_por_m3: 1,
      cantidad_total_teorica: null,
      desviacion_pct: null,
    });
  }

  return {
    id_colada: Number(c.id_colada),
    codigo_interno_colada: String(c.codigo_interno),
    fecha_colada:
      c.fecha_inicio instanceof Date ? c.fecha_inicio.toISOString() : String(c.fecha_inicio),
    codigo_producto_bc: c.codigo_bc,
    descripcion_producto_bc: c.descripcion_receta_bc,
    codigo_recurso_bc: c.codigo_recurso_bc,
    recurso_bc_descripcion: c.recurso_bc_descripcion,
    cantidad_m3: m3,
    obra_works_no: c.obra_works_no,
    obra_display_name: c.obra_display_name,
    numero_pedido_bc_existente: c.numero_pedido_ensamblado_bc,
    bloqueantes,
    lineas,
  };
}

// =============================================================================
// Creación del pedido
// =============================================================================

interface PayloadHeaderBC {
  Posting_Date: string;
  Due_Date: string;
  Item_No: string;
  Quantity: number;
  Location_Code: string;
}

const ALMACEN_COMPONENTES = 'ALM-GRAL';

interface FilaLineaAssemblyBC {
  Document_Type: string;
  Document_No: string;
  Line_No: number;
  Type: string;
  No?: string;
  Location_Code?: string;
}

/**
 * Tras crear el header, BC autogenera las líneas copiando el Location_Code del
 * header (almacén obra). Las líneas de tipo Item las movemos a ALM-GRAL (la
 * materia prima sale del almacén central). Best-effort: si falla, se loguea y
 * NO se aborta (el pedido ya existe en BC).
 */
async function ajustarAlmacenLineasComponente(numeroPedido: string): Promise<void> {
  const urlLineas = `${urlEmpresaBC()}/AssemblyOrderLine?$filter=Document_No eq '${encodeURIComponent(numeroPedido)}'`;
  const resp = await llamarBC<{ value?: FilaLineaAssemblyBC[] }>(urlLineas);
  const lineas = resp.value ?? [];

  const lineasItem = lineas.filter(
    (l) => l.Type === 'Item' && l.Location_Code !== ALMACEN_COMPONENTES,
  );

  let ultimoError: unknown = null;
  for (const linea of lineasItem) {
    const urlLinea =
      `${urlEmpresaBC()}/AssemblyOrderLine(` +
      `Document_Type='${encodeURIComponent(linea.Document_Type)}',` +
      `Document_No='${encodeURIComponent(linea.Document_No)}',` +
      `Line_No=${linea.Line_No})`;
    try {
      await llamarBC(urlLinea, {
        metodo: 'PATCH',
        headers: { 'If-Match': '*' },
        body: { Location_Code: ALMACEN_COMPONENTES },
      });
    } catch (e) {
      console.error(
        `[pedido-bc] PATCH almacén falló para ${linea.Document_No}/${linea.Line_No}:`,
        e instanceof Error ? e.message : e,
      );
      ultimoError = e;
    }
  }
  if (ultimoError) throw ultimoError;
}

/**
 * Crea el pedido en BC y persiste el N° generado en la colada + auditoría de
 * digitación (actor = email de la sesión).
 *
 * Idempotente: si la colada ya tiene numero_pedido_ensamblado_bc → 409
 * ('YA_TIENE_PEDIDO_BC'). Si el POST a BC falla, NO se toca la DB.
 */
export async function crearPedidoEnsamblado(
  pool: sqlModule.ConnectionPool,
  idColada: number,
  actorEmail: string,
  opciones: OpcionesCrearPedidoBC = {},
): Promise<CrearPedidoEnsambladoBCResponse> {
  if (!bcConfigured()) {
    throw new ErrorPedidoBC(
      501,
      'BC_NO_CONFIGURADO',
      'La integración con Business Central no está configurada (faltan envs BC_*).',
    );
  }

  const c = await leerColadaParaBC(pool, idColada);
  if (!c) {
    throw new ErrorPedidoBC(404, 'COLADA_NO_ENCONTRADA', `Colada ${idColada} no existe.`);
  }

  if (c.numero_pedido_ensamblado_bc) {
    throw new ErrorPedidoBC(
      409,
      'YA_TIENE_PEDIDO_BC',
      `La colada ya tiene el pedido BC ${c.numero_pedido_ensamblado_bc}. Limpiá el campo o anulalo en BC para re-generarlo.`,
      { numero_pedido_existente: c.numero_pedido_ensamblado_bc },
    );
  }

  const codigoProducto = opciones.codigoProductoBc ?? c.codigo_bc;
  if (!codigoProducto) {
    throw new ErrorPedidoBC(
      422,
      'SIN_RECETA_BC',
      'La colada no tiene receta BC mapeada y no se envió override de código de producto.',
    );
  }

  const cantidad = opciones.cantidadM3 ?? Number(c.m3_producidos);
  if (!(cantidad > 0)) {
    throw new ErrorPedidoBC(422, 'CANTIDAD_INVALIDA', `Cantidad inválida: ${cantidad}. Debe ser > 0.`);
  }

  const almacenDestino = (opciones.codigoAlmacenDestino ?? c.obra_works_no ?? '').trim();
  if (!almacenDestino) {
    throw new ErrorPedidoBC(
      422,
      'SIN_ALMACEN',
      'No se pudo determinar el almacén destino (la colada no tiene obra y no se envió override).',
    );
  }

  const fecha = opciones.fechaRegistro ?? new Date().toISOString().slice(0, 10);

  const payload: PayloadHeaderBC = {
    Posting_Date: fecha,
    Due_Date: fecha,
    Item_No: codigoProducto,
    Quantity: cantidad,
    Location_Code: almacenDestino,
  };

  const url = `${urlEmpresaBC()}/AssemblyOrder`;
  const respBC = await llamarBC<{ No?: string; SystemId?: string }>(url, {
    metodo: 'POST',
    body: payload,
  });

  const numeroPedido = respBC.No;
  if (!numeroPedido) {
    throw new ErrorPedidoBC(
      502,
      'BC_RESP_SIN_NO',
      'BC creó el pedido pero la respuesta no incluye el N° asignado.',
      respBC,
    );
  }

  // Persistir el N° PRIMERO (antes de ajustar líneas) para que la app quede
  // consistente aunque el PATCH de líneas falle. Auditoría: guardamos el email
  // del actor en digitada_por_oid (el modelo de Produccion no maneja oid).
  await pool
    .request()
    .input('id', sql.Int, idColada)
    .input('numero', sql.NVarChar(50), numeroPedido)
    .input('actor', sql.NVarChar(100), actorEmail)
    .query(`
      UPDATE hor.coladas
      SET numero_pedido_ensamblado_bc = @numero,
          digitada_por_oid            = @actor,
          fecha_digitada              = SYSUTCDATETIME()
      WHERE id_colada = @id
    `);

  // Ajustar Location_Code de las líneas de materiales → ALM-GRAL. Best-effort.
  try {
    await ajustarAlmacenLineasComponente(numeroPedido);
  } catch (e) {
    console.error(
      `[pedido-bc] Falló ajustar almacén de líneas para ${numeroPedido}:`,
      e instanceof Error ? e.message : e,
    );
  }

  return {
    numero_pedido: numeroPedido,
    id_bc: respBC.SystemId ?? null,
    codigo_producto_bc: codigoProducto,
    cantidad,
    codigo_almacen_destino: almacenDestino,
    url_bc: deepLinkPedidoEnsamblado(numeroPedido),
  };
}
