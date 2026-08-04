// Tipos del módulo "Avance de campo" (Kanban + operaciones de sprint/estado).
// Portados de obrascontrol `sprint.ts` (avanzar/retroceder, POST estado) y
// `avance.ts` (iniciar-lote). Los tipos base de avance (ObraAvance, AvanceSprint,
// AvanceSubPartida, EstadoObra, EstadoVenta, TipoCasa, Causa) YA viven en
// `lib/avance/types.ts` y se reusan — aquí solo van los NUEVOS.
import type { EstadoObra, TipoCasa } from './types';

/** Acción de sprint sobre una obra (POST .../sprint). */
export type SprintAccion = 'avanzar' | 'retroceder';

/** Body de POST /api/avance/obras/{codigo}/sprint. */
export interface SprintBody {
  accion: SprintAccion;
}

/** Respuesta de POST .../sprint. `sprint_a === null` = volvió a «Por Iniciar». */
export interface SprintResultado {
  obra_codigo: string;
  sprint_de: number;
  sprint_a: number | null;
}

/**
 * Estados a los que el endpoint POST .../estado permite mover una obra.
 * congelar = 'en_espera'; reactivar/descongelar/iniciar = 'en_ejecucion';
 * inactivar = 'inactiva'; terminar = 'finalizada'; volver a por-iniciar =
 * 'pendiente'.
 */
export type EstadoObraDestino = EstadoObra;

/** Body de POST /api/avance/obras/{codigo}/estado. */
export interface EstadoBody {
  estado: EstadoObraDestino;
  /** Motivo (obligatorio de negocio al congelar/inactivar; queda en obra_estado.motivo_inactiva). */
  motivo_inactiva?: string | null;
}

/** Respuesta de POST .../estado. */
export interface EstadoResultado {
  obra_codigo: string;
  estado: EstadoObraDestino;
}

/** Body de POST /api/avance/obras/iniciar-lote — habilitar varias obras de una. */
export interface IniciarLoteBody {
  codigos: string[];
  /** 'auto' toma el tipo de cada obra desde pro_obc.vw_obras. */
  tipo_casa: TipoCasa | 'auto';
  sprint_inicial?: number;
}

/** Respuesta de POST .../iniciar-lote. */
export interface IniciarLoteResultado {
  habilitadas: number;
  solicitadas: number;
  omitidas: number;
}
