import type sqlModule from 'mssql';
import { sql } from '@/lib/db-adelantedb';
import { obtenerMuestra } from './lab';
import type { MuestraDetalle } from './tipos';
import type {
  ActorLab,
  ActualizarEnsayoParams,
  ActualizarMedicionParams,
  ActualizarMuestraParams,
  CrearEnsayoParams,
  CrearMedicionParams,
  CrearMuestraParams,
  ImportarExcelLabResponse,
  ErrorImportLab,
  PuntoCurvaTeorica,
  CategoriaConcreto,
} from './tipos-lab';
import * as XLSX from 'xlsx';

// Portado de `api/src/lib/lab-dominio.ts` + `api/src/lib/importar-excel-lab.ts`.
// Escritura del módulo Laboratorio: CRUD de muestras/ensayos/mediciones,
// lectura de la curva teórica e importación masiva del Excel histórico.
//
// Convención: funciones que reciben el `pool` (o abren su propia transacción)
// y devuelven datos. Los errores de dominio se lanzan como `ErrorLab` con un
// `status` HTTP para que la ruta lo mapee (404/409/400); cualquier otro error
// cae a 500.

/** Error de dominio con status HTTP asociado (lo mapea la ruta). */
export class ErrorLab extends Error {
  readonly codigo: string;
  readonly status: number;
  constructor(codigo: string, mensaje: string, status = 409) {
    super(mensaje);
    this.name = 'ErrorLab';
    this.codigo = codigo;
    this.status = status;
  }
}

// =============================================================================
// Muestras
// =============================================================================

/**
 * Crea una muestra. El número de muestra se autogenera (max + 1). Pre-crea los
 * ensayos a las edades pedidas (default [7, 14, 28]) con fecha_prueba teórica
 * = fecha_colado + edad, para que el detalle quede listo para cargar los MPa.
 */
export async function crearMuestra(
  pool: sqlModule.ConnectionPool,
  body: CrearMuestraParams,
  usuario: ActorLab,
): Promise<MuestraDetalle> {
  // 1) Validar actividad existe y está activa.
  const rAct = await pool
    .request()
    .input('id', sql.Int, body.id_actividad)
    .query('SELECT activo FROM pro_lab.actividades WHERE id = @id');
  if (rAct.recordset.length === 0) {
    throw new ErrorLab('ACTIVIDAD_NO_ENCONTRADA', `Actividad ${body.id_actividad} no existe.`, 404);
  }
  if (!rAct.recordset[0]?.activo) {
    throw new ErrorLab('ACTIVIDAD_INACTIVA', 'La actividad seleccionada está inactiva.');
  }

  // 2) Si tiene id_colada, validar que existe.
  if (body.id_colada !== null && body.id_colada !== undefined) {
    const rCol = await pool
      .request()
      .input('id', sql.Int, body.id_colada)
      .query('SELECT 1 FROM pro_hor.coladas WHERE id_colada = @id');
    if (rCol.recordset.length === 0) {
      throw new ErrorLab('COLADA_NO_ENCONTRADA', `Colada ${body.id_colada} no existe.`, 404);
    }
  }

  // 3) Si tiene id_receta_bc, validar.
  if (body.id_receta_bc !== null && body.id_receta_bc !== undefined) {
    const rRec = await pool
      .request()
      .input('id', sql.Int, body.id_receta_bc)
      .query('SELECT 1 FROM pro_hor.recetas_bc WHERE id = @id');
    if (rRec.recordset.length === 0) {
      throw new ErrorLab('RECETA_NO_ENCONTRADA', `Receta BC ${body.id_receta_bc} no existe.`, 404);
    }
  }

  // 4) Si tiene obra, validar contra pro_bi.dim_obra (mismo patrón que coladas).
  if (body.obra_works_no) {
    const rObra = await pool
      .request()
      .input('w', sql.NVarChar(20), body.obra_works_no)
      .query<{ existe: number }>(
        `SELECT COUNT(*) AS existe
         FROM pro_bi.dim_obra
         WHERE works_no COLLATE DATABASE_DEFAULT = @w COLLATE DATABASE_DEFAULT`,
      );
    if ((rObra.recordset[0]?.existe ?? 0) === 0) {
      throw new ErrorLab('OBRA_NO_ENCONTRADA', `Obra "${body.obra_works_no}" no existe.`, 404);
    }
  }

  // 5) Resolver siguiente numero_muestra (max + 1, o 1 si tabla vacía).
  const rNum = await pool.request().query<{ next_num: number }>(`
    SELECT ISNULL(MAX(numero_muestra), 0) + 1 AS next_num FROM pro_lab.muestras
  `);
  const numero = rNum.recordset[0]?.next_num ?? 1;

  // 6) INSERT.
  const r = await pool
    .request()
    .input('numero_muestra', sql.Int, numero)
    .input('obra_works_no', sql.NVarChar(20), body.obra_works_no ?? null)
    .input('id_casa', sql.NVarChar(50), body.id_casa ?? null)
    .input('planta_nombre', sql.NVarChar(50), body.planta_nombre ?? null)
    .input('id_actividad', sql.Int, body.id_actividad)
    .input('fecha_colado', sql.Date, body.fecha_colado)
    .input('proveedor', sql.NVarChar(100), body.proveedor || 'ADELANTE DESARROLLOS')
    .input('id_colada', sql.Int, body.id_colada ?? null)
    .input('id_receta_bc', sql.Int, body.id_receta_bc ?? null)
    .input('fc_objetivo', sql.Int, body.fc_objetivo)
    .input('categoria_concreto', sql.NVarChar(20), body.categoria_concreto ?? null)
    .input('tipo_concreto_libre', sql.NVarChar(100), body.tipo_concreto_libre ?? null)
    .input('notas', sql.NVarChar(sql.MAX), body.notas ?? null)
    .input('oid', sql.NVarChar(100), usuario.oid)
    .input('email', sql.NVarChar(200), usuario.email)
    .query<{ id: number }>(`
      INSERT INTO pro_lab.muestras (
        numero_muestra, obra_works_no, id_casa, planta_nombre, id_actividad, fecha_colado,
        proveedor, id_colada, id_receta_bc, fc_objetivo, categoria_concreto,
        tipo_concreto_libre, notas, creado_por_oid, creado_por_email
      )
      OUTPUT INSERTED.id
      VALUES (
        @numero_muestra, @obra_works_no, @id_casa, @planta_nombre, @id_actividad, @fecha_colado,
        @proveedor, @id_colada, @id_receta_bc, @fc_objetivo, @categoria_concreto,
        @tipo_concreto_libre, @notas, @oid, @email
      )
    `);
  const idNueva = r.recordset[0]?.id;
  if (!idNueva) throw new ErrorLab('INSERT_FALLO', 'No se pudo crear la muestra.', 500);

  // 7) Pre-crear los ensayos a las edades pedidas (default [7, 14, 28]). Los
  //    ensayos quedan vacíos; el laboratorista entra los MPa cuando falle cada
  //    cilindro. fecha_prueba = fecha_colado + edad (calculado en JS, UTC).
  const edadesDedup = Array.from(
    new Set((body.edades_ensayos ?? [7, 14, 28]).filter((d) => d >= 1 && d <= 365)),
  ).sort((a, b) => a - b);

  if (edadesDedup.length > 0) {
    const fechaBase = new Date(`${body.fecha_colado}T00:00:00Z`);
    for (const edad of edadesDedup) {
      const fechaPrueba = new Date(fechaBase.getTime() + edad * 24 * 60 * 60 * 1000);
      const fechaPruebaIso = fechaPrueba.toISOString().slice(0, 10);
      // fecha_prueba_programada = misma fecha teórica: sirve de referencia
      // para detectar después si el laboratorista la ajustó a otra fecha.
      await pool
        .request()
        .input('id_muestra', sql.BigInt, idNueva)
        .input('edad_dias', sql.Int, edad)
        .input('fecha_prueba', sql.Date, fechaPruebaIso)
        .input('oid', sql.NVarChar(100), usuario.oid)
        .query(`
          INSERT INTO pro_lab.ensayos (id_muestra, edad_dias, fecha_prueba, fecha_prueba_programada, creado_por_oid)
          VALUES (@id_muestra, @edad_dias, @fecha_prueba, @fecha_prueba, @oid)
        `);
    }
  }

  const detalle = await obtenerMuestra(pool, idNueva);
  if (!detalle) throw new ErrorLab('INCONSISTENTE', 'No se pudo recuperar la muestra creada.', 500);
  return detalle;
}

