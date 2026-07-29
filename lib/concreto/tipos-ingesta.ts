// Tipos del módulo de ingesta de CSV Blend (portados de `api/src/lib/ingestor-blend.ts`
// y de los schemas Zod de `shared/src/schemas/{ingesta-blend,importaciones}.ts` de la
// app original). Acá NO usamos Zod: se declaran como interfaces/tipos planos de TS
// porque las rutas parsean el body a mano (convención del app Produccion).

// ─── Parser Blend ───────────────────────────────────────────────────────────

/**
 * Delta tal como viene en el CSV: valor absoluto + porcentaje sobre el teórico.
 *
 * `porcentaje` puede ser `null` cuando el teórico es 0 y el formatter de Blend
 * produce notación científica garbleada (ej. `"7.20(3.05356e+00.7%)"`). En ese
 * caso preservamos el valor real (confiable) y descartamos el porcentaje.
 */
export interface Delta {
  valor: number;
  porcentaje: number | null;
}

/** Alarma individual del ciclo (32 slots posibles). */
export interface AlarmaParseada {
  /** 1..32 — slot original donde apareció la alarma en el CSV. */
  posicion: number;
  /** Código numérico que reporta Blend (ej. `"605"`, `"611"`). */
  codigo: string;
  /** Descripción legible. Vacío si Blend solo reportó código. */
  descripcion: string;
}

/**
 * Batch parseado. Los nombres reflejan el dominio del negocio en español.
 * Los nulls son explícitos cuando el CSV trae el campo vacío.
 */
export interface BatchParseado {
  // Identidad
  recordNo: number;
  swVersion: string | null;
  /**
   * Serial de la máquina Blend. Es el campo que se usa para lookup contra
   * `hor.plantas.serial` (NO `serial_number`).
   */
  machineSn: string;

  // Operación / contexto
  company: string | null;
  customer: string | null;
  operador: string | null;
  gpsValido: boolean | null;
  gpsLat: number | null;
  gpsLon: number | null;
  fechaInicio: Date;
  fechaFin: Date;
  timezoneBias: string | null;

  // Receta
  recipeNameRaw: string;
  recetaBase: string;
  recetaModificada: boolean;

  // Dosis del CSV (kg/m³ o l/m³)
  aridoANombre: string | null;
  aridoADosisKgM3: number | null;
  aridoBNombre: string | null;
  aridoBDosisKgM3: number | null;
  cementoDosisKgM3: number | null;
  aguaDosisLM3: number | null;
  aditivo1DosisLM3: number | null;
  aditivo2DosisLM3: number | null;
  aditivo3DosisLM3: number | null;

  // Production rate y ajustes
  productionRate: number | null;
  productionRateAdj: boolean | null;
  waterDosageAdj: boolean | null;
  waterTotalAdjL: number | null;

  // Ambiente
  tempAmbienteInicio: number | null;
  tempAmbienteFin: number | null;

  // Producción real
  m3Producidos: number;

  // Áridos: cons, lordo, teor, delta
  aridoAKg: number;
  aridoALordoKg: number | null;
  aridoAKgTeor: number | null;
  aridoADelta: Delta | null;
  aridoBKg: number;
  aridoBLordoKg: number | null;
  aridoBKgTeor: number | null;
  aridoBDelta: Delta | null;

  // Cemento, agua, aditivos: cons, teor, delta
  cementoKg: number;
  cementoKgTeor: number | null;
  cementoDelta: Delta | null;
  aguaL: number;
  aguaLTeor: number | null;
  aguaDelta: Delta | null;
  aditivo1L: number;
  aditivo1LTeor: number | null;
  aditivo1Delta: Delta | null;
  aditivo2L: number;
  aditivo2LTeor: number | null;
  aditivo2Delta: Delta | null;
  aditivo3L: number;
  aditivo3LTeor: number | null;
  aditivo3Delta: Delta | null;

  // Humedad áridos (solo el % — la absorción es propiedad del material)
  aridoAMoisturePct: number | null;
  aridoBMoisturePct: number | null;

