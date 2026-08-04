// Tipos del módulo Tipos de Casa (admin) — portado de obrascontrol `tipos-casa.ts`
// + catálogo de sprints de `sprint.ts`. Datos en AdelanteDB, esquema `obc`
// (tablas tipo_casa_sprints / tipos_casa / sprints_catalogo).
//
// Cada tipo de casa define QUÉ sprints (de la secuencia global) participan, en
// orden ascendente. El peso de referencia por sprint = 100% / total de sprints.

import type { TipoCasa } from '@/lib/avance/types';

export type { TipoCasa };

/** Catálogo y orden fijo de tipos de casa (igual que el fuente obrascontrol). */
export const TIPOS: TipoCasa[] = ['1N-Techo', '1N-Azotea', '2N-Techo', '2N-Azotea'];

/** Sprint del catálogo global (pro_obc.sprints_catalogo). */
export interface SprintCatalogo {
  numero_global: number;
  nombre: string;
  es_espera: boolean;
  categoria: string;
}

/**
 * Sprints (globales) que usa un tipo de casa, en orden ascendente
 * (pro_obc.tipo_casa_sprints). El peso de referencia por sprint = 100% / total.
 */
export interface TipoCasaSprints {
  tipo_casa: TipoCasa;
  /** descripción del tipo (pro_obc.tipos_casa.descripcion) o null si no existe. */
  descripcion: string | null;
  /** numero_global de cada sprint, ascendente. */
  sprints: number[];
}

/** Respuesta de GET /api/avance/tipos-casa. */
export interface TiposCasaResponse {
  tipos: TipoCasaSprints[];
  catalogo: SprintCatalogo[];
}
