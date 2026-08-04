/**
 * Tipos del módulo Avance (control de obras). Portados de `@adelante/shared`
 * (tipos/Avance.ts, tipos/ObrasControl.ts) de la app original obrascontrol,
 * ahora locales al módulo. Las tablas viven en el schema `obc` de la base.
 */

export type TipoCasa = '1N-Techo' | '1N-Azotea' | '2N-Techo' | '2N-Azotea';

export type EstadoObra =
  | 'pendiente'
  | 'en_ejecucion'
  | 'en_espera'
  | 'inactiva'
  | 'finalizada';

/** Estado de venta de la casa (de dbo.V_CasosActivos). */
export type EstadoVenta = 'formalizada' | 'reservada' | 'disponible' | 'entregada';

/** Estado de avance visual de una sub-partida. */
export type EstadoAvance = 'sin_iniciar' | 'en_progreso' | 'completada' | 'nc';

/** Proyecto (chip del dashboard) — pro_obc.vw_proyectos. */
export interface Proyecto {
  id: number;
  codigo: string;
  nombre: string;
  categoria: string | null;
  es_desarrollo: boolean;
  es_homes: boolean;
  es_ventas: boolean;
  color_hex: string | null;
}

/** Obra habilitada para captura (listado del dashboard). */
export interface ObraAvance {
  codigo: string;
  estado: EstadoObra;
  tipo_casa: TipoCasa | null;
  sprint_actual: number;
  estado_venta: EstadoVenta | null;
  bloque_letra: string;
  proyecto_codigo: string;
}

/** Una sub-partida del sprint con su avance + peso efectivo (captura). */
export interface AvanceSubPartida {
  sub_partida_id: number;
  codigo: string;
  nombre: string;
  partida_id: number;
  partida_codigo: string;
  partida_nombre: string;
  sprint_numero: number;
  es_critica: boolean;
  peso: number;
  pct_completado: number;
  completada: boolean;
  nc_causa: string | null;
  nc_nota: string | null;
  piso_pct: number;
  arrastrada: boolean;
}

/** Respuesta de GET /api/avance/obras/{codigo}/avance?sprint=N. */
export interface AvanceSprint {
  obra_codigo: string;
  tipo_casa: TipoCasa;
  sprint: number;
  estado_obra: EstadoObra;
  sprint_actual: number;
  avance_sprint: number;
  sub_partidas: AvanceSubPartida[];
}

/** Body de PUT /api/avance/obras/{codigo}/avance. */
export interface RegistrarAvance {
  sub_partida_id: number;
  pct_completado?: number;
  completada?: boolean;
  nc_causa?: string | null;
  nc_nota?: string | null;
}

/** Una partida como columna de la matriz. */
export interface MatrizPartida {
  id: number;
  codigo: string;
  nombre: string;
  grupo_codigo: string | null;
  grupo_nombre: string | null;
}

/** Una obra como fila de la matriz. */
export interface MatrizObraFila {
  codigo: string;
  bloque_letra: string;
  tipo_casa: TipoCasa;
  sprint_actual: number;
  estado_venta: EstadoVenta | null;
  congelada: boolean;
  avance_crono: number;
  avance_general: number;
  celdas: Record<number, number | null>;
}

/** Respuesta de GET /api/avance/matriz?proyecto=VN. */
export interface MatrizAvance {
  proyecto: string;
  partidas: MatrizPartida[];
  obras: MatrizObraFila[];
}

/** Causa NC (pro_obc.causas_catalogo). */
export interface Causa {
  id: number;
  codigo: string;
  descripcion: string;
  aplica_nc: boolean;
  aplica_inactividad: boolean;
  activo: boolean;
  orden: number;
}
