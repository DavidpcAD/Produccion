/**
 * Evaluación de cumplimiento de resistencia de una muestra de laboratorio contra
 * la curva teórica (ASTM C-150 Type I) y el F'C objetivo. Portado de obrascontrol
 * `shared/utilidades/evaluacion-resistencia.ts` (adelante-control-concreto).
 *
 * Reglas: ratio = kg/cm²_real / (pct_teórico × F'C)
 *   ratio >= 0.95 → 'cumple' (verde) · 0.85–0.95 → 'marginal' (amarillo)
 *   ratio < 0.85 → 'incumple' (rojo) · sin mediciones → 'sin_dato' (gris)
 * Una MUESTRA se evalúa con el PEOR de sus ensayos.
 *
 * La curva vive en la DB del repo original (lab.curva_teorica); acá va como
 * constante (no existe esa tabla en la base de Producción). Si algún día se
 * carga, se puede pasar como parámetro `curva`.
 */

export type EvaluacionCumplimiento = 'cumple' | 'marginal' | 'incumple' | 'sin_dato';

export interface PuntoCurva {
  edad_dias: number;
  pct_resistencia: number;
}

// Curva teórica ASTM C-150 Type I (valores exactos de lab.curva_teorica).
export const CURVA_TEORICA_DEFAULT: PuntoCurva[] = [
  { edad_dias: 1, pct_resistencia: 0.16 },
  { edad_dias: 3, pct_resistencia: 0.40 },
  { edad_dias: 7, pct_resistencia: 0.65 },
  { edad_dias: 14, pct_resistencia: 0.90 },
  { edad_dias: 28, pct_resistencia: 1.00 },
  { edad_dias: 56, pct_resistencia: 1.10 },
  { edad_dias: 90, pct_resistencia: 1.15 },
];

export const UMBRAL_CUMPLE = 0.95;
export const UMBRAL_MARGINAL = 0.85;

/** Interpola linealmente el % de resistencia esperado a una edad dada. */
export function interpolarCurvaTeorica(puntos: PuntoCurva[], edad: number): number {
  if (puntos.length === 0) return 0;
  const exacto = puntos.find((p) => p.edad_dias === edad);
  if (exacto) return exacto.pct_resistencia;

  const ordenados = [...puntos].sort((a, b) => a.edad_dias - b.edad_dias);
  const anteriores = ordenados.filter((p) => p.edad_dias < edad);
  const posteriores = ordenados.filter((p) => p.edad_dias > edad);
  if (anteriores.length === 0) return posteriores[0]?.pct_resistencia ?? 0;
  if (posteriores.length === 0) return anteriores.at(-1)?.pct_resistencia ?? 0;

  const a = anteriores.at(-1)!;
  const b = posteriores[0]!;
  const t = (edad - a.edad_dias) / (b.edad_dias - a.edad_dias);
  return a.pct_resistencia + t * (b.pct_resistencia - a.pct_resistencia);
}

export interface EnsayoEval {
  edad_dias: number;
  resistencia_kg_cm2_promedio: number | null;
}

/** Evalúa un único ensayo contra la curva. */
export function evaluarEnsayoCumplimiento(
  ensayo: EnsayoEval,
  fcObjetivo: number,
  curva: PuntoCurva[] = CURVA_TEORICA_DEFAULT,
): EvaluacionCumplimiento {
  if (ensayo.resistencia_kg_cm2_promedio === null) return 'sin_dato';
  if (fcObjetivo <= 0) return 'sin_dato';
  const pctTeorico = interpolarCurvaTeorica(curva, ensayo.edad_dias);
  if (pctTeorico <= 0) return 'sin_dato';
  const ratio = ensayo.resistencia_kg_cm2_promedio / (pctTeorico * fcObjetivo);
  if (ratio >= UMBRAL_CUMPLE) return 'cumple';
  if (ratio >= UMBRAL_MARGINAL) return 'marginal';
  return 'incumple';
}

/** Evalúa la muestra: peor caso de sus ensayos con datos. */
export function evaluarMuestraCumplimiento(
  ensayos: EnsayoEval[],
  fcObjetivo: number,
  curva: PuntoCurva[] = CURVA_TEORICA_DEFAULT,
): EvaluacionCumplimiento {
  const conDatos = ensayos.filter((e) => e.resistencia_kg_cm2_promedio !== null);
  if (conDatos.length === 0) return 'sin_dato';
  let peor: EvaluacionCumplimiento = 'cumple';
  for (const e of conDatos) {
    const v = evaluarEnsayoCumplimiento(e, fcObjetivo, curva);
    if (v === 'incumple') return 'incumple';
    if (v === 'marginal') peor = 'marginal';
  }
  return peor;
}

/** Etiqueta + variante de Badge para una evaluación. */
export const CUMPLIMIENTO_META: Record<EvaluacionCumplimiento, { label: string; variant: 'green' | 'yellow' | 'red' | 'gray' }> = {
  cumple: { label: 'Cumple', variant: 'green' },
  marginal: { label: 'Marginal', variant: 'yellow' },
  incumple: { label: 'No cumple', variant: 'red' },
  sin_dato: { label: 'Sin dato', variant: 'gray' },
};