/** Edita una muestra (SET dinámico: solo campos provistos). */
export async function actualizarMuestra(
  pool: sqlModule.ConnectionPool,
  id: number,
  body: ActualizarMuestraParams,
): Promise<MuestraDetalle> {
  const sets: string[] = ['actualizado_en = SYSUTCDATETIME()'];
  const req = pool.request().input('id', sql.BigInt, id);

  if (body.obra_works_no !== undefined) {
    sets.push('obra_works_no = @obra_works_no');
    req.input('obra_works_no', sql.NVarChar(20), body.obra_works_no);
  }
  if (body.id_casa !== undefined) {
    sets.push('id_casa = @id_casa');
    req.input('id_casa', sql.NVarChar(50), body.id_casa);
  }
  if (body.planta_nombre !== undefined) {
    sets.push('planta_nombre = @planta_nombre');
    req.input('planta_nombre', sql.NVarChar(50), body.planta_nombre);
  }
  if (body.id_actividad !== undefined) {
    sets.push('id_actividad = @id_actividad');
    req.input('id_actividad', sql.Int, body.id_actividad);
  }
  if (body.fecha_colado !== undefined) {
    sets.push('fecha_colado = @fecha_colado');
    req.input('fecha_colado', sql.Date, body.fecha_colado);
  }
  if (body.proveedor !== undefined) {
    sets.push('proveedor = @proveedor');
    req.input('proveedor', sql.NVarChar(100), body.proveedor);
  }
  if (body.id_colada !== undefined) {
    sets.push('id_colada = @id_colada');
    req.input('id_colada', sql.Int, body.id_colada);
  }
  if (body.id_receta_bc !== undefined) {
    sets.push('id_receta_bc = @id_receta_bc');
    req.input('id_receta_bc', sql.Int, body.id_receta_bc);
  }
  if (body.fc_objetivo !== undefined) {
    sets.push('fc_objetivo = @fc_objetivo');
    req.input('fc_objetivo', sql.Int, body.fc_objetivo);
  }
  if (body.categoria_concreto !== undefined) {
    sets.push('categoria_concreto = @categoria_concreto');
    req.input('categoria_concreto', sql.NVarChar(20), body.categoria_concreto);
  }
  if (body.tipo_concreto_libre !== undefined) {
    sets.push('tipo_concreto_libre = @tipo_concreto_libre');
    req.input('tipo_concreto_libre', sql.NVarChar(100), body.tipo_concreto_libre);
  }
  if (body.notas !== undefined) {
    sets.push('notas = @notas');
    req.input('notas', sql.NVarChar(sql.MAX), body.notas);
  }

  if (sets.length === 1) {
    throw new ErrorLab('SIN_CAMBIOS', 'Body vacío: nada que actualizar.', 400);
  }

  const r = await req.query<{ rows: number }>(`
    UPDATE pro_lab.muestras SET ${sets.join(', ')} WHERE id = @id;
    SELECT @@ROWCOUNT AS rows;
  `);
  if ((r.recordset[0]?.rows ?? 0) === 0) {
    throw new ErrorLab('NO_ENCONTRADA', `Muestra ${id} no encontrada.`, 404);
  }

  const detalle = await obtenerMuestra(pool, id);
  if (!detalle) throw new ErrorLab('INCONSISTENTE', 'No se pudo recuperar la muestra.', 500);
  return detalle;
}

