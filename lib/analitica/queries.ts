import 'server-only';
import { getDb, sql } from '@/lib/db';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getPool as getComprasDb } from '@/lib/compras/db';
import { abreviarCRC, MESES_CORTOS } from '@/lib/utilidades/format';
import type { Analitica, Dona, Punto, Serie, Tarjeta } from './tipos';

// ─── Panel de Analítica ───────────────────────────────────────────────────────
// Las métricas se arman por MÓDULO (igual que el dashboard): cada persona ve la
// historia de lo que le toca. Un bloque = un pool de base + un batch de SELECTs;
// si ese bloque falla (base dormida, esquema que no existe en esa base, permisos)
// cae a vacío y el resto del panel igual se pinta.
//
// Ojo con las bases (ver docs/ y el mapa de bases):
//   · getComprasDb()  → compras (SQL_*: AdelantePRO en producción)
//   · getDb()         → auth/base + esquema h4 (AdelantePRO en producción)
//   · getAdelanteDb() → esquemas pro_* (AdelanteSBX)
// NUNCA se cruzan en la misma query: un JOIN entre bases distintas revienta.

const VACIO: Analitica = { tarjetas: [], series: [], donas: [] };
const TZ = 'Central America Standard Time';

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

// ─── Fechas (Costa Rica = UTC-6 fijo, sin horario de verano) ──────────────────

/** Hoy en CR, como fecha "pelada" (el server corre en UTC). */
function hoyCR(): Date {
  const cr = new Date(Date.now() - 6 * 60 * 60 * 1000);
  return new Date(Date.UTC(cr.getUTCFullYear(), cr.getUTCMonth(), cr.getUTCDate()));
}
function sumarDias(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}
function claveDia(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function etiquetaDia(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
/** Primer día del mes, `n` meses atrás. */
function inicioMesHace(n: number): Date {
  const h = hoyCR();
  return new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth() - n, 1));
}
/** Enero lleva el año para que se note el corte ("Ene 26"). */
function etiquetaMes(anio: number, mes: number): string {
  const corto = MESES_CORTOS[mes - 1] ?? String(mes);
  return mes === 1 ? `${corto} ${String(anio).slice(2)}` : corto;
}

// ─── Relleno de series (los días/meses sin dato valen 0, no se saltan) ────────

type FilaDia = { d: Date | string; valor: number | null };
type FilaMes = { anio: number; mes: number; valor: number | null };

function serieDiaria(filas: FilaDia[], dias: number): Punto[] {
  const mapa = new Map(filas.map((f) => [claveDia(new Date(f.d)), Number(f.valor ?? 0)]));
  const fin = hoyCR();
  const out: Punto[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = sumarDias(fin, -i);
    out.push({ x: etiquetaDia(d), y: mapa.get(claveDia(d)) ?? 0 });
  }
  return out;
}

function serieMensual(filas: FilaMes[], meses: number): Punto[] {
  const mapa = new Map(filas.map((f) => [`${f.anio}-${f.mes}`, Number(f.valor ?? 0)]));
  const h = hoyCR();
  const out: Punto[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth() - i, 1));
    const anio = d.getUTCFullYear(), mes = d.getUTCMonth() + 1;
    out.push({ x: etiquetaMes(anio, mes), y: mapa.get(`${anio}-${mes}`) ?? 0 });
  }
  return out;
}

/** Último valor de una serie (el periodo en curso). */
function actual(puntos: Punto[]): number {
  return puntos.length ? puntos[puntos.length - 1].y : 0;
}
/** Las últimas `n` barras de la mini-historia. */
function ultimos(puntos: Punto[], n: number): Punto[] {
  return puntos.slice(Math.max(0, puntos.length - n));
}
/** ¿Tiene algo que mostrar? (todo en cero = mejor no pintar la tarjeta/gráfico) */
function tieneDatos(puntos: Punto[]): boolean {
  return puntos.some((p) => p.y !== 0);
}

