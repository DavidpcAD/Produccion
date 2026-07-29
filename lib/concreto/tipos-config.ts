// Tipos del área de Configuración del módulo Concreto: umbrales de alerta y
// densidades de materiales. Portado de `shared/src/schemas/umbrales.ts` y
// `shared/src/schemas/densidades.ts` (sin zod; en este app el parseo de body
// es manual, como el resto de las rutas). Las actividades reusan `ActividadLab`
// de `./tipos` y `crearActividad`/`actualizarActividad` de `./config`.

// ─── Umbrales de alerta ───────────────────────────────────────────────────
// Comparadores soportados: cómo se aplica el umbral al valor para decidir si
// la celda/ítem debe alertar (gte_abs/gt_abs sobre valor absoluto; el resto
// directo).
export const COMPARADORES_UMBRAL = ['gte_abs', 'gt_abs', 'gte', 'gt', 'lte', 'lt'] as const;
export type ComparadorUmbral = (typeof COMPARADORES_UMBRAL)[number];

export interface UmbralAlerta {
  clave: string;
  descripcion: string | null;
  umbral: number;
  comparador: ComparadorUmbral;
  /** Unidad para mostrar al lado del valor (ej. "%", "L"). NULL = sin unidad. */
  unidad: string | null;
  activo: boolean;
  actualizado_en: string;
  actualizado_por_email: string | null;
}

export interface ActualizarUmbralParams {
  umbral?: number;
  comparador?: ComparadorUmbral;
  activo?: boolean;
  descripcion?: string | null;
  unidad?: string | null;
}

// ─── Densidades de materiales ─────────────────────────────────────────────
// Una fila por material. `clave` es la identificación lógica (snake_case) y
// `codigo_bc` el N° de producto en Business Central (opcional). Usado para
// conversiones kg ↔ m³ ↔ L.
export interface DensidadMaterial {
  clave: string;
  nombre: string;
  codigo_bc: string | null;
  densidad: number;
  unidad: string;
  notas: string | null;
  activo: boolean;
  actualizado_en: string;
  actualizado_por_email: string | null;
}

export interface CrearDensidadParams {
  clave: string;
  nombre: string;
  codigo_bc?: string | null;
  densidad: number;
  unidad: string;
  notas?: string | null;
}

export interface ActualizarDensidadParams {
  nombre?: string;
  codigo_bc?: string | null;
  densidad?: number;
  unidad?: string;
  notas?: string | null;
  activo?: boolean;
}

// ─── Actividades de laboratorio (escritura) ───────────────────────────────
export interface CrearActividadParams {
  nombre: string;
  orden?: number;
}

export interface ActualizarActividadParams {
  nombre?: string;
  orden?: number;
  activo?: boolean;
}

// ─── Actor de auditoría (queda en actualizado_por_oid / _email) ───────────
export interface ActorConfig {
  /** Identificador estable del usuario (idUsuario o idCol). */
  oid: string;
  /** Email/cédula con el que entró. */
  email: string;
}