/** Borra una muestra (CASCADE a ensayos/mediciones). Solo-admin en la ruta. */
export async function borrarMuestra(pool: sqlModule.ConnectionPool, id: number): Promise<void> {
  const r = await pool
    .request()
    .input('id', sql.BigInt, id)
    .query<{ rows: number }>(`
    DELETE FROM pro_lab.muestras WHERE id = @id;
    SELECT @@ROWCOUNT AS rows;
  `);
  if ((r.recordset[0]?.rows ?? 0) === 0) {
    throw new ErrorLab('NO_ENCONTRADA', `Muestra ${id} no encontrada.`, 404);
  }
}

// =============================================================================
// Ensayos
// =============================================================================

export async function crearEnsayo(
  pool: sqlModule.ConnectionPool,
  idMuestra: number,
  body: CrearEnsayoParams,
  usuario: ActorLab,
): Promise<{ id: number }> {
  const rM = await pool
    .request()
    .input('id', sql.BigInt, idMuestra)
    .query('SELECT 1 FROM pro_lab.muestras WHERE id = @id');
  if (rM.recordset.length === 0) {
    throw new ErrorLab('MUESTRA_NO_ENCONTRADA', `Muestra ${idMuestra} no existe.`, 404);
  }

  try {
    const r = await pool
      .request()
      .input('id_muestra', sql.BigInt, idMuestra)
      .input('edad_dias', sql.Int, body.edad_dias)
      .input('fecha_prueba', sql.Date, body.fecha_prueba ?? null)
      .input('notas', sql.NVarChar(sql.MAX), body.notas ?? null)
      .input('oid', sql.NVarChar(100), usuario.oid)
      .query<{ id: number }>(`
        INSERT INTO pro_lab.ensayos (id_muestra, edad_dias, fecha_prueba, fecha_prueba_programada, notas, creado_por_oid)
        OUTPUT INSERTED.id
        VALUES (@id_muestra, @edad_dias, @fecha_prueba, @fecha_prueba, @notas, @oid)
      `);
    const idEnsayo = r.recordset[0]?.id;
    if (!idEnsayo) throw new ErrorLab('INSERT_FALLO', 'No se pudo crear el ensayo.', 500);
    return { id: idEnsayo };
  } catch (e) {
    if (e instanceof Error && e.message.includes('UQ_lab_ensayos_edad')) {
      throw new ErrorLab(
        'EDAD_DUPLICADA',
        `Ya existe un ensayo de ${body.edad_dias} días para esta muestra. Editá el existente o elegí otra edad.`,
      );
    }
    throw e;
  }
}

export async function actualizarEnsayo(
  pool: sqlModule.ConnectionPool,
  idEnsayo: number,
  body: ActualizarEnsayoParams,
  usuario: ActorLab,
): Promise<void> {
  const sets: string[] = ['actualizado_en = SYSUTCDATETIME()'];
  const req = pool.request().input('id', sql.BigInt, idEnsayo);
  if (body.fecha_prueba !== undefined) {
    sets.push('fecha_prueba = @fecha_prueba');
    req.input('fecha_prueba', sql.Date, body.fecha_prueba);
    // Registrar quién/cuándo/por qué se cambió la fecha (auditoría). La
    // fecha_prueba_programada queda intacta como referencia teórica.
    sets.push('fecha_ajustada_por_oid = @faj_oid');
    sets.push('fecha_ajustada_por_email = @faj_email');
    sets.push('fecha_ajustada_en = SYSUTCDATETIME()');
    sets.push('fecha_ajustada_motivo = @faj_motivo');
    req.input('faj_oid', sql.NVarChar(100), usuario.oid);
    req.input('faj_email', sql.NVarChar(200), usuario.email);
    req.input('faj_motivo', sql.NVarChar(500), body.fecha_ajustada_motivo ?? null);
  }
  if (body.notas !== undefined) {
    sets.push('notas = @notas');
    req.input('notas', sql.NVarChar(sql.MAX), body.notas);
  }
  if (sets.length === 1) {
    throw new ErrorLab('SIN_CAMBIOS', 'Body vacío: nada que actualizar.', 400);
  }
  const r = await req.query<{ rows: number }>(`
    UPDATE pro_lab.ensayos SET ${sets.join(', ')} WHERE id = @id;
    SELECT @@ROWCOUNT AS rows;
  `);
  if ((r.recordset[0]?.rows ?? 0) === 0) {
    throw new ErrorLab('NO_ENCONTRADO', `Ensayo ${idEnsayo} no encontrado.`, 404);
  }
}