const fmtEntero = (n: number) => Math.round(n).toLocaleString('es-CR');
const fmtDecimal = (n: number, dec = 1) =>
  n.toLocaleString('es-CR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

/** Top `n` + "Otros": una dona con 30 rebanadas no se lee. */
function recortar(partes: Array<{ etiqueta: string; valor: number }>, n = 6) {
  const orden = [...partes].filter((p) => p.valor > 0).sort((a, b) => b.valor - a.valor);
  if (orden.length <= n) return orden;
  const resto = orden.slice(n).reduce((s, p) => s + p.valor, 0);
  return [...orden.slice(0, n), { etiqueta: 'Otros', valor: resto }];
}

// ─── Helper de batch: varios SELECT en un solo viaje a la base ────────────────
// La base es serverless y cada ida cuesta; se manda un batch por pool y se
// reparten los recordsets por clave (en el orden en que van los SELECT).

type Fila = Record<string, unknown>;
type Consulta = { clave: string; sql: string };

async function correr(req: sql.Request, prefijo: string, consultas: Consulta[]): Promise<Record<string, Fila[]>> {
  const r = await req.query(`${prefijo}\n${consultas.map((c) => c.sql).join('\n')}`);
  const sets = r.recordsets as unknown as Fila[][];
  const out: Record<string, Fila[]> = {};
  consultas.forEach((c, i) => { out[c.clave] = sets[i] ?? []; });
  return out;
}

const PREFIJO_TZ = `DECLARE @tz nvarchar(60) = N'${TZ}';`;
/** Fecha (CR) de una columna datetime2 guardada en UTC. */
const diaCR = (col: string) => `CAST(${col} AT TIME ZONE 'UTC' AT TIME ZONE @tz AS date)`;

// ─────────────────────────────────────────────────────────────────────────────
// Bloques por módulo
// ─────────────────────────────────────────────────────────────────────────────

type Bloque = { tarjetas: Tarjeta[]; series: Serie[]; donas: Dona[] };
const bloqueVacio = (): Bloque => ({ tarjetas: [], series: [], donas: [] });

/** Órdenes de compra: pedidos, órdenes y recepciones. */
async function bloqueCompras(dias: number, completo: boolean, hrefPedidos: string, hrefOrdenes?: string): Promise<Bloque> {
  const db = await getComprasDb();
  const consultas: Consulta[] = [
    {
      clave: 'pedidosMes',
      sql: `SELECT YEAR(t.d) AS anio, MONTH(t.d) AS mes, COUNT(*) AS valor
            FROM (SELECT ${diaCR('p.fechaCreacion')} AS d FROM dbo.PedidoCompra p
                  WHERE p.esEliminada = 0 AND p.fechaCreacion >= @desdeMeses) t
            GROUP BY YEAR(t.d), MONTH(t.d);`,
    },
    {
      clave: 'ordenesMes',
      sql: `SELECT YEAR(t.d) AS anio, MONTH(t.d) AS mes, COUNT(*) AS valor,
                   CAST(ISNULL(SUM(t.monto), 0) AS decimal(18,2)) AS monto
            FROM (SELECT ${diaCR('o.fechaCreacion')} AS d, o.montoConIva AS monto FROM dbo.OrdenCompra o
                  WHERE o.esEliminada = 0 AND o.fechaCreacion >= @desdeMeses) t
            GROUP BY YEAR(t.d), MONTH(t.d);`,
    },
    {
      clave: 'recepcionesMes',
      sql: `SELECT YEAR(t.d) AS anio, MONTH(t.d) AS mes, COUNT(*) AS valor
            FROM (SELECT ${diaCR('r.fechaCreacion')} AS d FROM dbo.RecepcionCompra r
                  WHERE r.esEliminada = 0 AND r.fechaCreacion >= @desdeMeses) t
            GROUP BY YEAR(t.d), MONTH(t.d);`,
    },
  ];
  if (completo) {
    consultas.push(
      {
        clave: 'pedidosDia',
        sql: `SELECT ${diaCR('p.fechaCreacion')} AS d, COUNT(*) AS valor
              FROM dbo.PedidoCompra p WHERE p.esEliminada = 0 AND p.fechaCreacion >= @desdeDias
              GROUP BY ${diaCR('p.fechaCreacion')};`,
      },
      {
        clave: 'ordenesDia',
        sql: `SELECT ${diaCR('o.fechaCreacion')} AS d, COUNT(*) AS valor
              FROM dbo.OrdenCompra o WHERE o.esEliminada = 0 AND o.fechaCreacion >= @desdeDias
              GROUP BY ${diaCR('o.fechaCreacion')};`,
      },
      {
        // El estado vive en dbo.Estado, que comparte ids entre módulos: se toma
        // el del módulo Compras con TOP 1 (en producción hay ids repetidos).
        clave: 'porEstado',
        sql: `SELECT ISNULL(e.estado, N'Sin estado') AS etiqueta, COUNT(*) AS valor
              FROM dbo.PedidoCompra p
              OUTER APPLY (SELECT TOP 1 x.estado FROM dbo.Estado x
                           WHERE x.idEstado = p.idEstado AND x.modulo = N'Compras' ORDER BY x.orden) e
              WHERE p.esEliminada = 0 AND p.fechaCreacion >= @desdeMeses
              GROUP BY ISNULL(e.estado, N'Sin estado');`,
      },
      {
        clave: 'porTipo',
        sql: `SELECT ISNULL(p.tipoSolicitud, N'sin tipo') AS etiqueta, COUNT(*) AS valor
              FROM dbo.PedidoCompra p
              WHERE p.esEliminada = 0 AND p.fechaCreacion >= @desdeMeses
              GROUP BY ISNULL(p.tipoSolicitud, N'sin tipo');`,
      },
      {
        clave: 'porProveedor',
        sql: `SELECT ISNULL(o.proveedorNombre, N'Sin proveedor') AS etiqueta, COUNT(*) AS valor
              FROM dbo.OrdenCompra o
              WHERE o.esEliminada = 0 AND o.fechaCreacion >= @desdeMeses
              GROUP BY ISNULL(o.proveedorNombre, N'Sin proveedor');`,
      },
    );
  }

  const req = db.request()
    .input('desdeDias', sql.DateTime2, sumarDias(hoyCR(), -(dias - 1)))
    .input('desdeMeses', sql.DateTime2, inicioMesHace(11));
  const res = await correr(req, PREFIJO_TZ, consultas);

  const pedidosMes = serieMensual(res.pedidosMes as FilaMes[], 12);
  const ordenesMes = serieMensual(res.ordenesMes as FilaMes[], 12);
  const recepcionesMes = serieMensual(res.recepcionesMes as FilaMes[], 12);
  const compradoMes = serieMensual(
    (res.ordenesMes as Array<{ anio: number; mes: number; monto: number | null }>)
      .map((f) => ({ anio: f.anio, mes: f.mes, valor: f.monto })), 12);

  const tarjetas: Tarjeta[] = [
    {
      clave: 'pedidos-mes', label: 'Pedidos del mes', valor: fmtEntero(actual(pedidosMes)),
      sub: 'solicitudes creadas este mes', href: hrefPedidos,
      historia: ultimos(pedidosMes, 6), unidad: 'pedidos',
    },
  ];
  if (hrefOrdenes || tieneDatos(ordenesMes)) {
    tarjetas.push({
      clave: 'ordenes-mes', label: 'Órdenes del mes', valor: fmtEntero(actual(ordenesMes)),
      sub: 'órdenes de compra creadas', href: hrefOrdenes,
      historia: ultimos(ordenesMes, 6), unidad: 'órdenes',
    });
  }
  if (tieneDatos(compradoMes)) {
    tarjetas.push({
      clave: 'comprado-mes', label: 'Comprado en el mes', valor: abreviarCRC(actual(compradoMes)),
      sub: 'monto con IVA de las órdenes', href: hrefOrdenes,
      historia: ultimos(compradoMes, 6), unidad: '₡',
    });
  }
  if (tieneDatos(recepcionesMes)) {
    tarjetas.push({
      clave: 'recepciones-mes', label: 'Recepciones del mes', valor: fmtEntero(actual(recepcionesMes)),
      sub: 'entradas de material registradas', historia: ultimos(recepcionesMes, 6), unidad: 'recepciones',
    });
  }

  const series: Serie[] = [];
  const donas: Dona[] = [];
  if (completo) {
    const pedidosDia = serieDiaria(res.pedidosDia as FilaDia[], dias);
    const ordenesDia = serieDiaria(res.ordenesDia as FilaDia[], dias);
    if (tieneDatos(pedidosDia)) {
      series.push({
        clave: 'pedidos-dia', titulo: 'Pedidos por día',
        sub: `media móvil de 7 días · últimos ${dias} días`,
        puntos: pedidosDia, media: 7, formato: 'entero',
      });
    }
    if (tieneDatos(ordenesDia)) {
      series.push({
        clave: 'ordenes-dia', titulo: 'Órdenes de compra por día',
        sub: `media móvil de 7 días · últimos ${dias} días`,
        puntos: ordenesDia, media: 7, formato: 'entero',
      });
    }
    const estado = recortar((res.porEstado as Array<{ etiqueta: string; valor: number }>) ?? []);
    if (estado.length) donas.push({ clave: 'pedidos-estado', titulo: 'Pedidos por estado', sub: 'últimos 12 meses', partes: estado });
    const tipo = recortar((res.porTipo as Array<{ etiqueta: string; valor: number }>) ?? []);
    if (tipo.length) donas.push({ clave: 'pedidos-tipo', titulo: 'Pedidos por tipo de solicitud', sub: 'últimos 12 meses', partes: tipo });
    const prov = recortar((res.porProveedor as Array<{ etiqueta: string; valor: number }>) ?? []);
    if (prov.length) donas.push({ clave: 'ordenes-proveedor', titulo: 'Órdenes por proveedor', sub: 'últimos 12 meses', partes: prov });
  }

  return { tarjetas, series, donas };
}

/** Obra: estado de las obras (pro_obc, base AdelanteSBX). */
async function bloqueObra(completo: boolean): Promise<Bloque> {
  const db = await getAdelanteDb();
  const consultas: Consulta[] = [
    { clave: 'estados', sql: `SELECT estado AS etiqueta, COUNT(*) AS valor FROM pro_obc.obra_estado GROUP BY estado;` },
  ];
  if (completo) {
    consultas.push(
      { clave: 'tipoCasa', sql: `SELECT ISNULL(tipo_casa, N'Sin tipo') AS etiqueta, COUNT(*) AS valor
                                 FROM pro_obc.obra_estado WHERE estado = 'en_ejecucion' GROUP BY ISNULL(tipo_casa, N'Sin tipo');` },
      { clave: 'sprints', sql: `SELECT sprint_actual AS sprint, COUNT(*) AS valor
                                FROM pro_obc.obra_estado WHERE estado = 'en_ejecucion' GROUP BY sprint_actual ORDER BY sprint_actual;` },
    );
  }
  const res = await correr(db.request(), '', consultas);

  const porEstado = (res.estados as Array<{ etiqueta: string; valor: number }>) ?? [];
  const cuenta = (e: string) => porEstado.find((x) => x.etiqueta === e)?.valor ?? 0;
  const ejecucion = cuenta('en_ejecucion'), espera = cuenta('en_espera');

  const ETIQUETA_ESTADO: Record<string, string> = {
    en_ejecucion: 'En ejecución', en_espera: 'En espera', finalizada: 'Finalizada',
    inactiva: 'Inactiva', pendiente: 'Pendiente',
  };

  const tarjetas: Tarjeta[] = [
    { clave: 'obras-ejecucion', label: 'Obras en ejecución', valor: fmtEntero(ejecucion), sub: `${fmtEntero(espera)} en espera`, href: '/obras' },
  ];

  const donas: Dona[] = [];
  const series: Serie[] = [];
  if (completo) {
    donas.push({
      clave: 'obras-estado', titulo: 'Obras por estado', sub: 'todo el padrón de obras',
      partes: recortar(porEstado.map((p) => ({ etiqueta: ETIQUETA_ESTADO[p.etiqueta] ?? p.etiqueta, valor: p.valor }))),
    });
    const tipos = recortar((res.tipoCasa as Array<{ etiqueta: string; valor: number }>) ?? []);
    if (tipos.length) donas.push({ clave: 'obras-tipo', titulo: 'Obras en ejecución por tipo de casa', partes: tipos });
    const sprints = (res.sprints as Array<{ sprint: number | null; valor: number }>) ?? [];
    if (sprints.length) {
      series.push({
        clave: 'obras-sprint', titulo: 'Obras en ejecución por sprint',
        sub: 'en qué etapa va el padrón activo',
        puntos: sprints.map((s) => ({ x: `S${s.sprint ?? '—'}`, y: Number(s.valor) })), formato: 'entero',
      });
    }
  }
  return { tarjetas, series, donas };
}

/** Cuadrillas activas (base de auth/base). */
async function bloqueCuadrillas(): Promise<Bloque> {
  const db = await getDb();
  const r = await db.request().query<{ cuadrillas: number; miembros: number }>(`
    SELECT (SELECT COUNT(*) FROM dbo.Cuadrilla WHERE Activo = 1) AS cuadrillas,
           (SELECT COUNT(DISTINCT IDCol) FROM dbo.CuadrillaMiembro WHERE Activo = 1) AS miembros;`);
  const row = r.recordset[0];
  return {
    tarjetas: [{
      clave: 'cuadrillas', label: 'Cuadrillas activas', valor: fmtEntero(row?.cuadrillas ?? 0),
      sub: `${fmtEntero(row?.miembros ?? 0)} colaboradores asignados`, href: '/cuadrillas',
    }],
    series: [], donas: [],
  };
}

/** Jornada (H4): quién marcó, cuántas horas y qué anomalías hubo. */
async function bloqueH4(dias: number, completo: boolean): Promise<Bloque> {
  const db = await getDb();
  const consultas: Consulta[] = [
    {
      clave: 'jornadaDia',
      sql: `SELECT ${diaCR('j.fechaHoraEntradaUtc')} AS d,
                   COUNT(DISTINCT j.idColaborador) AS valor,
                   CAST(SUM(DATEDIFF(SECOND, j.fechaHoraEntradaUtc,
                        COALESCE(j.fechaHoraSalidaUtc, j.fechaHoraEntradaUtc))) / 3600.0 AS decimal(20,2)) AS horas
            FROM h4.Jornada j WHERE j.fechaHoraEntradaUtc >= @desdeDias
            GROUP BY ${diaCR('j.fechaHoraEntradaUtc')};`,
    },
    {
      clave: 'anomaliasDia',
      sql: `SELECT ${diaCR('e.ocurridoUtc')} AS d, COUNT(*) AS valor
            FROM h4.EventoActividad e
            WHERE e.severidad <> N'info' AND e.ocurridoUtc >= @desdeDias
            GROUP BY ${diaCR('e.ocurridoUtc')};`,
    },
  ];
  const req = db.request().input('desdeDias', sql.DateTime2, sumarDias(hoyCR(), -(Math.max(dias, 7) - 1)));
  const res = await correr(req, PREFIJO_TZ, consultas);

  const filas = (res.jornadaDia as Array<{ d: Date; valor: number; horas: number | null }>) ?? [];
  const personas = serieDiaria(filas, dias);
  const horas = serieDiaria(filas.map((f) => ({ d: f.d, valor: f.horas })), dias);
  const anomalias = serieDiaria(res.anomaliasDia as FilaDia[], dias);

  const tarjetas: Tarjeta[] = [
    {
      clave: 'personal-jornada', label: 'Personal en jornada', valor: fmtEntero(actual(personas)),
      sub: 'colaboradores con marca hoy', href: '/reporte-h4',
      historia: ultimos(personas, 7), unidad: 'personas',
    },
    {
      clave: 'anomalias-h4', label: 'Anomalías H4 (hoy)', valor: fmtEntero(actual(anomalias)),
      sub: 'eventos por revisar en la jornada', href: '/reporte-h4',
      tono: actual(anomalias) > 0 ? 'alerta' : 'neutro',
      historia: ultimos(anomalias, 7), unidad: 'anomalías',
    },
  ];

  const series: Serie[] = [];
  if (completo) {
    if (tieneDatos(personas)) {
      series.push({
        clave: 'personal-dia', titulo: 'Personal en jornada por día',
        sub: `media móvil de 7 días · últimos ${dias} días`, puntos: personas, media: 7, formato: 'entero',
      });
    }
    if (tieneDatos(horas)) {
      series.push({
        clave: 'horas-dia', titulo: 'Horas trabajadas por día',
        sub: `media móvil de 7 días · últimos ${dias} días`, puntos: horas, media: 7, formato: 'decimal',
      });
    }
  }
  return { tarjetas, series, donas: [] };
}

/** Utilidades (pro_uti, base AdelanteSBX). */
async function bloqueUtilidades(completo: boolean): Promise<Bloque> {
  const db = await getAdelanteDb();
  const r = await db.request().query<{
    anio: number; mes: number; utilidad_neta: number | null; utilidad_ingresada: number | null;
    utilidad_gastada: number | null; inversion_casas: number | null; inversion_proyectos: number | null;
    salida_socios: number | null; credito_clientes: number | null; otros: number | null;
  }>(`SELECT TOP (12) anio, mes, utilidad_neta, utilidad_ingresada, utilidad_gastada,
             inversion_casas, inversion_proyectos, salida_socios, credito_clientes, otros
      FROM pro_uti.v_resumen_mensual ORDER BY anio DESC, mes DESC`);

  const filas = r.recordset;
  const neta = serieMensual(filas.map((f) => ({ anio: f.anio, mes: f.mes, valor: f.utilidad_neta })), 12);

  const tarjetas: Tarjeta[] = [{
    clave: 'utilidad-mes', label: 'Utilidad del mes', valor: abreviarCRC(actual(neta)),
    sub: 'utilidad neta acumulada del mes', href: '/utilidades',
    historia: ultimos(neta, 6), unidad: '₡',
  }];

  const series: Serie[] = [];
  const donas: Dona[] = [];
  if (completo && tieneDatos(neta)) {
    series.push({
      clave: 'utilidad-mensual', titulo: 'Utilidad neta por mes',
      sub: 'últimos 12 meses', puntos: neta, formato: 'crc',
    });
    // Composición del mes más reciente que tenga movimiento.
    const ultimo = filas.find((f) => Number(f.utilidad_ingresada ?? 0) !== 0 || Number(f.utilidad_gastada ?? 0) !== 0);
    if (ultimo) {
      const partes = recortar([
        { etiqueta: 'Inversión en casas', valor: Number(ultimo.inversion_casas ?? 0) },
        { etiqueta: 'Inversión en proyectos', valor: Number(ultimo.inversion_proyectos ?? 0) },
        { etiqueta: 'Salida a socios', valor: Number(ultimo.salida_socios ?? 0) },
        { etiqueta: 'Crédito a clientes', valor: Number(ultimo.credito_clientes ?? 0) },
        { etiqueta: 'Otros', valor: Number(ultimo.otros ?? 0) },
      ]);
      if (partes.length) {
        donas.push({
          clave: 'utilidad-destino', titulo: 'Utilidad gastada por destino',
          sub: etiquetaMesLargo(ultimo.anio, ultimo.mes), partes, formato: 'crc',
        });
      }
    }
  }
  return { tarjetas, series, donas };
}

function etiquetaMesLargo(anio: number, mes: number): string {
  return `${MESES_CORTOS[mes - 1] ?? mes} ${anio}`;
}

/** Presupuesto: catálogo (pro_obc) + padrón de obras y proyectos. */
async function bloquePresupuesto(completo: boolean): Promise<Bloque> {
  const [catalogo, padron] = await Promise.all([
    safe(async () => {
      const db = await getAdelanteDb();
      const r = await db.request().query<{ partidas: number; subpartidas: number }>(`
        SELECT (SELECT COUNT(*) FROM pro_obc.partidas)     AS partidas,
               (SELECT COUNT(*) FROM pro_obc.sub_partidas) AS subpartidas`);
      return r.recordset[0] ?? { partidas: 0, subpartidas: 0 };
    }, { partidas: 0, subpartidas: 0 }),
    safe(async () => {
      const db = await getDb();
      const consultas: Consulta[] = [
        { clave: 'totales', sql: `SELECT (SELECT COUNT(*) FROM dbo.Obra) AS obras, (SELECT COUNT(*) FROM dbo.Proyecto) AS proyectos;` },
      ];
      if (completo) {
        consultas.push({
          clave: 'obrasMes',
          sql: `SELECT YEAR(t.d) AS anio, MONTH(t.d) AS mes, COUNT(*) AS valor
                FROM (SELECT ${diaCR('o.fechaCreacion')} AS d FROM dbo.Obra o
                      WHERE o.fechaCreacion >= @desdeMeses) t
                GROUP BY YEAR(t.d), MONTH(t.d);`,
        });
      }
      const req = db.request().input('desdeMeses', sql.DateTime2, inicioMesHace(11));
      return correr(req, PREFIJO_TZ, consultas);
    }, {} as Record<string, Fila[]>),
  ]);

  const totales = (padron.totales?.[0] ?? {}) as { obras?: number; proyectos?: number };
  const obrasMes = serieMensual((padron.obrasMes as FilaMes[]) ?? [], 12);

  const tarjetas: Tarjeta[] = [
    { clave: 'partidas', label: 'Partidas', valor: fmtEntero(catalogo.partidas), sub: `${fmtEntero(catalogo.subpartidas)} subpartidas en catálogo`, href: '/partidas' },
    { clave: 'obras', label: 'Obras', valor: fmtEntero(totales.obras ?? 0), sub: 'obras registradas', href: '/obras', historia: ultimos(obrasMes, 6), unidad: 'nuevas' },
    { clave: 'proyectos', label: 'Proyectos', valor: fmtEntero(totales.proyectos ?? 0), sub: 'proyectos registrados', href: '/proyectos' },
  ];

  const series: Serie[] = [];
  if (completo && tieneDatos(obrasMes)) {
    series.push({ clave: 'obras-mes', titulo: 'Obras nuevas por mes', sub: 'últimos 12 meses', puntos: obrasMes, formato: 'entero' });
  }
  return { tarjetas, series, donas: [] };
}

/** Concreto (pro_hor / pro_lab, base AdelanteSBX). */
async function bloqueConcreto(dias: number, completo: boolean): Promise<Bloque> {
  const db = await getAdelanteDb();
  const consultas: Consulta[] = [
    {
      clave: 'porMes',
      sql: `SELECT YEAR(b.fecha_inicio) AS anio, MONTH(b.fecha_inicio) AS mes, COUNT(*) AS valor,
                   CAST(ISNULL(SUM(b.m3_producidos), 0) AS decimal(18,2)) AS m3
            FROM pro_hor.batches b WHERE b.fecha_inicio >= @desdeMeses
            GROUP BY YEAR(b.fecha_inicio), MONTH(b.fecha_inicio);`,
    },
    { clave: 'coladas', sql: `SELECT estado AS etiqueta, COUNT(*) AS valor FROM pro_hor.coladas GROUP BY estado;` },
  ];
  if (completo) {
    consultas.push(
      {
        clave: 'porDia',
        sql: `SELECT CAST(b.fecha_inicio AS date) AS d,
                     CAST(ISNULL(SUM(b.m3_producidos), 0) AS decimal(18,2)) AS valor,
                     COUNT(*) AS batches
              FROM pro_hor.batches b WHERE b.fecha_inicio >= @desdeDias
              GROUP BY CAST(b.fecha_inicio AS date);`,
      },
      {
        clave: 'porPlanta',
        sql: `SELECT ISNULL(p.codigo, N'Sin planta') AS etiqueta,
                     CAST(ISNULL(SUM(b.m3_producidos), 0) AS decimal(18,2)) AS valor
              FROM pro_hor.batches b LEFT JOIN pro_hor.plantas p ON p.id = b.id_planta
              WHERE b.fecha_inicio >= @desdeMeses GROUP BY ISNULL(p.codigo, N'Sin planta');`,
      },
    );
  }
  const req = db.request()
    .input('desdeDias', sql.DateTime2, sumarDias(hoyCR(), -(dias - 1)))
    .input('desdeMeses', sql.DateTime2, inicioMesHace(11));
  const res = await correr(req, '', consultas);

  const mesFilas = (res.porMes as Array<{ anio: number; mes: number; valor: number; m3: number | null }>) ?? [];
  const batchesMes = serieMensual(mesFilas, 12);
  const m3Mes = serieMensual(mesFilas.map((f) => ({ anio: f.anio, mes: f.mes, valor: f.m3 })), 12);
  const coladas = (res.coladas as Array<{ etiqueta: string; valor: number }>) ?? [];
  const pendientes = coladas
    .filter((c) => c.etiqueta === 'sugerida' || c.etiqueta === 'confirmada')
    .reduce((s, c) => s + Number(c.valor), 0);

  const tarjetas: Tarjeta[] = [
    { clave: 'm3-mes', label: 'm³ del mes', valor: fmtDecimal(actual(m3Mes), 1), sub: 'metros cúbicos producidos', href: '/concreto/dashboard', historia: ultimos(m3Mes, 6), unidad: 'm³' },
    { clave: 'batches-mes', label: 'Batches del mes', valor: fmtEntero(actual(batchesMes)), sub: 'importados este mes', href: '/concreto/batches', historia: ultimos(batchesMes, 6), unidad: 'batches' },
    { clave: 'coladas-pendientes', label: 'Coladas por digitar', valor: fmtEntero(pendientes), sub: 'sugeridas y confirmadas', href: '/concreto/coladas', tono: pendientes > 0 ? 'alerta' : 'neutro' },
  ];

  const series: Serie[] = [];
  const donas: Dona[] = [];
  if (completo) {
    const m3Dia = serieDiaria(res.porDia as FilaDia[], dias);
    if (tieneDatos(m3Dia)) {
      series.push({ clave: 'm3-dia', titulo: 'm³ producidos por día', sub: `media móvil de 7 días · últimos ${dias} días`, puntos: m3Dia, media: 7, formato: 'decimal' });
    }
    const plantas = recortar((res.porPlanta as Array<{ etiqueta: string; valor: number }>) ?? []);
    if (plantas.length) donas.push({ clave: 'm3-planta', titulo: 'm³ por planta', sub: 'últimos 12 meses', partes: plantas, formato: 'decimal' });
    const ESTADO_COLADA: Record<string, string> = { cerrada: 'Cerrada', sugerida: 'Sugerida', confirmada: 'Confirmada', anulada: 'Anulada' };
    const porEstado = recortar(coladas.map((c) => ({ etiqueta: ESTADO_COLADA[c.etiqueta] ?? c.etiqueta, valor: Number(c.valor) })));
    if (porEstado.length) donas.push({ clave: 'coladas-estado', titulo: 'Coladas por estado', partes: porEstado });
  }
  return { tarjetas, series, donas };
}

/** Desembolsos (pro_app / pro_ventas, base AdelanteSBX). */
async function bloqueDesembolsos(completo: boolean): Promise<Bloque> {
  const db = await getAdelanteDb();
  const consultas: Consulta[] = [
    {
      clave: 'resumen',
      sql: `SELECT CAST(ISNULL(SUM(Pendiente_CRC), 0) AS decimal(18,2)) AS pendiente,
                   SUM(CASE WHEN EsReservado = 0 THEN 1 ELSE 0 END) AS formalizadas,
                   SUM(CASE WHEN EsReservado = 1 THEN 1 ELSE 0 END) AS reservadas
            FROM pro_app.vw_dashboard_caso;`,
    },
    {
      clave: 'movimientosMes',
      sql: `SELECT YEAR(m.FechaMovimiento) AS anio, MONTH(m.FechaMovimiento) AS mes,
                   CAST(ISNULL(SUM(m.MontoColones), 0) AS decimal(18,2)) AS valor
            FROM pro_ventas.Movimientos m
            WHERE m.FechaMovimiento >= @desdeMeses
            GROUP BY YEAR(m.FechaMovimiento), MONTH(m.FechaMovimiento);`,
    },
  ];
  if (completo) {
    consultas.push({
      clave: 'porBanco',
      sql: `SELECT ISNULL(AbrevBanco, N'Sin banco') AS etiqueta,
                   CAST(ISNULL(SUM(Pendiente_CRC), 0) AS decimal(18,2)) AS valor
            FROM pro_app.vw_dashboard_caso GROUP BY ISNULL(AbrevBanco, N'Sin banco');`,
    });
  }
  const req = db.request().input('desdeMeses', sql.DateTime2, inicioMesHace(11));
  const res = await correr(req, '', consultas);

  const resumen = (res.resumen?.[0] ?? {}) as { pendiente?: number; formalizadas?: number; reservadas?: number };
  const movimientos = serieMensual(res.movimientosMes as FilaMes[], 12);

  const tarjetas: Tarjeta[] = [
    { clave: 'pendiente', label: 'Pendiente por recibir', valor: abreviarCRC(resumen.pendiente ?? 0), sub: 'saldo pendiente total', href: '/desembolsos/dashboard' },
    { clave: 'recibido-mes', label: 'Recibido en el mes', valor: abreviarCRC(actual(movimientos)), sub: 'movimientos del mes en curso', href: '/desembolsos/movimientos', historia: ultimos(movimientos, 6), unidad: '₡' },
    { clave: 'casas-formalizadas', label: 'Casas formalizadas', valor: fmtEntero(resumen.formalizadas ?? 0), sub: `${fmtEntero(resumen.reservadas ?? 0)} en reserva`, href: '/desembolsos/matriz' },
  ];

  const series: Serie[] = [];
  const donas: Dona[] = [];
  if (completo) {
    if (tieneDatos(movimientos)) {
      series.push({ clave: 'desembolsos-mes', titulo: 'Movimientos recibidos por mes', sub: 'últimos 12 meses', puntos: movimientos, formato: 'crc' });
    }
    const bancos = recortar((res.porBanco as Array<{ etiqueta: string; valor: number }>) ?? []);
    if (bancos.length) donas.push({ clave: 'pendiente-banco', titulo: 'Pendiente por banco', partes: bancos, formato: 'crc' });
  }
  return { tarjetas, series, donas };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Arma el panel para los módulos del usuario.
 * @param dias   ventana de las series diarias (30 / 90 / 180).
 * @param completo `false` = solo tarjetas (lo que usa el dashboard de inicio):
 *                 se saltan las consultas de series y donas.
 */
export async function getAnalitica(mods: string[], dias = 30, completo = true): Promise<Analitica> {
  const has = (m: string) => mods.includes(m);
  const esAdmin = has('admin');
  const compras = esAdmin || has('ingenieria') || has('bodega') || has('recepcion');

  const bloques = await Promise.all([
    // Obra y cuadrillas: admin e ingeniería.
    esAdmin || has('ingenieria') ? safe(() => bloqueObra(completo), bloqueVacio()) : bloqueVacio(),
    esAdmin || has('ingenieria') ? safe(() => bloqueCuadrillas(), bloqueVacio()) : bloqueVacio(),
    // Jornada H4 y utilidades: resumen global (Super Admin).
    esAdmin ? safe(() => bloqueH4(dias, completo), bloqueVacio()) : bloqueVacio(),
    esAdmin ? safe(() => bloqueUtilidades(completo), bloqueVacio()) : bloqueVacio(),
    // Órdenes de compra: lo ven los tres roles del módulo, con enlaces distintos.
    compras
      ? safe(() => bloqueCompras(
          dias, completo,
          '/compras/ingenieria',
          esAdmin || has('ingenieria') ? '/compras/proveeduria/ordenes' : undefined,
        ), bloqueVacio())
      : bloqueVacio(),
    has('presupuesto') ? safe(() => bloquePresupuesto(completo), bloqueVacio()) : bloqueVacio(),
    has('concreto') ? safe(() => bloqueConcreto(dias, completo), bloqueVacio()) : bloqueVacio(),
    has('desembolsos') ? safe(() => bloqueDesembolsos(completo), bloqueVacio()) : bloqueVacio(),
  ]);

  const out = bloques.reduce<Analitica>((acc, b) => ({
    tarjetas: [...acc.tarjetas, ...b.tarjetas],
    series: [...acc.series, ...b.series],
    donas: [...acc.donas, ...b.donas],
  }), VACIO);

  return out;
}
