/**
 * Spring presets — espejo exacto del design system (react/springs.ts).
 * Usar estos valores en TODOS los motion components para coherencia visual.
 */
export const springs = {
  /** Taps, botones — respuesta inmediata */
  snappy:     { type: "spring", stiffness: 400, damping: 30 } as const,
  /** Estados de éxito, completar acciones */
  completing: { type: "spring", stiffness: 300, damping: 28 } as const,
  /** Acciones destructivas (eliminar) */
  deleting:   { type: "spring", stiffness: 500, damping: 25 } as const,
  /** Drawers, sidebar, revelar contenido */
  expanding:  { type: "spring", stiffness: 170, damping: 30 } as const,
  /** Cerrar / dismiss */
  settling:   { type: "spring", stiffness: 150, damping: 28 } as const,
} as const;