export async function borrarEnsayo(
  pool: sqlModule.ConnectionPool,
  idEnsayo: number,
): Promise<void> {
  // Las fotos que apunten a este ensayo se desligan (quedan como "general" de
  // la muestra). NO se borran: pueden tener valor histórico.
  const r = await pool
    .request()
    .input('id', sql.BigInt, idEnsayo)
    .query<{ rows: number }>(`
    UPDATE pro_lab.fotos_muestra SET id_ensayo = NULL WHERE id_ensayo = @id;
    DELETE FROM pro_lab.ensayos WHERE id = @id;
    SELECT @@ROWCOUNT AS rows;
  `);
  if ((r.recordset[0]?.rows ?? 0) === 0) {
    throw new ErrorLab('NO_ENCONTRADO', `Ensayo ${idEnsayo} no encontrado.`, 404);
  }
}

// =============================================================================
// Mediciones
// =============================================================================

export async function crearMedicion(
  pool: sqlModule.ConnectionPool,
  idEnsayo: number,
  body: CrearMedicionParams,
): Promise<{ id: number }> {
  const rE = await pool
    .request()
    .input('id', sql.BigInt, idEnsayo)
    .query('SELECT 1 FROM pro_lab.ensayos WHERE id = @id');
  if (rE.recordset.length === 0) {
    throw new ErrorLab('ENSAYO_NO_ENCONTRADO', `Ensayo ${idEnsayo} no existe.`, 404);
  }

  const r = await pool
    .request()
    .input('id_ensayo', sql.BigInt, idEnsayo)
    .input('resistencia_mpa', sql.Decimal(7, 2), body.resistencia_mpa)
    .input('orden', sql.Int, body.orden ?? 1)
    .input('notas', sql.NVarChar(500), body.notas ?? null)
    .query<{ id: number }>(`
      INSERT INTO pro_lab.mediciones (id_ensayo, resistencia_mpa, orden, notas)
      OUTPUT INSERTED.id
      VALUES (@id_ensayo, @resistencia_mpa, @orden, @notas)
    `);
  const idNueva = r.recordset[0]?.id;
  if (!idNueva) throw new ErrorLab('INSERT_FALLO', 'No se pudo crear la medición.', 500);
  return { id: idNueva };
}

export async function actualizarMedicion(
  pool: sqlModule.ConnectionPool,
  idMedicion: number,
  body: ActualizarMedicionParams,
): Promise<void> {
  const sets: string[] = [];
  const req = pool.request().input('id', sql.BigInt, idMedicion);
  if (body.resistencia_mpa !== undefined) {
    sets.push('resistencia_mpa = @resistencia_mpa');
    req.input('resistencia_mpa', sql.Decimal(7, 2), body.resistencia_mpa);
  }
  if (body.orden !== undefined) {
    sets.push('orden = @orden');
    req.input('orden', sql.Int, body.orden);
  }
  if (body.notas !== undefined) {
    sets.push('notas = @notas');
    req.input('notas', sql.NVarChar(500), body.notas);
  }
  if (sets.length === 0) {
    throw new ErrorLab('SIN_CAMBIOS', 'Body vacío: nada que actualizar.', 400);
  }
  const r = await req.query<{ rows: number }>(`
    UPDATE pro_lab.mediciones SET ${sets.join(', ')} WHERE id = @id;
    SELECT @@ROWCOUNT AS rows;
  `);
  if ((r.recordset[0]?.rows ?? 0) === 0) {
    throw new ErrorLab('NO_ENCONTRADA', `Medición ${idMedicion} no encontrada.`, 404);
  }
}

export async function borrarMedicion(
  pool: sqlModule.ConnectionPool,
  idMedicion: number,
): Promise<void> {
  const r = await pool
    .request()
    .input('id', sql.BigInt, idMedicion)
    .query<{ rows: number }>(`
    DELETE FROM pro_lab.mediciones WHERE id = @id;
    SELECT @@ROWCOUNT AS rows;
  `);
  if ((r.recordset[0]?.rows ?? 0) === 0) {
    throw new ErrorLab('NO_ENCONTRADA', `Medición ${idMedicion} no encontrada.`, 404);
  }
}

// =============================================================================
// Curva teórica (lookup table compartida — solo lectura)
// =============================================================================

export async function obtenerCurvaTeorica(
  pool: sqlModule.ConnectionPool,
): Promise<PuntoCurvaTeorica[]> {
  const r = await pool.request().query<{
    edad_dias: number;
    pct_resistencia: number;
    descripcion: string | null;
  }>(`
    SELECT edad_dias, pct_resistencia, descripcion
    FROM pro_lab.curva_teorica
    ORDER BY edad_dias
  `);
  return r.recordset.map((row) => ({
    edad_dias: row.edad_dias,
    pct_resistencia: Number(row.pct_resistencia),
    descripcion: row.descripcion,
  }));
}