  // Métricas derivadas que vienen calculadas por Blend
  relacionAguaCemento: number | null;
  cementoSiloStopKg: number | null;
}

export interface BatchConAlarmas {
  batch: BatchParseado;
  alarmas: AlarmaParseada[];
}

export interface ErrorParseo {
  /** 1-indexed. Header = fila 1, primer batch = fila 2. */
  fila: number;
  /** Nombre del campo que falló, si aplica. */
  campo?: string;
  mensaje: string;
}

export interface ResumenParseo {
  total_filas: number;
  parseadas_ok: number;
  con_errores: number;
  plantas_machine_sn: string[];
  fecha_min: Date | null;
  fecha_max: Date | null;
  record_no_min: number | null;
  record_no_max: number | null;
}

export interface ResultadoParseo {
  batches: BatchConAlarmas[];
  errores: ErrorParseo[];
  resumen: ResumenParseo;
}

// ─── Contrato de la ingesta ───────────────────────────────────────────────────

/** Error de parseo de una fila individual del CSV (1-indexed). */
export interface ErrorIngesta {
  fila: number;
  campo?: string;
  mensaje: string;
}

/**
 * Warning emitido por el agrupador automático cuando un batch nuevo matchea
 * contra una colada existente que ya NO es modificable. La agrupación es
 * dominio de coladas (otro agente); acá solo declaramos el tipo para el
 * contrato del response.
 */
export interface ColadaWarning {
  tipo: 'batch_matchea_colada_no_modificable';
  id_batch: number;
  id_colada_existente: number;
  codigo_interno_existente: number;
  estado_existente: 'confirmada' | 'digitada' | 'cerrada' | 'anulada';
  id_colada_nueva: number;
  codigo_interno_nueva: number;
  mensaje: string;
}

/** Resumen de la agrupación automática que corre dentro de la transacción. */
export interface AgrupacionIngesta {
  coladasCreadas: number;
  coladasActualizadas: number;
  batchesAgrupados: number;
  warnings: ColadaWarning[];
}

/**
 * Response del endpoint de ingesta.
 *
 * Estados posibles:
 *  - `'ok'`: todos los batches insertados sin errores.
 *  - `'parcial'`: al menos un batch insertado pero hubo errores de parseo.
 *  - `'duplicado_archivo'`: el hash del archivo ya existía y no se forzó
 *    reingesta. No se insertó ni se modificó nada.
 */
export interface IngestaBlendResponse {
  id_importacion: number;
  estado: 'ok' | 'duplicado_archivo' | 'parcial';
  hash_archivo: string;
  resumen: {
    filas_recibidas: number;
    batches_insertados: number;
    batches_omitidos_duplicado: number;
    filas_con_error: number;
    /** Lista de `Machine_SN` (serial Blend) únicos encontrados en el CSV. */
    plantas: string[];
    /** ISO UTC, o null si el CSV no tenía filas parseables. */
    fecha_min: string | null;
    fecha_max: string | null;
  };
  errores: ErrorIngesta[];
  agrupacion: AgrupacionIngesta;
}

// ─── Historial de importaciones ───────────────────────────────────────────────

export type EstadoImportacion = 'ok' | 'parcial' | 'duplicado_archivo' | 'procesando';

/**
 * Fila resumida del historial. NO trae el JSON de errores ni el contenido del
 * archivo.
 */
export interface ImportacionResumen {
  id: number;
  archivo_nombre: string;
  estado: EstadoImportacion;
  filas_totales: number;
  batches_nuevos: number;
  batches_duplicados: number;
  batches_con_error: number;
  /** Email/cédula del usuario que ejecutó la ingesta. Puede venir null en filas legacy. */
  usuario_email: string | null;
  /** ISO UTC. */
  fecha_archivo: string;
  /** Hash SHA-256 del archivo (hex, 64 chars). */
  archivo_hash: string;
}

export interface HistorialImportacionesResponse {
  items: ImportacionResumen[];
  total: number;
}
