// Tipos del workflow de coladas (transiciones de estado, gestión de batches
// huérfanos, asignación de obra y consolidación).
//
// Portado de `@adelante/shared` (tipos/obras + esquemas de coladas) de la app
// original `adelante-control-concreto`. Los tipos del core del módulo viven en
// `./tipos`; acá solo van los específicos del workflow para no tocar ese
// archivo (propiedad de otro agente).

// ─── Resultado genérico de una mutación del workflow ────────────────────────
//
// Las funciones de dominio no lanzan por errores de negocio esperados
// (conflicto de estado, no encontrada, etc.): devuelven un resultado
// discriminado para que la ruta lo mapee al status HTTP correcto. Los errores
// inesperados (SQL caído, etc.) sí se propagan como excepción → 500.

export interface ErrorWorkflow {
  ok: false;
  /** Status HTTP con el que la ruta debe responder. */
  status: number;
  /** Código de error estable para el cliente (ej. 'CONFLICTO_ESTADO'). */
  codigo: string;
  /** Mensaje legible en español. */
  error: string;
  /** Metadata adicional (estado actual, ids, etc.). */
  extra?: Record<string, unknown>;
}

export type ResultadoWorkflow = { ok: true } | ErrorWorkflow;

// ─── Obras (pro_bi.dim_obra) — picker de asignación en coladas ──────────────────

export interface Obra {
  works_no: string;
  display_name: string | null;
  description: string | null;
  status: string | null;
  centro_costo: string | null;
}

export interface ListarObrasParams {
  q?: string;
  /** Si true (default) filtra por status = 'Open'. */
  solo_activas?: boolean;
  /** Máx filas (default 200, máx 500). */
  limite?: number;
}

// ─── Batches huérfanos (excluidos, listos para reasignar) ───────────────────

export interface BatchHuerfano {
  id_batch: number;
  record_no: number;
  fecha_inicio: string;
  m3_producidos: number;
  cliente_raw: string;
  recipe_name_raw: string | null;
  planta_codigo: string;
  id_colada_actual: number;
  codigo_interno_actual: number;
  motivo_exclusion: string | null;
  excluido_en: string | null;
  excluido_por_oid: string | null;
}
