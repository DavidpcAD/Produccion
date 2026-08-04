// Tipos del módulo Laboratorio — parte de escritura (crear/editar/borrar) e
// importación de Excel. Los tipos de lectura viven en `./tipos`
// (MuestraDetalle, EnsayoDetalle, MedicionLab, etc.); acá solo agregamos los
// contratos que faltaban para las mutaciones y la curva teórica.
//
// Portado de `shared/src/schemas/laboratorio.ts` (sin zod: en este app el
// parseo de body es manual, como el resto de las rutas).

// ─── Categoría del concreto ──────────────────────────────────────────────
// Afecta el análisis de curvas (auto vs convencional). Se guarda tal cual en
// pro_lab.muestras.categoria_concreto.
export const CATEGORIAS_CONCRETO = ['convencional', 'autocompactable', 'otro'] as const;
export type CategoriaConcreto = (typeof CATEGORIAS_CONCRETO)[number];

// ─── Plantas conocidas (sugeridas en el dropdown de la muestra) ──────────
export const PLANTAS_LAB = ['Bianca E50', 'Roja E50', 'Fiori 4.0', 'Fiori 1.8'] as const;

// ─── Actor de auditoría (creado_por_* / *_por_oid) ───────────────────────
export interface ActorLab {
  /** Identificador estable del usuario (idUsuario o idCol). */
  oid: string;
  /** Email/cédula con el que entró (queda en creado_por_email, etc.). */
  email: string;
}

// ─── Punto de la curva teórica (ASTM C-150) ──────────────────────────────
export interface PuntoCurvaTeorica {
  edad_dias: number;
  /** Fracción decimal: 0.65 = 65% del F'C a esa edad. */
  pct_resistencia: number;
  descripcion: string | null;
}

// ─── Muestras ─────────────────────────────────────────────────────────────
export interface CrearMuestraParams {
  obra_works_no?: string | null;
  id_casa?: string | null;
  planta_nombre?: string | null;
  id_actividad: number;
  /** YYYY-MM-DD. */
  fecha_colado: string;
  proveedor?: string;
  id_colada?: number | null;
  id_receta_bc?: number | null;
  fc_objetivo: number;
  categoria_concreto?: CategoriaConcreto | null;
  tipo_concreto_libre?: string | null;
  notas?: string | null;
  /**
   * Edades a pre-crear como ensayos vacíos. Default [7, 14, 28]. Pasar []
   * para crear la muestra sin ensayos. Se deduplica y filtra a 1-365.
   */
  edades_ensayos?: number[];
}

// Editar muestra: todos los campos opcionales (los que vengan `undefined` no
// se tocan). Nota: para poder distinguir "no enviado" de null, el parseo de la
// ruta solo agrega las claves presentes en el body.
export type ActualizarMuestraParams = Partial<Omit<CrearMuestraParams, 'edades_ensayos'>>;

// ─── Ensayos ────────────────────────────────────────────────────────────
export interface CrearEnsayoParams {
  edad_dias: number;
  /** YYYY-MM-DD o null. */
  fecha_prueba?: string | null;
  notas?: string | null;
}

export interface ActualizarEnsayoParams {
  fecha_prueba?: string | null;
  /** Motivo opcional del cambio de fecha (queda auditado). */
  fecha_ajustada_motivo?: string | null;
  notas?: string | null;
}

// ─── Mediciones (probetas individuales) ───────────────────────────────────
export interface CrearMedicionParams {
  resistencia_mpa: number;
  orden?: number;
  notas?: string | null;
}

export interface ActualizarMedicionParams {
  resistencia_mpa?: number;
  orden?: number;
  notas?: string | null;
}

// ─── Importación de Excel ─────────────────────────────────────────────────
export interface ErrorImportLab {
  fila_excel: number;
  numero_muestra: string | null;
  mensaje: string;
}

export interface ImportarExcelLabResponse {
  total_filas: number;
  muestras_insertadas: number;
  muestras_actualizadas: number;
  muestras_duplicadas: number;
  ensayos_insertados: number;
  ensayos_actualizados: number;
  mediciones_insertadas: number;
  actividades_creadas: number;
  advertencias: string[];
  errores: ErrorImportLab[];
}
