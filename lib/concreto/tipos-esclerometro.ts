// Tipos del módulo Esclerómetro (ensayo NO destructivo — martillo Schmidt).
// Portado de `shared/src/schemas/esclerometro.ts` de la app original, pero
// como tipos TS planos (sin zod, según la convención de este repo). La
// validación de rangos se hace manualmente en las rutas y en la BD.
//
// Modelo: un ensayo (header) tiene N rebotes (golpes) sobre una zona de un
// elemento estructural. Se promedia descartando max/min cuando hay ≥3 golpes.

/** Ángulos de impacto típicos del martillo respecto a la horizontal. */
export const ANGULOS_IMPACTO = [-90, -45, 0, 45, 90] as const;

// =========================================================
// Rebote individual (golpe N)
// =========================================================

export interface Rebote {
  id: number;
  id_ensayo: number;
  numero_golpe: number;
  valor_rebote: number;
  notas: string | null;
}

export interface CrearReboteRequest {
  numero_golpe: number;
  valor_rebote: number;
  notas?: string | null;
}

export interface ActualizarReboteRequest {
  valor_rebote?: number;
  numero_golpe?: number;
  notas?: string | null;
}

// =========================================================
// Ensayo (header + rebotes en el detalle)
// =========================================================

export interface EnsayoEsclerometroListado {
  id: number;
  numero: number;
  fecha: string;
  obra_works_no: string | null;
  obra_display_name: string | null;
  id_casa: string | null;
  elemento_estructural: string;
  edad_dias: number | null;
  angulo_impacto: number;
  equipo_serial: string | null;
  cantidad_rebotes: number;
  /** Promedio de rebotes válido (descarta max/min cuando hay ≥3 golpes). */
  rebote_promedio: number | null;
}

export interface EnsayoEsclerometroDetalle extends EnsayoEsclerometroListado {
  notas: string | null;
  creado_por_email: string | null;
  creado_en: string;
  actualizado_en: string;
  rebotes: Rebote[];
}

export interface ListaEnsayosEsclerometroResponse {
  ensayos: EnsayoEsclerometroListado[];
  total: number;
  pagina: number;
  por_pagina: number;
}

export interface ListarEnsayosEsclerometroRequest {
  obra_works_no?: string;
  desde?: string;
  hasta?: string;
  q?: string;
  pagina: number;
  por_pagina: number;
}

export interface CrearEnsayoEsclerometroRequest {
  fecha: string;
  obra_works_no?: string | null;
  id_casa?: string | null;
  elemento_estructural: string;
  edad_dias?: number | null;
  angulo_impacto: number;
  equipo_serial?: string | null;
  notas?: string | null;
}

export type ActualizarEnsayoEsclerometroRequest = Partial<CrearEnsayoEsclerometroRequest>;

/**
 * Promedio de rebotes descartando max y min cuando hay ≥3 valores. Es la
 * fórmula típica del Schmidt hammer para rechazar outliers. Compartido
 * frontend/backend para que la UI muestre el mismo valor que el listado.
 */
export function calcularReboteUtilPromedio(valores: number[]): number | null {
  if (valores.length === 0) return null;
  if (valores.length === 1) return valores[0] ?? null;
  if (valores.length === 2) return (valores[0]! + valores[1]!) / 2;
  // 3+: descartar max y min
  const ord = [...valores].sort((a, b) => a - b);
  const conserva = ord.slice(1, -1);
  return conserva.reduce((s, v) => s + v, 0) / conserva.length;
}
