// Tipos del módulo Sprints + Semanas operativas (admin) — portado de
// obrascontrol `sprint.ts` + `semanas.ts`. Datos en AdelanteDB, esquema `obc`
// (tablas sprints_catalogo, sprints_cerrados, semanas_operativas + las de
// línea base plan_semanal / avance_base_semanal).
//
// - sprints_catalogo: catálogo global de sprints (la secuencia CASA). Cada uno
//   puede marcarse "de espera" (colado/curado, sin sub-partidas propias).
// - semanas_operativas: la semana de trabajo. Solo UNA puede estar 'abierta' a
//   la vez (índice filtrado UX_semanas_una_abierta). Abrir una semana fija su
//   línea base (foto del avance vivo) para que el "logrado de la semana" mida
//   desde ahí.

import type { SemanaOperativa } from '@/lib/avance/mano-obra';

export type { SemanaOperativa };

/**
 * Sprint del catálogo global (pro_obc.sprints_catalogo) con el nº de sub-partidas
 * críticas que participan en él (pro_obc.sub_partidas activas).
 */
export interface SprintCatalogoDetalle {
  id: number;
  codigo: string;
  numero_global: number;
  nombre: string;
  descripcion: string | null;
  categoria: string;
  es_espera: boolean;
  /** Sub-partidas críticas activas cuyo sprint_numero = numero_global. */
  criticas: number;
}

/**
 * Semana operativa con estado/config (pro_obc.semanas_operativas). Extiende la
 * SemanaOperativa base (usada por Mano de Obra) con los campos de gestión.
 */
export interface SemanaOperativaDetalle extends SemanaOperativa {
  /** 'abierta' | 'cerrada'. Solo una puede estar 'abierta'. */
  estado: string;
  descripcion: string | null;
  /** Días laborables efectivos de la semana (1–7, default 5). */
  dias_efectivos: number;
}

/** Resultado de re-fijar la línea base de una semana. */
export interface LineaBaseResultado {
  semana_id: number;
  fijadas: number;
  total_obras: number;
}