// =============================================================================
// Importación / reconciliación del Excel de laboratorio
// (`PRUEBAS RESISTENCIA A LA COMPRESIÓN DEL CONCRETO 2025.xlsx`)
//
// Estructura esperada (hoja "BASE DATOS"):
//   - Fila 1-9: encabezados y metadata.
//   - Fila 10+: datos. Cada fila = una muestra con hasta 3 ensayos (7/14/28d).
//
// Columnas (0-indexed):
//    1  N° MUESTRA       "M - 1"
//    2  PROYECTO         "VALLE NOVARUM"
//    3  ID CASA          "VN-M.12" (works_no si matchea con pro_bi.dim_obra)
//    4  ACTIVIDAD        "MUROS 1N"
//    5  FECHA DE COLADO  DD/MM/YY
//    6  PROVEEDOR        "ADELANTE DESARROLLOS"
//    7  TIPO CONCRETO    "210 KG/CM2 AUTOCOMPACTANTE"
//    9  FECHA PRUEBA 7d      10  RESISTENCIA MPa 7d
//   14  FECHA PRUEBA 14d     15  RESISTENCIA MPa 14d
//   19  FECHA PRUEBA 28d     20  RESISTENCIA MPa 28d
//
// Matching: el `numero_muestra` de la BD NO alinea con el "M-N" del Excel, así
// que el match se hace por (fecha_colado + casa/obra normalizada). Upsert
// idempotente: correr dos veces el mismo Excel no duplica nada.
// =============================================================================

interface FilaParsed {
  fila_excel: number;
  numero_texto: string;
  id_casa: string;
  casa_key: string;
  actividad_nombre: string;
  fecha_colado: string;
  proveedor: string;
  tipo_concreto_raw: string;
  fc_objetivo: number;
  categoria: CategoriaConcreto;
  ensayos: { edad_dias: number; fecha_prueba: string | null; mpa: number }[];
}

/** Año piso del dataset del laboratorio. Fechas de colado antes de esto = typos. */
const ANIO_PISO_DATASET = 2024;

/** Suma `dias` a una fecha ISO (YYYY-MM-DD) y devuelve ISO. UTC para no depender de TZ. */
function sumarDiasIso(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Parsea DD/MM/YY o DD/MM/YYYY a YYYY-MM-DD. Corrige el typo de década (año
 * de 2 dígitos escrito "06" en vez de "26"): cuando cae antes de 2024 lo
 * empuja +20 años y marca `corregido`.
 */
function parsearFecha(valor: unknown): { iso: string; corregido: boolean } | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const s = String(valor).trim();

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    const dia = m[1]?.padStart(2, '0');
    const mes = m[2]?.padStart(2, '0');
    const anioRaw = m[3];
    if (!dia || !mes || !anioRaw) return null;
    let corregido = false;
    let anioNum: number;
    if (anioRaw.length === 2) {
      let y = Number.parseInt(anioRaw, 10);
      if (2000 + y < ANIO_PISO_DATASET) {
        y += 20;
        corregido = true;
      }
      anioNum = 2000 + y;
    } else {
      anioNum = Number.parseInt(anioRaw, 10);
      if (anioNum < ANIO_PISO_DATASET) {
        anioNum += 20;
        corregido = true;
      }
    }
    return { iso: `${anioNum}-${mes}-${dia}`, corregido };
  }

  // Número serial de Excel.
  const n = Number(s);
  if (Number.isFinite(n) && n > 30000 && n < 100000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + n * 86400000);
    return { iso: d.toISOString().slice(0, 10), corregido: false };
  }
  return null;
}

function parsearMpa(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0 || n > 200) return null; // descartamos basura
  return Math.round(n * 100) / 100;
}

/** Extrae F'C numérico del texto del Excel ("210 KG/CM2..." → 210). */
function parsearFc(texto: string): number {
  const m = texto.match(/\b(\d{2,4})\b/);
  if (m?.[1]) {
    const n = Number.parseInt(m[1], 10);
    if (n >= 100 && n <= 600) return n;
  }
  return 210; // default razonable
}

function parsearCategoria(texto: string): CategoriaConcreto {
  const upper = texto.toUpperCase();
  if (upper.includes('AUTOCOMPACTANTE') || upper.includes('AUTOCOMPACTABLE')) {
    return 'autocompactable';
  }
  return 'convencional';
}

/**
 * Normaliza una casa/obra para comparar entre Excel y BD: mayúsculas, sin
 * espacios, sin puntos/guiones/underscores. Así "VN-M.12" == "VNM12".
 */
