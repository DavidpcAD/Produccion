// Constantes de dominio compartidas por las pantallas (selects, filtros,
// etiquetas). Los datos ficticios de ejemplo ya no viven acá — el seed real
// contra Azure SQL está en scripts/seed.mjs, que llama a la propia API en
// vez de hardcodear arrays como este archivo hacía antes de conectar la base.

import type { TipoOt, PrioridadOt, EstadoOt, EstadoEquipo } from "./types";

export const TIPOS_OT: TipoOt[] = ["preventivo", "correctivo", "predictivo"];
export const PRIORIDADES_OT: PrioridadOt[] = ["baja", "media", "alta", "urgente"];
export const ESTADOS_OT: EstadoOt[] = ["abierta", "en_proceso", "finalizada", "cancelada"];
export const ESTADOS_EQUIPO: EstadoEquipo[] = ["operativo", "mantenimiento", "fuera_servicio"];
