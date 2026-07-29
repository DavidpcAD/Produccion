import { createHash } from 'node:crypto';
import type sqlModule from 'mssql';
import { sql } from '@/lib/db-adelantedb';
import type {
  AgrupacionIngesta,
  AlarmaParseada,
  BatchConAlarmas,
  BatchParseado,
  Delta,
  ErrorIngesta,
  ErrorParseo,
  IngestaBlendResponse,
  ResultadoParseo,
} from './tipos-ingesta';

// Portado FIEL de `api/src/lib/ingestor-blend.ts` (parser) y
// `api/src/lib/procesar-ingesta.ts` (transacción/dedup/validación/inserts) de la
// app original `adelante-control-concreto`. SQL contra `hor.batches`,
// `hor.batches_alarmas`, `hor.importaciones_csv`, `hor.plantas`, `hor.recetas_blend`.

// =============================================================================
// PARSER DEL CSV BLEND
// =============================================================================
//
// El archivo CSV de la planta dosificadora Blend BBOp trae 157 columnas (muchas
// reservadas y vacías). Este bloque convierte un CSV crudo a una lista de batches
// estructurados listos para insertar, sin tocar la base de datos.
//
// Convenciones:
//  - Fechas: `DD/MM/YYYY HH:MM:SS` en hora local de Costa Rica + columna separada
//    `TimeZone_Bias = "GMT-06:00"`. CR no observa DST → asumimos GMT-06:00 fijo y
//    guardamos todos los timestamps como UTC interno (sumando 6h a la hora local).
//  - Booleanos: `"Si"` / `"No"` (case-sensitive). Vacío → null.
//  - Decimales: punto como separador decimal. Vacío → null.
//  - Deltas: `"VALOR(PCT%)"` ej. `"-245.58(-43.0%)"`.
//  - Recipe_Name: puede traer sufijo `" *"` (receta editada manualmente).
//  - Encoding: UTF-8 con BOM opcional. Line endings: CRLF o LF.
//
// El parser es tolerante: filas malformadas se acumulan en `errores` con número
// de fila (1-indexed, header = fila 1) pero el parseo continúa.

// ─── Índices de columnas (0-based) en el CSV de Blend BBOp ──────────────────

const COL = {
  recordNo: 0,
  swVersion: 1,
  machineSn: 2,
  company: 3,
  customer: 4,
  operator: 5,
  gpsValid: 6,
  gpsLat: 7,
  gpsLon: 8,
  fechaInicio: 9,
  fechaFin: 10,
  timezoneBias: 11,
  recipeName: 12,
  aggANombre: 13,
  aggADosis: 14,
  aggBNombre: 17,
  aggBDosis: 18,
  cementoDosis: 25,
  aguaDosis: 27,
  aditivo1Dosis: 28,
  aditivo2Dosis: 29,
  aditivo3Dosis: 30,
  productionRate: 31,
  productionRateAdj: 32,
  waterDosageAdj: 33,
  waterTotalAdj: 34,
  tempInicio: 42,
  tempFin: 43,
  concreteCons: 44,
  aggACons: 45,
  aggALordo: 46,
  aggATeor: 47,
  aggADelta: 48,
  aggBCons: 53,
  aggBLordo: 54,
  aggBTeor: 55,
  aggBDelta: 56,
  cementoCons: 69,
  cementoTeor: 70,
  cementoDelta: 71,
  aguaCons: 75,
  aguaTeor: 76,
  aguaDelta: 77,
  aditivo1Cons: 78,
  aditivo1Teor: 79,
  aditivo1Delta: 80,
  aditivo2Cons: 81,
  aditivo2Teor: 82,
  aditivo2Delta: 83,
  aditivo3Cons: 84,
  aditivo3Teor: 85,
  aditivo3Delta: 86,
  aggAMoisture: 87,
  aggBMoisture: 95,
  waterCementRatio: 111,
  cementoSiloStop: 118,
  /** Inicio del bloque de 32 alarmas. */
  alarmStart: 125,
} as const;

const ALARMAS_CANTIDAD = 32;

// ─── Helpers de parseo de valores individuales ──────────────────────────────

/**
 * Convierte una fecha CR (`"DD/MM/YYYY HH:MM:SS"`) a `Date` en UTC.
 * Asume zona fija GMT-06:00 (Costa Rica no observa DST).
 */
export function parsearFechaCR(s: string): Date {
  const t = s.trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m || !m[1] || !m[2] || !m[3] || !m[4] || !m[5] || !m[6]) {
    throw new Error(`Fecha inválida: "${s}". Esperado "DD/MM/YYYY HH:MM:SS".`);
  }
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const anio = Number(m[3]);
  const hora = Number(m[4]);
  const minuto = Number(m[5]);
  const segundo = Number(m[6]);
  // CR está 6h detrás de UTC → sumamos 6h a la hora local para obtener UTC.
  return new Date(Date.UTC(anio, mes - 1, dia, hora + 6, minuto, segundo));
}

/** `""` → null, sino parseFloat. Tira si el valor no es numérico. */
export function parsearDecimal(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) {
    throw new Error(`Número decimal inválido: "${s}".`);
  }
  return n;
}

/** Versión requerida: lanza si vacío. */
export function parsearDecimalRequerido(s: string, campo: string): number {
  const v = parsearDecimal(s);
  if (v === null) {
    throw new Error(`Campo requerido vacío: ${campo}.`);
  }
  return v;
}

/** Igual que `parsearDecimal` pero defaultea a 0 si vacío. */
export function parsearDecimalODefault(s: string, porDefecto: number): number {
  const v = parsearDecimal(s);
  return v === null ? porDefecto : v;
}

/** `"Si"` → true, `"No"` → false. Case-sensitive y estricto. */
export function parsearBoolSiNo(s: string): boolean {
  if (s === 'Si') return true;
  if (s === 'No') return false;
  throw new Error(`Booleano inválido: "${s}". Esperado "Si" o "No".`);
}

/** Versión nullable: `""` → null, sino delega en `parsearBoolSiNo`. */
export function parsearBoolSiNoNullable(s: string): boolean | null {
  if (s.trim() === '') return null;
  return parsearBoolSiNo(s);
}

/** `""` → null, sino devuelve el string trim. */
export function parsearStringNullable(s: string): string | null {
  const t = s.trim();
  return t === '' ? null : t;
}