export function normalizarCasa(s: string | null | undefined): string {
  return String(s ?? '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[.\-_]/g, '')
    .trim();
}

/** Parsea el contenido del Excel a filas estructuradas. No toca BD. */
export function parsearExcelLab(buffer: Buffer): {
  filas: FilaParsed[];
  errores: ErrorImportLab[];
  advertencias: string[];
} {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  if (!wb.SheetNames.includes('BASE DATOS')) {
    throw new Error(`El Excel no tiene la hoja "BASE DATOS" (hojas: ${wb.SheetNames.join(', ')})`);
  }
  const sheet = wb.Sheets['BASE DATOS'];
  if (!sheet) throw new Error('Hoja BASE DATOS vacía');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });

  const filas: FilaParsed[] = [];
  const errores: ErrorImportLab[] = [];
  const advertencias: string[] = [];

  // Datos arrancan en fila 10 (idx 9). Toleramos huecos: paramos tras 5 filas
  // vacías consecutivas.
  for (let i = 9; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const numeroTexto = String(r[1] ?? '').trim();
    if (!numeroTexto) {
      let huecos = 1;
      let j = i + 1;
      while (j < rows.length && huecos < 5) {
        if (!String(rows[j]?.[1] ?? '').trim()) huecos++;
        else break;
        j++;
      }
      if (huecos >= 5) break;
      continue;
    }

    // Solo procesamos filas que claramente son una muestra ("M - 1", "M-12").
    if (!/^M\s*-?\s*\d+/i.test(numeroTexto)) continue;

    const idCasa = String(r[3] ?? '').trim();
    const actividad = String(r[4] ?? '').trim();
    const fechaColadoRaw = r[5];
    const proveedor = String(r[6] ?? '').trim() || 'ADELANTE DESARROLLOS';
    const tipoConcreto = String(r[7] ?? '').trim();

    const fechaParsed = parsearFecha(fechaColadoRaw);
    if (!fechaParsed) {
      errores.push({
        fila_excel: i + 1,
        numero_muestra: numeroTexto,
        mensaje: `Fecha de colado inválida: "${fechaColadoRaw}"`,
      });
      continue;
    }
    if (fechaParsed.corregido) {
      advertencias.push(
        `Fila ${i + 1} (${numeroTexto}): fecha de colado "${fechaColadoRaw}" corregida a ${fechaParsed.iso} (typo de año). Conviene arreglarla en el Excel origen.`,
      );
    }
    if (!actividad) {
      errores.push({
        fila_excel: i + 1,
        numero_muestra: numeroTexto,
        mensaje: 'Falta actividad',
      });
      continue;
    }

    // Ensayos 7/14/28 días. Solo guardamos los que traen MPa (resultado).
    const ensayos: FilaParsed['ensayos'] = [];
    const colsEnsayo = [
      { edad: 7, colFecha: 9, colMpa: 10 },
      { edad: 14, colFecha: 14, colMpa: 15 },
      { edad: 28, colFecha: 19, colMpa: 20 },
    ];
    for (const e of colsEnsayo) {
      const fp = parsearFecha(r[e.colFecha]);
      const mpa = parsearMpa(r[e.colMpa]);
      if (mpa !== null) {
        ensayos.push({ edad_dias: e.edad, fecha_prueba: fp?.iso ?? null, mpa });
      }
    }

    filas.push({
      fila_excel: i + 1,
      numero_texto: numeroTexto,
      id_casa: idCasa,
      casa_key: normalizarCasa(idCasa),
      actividad_nombre: actividad,
      fecha_colado: fechaParsed.iso,
      proveedor,
      tipo_concreto_raw: tipoConcreto,
      fc_objetivo: parsearFc(tipoConcreto),
      categoria: parsearCategoria(tipoConcreto),
      ensayos,
    });
  }

  return { filas, errores, advertencias };
}

interface MuestraExistente {
  id: number;
  numero_muestra: number;
  fecha_colado: string;
  casa_key: string;
  id_actividad: number;
  consumida: boolean;
}

interface EnsayoExistente {
  id: number;
  edad_dias: number;
  fecha_prueba: string | null;
  tiene_medicion: boolean;
}

/**
 * Importa/reconcilia el Excel a la BD en una transacción única. Match por
 * (fecha_colado + casa), upsert de ensayos/mediciones.
 */
