// Tipos del módulo Sub-partidas (portado de obrascontrol `sub-partidas.ts`).
// Catálogo núcleo de ObrasControl: unidades atómicas que conectan sprints con
// partidas de costo. Datos en AdelanteDB, esquema `obc`:
//   obc.sub_partidas + obc.partidas + obc.grupos_partida +
//   obc.sub_partida_tipos + obc.sub_partida_pesos_partida / _sprint

import type { TipoCasa } from './types';

export type { TipoCasa };

/** Los cuatro tipos de casa válidos (fuente de columnas de peso). */
export const TIPOS_CASA: TipoCasa[] = ['1N-Techo', '1N-Azotea', '2N-Techo', '2N-Azotea'];

/** Partida del catálogo (obc.partidas + su grupo). Opciones del dropdown. */
export interface PartidaConGrupo {
  id: number;
  codigo: string;
  nombre: string;
  grupo_id: number;
  grupo_codigo: string;
  grupo_nombre: string;
  orden: number | null;
  activo: boolean;
}

/** Peso de la sub-partida dentro de una partida, por tipo de casa. */
export interface PesoPartida {
  tipo_casa: TipoCasa;
  partida_id: number;
  peso: number;
}

/** Peso de la sub-partida dentro de un sprint, por tipo de casa. */
export interface PesoSprint {
  tipo_casa: TipoCasa;
  sprint_numero: number;
  peso: number;
}

/** Fila del listado (GET /api/avance/sub-partidas). */
export interface SubPartidaListado {
  id: number;
  codigo: string;
  nombre: string;
  sprint_numero: number;
  es_critica: boolean;
  activo: boolean;
  partida_id: number;
  partida_codigo: string;
  partida_nombre: string;
  grupo_id: number;
  grupo_codigo: string;
  grupo_nombre: string;
  tipos_casa: TipoCasa[];
}

/** Detalle (GET /api/avance/sub-partidas/{id}): listado + descripción + pesos. */
export interface SubPartidaDetalle extends SubPartidaListado {
  descripcion: string | null;
  pesos_partida: PesoPartida[];
  pesos_sprint: PesoSprint[];
}

/** Body de POST /api/avance/sub-partidas. */
export interface SubPartidaCrear {
  codigo: string;
  nombre: string;
  partida_id: number;
  sprint_numero: number;
  tipos_casa: TipoCasa[];
  es_critica?: boolean;
  descripcion?: string | null;
  activo?: boolean;
}

/** Body de PATCH /api/avance/sub-partidas/{id} (parcial). */
export interface SubPartidaPatch {
  codigo?: string;
  nombre?: string;
  partida_id?: number;
  sprint_numero?: number;
  es_critica?: boolean;
  descripcion?: string | null;
  activo?: boolean;
  tipos_casa?: TipoCasa[];
}