/**
 * Parsea un campo Delta del formato `"VALOR(PCT%)"` (ej. `"-245.58(-43.0%)"`).
 *  - Vacío → `null`.
 *  - Formato estándar → `{ valor, porcentaje }`.
 *  - Porcentaje garbleado por Blend (división por cero) → `{ valor, porcentaje: null }`.
 *  - Cualquier otro formato → throw.
 */
export function parsearDelta(s: string): Delta | null {
  const t = s.trim();
  if (t === '') return null;

  // 1) Formato estándar: valor y porcentaje ambos numéricos limpios.
  const estandar = t.match(/^(-?\d+(?:\.\d+)?)\((-?\d+(?:\.\d+)?)%\)$/);
  if (estandar?.[1] && estandar[2]) {
    return { valor: Number(estandar[1]), porcentaje: Number(estandar[2]) };
  }

  // 2) Formato tolerante: valor numérico limpio + porcentaje garbleado.
  const tolerante = t.match(/^(-?\d+(?:\.\d+)?)\([^)]*%\)$/);
  if (tolerante?.[1]) {
    return { valor: Number(tolerante[1]), porcentaje: null };
  }

  throw new Error(`Delta inválido: "${s}". Esperado formato "VALOR(PCT%)".`);
}

/** Indica si el nombre de receta termina en `" *"` (editada manualmente). */
export function esRecetaModificada(recipeName: string): boolean {
  return recipeName.endsWith(' *');
}

/** Devuelve el nombre de receta sin el sufijo `" *"` y trimeado. */
export function recetaBase(recipeName: string): string {
  if (esRecetaModificada(recipeName)) {
    return recipeName.slice(0, -2).trim();
  }
  return recipeName.trim();
}

/**
 * Extrae las alarmas del ciclo desde una fila ya splitteada. Recorre 32 slots
 * a partir de `offsetInicio` y descarta vacíos. Formato esperado de cada slot:
 * `"605-Water regulation error"`. Si no hay guion, el valor completo va como
 * `codigo` y `descripcion` queda vacía.
 */
export function extraerAlarmas(
  fila: readonly string[],
  offsetInicio: number = COL.alarmStart,
  cantidad: number = ALARMAS_CANTIDAD,
): AlarmaParseada[] {
  const alarmas: AlarmaParseada[] = [];
  for (let i = 0; i < cantidad; i++) {
    const crudo = fila[offsetInicio + i] ?? '';
    const valor = crudo.trim();
    if (valor === '') continue;
    const idx = valor.indexOf('-');
    if (idx === -1) {
      alarmas.push({ posicion: i + 1, codigo: valor, descripcion: '' });
    } else {
      alarmas.push({
        posicion: i + 1,
        codigo: valor.slice(0, idx).trim(),
        descripcion: valor.slice(idx + 1).trim(),
      });
    }
  }
  return alarmas;
}

// ─── Splitter de líneas CSV (RFC 4180 simplificado) ──────────────────────────

/**
 * Divide una línea CSV en campos respetando comillas dobles.
 *  - Campos opcionalmente entre `"..."`.
 *  - `""` dentro de un campo entre comillas representa una comilla literal.
 *  - Fuera de comillas, `,` separa campos.
 *  - Opera sobre UNA línea (el CSV de Blend no usa saltos de línea en comillas).
 */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let actual = '';
  let enComillas = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (enComillas) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          actual += '"';
          i++;
        } else {
          enComillas = false;
        }
      } else {
        actual += c;
      }
    } else if (c === '"') {
      enComillas = true;
    } else if (c === ',') {
      fields.push(actual);
      actual = '';
    } else {
      actual += c;
    }
  }
  fields.push(actual);
  return fields;
}

// ─── Parseo de fila → BatchConAlarmas ────────────────────────────────────────

function get(fila: readonly string[], idx: number): string {
  return fila[idx] ?? '';
}