export async function importarExcelLab(
  pool: sqlModule.ConnectionPool,
  buffer: Buffer,
  usuario: ActorLab,
): Promise<ImportarExcelLabResponse> {
  const { filas, errores: erroresParseo, advertencias } = parsearExcelLab(buffer);

  const respuestaVacia: ImportarExcelLabResponse = {
    total_filas: 0,
    muestras_insertadas: 0,
    muestras_actualizadas: 0,
    muestras_duplicadas: 0,
    ensayos_insertados: 0,
    ensayos_actualizados: 0,
    mediciones_insertadas: 0,
    actividades_creadas: 0,
    advertencias,
    errores: erroresParseo,
  };
  if (filas.length === 0) return respuestaVacia;

  const errores = [...erroresParseo];
  let insertadas = 0;
  let actualizadas = 0;
  let sinCambios = 0;
  let ensayosIns = 0;
  let ensayosAct = 0;
  let medicionesIns = 0;
  let actividadesCreadas = 0;

  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    // --- Pre-cargar índice de muestras existentes por (fecha + casa) ---
    const rMuestras = await tx.request().query<{
      id: number;
      numero_muestra: number;
      fecha_colado: string | Date;
      obra_works_no: string | null;
      id_casa: string | null;
      id_actividad: number;
    }>(`
      SELECT id, numero_muestra, fecha_colado, obra_works_no, id_casa, id_actividad
      FROM pro_lab.muestras
    `);
    const indexMuestras = new Map<string, MuestraExistente[]>();
    let maxNumero = 0;
    for (const m of rMuestras.recordset) {
      const iso =
        m.fecha_colado instanceof Date
          ? m.fecha_colado.toISOString().slice(0, 10)
          : String(m.fecha_colado).slice(0, 10);
      const casaKey = normalizarCasa(m.obra_works_no || m.id_casa);
      const clave = `${iso}#${casaKey}`;
      const registro: MuestraExistente = {
        id: m.id,
        numero_muestra: m.numero_muestra,
        fecha_colado: iso,
        casa_key: casaKey,
        id_actividad: m.id_actividad,
        consumida: false,
      };
      if (!indexMuestras.has(clave)) indexMuestras.set(clave, []);
      indexMuestras.get(clave)?.push(registro);
      if (m.numero_muestra > maxNumero) maxNumero = m.numero_muestra;
    }
    let siguienteNumero = maxNumero + 1;

    // --- Pre-cargar actividades (case-insensitive) ---
    const rAct = await tx
      .request()
      .query<{ id: number; nombre: string }>('SELECT id, nombre FROM pro_lab.actividades');
    const actividadesPorNombre = new Map<string, number>();
    let idActividadPorAsignar: number | null = null;
    for (const a of rAct.recordset) {
      const clave = a.nombre.toUpperCase().trim();
      actividadesPorNombre.set(clave, a.id);
      if (clave === 'POR ASIGNAR') idActividadPorAsignar = a.id;
    }

    // --- Pre-cargar works_no de pro_bi.dim_obra ---
    const rObras = await tx.request().query<{ works_no: string }>('SELECT works_no FROM pro_bi.dim_obra');
    const worksNoExistentes = new Set(rObras.recordset.map((x) => x.works_no));

    // Resuelve/crea id de actividad por nombre.
    const resolverActividad = async (nombre: string): Promise<number> => {
      const clave = nombre.toUpperCase().trim();
      const cache = actividadesPorNombre.get(clave);
      if (cache !== undefined) return cache;
      const rNueva = await tx
        .request()
        .input('nombre', sql.NVarChar(100), nombre)
        .input('orden', sql.Int, 100)
        .query<{ id: number }>(
          'INSERT INTO pro_lab.actividades (nombre, orden) OUTPUT INSERTED.id VALUES (@nombre, @orden)',
        );
      const id = rNueva.recordset[0]?.id;
      if (id === undefined) throw new Error('INSERT actividad no devolvió id');
      actividadesPorNombre.set(clave, id);
      actividadesCreadas++;
      return id;
    };

    // Crea ensayo + medición para una muestra.
    const crearEnsayoConMedicion = async (
      idMuestra: number,
      edad: number,
      fechaPrueba: string | null,
      fechaProgramada: string | null,
      mpa: number,
    ) => {
      const rEns = await tx
        .request()
        .input('id_muestra', sql.BigInt, idMuestra)
        .input('edad_dias', sql.Int, edad)
        .input('fecha_prueba', sql.Date, fechaPrueba)
        .input('fecha_programada', sql.Date, fechaProgramada)
        .input('oid', sql.NVarChar(100), usuario.oid)
        .query<{ id: number }>(`
          INSERT INTO pro_lab.ensayos (id_muestra, edad_dias, fecha_prueba, fecha_prueba_programada, creado_por_oid)
          OUTPUT INSERTED.id
          VALUES (@id_muestra, @edad_dias, @fecha_prueba, @fecha_programada, @oid)
        `);
      const idEnsayo = rEns.recordset[0]?.id;
      if (!idEnsayo) throw new Error('INSERT ensayo no devolvió id');
      ensayosIns++;
      await tx
        .request()
        .input('id_ensayo', sql.BigInt, idEnsayo)
        .input('mpa', sql.Decimal(7, 2), mpa)
        .input('orden', sql.Int, 1)
        .query(
          'INSERT INTO pro_lab.mediciones (id_ensayo, resistencia_mpa, orden) VALUES (@id_ensayo, @mpa, @orden)',
        );
      medicionesIns++;
    };

    for (const f of filas) {
      try {
        const clave = `${f.fecha_colado}#${f.casa_key}`;
        // Solo matchea por casa si la casa no está vacía (evita que todas las
        // de casa vacía colapsen en una sola clave).
        const match =
          f.casa_key !== '' ? indexMuestras.get(clave)?.find((c) => !c.consumida) : undefined;

        if (!match) {
          // === Muestra NUEVA ===
          const idActividad = await resolverActividad(f.actividad_nombre);
          const obraWorksNo = worksNoExistentes.has(f.id_casa) ? f.id_casa : null;
          const idCasaTexto = obraWorksNo === null ? f.id_casa : null;
          const numero = siguienteNumero++;

          const rIns = await tx
            .request()
            .input('numero_muestra', sql.Int, numero)
            .input('obra_works_no', sql.NVarChar(20), obraWorksNo)
            .input('id_casa', sql.NVarChar(50), idCasaTexto)
            .input('id_actividad', sql.Int, idActividad)
            .input('fecha_colado', sql.Date, f.fecha_colado)
            .input('proveedor', sql.NVarChar(100), f.proveedor)
            .input('fc_objetivo', sql.Int, f.fc_objetivo)
            .input('categoria_concreto', sql.NVarChar(20), f.categoria)
            .input('tipo_concreto_libre', sql.NVarChar(100), f.tipo_concreto_raw)
            .input('oid', sql.NVarChar(100), usuario.oid)
            .input('email', sql.NVarChar(200), usuario.email)
            .query<{ id: number }>(`
              INSERT INTO pro_lab.muestras (
                numero_muestra, obra_works_no, id_casa, id_actividad, fecha_colado,
                proveedor, fc_objetivo, categoria_concreto, tipo_concreto_libre,
                creado_por_oid, creado_por_email
              )
              OUTPUT INSERTED.id
              VALUES (
                @numero_muestra, @obra_works_no, @id_casa, @id_actividad, @fecha_colado,
                @proveedor, @fc_objetivo, @categoria_concreto, @tipo_concreto_libre,
                @oid, @email
              )
            `);
          const idMuestra = rIns.recordset[0]?.id;
          if (!idMuestra) throw new Error('INSERT muestra no devolvió id');
          insertadas++;
          // Registrar en el índice para que filas siguientes con misma (fecha,
          // casa) no la re-creen.
          const nuevoReg: MuestraExistente = {
            id: idMuestra,
            numero_muestra: numero,
            fecha_colado: f.fecha_colado,
            casa_key: f.casa_key,
            id_actividad: idActividad,
            consumida: true,
          };
          if (!indexMuestras.has(clave)) indexMuestras.set(clave, []);
          indexMuestras.get(clave)?.push(nuevoReg);

          for (const e of f.ensayos) {
            const programada = sumarDiasIso(f.fecha_colado, e.edad_dias);
            await crearEnsayoConMedicion(idMuestra, e.edad_dias, e.fecha_prueba, programada, e.mpa);
          }
          continue;
        }

        // === Muestra EXISTENTE (upsert de ensayos) ===
        match.consumida = true;
        let huboCambio = false;

        // Actualizar actividad SOLO si la existente es 'POR ASIGNAR'.
        if (
          idActividadPorAsignar !== null &&
          match.id_actividad === idActividadPorAsignar &&
          f.actividad_nombre
        ) {
          const idActNueva = await resolverActividad(f.actividad_nombre);
          if (idActNueva !== match.id_actividad) {
            await tx
              .request()
              .input('id', sql.BigInt, match.id)
              .input('act', sql.Int, idActNueva)
              .query(
                'UPDATE pro_lab.muestras SET id_actividad = @act, actualizado_en = SYSUTCDATETIME() WHERE id = @id',
              );
            match.id_actividad = idActNueva;
            huboCambio = true;
          }
        }

        // Cargar ensayos existentes de esta muestra.
        const rEns = await tx
          .request()
          .input('id', sql.BigInt, match.id)
          .query<{
            id: number;
            edad_dias: number;
            fecha_prueba: string | Date | null;
            med: number;
          }>(`
            SELECT e.id, e.edad_dias, e.fecha_prueba,
                   (SELECT COUNT(*) FROM pro_lab.mediciones md WHERE md.id_ensayo = e.id) AS med
            FROM pro_lab.ensayos e
            WHERE e.id_muestra = @id
          `);
        const ensayosPorEdad = new Map<number, EnsayoExistente>();
        for (const e of rEns.recordset) {
          const iso =
            e.fecha_prueba instanceof Date
              ? e.fecha_prueba.toISOString().slice(0, 10)
              : e.fecha_prueba
                ? String(e.fecha_prueba).slice(0, 10)
                : null;
          ensayosPorEdad.set(e.edad_dias, {
            id: e.id,
            edad_dias: e.edad_dias,
            fecha_prueba: iso,
            tiene_medicion: e.med > 0,
          });
        }

        for (const e of f.ensayos) {
          const existente = ensayosPorEdad.get(e.edad_dias);
          if (!existente) {
            // Ensayo no existe → crear ensayo + medición.
            const programada = sumarDiasIso(f.fecha_colado, e.edad_dias);
            await crearEnsayoConMedicion(match.id, e.edad_dias, e.fecha_prueba, programada, e.mpa);
            huboCambio = true;
            continue;
          }
          if (existente.tiene_medicion) {
            // Ya tiene resultado → respetar (no pisar trabajo manual).
            continue;
          }
          // Ensayo existe pero vacío → agregar medición y completar fecha.
          if (e.fecha_prueba && existente.fecha_prueba !== e.fecha_prueba) {
            await tx
              .request()
              .input('id', sql.BigInt, existente.id)
              .input('fp', sql.Date, e.fecha_prueba)
              .query(
                'UPDATE pro_lab.ensayos SET fecha_prueba = @fp, actualizado_en = SYSUTCDATETIME() WHERE id = @id',
              );
            ensayosAct++;
          }
          await tx
            .request()
            .input('id_ensayo', sql.BigInt, existente.id)
            .input('mpa', sql.Decimal(7, 2), e.mpa)
            .input('orden', sql.Int, 1)
            .query(
              'INSERT INTO pro_lab.mediciones (id_ensayo, resistencia_mpa, orden) VALUES (@id_ensayo, @mpa, @orden)',
            );
          medicionesIns++;
          huboCambio = true;
        }

        if (huboCambio) actualizadas++;
        else sinCambios++;
      } catch (e) {
        errores.push({
          fila_excel: f.fila_excel,
          numero_muestra: f.numero_texto,
          mensaje: e instanceof Error ? e.message : 'Error desconocido',
        });
      }
    }

    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }

  return {
    total_filas: filas.length,
    muestras_insertadas: insertadas,
    muestras_actualizadas: actualizadas,
    muestras_duplicadas: sinCambios,
    ensayos_insertados: ensayosIns,
    ensayos_actualizados: ensayosAct,
    mediciones_insertadas: medicionesIns,
    actividades_creadas: actividadesCreadas,
    advertencias,
    errores,
  };
}
