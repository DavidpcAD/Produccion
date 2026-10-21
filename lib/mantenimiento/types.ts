// Tipos de dominio compartidos por toda la app — reflejan uno a uno las
// columnas de sql/schema2.sql y las migraciones 003-007. Un solo lugar para
// no repetir la forma de cada entidad en cada componente.

export type Rol = "admin" | "tecnico" | "operador";

export interface Usuario {
  id: string;
  nombre: string;
  usuario: string;
  rol: Rol;
  activo?: boolean;
}

export type EstadoEquipo = "operativo" | "mantenimiento" | "fuera_servicio";
export type TipoOt = "preventivo" | "correctivo" | "predictivo";
export type PrioridadOt = "baja" | "media" | "alta" | "urgente";
export type EstadoOt = "abierta" | "en_proceso" | "finalizada" | "cancelada";
export type TipoMovimiento = "entrada" | "salida";
export type TipoIntervaloPlan = "horas" | "dias" | "ambos";

export interface ManualEquipo {
  archivoId: string;
  nombre: string;
  contentType?: string;
  sizeBytes?: number;
  subidoEn: string;
}

export interface Equipo {
  id: string;
  codigo: string;
  nombre: string;
  tipo?: string;
  marca?: string;
  modelo?: string;
  anio?: number | null;
  numeroSerie?: string;
  horometroActual: number;
  estado: EstadoEquipo;
  ubicacion?: string;
  intervaloHorasPreventivo: number;
  intervaloKilometrajePreventivo?: number | null;
  notas?: string;
  fotoId?: string | null;
  placa?: string;
  revisionTecnica?: string;
  fechaIngreso?: string;
  kilometraje?: number | null;
  combustible?: string;
  filtroAceite?: string;
  filtroDiesel?: string;
  filtroAireAcondicionado?: string;
  llantasDelanteras?: string;
  llantasTraseras?: string;
  cilindraje?: string;
  ultimaFechaMantenimiento?: string;
  proximaFechaMantenimiento?: string;
  manuales?: ManualEquipo[];
  creadoEn?: string;
}

export interface Repuesto {
  id: string;
  codigo: string;
  nombre: string;
  categoria?: string;
  unidad?: string;
  costoUnitario: number;
  stockActual: number;
  stockMinimo: number;
  ubicacionBodega?: string;
  notas?: string;
  equipoId?: string | null;
}

export interface ChecklistItem {
  texto: string;
  hecho: boolean;
}

export interface RepuestoUsado {
  repuestoId: string | null;
  nombre: string;
  cantidad: number;
  costoUnitario: number;
}

export interface OrdenTrabajo {
  id: string;
  numero: string;
  equipoId: string;
  tipo: TipoOt;
  prioridad: PrioridadOt;
  titulo: string;
  descripcion?: string;
  fechaProgramada?: string | null;
  responsable?: string;
  horometroApertura: number;
  horometroCierre?: number | null;
  estado: EstadoOt;
  fechaApertura: string;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  motivoCancelacion?: string | null;
  trabajoRealizado?: string;
  costoManoObra: number;
  planId?: string | null;
  checklist: ChecklistItem[];
  fotos: string[];
  repuestosUsados: RepuestoUsado[];
  firmaId?: string | null;
  firmaResponsable?: string | null;
  firmaFecha?: string | null;
  /** Tipo de falla asignado por Mantenimiento (null = sin clasificar). */
  tipoFallaId?: string | null;
}

/** Tipo de falla para el historial (mant.TiposFalla). Se desactiva, no se borra. */
export interface TipoFalla {
  id: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

export interface PlanMantenimiento {
  id: string;
  equipoId: string;
  nombre: string;
  tipoIntervalo: TipoIntervaloPlan;
  intervaloHoras: number;
  intervaloDias: number;
  umbralAvisoHoras: number;
  umbralAvisoDias: number;
  ultimaEjecucionHorometro: number;
  ultimaEjecucionFecha?: string | null;
  tareas: string[];
  activo: boolean;
}

export interface MovimientoRepuesto {
  id: string;
  repuestoId: string;
  tipo: TipoMovimiento;
  cantidad: number;
  motivo?: string;
  otId?: string | null;
  responsable?: string;
  fecha: string;
}

export interface LecturaHorometro {
  id: string;
  equipoId: string;
  horometro: number;
  fecha: string;
  fuente: "manual" | "ot" | "inspeccion";
  nota?: string;
  otId?: string | null;
  creadoEn?: string;
}

export interface ChecklistDiarioItem {
  id: string;
  equipoId: string;
  orden: number;
  titulo: string;
  detalle?: string;
}

export interface RespuestaChecklistDiario {
  itemId: string;
  titulo: string;
  hecho: boolean;
  observacion?: string;
}

export interface InspeccionDiaria {
  id: string;
  equipoId: string;
  usuarioId: string;
  usuarioNombre?: string;
  horometro: number | null;
  checklist: RespuestaChecklistDiario[];
  fotos: string[];
  fecha: string;
}

export interface SolicitudItem {
  repuestoId: string | null;
  nombre: string;
  cantidad: number;
  unidad: string;
}

export interface SolicitudMaterial {
  id: string;
  numero: string;
  solicitante: string;
  equipoId?: string | null;
  fecha: string;
  items: SolicitudItem[];
  fotos: string[];
  notas?: string;
}

export type Tema = "light" | "dark";