function parsearFilaBatch(fila: readonly string[]): BatchConAlarmas {
  // Campos requeridos
  const recordNoStr = get(fila, COL.recordNo);
  const recordNo = Number(recordNoStr.trim());
  if (!Number.isInteger(recordNo) || recordNo <= 0) {
    throw new Error(`Record no inválido: "${recordNoStr}".`);
  }

  const machineSn = get(fila, COL.machineSn).trim();
  if (machineSn === '') {
    throw new Error('Machine_SN vacío.');
  }

  const fechaInicio = parsearFechaCR(get(fila, COL.fechaInicio));
  const fechaFin = parsearFechaCR(get(fila, COL.fechaFin));

  const recipeNameRaw = get(fila, COL.recipeName);
  if (recipeNameRaw.trim() === '') {
    throw new Error('Recipe_Name vacío.');
  }

  const m3Producidos = parsearDecimalRequerido(get(fila, COL.concreteCons), 'Concrete_Cons');

  const alarmas = extraerAlarmas(fila);

  const batch: BatchParseado = {
    recordNo,
    swVersion: parsearStringNullable(get(fila, COL.swVersion)),
    machineSn,
    company: parsearStringNullable(get(fila, COL.company)),
    customer: parsearStringNullable(get(fila, COL.customer)),
    operador: parsearStringNullable(get(fila, COL.operator)),
    gpsValido: parsearBoolSiNoNullable(get(fila, COL.gpsValid)),
    gpsLat: parsearDecimal(get(fila, COL.gpsLat)),
    gpsLon: parsearDecimal(get(fila, COL.gpsLon)),
    fechaInicio,
    fechaFin,
    timezoneBias: parsearStringNullable(get(fila, COL.timezoneBias)),

    recipeNameRaw,
    recetaBase: recetaBase(recipeNameRaw),
    recetaModificada: esRecetaModificada(recipeNameRaw),

    aridoANombre: parsearStringNullable(get(fila, COL.aggANombre)),
    aridoADosisKgM3: parsearDecimal(get(fila, COL.aggADosis)),
    aridoBNombre: parsearStringNullable(get(fila, COL.aggBNombre)),
    aridoBDosisKgM3: parsearDecimal(get(fila, COL.aggBDosis)),
    cementoDosisKgM3: parsearDecimal(get(fila, COL.cementoDosis)),
    aguaDosisLM3: parsearDecimal(get(fila, COL.aguaDosis)),
    aditivo1DosisLM3: parsearDecimal(get(fila, COL.aditivo1Dosis)),
    aditivo2DosisLM3: parsearDecimal(get(fila, COL.aditivo2Dosis)),
    aditivo3DosisLM3: parsearDecimal(get(fila, COL.aditivo3Dosis)),

    productionRate: parsearDecimal(get(fila, COL.productionRate)),
    productionRateAdj: parsearBoolSiNoNullable(get(fila, COL.productionRateAdj)),
    waterDosageAdj: parsearBoolSiNoNullable(get(fila, COL.waterDosageAdj)),
    waterTotalAdjL: parsearDecimal(get(fila, COL.waterTotalAdj)),

    tempAmbienteInicio: parsearDecimal(get(fila, COL.tempInicio)),
    tempAmbienteFin: parsearDecimal(get(fila, COL.tempFin)),

    m3Producidos,

    aridoAKg: parsearDecimalODefault(get(fila, COL.aggACons), 0),
    aridoALordoKg: parsearDecimal(get(fila, COL.aggALordo)),
    aridoAKgTeor: parsearDecimal(get(fila, COL.aggATeor)),
    aridoADelta: parsearDelta(get(fila, COL.aggADelta)),
    aridoBKg: parsearDecimalODefault(get(fila, COL.aggBCons), 0),
    aridoBLordoKg: parsearDecimal(get(fila, COL.aggBLordo)),
    aridoBKgTeor: parsearDecimal(get(fila, COL.aggBTeor)),
    aridoBDelta: parsearDelta(get(fila, COL.aggBDelta)),

    cementoKg: parsearDecimalODefault(get(fila, COL.cementoCons), 0),
    cementoKgTeor: parsearDecimal(get(fila, COL.cementoTeor)),
    cementoDelta: parsearDelta(get(fila, COL.cementoDelta)),
    aguaL: parsearDecimalODefault(get(fila, COL.aguaCons), 0),
    aguaLTeor: parsearDecimal(get(fila, COL.aguaTeor)),
    aguaDelta: parsearDelta(get(fila, COL.aguaDelta)),
    aditivo1L: parsearDecimalODefault(get(fila, COL.aditivo1Cons), 0),
    aditivo1LTeor: parsearDecimal(get(fila, COL.aditivo1Teor)),
    aditivo1Delta: parsearDelta(get(fila, COL.aditivo1Delta)),
    aditivo2L: parsearDecimalODefault(get(fila, COL.aditivo2Cons), 0),
    aditivo2LTeor: parsearDecimal(get(fila, COL.aditivo2Teor)),
    aditivo2Delta: parsearDelta(get(fila, COL.aditivo2Delta)),
    aditivo3L: parsearDecimalODefault(get(fila, COL.aditivo3Cons), 0),
    aditivo3LTeor: parsearDecimal(get(fila, COL.aditivo3Teor)),
    aditivo3Delta: parsearDelta(get(fila, COL.aditivo3Delta)),

    aridoAMoisturePct: parsearDecimal(get(fila, COL.aggAMoisture)),
    aridoBMoisturePct: parsearDecimal(get(fila, COL.aggBMoisture)),

    relacionAguaCemento: parsearDecimal(get(fila, COL.waterCementRatio)),
    cementoSiloStopKg: parsearDecimal(get(fila, COL.cementoSiloStop)),
  };

  return { batch, alarmas };
}

/**
 * SHA-256 hexadecimal del contenido. Determinístico: mismo input → mismo hash.
 * Se usa como clave de duplicación en `hor.importaciones_csv.archivo_hash`.
 */
export function calcularHashArchivo(contenido: string): string {
  return createHash('sha256').update(contenido, 'utf-8').digest('hex');
}

/**
 * Parsea un CSV completo de Blend. NO realiza I/O: input es string, output es
 * un objeto plano. (Antes `parsearCsvBlend` en la app original.)
 */
export function parsearBlend(contenido: string): ResultadoParseo {
  const errores: ErrorParseo[] = [];
  const batches: BatchConAlarmas[] = [];
  const plantasSet = new Set<string>();
  let fechaMin: Date | null = null;
  let fechaMax: Date | null = null;
  let recordMin: number | null = null;
  let recordMax: number | null = null;

  // Strip BOM si existe
  const sinBom = contenido.charCodeAt(0) === 0xfeff ? contenido.slice(1) : contenido;
  // Soportar CRLF y LF
  const lineas = sinBom.split(/\r?\n/);

  let totalFilas = 0;

  // Header = línea 0 (fila 1 en 1-indexed). Datos empiezan en línea 1.
  for (let i = 1; i < lineas.length; i++) {
    const linea = lineas[i] ?? '';
    if (linea.trim() === '') continue;
    totalFilas++;
    const numFila = i + 1;

    try {
      const campos = splitCsvLine(linea);
      const parsed = parsearFilaBatch(campos);
      batches.push(parsed);
      plantasSet.add(parsed.batch.machineSn);

      if (fechaMin === null || parsed.batch.fechaInicio < fechaMin) {
        fechaMin = parsed.batch.fechaInicio;
      }
      if (fechaMax === null || parsed.batch.fechaInicio > fechaMax) {
        fechaMax = parsed.batch.fechaInicio;
      }
      if (recordMin === null || parsed.batch.recordNo < recordMin) {
        recordMin = parsed.batch.recordNo;
      }
      if (recordMax === null || parsed.batch.recordNo > recordMax) {
        recordMax = parsed.batch.recordNo;
      }
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      errores.push({ fila: numFila, mensaje });
    }
  }

  return {
    batches,
    errores,
    resumen: {
      total_filas: totalFilas,
      parseadas_ok: batches.length,
      con_errores: errores.length,
      plantas_machine_sn: [...plantasSet],
      fecha_min: fechaMin,
      fecha_max: fechaMax,
      record_no_min: recordMin,
      record_no_max: recordMax,
    },
  };
}

// =============================================================================
// PROCESAMIENTO DE INGESTA (transacción, dedup, validación, inserts)
// =============================================================================

/**
 * Resultado de agrupación vacío. Se devuelve cuando no se insertaron batches
 * (estados 'duplicado_archivo' y 'parcial sin insertar') o cuando no se
 * proporcionó un agrupador.
 */
const AGRUPACION_VACIA: AgrupacionIngesta = {
  coladasCreadas: 0,
  coladasActualizadas: 0,
  batchesAgrupados: 0,
  warnings: [],
};

