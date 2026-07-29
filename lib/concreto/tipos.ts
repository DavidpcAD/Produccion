// Tipos compartidos del módulo Concreto (control de producción de concreto:
// plantas Blend, coladas, batches, laboratorio de cilindros/muestras).
//
// Portado del paquete `@adelante/shared` de la app original
// `adelante-control-concreto` (Vite + Azure Functions), recortado al core que
// hoy expone este módulo. Lo demás queda como TODO(concreto).

// ─── Coladas ────────────────────────────────────────────────────────────────

export type EstadoColada =
  | 'sugerida'
  | 'confirmada'
  | 'digitada'
  | 'cerrada'
  | 'anulada';

export interface ColadaListadoItem {
  id_colada: number;
  codigo_interno: number;
  estado: EstadoColada;
  planta_nombre: string;
  planta_serial: string;
  receta_blend_nombre: string;
  codigo_receta_bc: string | null;
  descripcion_receta_bc: string | null;
  destino_display: string;
  destino_raw: string;
  id_destino_canonico: number | null;
  nombre_canonico: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  m3_producidos: number;
  cantidad_batches: number;
  cantidad_alarmas_total: number;
  tuvo_alarma: boolean;
  numero_pedido_ensamblado_bc: string | null;
  obra_works_no: string | null;
  obra_display_name: string | null;
  motivo_anulacion: string | null;
}

export interface BatchResumenEnColada {
  id_batch: number;
  record_no: number;
  fecha_inicio: string;
  m3_producidos: number;
  ac_real: number | null;
  tuvo_alarma: boolean;
  cantidad_alarmas: number;
  excluido: boolean;
  excluido_motivo: string | null;
}

export interface CilindroEnColada {
  id_cilindro: number;
  numero_serie: string;
  fecha_toma: string;
  slump_cm: number | null;
  fecha_ensayo_7d: string | null;
  resistencia_7d_kg_cm2: number | null;
  fecha_ensayo_28d: string | null;
  resistencia_28d_kg_cm2: number | null;
  observaciones: string | null;
}

export interface ColadaHeader {
  id_colada: number;
  codigo_interno: number;
  estado: EstadoColada;
  planta_nombre: string;
  planta_serial: string;
  receta_blend_nombre: string;
  codigo_receta_bc: string | null;
  descripcion_receta_bc: string | null;
  destino_display: string;
  destino_raw: string;
  id_destino_canonico: number | null;
  nombre_canonico: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  m3_producidos: number;
  cantidad_batches: number;
  cantidad_alarmas_total: number;
  tuvo_alarma: boolean;
  numero_pedido_ensamblado_bc: string | null;
  obra_works_no: string | null;
  obra_display_name: string | null;
  relacion_agua_cemento_promedio: number | null;
  fc_teorica_kg_cm2: number | null;
  motivo_anulacion: string | null;
  creada_en: string;
  actualizada_en: string;
}

export interface ColadaDetalle {
  colada: ColadaHeader;
  batches: BatchResumenEnColada[];
  cilindros: CilindroEnColada[];
  // TODO(concreto): líneas del Pedido de Ensamblado BC (mapeo de materiales +
  // conversión de unidades). En la app original vivían en obtener-colada.ts.
}

export interface PlantaListadoItem {
  id: number;
  codigo: string;
  marca: string;
  serial: string;
  recurso_bc: string | null;
  activo: boolean;
}

// ─── Laboratorio ──────────────────────────────────────────────────────────

export interface ActividadLab {
  id: number;
  nombre: string;
  activo: boolean;
  orden: number;
}

export interface EnsayoResumen {
  edad_dias: number;
  resistencia_kg_cm2_promedio: number | null;
}