/**
 * Redondea un decimal a N posiciones después del punto. Garantiza que el
 * `scale` del valor JS no exceda el declarado en `sql.Decimal()` — el driver
 * mssql rechaza esto con "scale greater than precision" antes de enviar.
 */
function redondearDecimal(valor: number | null, scale: number): number | null {
  if (valor === null || !Number.isFinite(valor)) return null;
  const factor = 10 ** scale;
  return Math.round(valor * factor) / factor;
}

/**
 * Sanitiza un % de humedad de árido. El sensor a veces reporta valores
 * irreales (lecturas de 2220%, 8144%, 16152% en CSV de producción). Real: 0-30%;
 * dejamos pasar hasta 100% por margen. Fuera de rango → null (silencioso).
 */
function sanitizarMoisturePct(valor: number | null): number | null {
  if (valor === null || !Number.isFinite(valor)) return null;
  if (valor < 0 || valor > 100) return null;
  return redondearDecimal(valor, 4);
}

export interface LoggerIngesta {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/**
 * Callback opcional del agrupador automático de coladas. La agrupación es
 * dominio de `lib/concreto/coladas` (otro agente); la ingesta la invoca DENTRO
 * de la misma transacción si el caller la provee. Si no se provee, la ingesta
 * inserta los batches y devuelve `AGRUPACION_VACIA` (los batches quedan sin
 * agrupar hasta que se cablee el agrupador).
 */
export type AgruparBatchesFn = (
  idsBatchesNuevos: number[],
  tx: sqlModule.Transaction,
) => Promise<AgrupacionIngesta>;

export interface OpcionesProcesarIngesta {
  /** Contenido crudo del CSV Blend (UTF-8 plano, NO base64). */
  contenido: string;
  /** Nombre del archivo cargado (para auditoría). */
  nombreArchivo: string;
  /** Desactiva la dedup por hash de archivo. */
  forzarReingesta?: boolean;
  /** Actor de auditoría → session. */
  usuarioOid: string;
  usuarioEmail: string;
  /** Agrupador opcional (dominio coladas). Corre dentro de la transacción. */
  agrupar?: AgruparBatchesFn;
  /** Logger opcional (default: console). */
  logger?: LoggerIngesta;
}

/**
 * Resultado de `procesarIngesta`. El handler HTTP lo mapea a la respuesta:
 *   - status 200 + IngestaBlendResponse → ok
 *   - status 400/500 + { error } → malRequest / errorInterno
 */
export type ResultadoProcesar =
  | { status: 200; body: IngestaBlendResponse }
  | { status: 400 | 500; body: { error: string } };

interface PlantaResuelta {
  machineSn: string;
  idPlanta: number;
}

async function resolverIdPlanta(
  tx: sqlModule.Transaction,
  machineSn: string,
): Promise<number | null> {
  const r = await tx
    .request()
    .input('sn', sql.NVarChar(20), machineSn)
    .query<{ id: number }>('SELECT id FROM hor.plantas WHERE serial = @sn');
  return r.recordset[0]?.id ?? null;
}

async function insertarRegistroImportacion(
  tx: sqlModule.Transaction,
  args: {
    idPlanta: number;
    nombreArchivo: string;
    hash: string;
    filasTotales: number;
    batchesConError: number;
    erroresJson: string | null;
    usuarioOid: string;
    usuarioEmail: string;
  },
): Promise<number> {
  const r = await tx
    .request()
    .input('idPlanta', sql.Int, args.idPlanta)
    .input('archivoNombre', sql.NVarChar(200), args.nombreArchivo)
    .input('archivoHash', sql.NVarChar(64), args.hash)
    .input('filasTotales', sql.Int, args.filasTotales)
    .input('batchesConError', sql.Int, args.batchesConError)
    .input('erroresJson', sql.NVarChar(sql.MAX), args.erroresJson)
    .input('usuarioOid', sql.NVarChar(50), args.usuarioOid)
    .input('usuarioEmail', sql.NVarChar(200), args.usuarioEmail)
    .query<{ id: number }>(`
      INSERT INTO hor.importaciones_csv (
        id_planta, archivo_nombre, archivo_hash, fecha_archivo,
        filas_totales, batches_nuevos, batches_duplicados, batches_con_error,
        errores_json, usuario, usuario_oid, usuario_email,
        estado, blob_url
      )
      OUTPUT INSERTED.id
      VALUES (
        @idPlanta, @archivoNombre, @archivoHash, SYSUTCDATETIME(),
        @filasTotales, 0, 0, @batchesConError,
        @erroresJson, NULL, @usuarioOid, @usuarioEmail,
        'procesando', NULL
      )
    `);

  const fila = r.recordset[0];
  if (!fila) {
    throw new Error('INSERT en hor.importaciones_csv no devolvió id');
  }
  return fila.id;
}

/**
 * Normaliza el nombre de la receta blend antes de buscarla/insertarla.
 * El operador a veces le agrega `" *"` al final para indicar que modificó la
 * receta; para el dominio "Muros" y "Muros *" son el mismo producto.
 */
export function normalizarNombreReceta(raw: string): string {
  return raw
    .trim()
    .replace(/\s*\*+\s*$/, '')
    .trim();
}

/**
 * Resuelve `id_receta_blend` por (id_planta, nombre_texto normalizado). Si no
 * existe, la crea. Devuelve `null` si `recipeNameRaw` es null/vacío.
 */
async function resolverOCrearRecetaBlend(
  tx: sqlModule.Transaction,
  idPlanta: number,
  recipeNameRaw: string | null,
): Promise<number | null> {
  if (recipeNameRaw === null || recipeNameRaw.trim() === '') return null;

  const nombreNormalizado = normalizarNombreReceta(recipeNameRaw);
  if (nombreNormalizado === '') return null;

  const r = await tx
    .request()
    .input('id_planta', sql.Int, idPlanta)
    .input('nombre', sql.NVarChar(50), nombreNormalizado)
    .query<{ id: number }>(`
      SELECT TOP 1 id FROM hor.recetas_blend
      WHERE id_planta = @id_planta AND nombre_texto = @nombre
    `);
  const existente = r.recordset[0]?.id;
  if (existente !== undefined) return existente;

  const ins = await tx
    .request()
    .input('id_planta', sql.Int, idPlanta)
    .input('nombre', sql.NVarChar(50), nombreNormalizado)
    .query<{ id: number }>(`
      INSERT INTO hor.recetas_blend (id_planta, nombre_texto)
      OUTPUT INSERTED.id
      VALUES (@id_planta, @nombre)
    `);
  const nueva = ins.recordset[0]?.id;
  if (nueva === undefined) {
    throw new Error(`No se pudo crear receta_blend ('${nombreNormalizado}', planta ${idPlanta}).`);
  }
  return nueva;
}

/**
 * Pre-carga en memoria los `(id_planta, record_no)` ya existentes en BD para
 * las plantas presentes en el CSV. Convierte N queries en 1 sola query masiva.
 * Retorna un Set<string> con claves "idPlanta::recordNo" para chequeo O(1).
 */
async function precargarRecordNosExistentes(
  tx: sqlModule.Transaction,
  idsPlanta: number[],
): Promise<Set<string>> {
  if (idsPlanta.length === 0) return new Set();

  // Ids inyectados como literal SQL (whitelist por construcción: INT del cache).
  const lista = idsPlanta.map((n) => String(Math.trunc(n))).join(',');
  const r = await tx
    .request()
    .query<{ id_planta: number; record_no: number }>(
      `SELECT id_planta, record_no FROM hor.batches WHERE id_planta IN (${lista})`,
    );

  const set = new Set<string>();
  for (const row of r.recordset) {
    set.add(`${row.id_planta}::${row.record_no}`);
  }
  return set;
}

async function insertarBatch(
  tx: sqlModule.Transaction,
  args: {
    bca: BatchConAlarmas;
    idPlanta: number;
    idRecetaBlend: number | null;
    idImportacion: number;
    archivoOrigen: string;
  },
): Promise<number> {
  const b = args.bca.batch;
  const alarmas = args.bca.alarmas;

  const r = await tx
    .request()
    .input('id_planta', sql.Int, args.idPlanta)
    .input('id_receta_blend', sql.Int, args.idRecetaBlend)
    .input('record_no', sql.Int, b.recordNo)
    .input('fecha_inicio', sql.DateTime2, b.fechaInicio)
    .input('fecha_fin', sql.DateTime2, b.fechaFin)
    .input('cliente_raw', sql.NVarChar(200), b.customer)
    .input('recipe_name_raw', sql.NVarChar(50), b.recipeNameRaw)
    .input('receta_modificada', sql.Bit, b.recetaModificada ? 1 : 0)
    .input('gps_lat', sql.Decimal(10, 6), b.gpsLat)
    .input('gps_lon', sql.Decimal(10, 6), b.gpsLon)
    .input('gps_valido', sql.Bit, b.gpsValido === null ? null : b.gpsValido ? 1 : 0)
    .input('m3_producidos', sql.Decimal(8, 3), b.m3Producidos)
    .input('sw_version', sql.NVarChar(20), b.swVersion)
    .input('operador', sql.NVarChar(100), b.operador)
    .input('company_raw', sql.NVarChar(200), b.company)
    .input('timezone_bias', sql.NVarChar(20), b.timezoneBias)
    .input('arido_a_nombre', sql.NVarChar(50), b.aridoANombre)
    .input('arido_a_dosis_kg_m3', sql.Decimal(8, 2), b.aridoADosisKgM3)
    .input('arido_b_nombre', sql.NVarChar(50), b.aridoBNombre)
    .input('arido_b_dosis_kg_m3', sql.Decimal(8, 2), b.aridoBDosisKgM3)
    .input('cemento_dosis_kg_m3', sql.Decimal(8, 2), b.cementoDosisKgM3)
    .input('agua_dosis_l_m3', sql.Decimal(8, 2), b.aguaDosisLM3)
    .input('aditivo1_dosis_l_m3', sql.Decimal(8, 3), b.aditivo1DosisLM3)
    .input('aditivo2_dosis_l_m3', sql.Decimal(8, 3), b.aditivo2DosisLM3)
    .input('aditivo3_dosis_l_m3', sql.Decimal(8, 3), b.aditivo3DosisLM3)
    .input('production_rate', sql.Decimal(8, 2), b.productionRate)
    .input(
      'production_rate_adj',
      sql.Bit,
      b.productionRateAdj === null ? null : b.productionRateAdj ? 1 : 0,
    )
    .input('water_dosage_adj', sql.Bit, b.waterDosageAdj === null ? null : b.waterDosageAdj ? 1 : 0)
    .input('water_total_adj_l', sql.Decimal(10, 2), b.waterTotalAdjL)
    .input('arido_a_kg', sql.Decimal(10, 2), b.aridoAKg)
    .input('arido_a_lordo_kg', sql.Decimal(10, 2), b.aridoALordoKg)
    .input('arido_a_kg_teor', sql.Decimal(10, 2), b.aridoAKgTeor)
    .input('arido_b_kg', sql.Decimal(10, 2), b.aridoBKg)
    .input('arido_b_lordo_kg', sql.Decimal(10, 2), b.aridoBLordoKg)
    .input('arido_b_kg_teor', sql.Decimal(10, 2), b.aridoBKgTeor)
    .input('cemento_kg', sql.Decimal(10, 2), b.cementoKg)
    .input('cemento_kg_teor', sql.Decimal(10, 2), b.cementoKgTeor)
    .input('agua_l', sql.Decimal(10, 2), b.aguaL)
    .input('agua_l_teor', sql.Decimal(10, 2), b.aguaLTeor)
    .input('aditivo1_l', sql.Decimal(10, 3), b.aditivo1L)
    .input('aditivo1_l_teor', sql.Decimal(10, 3), b.aditivo1LTeor)
    .input('aditivo2_l', sql.Decimal(10, 3), b.aditivo2L)
    .input('aditivo2_l_teor', sql.Decimal(10, 3), b.aditivo2LTeor)
    .input('aditivo3_l', sql.Decimal(10, 3), b.aditivo3L)
    .input('aditivo3_l_teor', sql.Decimal(10, 3), b.aditivo3LTeor)
    .input('arido_a_delta_kg', sql.Decimal(10, 2), b.aridoADelta?.valor ?? null)
    .input('arido_a_delta_pct', sql.Decimal(8, 2), b.aridoADelta?.porcentaje ?? null)
    .input('arido_b_delta_kg', sql.Decimal(10, 2), b.aridoBDelta?.valor ?? null)
    .input('arido_b_delta_pct', sql.Decimal(8, 2), b.aridoBDelta?.porcentaje ?? null)
    .input('cemento_delta_kg', sql.Decimal(10, 2), b.cementoDelta?.valor ?? null)
    .input('cemento_delta_pct', sql.Decimal(8, 2), b.cementoDelta?.porcentaje ?? null)
    .input('agua_delta_l', sql.Decimal(10, 2), b.aguaDelta?.valor ?? null)
    .input('agua_delta_pct', sql.Decimal(8, 2), b.aguaDelta?.porcentaje ?? null)
    .input('aditivo1_delta_l', sql.Decimal(10, 3), b.aditivo1Delta?.valor ?? null)
    .input('aditivo1_delta_pct', sql.Decimal(8, 2), b.aditivo1Delta?.porcentaje ?? null)
    .input('aditivo2_delta_l', sql.Decimal(10, 3), b.aditivo2Delta?.valor ?? null)
    .input('aditivo2_delta_pct', sql.Decimal(8, 2), b.aditivo2Delta?.porcentaje ?? null)
    .input('aditivo3_delta_l', sql.Decimal(10, 3), b.aditivo3Delta?.valor ?? null)
    .input('aditivo3_delta_pct', sql.Decimal(8, 2), b.aditivo3Delta?.porcentaje ?? null)
    // DECIMAL(8,4): doble sanitización — capar a 0-100% y redondear a 4 decimales.
    .input('arido_a_moisture_pct', sql.Decimal(8, 4), sanitizarMoisturePct(b.aridoAMoisturePct))
    .input('arido_b_moisture_pct', sql.Decimal(8, 4), sanitizarMoisturePct(b.aridoBMoisturePct))
    .input('temp_ambiente_inicio', sql.Decimal(4, 1), b.tempAmbienteInicio)
    .input('temp_ambiente_fin', sql.Decimal(4, 1), b.tempAmbienteFin)
    .input('relacion_agua_cemento', sql.Decimal(8, 4), redondearDecimal(b.relacionAguaCemento, 4))
    .input('cemento_silo_stop_kg', sql.Decimal(10, 2), b.cementoSiloStopKg)
    .input('tuvo_alarma', sql.Bit, alarmas.length > 0 ? 1 : 0)
    .input('cantidad_alarmas', sql.Int, alarmas.length)
    .input('archivo_origen', sql.NVarChar(200), args.archivoOrigen)
    .input('id_importacion', sql.BigInt, args.idImportacion)
    .query<{ id: number }>(`
      INSERT INTO hor.batches (
        id_planta, id_receta_blend, record_no, fecha_inicio, fecha_fin,
        cliente_raw, recipe_name_raw, receta_modificada,
        gps_lat, gps_lon, gps_valido,
        m3_producidos,
        sw_version, operador, company_raw, timezone_bias,
        arido_a_nombre, arido_a_dosis_kg_m3,
        arido_b_nombre, arido_b_dosis_kg_m3,
        cemento_dosis_kg_m3, agua_dosis_l_m3,
        aditivo1_dosis_l_m3, aditivo2_dosis_l_m3, aditivo3_dosis_l_m3,
        production_rate, production_rate_adj, water_dosage_adj, water_total_adj_l,
        arido_a_kg, arido_a_lordo_kg, arido_a_kg_teor,
        arido_b_kg, arido_b_lordo_kg, arido_b_kg_teor,
        cemento_kg, cemento_kg_teor,
        agua_l, agua_l_teor,
        aditivo1_l, aditivo1_l_teor,
        aditivo2_l, aditivo2_l_teor,
        aditivo3_l, aditivo3_l_teor,
        arido_a_delta_kg, arido_a_delta_pct,
        arido_b_delta_kg, arido_b_delta_pct,
        cemento_delta_kg, cemento_delta_pct,
        agua_delta_l, agua_delta_pct,
        aditivo1_delta_l, aditivo1_delta_pct,
        aditivo2_delta_l, aditivo2_delta_pct,
        aditivo3_delta_l, aditivo3_delta_pct,
        arido_a_moisture_pct, arido_b_moisture_pct,
        temp_ambiente_inicio, temp_ambiente_fin,
        relacion_agua_cemento, cemento_silo_stop_kg,
        tuvo_alarma, cantidad_alarmas,
        archivo_origen, id_importacion
      )
      OUTPUT INSERTED.id
      VALUES (
        @id_planta, @id_receta_blend, @record_no, @fecha_inicio, @fecha_fin,
        @cliente_raw, @recipe_name_raw, @receta_modificada,
        @gps_lat, @gps_lon, @gps_valido,
        @m3_producidos,
        @sw_version, @operador, @company_raw, @timezone_bias,
        @arido_a_nombre, @arido_a_dosis_kg_m3,
        @arido_b_nombre, @arido_b_dosis_kg_m3,
        @cemento_dosis_kg_m3, @agua_dosis_l_m3,
        @aditivo1_dosis_l_m3, @aditivo2_dosis_l_m3, @aditivo3_dosis_l_m3,
        @production_rate, @production_rate_adj, @water_dosage_adj, @water_total_adj_l,
        @arido_a_kg, @arido_a_lordo_kg, @arido_a_kg_teor,
        @arido_b_kg, @arido_b_lordo_kg, @arido_b_kg_teor,
        @cemento_kg, @cemento_kg_teor,
        @agua_l, @agua_l_teor,
        @aditivo1_l, @aditivo1_l_teor,
        @aditivo2_l, @aditivo2_l_teor,
        @aditivo3_l, @aditivo3_l_teor,
        @arido_a_delta_kg, @arido_a_delta_pct,
        @arido_b_delta_kg, @arido_b_delta_pct,
        @cemento_delta_kg, @cemento_delta_pct,
        @agua_delta_l, @agua_delta_pct,
        @aditivo1_delta_l, @aditivo1_delta_pct,
        @aditivo2_delta_l, @aditivo2_delta_pct,
        @aditivo3_delta_l, @aditivo3_delta_pct,
        @arido_a_moisture_pct, @arido_b_moisture_pct,
        @temp_ambiente_inicio, @temp_ambiente_fin,
        @relacion_agua_cemento, @cemento_silo_stop_kg,
        @tuvo_alarma, @cantidad_alarmas,
        @archivo_origen, @id_importacion
      )
    `);

  const fila = r.recordset[0];
  if (!fila) {
    throw new Error(`INSERT en hor.batches no devolvió id para record_no=${b.recordNo}`);
  }
  return fila.id;
}

async function insertarAlarmasDeBatch(
  tx: sqlModule.Transaction,
  idBatch: number,
  alarmas: BatchConAlarmas['alarmas'],
): Promise<void> {
  if (alarmas.length === 0) return;

  const req = tx.request().input('id_batch', sql.BigInt, idBatch);

  const valuesClauses: string[] = [];
  for (let i = 0; i < alarmas.length; i++) {
    const alarma = alarmas[i];
    if (!alarma) continue;
    req.input(`p_${i}`, sql.TinyInt, alarma.posicion);
    req.input(`c_${i}`, sql.NVarChar(20), alarma.codigo);
    req.input(`d_${i}`, sql.NVarChar(200), alarma.descripcion);
    valuesClauses.push(`(@id_batch, @p_${i}, @c_${i}, @d_${i})`);
  }

  await req.query(`
    INSERT INTO hor.batches_alarmas (id_batch, posicion, codigo, descripcion)
    VALUES ${valuesClauses.join(', ')}
  `);
}

async function actualizarEstadoImportacion(
  tx: sqlModule.Transaction,
  args: { idImportacion: number; insertados: number; duplicados: number; estado: string },
): Promise<void> {
  await tx
    .request()
    .input('idImp', sql.BigInt, args.idImportacion)
    .input('ins', sql.Int, args.insertados)
    .input('dup', sql.Int, args.duplicados)
    .input('estado', sql.NVarChar(20), args.estado)
    .query(`
      UPDATE hor.importaciones_csv
      SET batches_nuevos = @ins,
          batches_duplicados = @dup,
          estado = @estado
      WHERE id = @idImp
    `);
}

async function existeImportacionConHash(
  tx: sqlModule.Transaction,
  hash: string,
): Promise<number | null> {
  const r = await tx
    .request()
    .input('h', sql.NVarChar(64), hash)
    .query<{ id: number }>(
      'SELECT TOP 1 id FROM hor.importaciones_csv WHERE archivo_hash = @h ORDER BY id DESC',
    );
  return r.recordset[0]?.id ?? null;
}

function fechaIsoONull(d: Date | null): string | null {
  return d === null ? null : d.toISOString();
}

/**
 * Procesa una ingesta de CSV Blend de punta a punta.
 *
 * Garantías:
 *   - Atomicidad: todo va en una transacción única; cualquier excepción interna
 *     dispara rollback.
 *   - Idempotencia por hash: si el archivo ya fue ingestado se devuelve
 *     `'duplicado_archivo'` sin tocar nada (salvo `forzarReingesta`).
 *   - Single-plant por archivo: rechaza con 400 cualquier CSV con más de un
 *     `Machine_SN`. Cada archivo Blend representa la salida de UNA planta.
 *
 * La agrupación en coladas (dominio de otro módulo) corre dentro de la misma
 * transacción SOLO si se provee `opciones.agrupar`; si no, los batches se
 * insertan y `agrupacion` viene en cero.
 */
export async function procesarIngesta(
  pool: sqlModule.ConnectionPool,
  opciones: OpcionesProcesarIngesta,
): Promise<ResultadoProcesar> {
  const logger = opciones.logger ?? console;
  const forzarReingesta = opciones.forzarReingesta ?? false;
  const hash = calcularHashArchivo(opciones.contenido);

  logger.info(
    `Ingesta iniciada: archivo=${opciones.nombreArchivo}, usuario=${opciones.usuarioOid}, hash=${hash}`,
  );

  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    // 1) Dedup por hash de archivo.
    const idImportacionPrevia = await existeImportacionConHash(tx, hash);
    if (idImportacionPrevia !== null && !forzarReingesta) {
      logger.warn(
        `Archivo duplicado (hash existente), id_importacion previo: ${idImportacionPrevia}`,
      );
      await tx.rollback();

      const r = parsearBlend(opciones.contenido);
      return {
        status: 200,
        body: {
          id_importacion: idImportacionPrevia,
          estado: 'duplicado_archivo',
          hash_archivo: hash,
          resumen: {
            filas_recibidas: r.resumen.total_filas,
            batches_insertados: 0,
            batches_omitidos_duplicado: 0,
            filas_con_error: 0,
            plantas: r.resumen.plantas_machine_sn,
            fecha_min: fechaIsoONull(r.resumen.fecha_min),
            fecha_max: fechaIsoONull(r.resumen.fecha_max),
          },
          errores: [],
          agrupacion: AGRUPACION_VACIA,
        },
      };
    }

    if (idImportacionPrevia !== null && forzarReingesta) {
      logger.warn(`forzar_reingesta=true ignorando id_importacion previo ${idImportacionPrevia}`);
    }

    // 2) Parsear CSV.
    const parseo = parsearBlend(opciones.contenido);
    logger.info(
      `Parseadas ${parseo.resumen.parseadas_ok}/${parseo.resumen.total_filas}, errores ${parseo.resumen.con_errores}`,
    );

    const erroresIngesta: ErrorIngesta[] = parseo.errores.map((e) => ({
      fila: e.fila,
      ...(e.campo !== undefined ? { campo: e.campo } : {}),
      mensaje: e.mensaje,
    }));

    // 3) Validación estricta: un CSV Blend == una planta.
    if (parseo.resumen.plantas_machine_sn.length > 1) {
      const lista = parseo.resumen.plantas_machine_sn.join(', ');
      logger.warn(`CSV contiene múltiples plantas (SN: ${lista}); rollback.`);
      await tx.rollback();
      return {
        status: 400,
        body: {
          error: `CSV contiene múltiples plantas (SN: ${lista}). Cada archivo Blend debe ser de una sola planta.`,
        },
      };
    }

    // 4) Si no quedó nada parseable, rollback y devolvemos parcial sin insertar.
    if (parseo.resumen.parseadas_ok === 0) {
      logger.warn('Ningún batch parseable; rollback sin insertar.');
      await tx.rollback();
      return {
        status: 200,
        body: {
          id_importacion: 0,
          estado: 'parcial',
          hash_archivo: hash,
          resumen: {
            filas_recibidas: parseo.resumen.total_filas,
            batches_insertados: 0,
            batches_omitidos_duplicado: 0,
            filas_con_error: parseo.resumen.con_errores,
            plantas: parseo.resumen.plantas_machine_sn,
            fecha_min: fechaIsoONull(parseo.resumen.fecha_min),
            fecha_max: fechaIsoONull(parseo.resumen.fecha_max),
          },
          errores: erroresIngesta,
          agrupacion: AGRUPACION_VACIA,
        },
      };
    }

    // 5) Resolver id_planta para cada machine_sn único, con cache local.
    const cachePlantas = new Map<string, number>();
    const plantasResueltas: PlantaResuelta[] = [];
    for (const sn of parseo.resumen.plantas_machine_sn) {
      const id = await resolverIdPlanta(tx, sn);
      if (id === null) {
        throw new Error(
          `Planta SN ${sn} no encontrada en hor.plantas. Cargá la planta antes de reingestar.`,
        );
      }
      cachePlantas.set(sn, id);
      plantasResueltas.push({ machineSn: sn, idPlanta: id });
      logger.info(`Planta SN ${sn} → id_planta ${id}`);
    }

    // 6) Insertar registro de importación (exactamente 1 planta por validación 3).
    const primeraPlanta = plantasResueltas[0];
    if (!primeraPlanta) {
      throw new Error('Inconsistencia: parseadas_ok > 0 pero sin plantas resueltas.');
    }

    const idImportacion = await insertarRegistroImportacion(tx, {
      idPlanta: primeraPlanta.idPlanta,
      nombreArchivo: opciones.nombreArchivo,
      hash,
      filasTotales: parseo.resumen.total_filas,
      batchesConError: parseo.resumen.con_errores,
      erroresJson: erroresIngesta.length > 0 ? JSON.stringify(erroresIngesta) : null,
      usuarioOid: opciones.usuarioOid,
      usuarioEmail: opciones.usuarioEmail,
    });

    // 7) Insertar batches uno por uno + alarmas. Dedup O(1) contra el Set
    //    pre-cargado de record_nos existentes.
    const idsPlantaUsadas = Array.from(new Set(cachePlantas.values()));
    const recordNosExistentes = await precargarRecordNosExistentes(tx, idsPlantaUsadas);
    logger.info(
      `Pre-cargados ${recordNosExistentes.size} (id_planta, record_no) existentes para dedup en memoria.`,
    );

    let insertados = 0;
    let omitidosDup = 0;
    const idsBatchesNuevos: number[] = [];
    const cacheRecetas = new Map<string, number | null>();
    for (const bca of parseo.batches) {
      const idPlanta = cachePlantas.get(bca.batch.machineSn);
      if (idPlanta === undefined) {
        throw new Error(`Cache de plantas inconsistente para SN ${bca.batch.machineSn}`);
      }

      if (recordNosExistentes.has(`${idPlanta}::${bca.batch.recordNo}`)) {
        omitidosDup++;
        continue;
      }

      // Clave del cache = nombre NORMALIZADO para que "Muros" y "Muros *" reusen
      // el mismo id_receta_blend dentro de la misma importación.
      const recipeRaw = bca.batch.recipeNameRaw ?? '';
      const claveReceta = `${idPlanta}::${normalizarNombreReceta(recipeRaw)}`;
      let idRecetaBlend = cacheRecetas.get(claveReceta);
      if (idRecetaBlend === undefined) {
        idRecetaBlend = await resolverOCrearRecetaBlend(tx, idPlanta, bca.batch.recipeNameRaw);
        cacheRecetas.set(claveReceta, idRecetaBlend);
      }

      const idBatch = await insertarBatch(tx, {
        bca,
        idPlanta,
        idRecetaBlend,
        idImportacion,
        archivoOrigen: opciones.nombreArchivo,
      });
      await insertarAlarmasDeBatch(tx, idBatch, bca.alarmas);
      insertados++;
      idsBatchesNuevos.push(idBatch);
    }

    // 8) Agrupar batches en coladas — solo si el caller proveyó el agrupador
    //    (dominio de `lib/concreto/coladas`). Corre DENTRO de la transacción:
    //    si tira, sube la excepción y el catch externo hace rollback (incluye
    //    los batches recién insertados). Sin agrupador → AGRUPACION_VACIA.
    let agrupacion: AgrupacionIngesta = AGRUPACION_VACIA;
    if (opciones.agrupar) {
      logger.info(`Agrupando ${idsBatchesNuevos.length} batches nuevos en coladas...`);
      agrupacion = await opciones.agrupar(idsBatchesNuevos, tx);
      logger.info(
        `Agrupación: creadas=${agrupacion.coladasCreadas}, actualizadas=${agrupacion.coladasActualizadas}, batches=${agrupacion.batchesAgrupados}, warnings=${agrupacion.warnings.length}`,
      );
    }

    // 9) Update final del estado. 'parcial' SOLO cuando hubo errores reales de
    //    parsing. Los duplicados (omitidosDup) son comportamiento esperado de
    //    idempotencia (la Blend descarga el histórico completo en cada CSV).
    const estadoFinal: 'ok' | 'parcial' = erroresIngesta.length === 0 ? 'ok' : 'parcial';

    await actualizarEstadoImportacion(tx, {
      idImportacion,
      insertados,
      duplicados: omitidosDup,
      estado: estadoFinal,
    });

    await tx.commit();
    logger.info(
      `Ingesta OK: id_importacion=${idImportacion}, insertados=${insertados}, omitidos_dup=${omitidosDup}, errores=${erroresIngesta.length}`,
    );

    return {
      status: 200,
      body: {
        id_importacion: idImportacion,
        estado: estadoFinal,
        hash_archivo: hash,
        resumen: {
          filas_recibidas: parseo.resumen.total_filas,
          batches_insertados: insertados,
          batches_omitidos_duplicado: omitidosDup,
          filas_con_error: parseo.resumen.con_errores,
          plantas: parseo.resumen.plantas_machine_sn,
          fecha_min: fechaIsoONull(parseo.resumen.fecha_min),
          fecha_max: fechaIsoONull(parseo.resumen.fecha_max),
        },
        errores: erroresIngesta,
        agrupacion,
      },
    };
  } catch (e) {
    try {
      await tx.rollback();
    } catch (rollbackErr) {
      logger.error('Rollback falló:', rollbackErr);
    }
    const mensaje = e instanceof Error ? e.message : 'Error desconocido';
    logger.error(`Ingesta ROLLBACK: razón=${mensaje}`, e);
    return {
      status: 500,
      body: { error: mensaje },
    };
  }
}