export interface MuestraListadoItem {
  id: number;
  numero_muestra: number;
  obra_works_no: string | null;
  obra_display_name: string | null;
  id_casa: string | null;
  planta_nombre: string | null;
  id_actividad: number;
  actividad_nombre: string;
  fecha_colado: string;
  proveedor: string;
  id_colada: number | null;
  codigo_interno_colada: number | null;
  id_receta_bc: number | null;
  receta_bc_codigo: string | null;
  receta_bc_descripcion: string | null;
  fc_objetivo: number;
  tipo_concreto_display: string;
  notas: string | null;
  creado_por_email: string | null;
  cantidad_ensayos: number;
  ensayos: EnsayoResumen[];
}

export interface MedicionLab {
  id: number;
  id_ensayo: number;
  resistencia_mpa: number;
  orden: number;
  notas: string | null;
}

export interface EnsayoDetalle {
  id: number;
  edad_dias: number;
  fecha_prueba: string | null;
  notas: string | null;
  cantidad_mediciones: number;
  resistencia_mpa_promedio: number | null;
  resistencia_kg_cm2_promedio: number | null;
  mediciones: MedicionLab[];
}

export interface MuestraDetalle extends MuestraListadoItem {
  ensayos_detalle: EnsayoDetalle[];
}

// ─── Dashboard / KPIs de producción ──────────────────────────────────────

export interface M3PorDia {
  fecha: string; // YYYY-MM-DD
  m3: number;
  m3_por_planta: Record<string, number>;
}

export interface KpisResponse {
  total_batches: number;
  total_m3: number;
  pct_con_alarma: number;
  pct_receta_modificada: number;
  m3_por_dia: M3PorDia[];
}

// ─── Batches (datos crudos de planta, para análisis de calidad) ───────────

export interface BatchDetallePlanta {
  id: number;
  record_no: number;
  fecha_inicio: string;
  planta_nombre: string;
  cliente_raw: string | null;
  recipe_name_raw: string | null;
  m3_producidos: number;

  // Receta / diseño por 1 m³.
  arido_a_nombre: string | null;
  arido_a_dosis_kg_m3: number | null;
  arido_b_nombre: string | null;
  arido_b_dosis_kg_m3: number | null;
  cemento_dosis_kg_m3: number | null;
  agua_dosis_l_m3: number | null;
  aditivo1_dosis_l_m3: number | null;
  aditivo2_dosis_l_m3: number | null;
  aditivo3_dosis_l_m3: number | null;

  // Agua.
  agua_l: number | null;
  agua_l_teor: number | null;
  agua_delta_l: number | null;
  agua_delta_pct: number | null;
  water_dosage_adj: boolean | null;
  water_total_adj_l: number | null;
  relacion_agua_cemento: number | null;

  // Humedad de áridos.
  arido_a_moisture_pct: number | null;
  arido_b_moisture_pct: number | null;

  // Cemento.
  cemento_kg: number | null;
  cemento_kg_teor: number | null;
  cemento_delta_pct: number | null;

  // Áridos.
  arido_a_kg: number | null;
  arido_a_kg_teor: number | null;
  arido_a_delta_pct: number | null;
  arido_b_kg: number | null;
  arido_b_kg_teor: number | null;
  arido_b_delta_pct: number | null;

  // Aditivos.
  aditivo1_l: number | null;
  aditivo1_l_teor: number | null;
  aditivo1_delta_pct: number | null;
  aditivo2_l: number | null;
  aditivo2_l_teor: number | null;
  aditivo2_delta_pct: number | null;
  aditivo3_l: number | null;
  aditivo3_l_teor: number | null;
  aditivo3_delta_pct: number | null;

  // Ambiente + flags.
  temp_ambiente_inicio: number | null;
  temp_ambiente_fin: number | null;
  production_rate: number | null;
  production_rate_adj: boolean | null;
  receta_modificada: boolean;
  tuvo_alarma: boolean;
  cantidad_alarmas: number;
  operador: string | null;

  // Colada a la que pertenece.
  id_colada: number | null;
  codigo_interno_colada: number | null;
}
