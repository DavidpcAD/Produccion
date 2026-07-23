// Helpers para normalizar el período recibido en los query params de los
// endpoints de utilidades. Portado de la app Vite original (api/src/lib/periodo.ts).
//
// Acepta dos formatos:
//   1) Legacy (un solo mes): `anio=2026&mes=5`
//   2) Rango: `desdeAnio=2026&desdeMes=1&hastaAnio=2026&hastaMes=5`
//
// Si se reciben ambos, el rango tiene prioridad. Si no se recibe nada,
// se devuelve `null` y el handler debe responder un 400. Todos los handlers
// usan este helper para que las queries SQL sean idénticas en estructura
// (siempre `WHERE (anio*100+mes) BETWEEN @desdeYM AND @hastaYM`).

export interface RangoMeses {
  desdeAnio: number;
  desdeMes: number;
  hastaAnio: number;
  hastaMes: number;
  /** YYYYMM como entero — útil para BETWEEN en SQL. */
  desdeYM: number;
  hastaYM: number;
  /** True si el rango cubre un solo mes. */
  esMesUnico: boolean;
}

function num(sp: URLSearchParams, k: string): number | undefined {
  const raw = sp.get(k);
  if (raw === null || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function enRango(anio: number | undefined, mes: number | undefined): boolean {
  return (
    anio !== undefined &&
    mes !== undefined &&
    anio >= 2015 &&
    anio <= 2100 &&
    mes >= 1 &&
    mes <= 12
  );
}

/**
 * Convierte los query params del request en un rango cerrado de meses.
 * Retorna `null` si los params son insuficientes o inválidos.
 */
export function resolverRango(sp: URLSearchParams): RangoMeses | null {
  const desdeAnio = num(sp, 'desdeAnio');
  const desdeMes = num(sp, 'desdeMes');
  const hastaAnio = num(sp, 'hastaAnio');
  const hastaMes = num(sp, 'hastaMes');

  // Modo rango: deben venir los 4 extremos válidos.
  if (enRango(desdeAnio, desdeMes) && enRango(hastaAnio, hastaMes)) {
    const desdeYM = desdeAnio! * 100 + desdeMes!;
    const hastaYM = hastaAnio! * 100 + hastaMes!;
    // Si vienen al revés, los volteamos silenciosamente.
    if (desdeYM > hastaYM) {
      return {
        desdeAnio: hastaAnio!,
        desdeMes: hastaMes!,
        hastaAnio: desdeAnio!,
        hastaMes: desdeMes!,
        desdeYM: hastaYM,
        hastaYM: desdeYM,
        esMesUnico: desdeYM === hastaYM,
      };
    }
    return {
      desdeAnio: desdeAnio!,
      desdeMes: desdeMes!,
      hastaAnio: hastaAnio!,
      hastaMes: hastaMes!,
      desdeYM,
      hastaYM,
      esMesUnico: desdeYM === hastaYM,
    };
  }

  // Modo legacy: anio + mes.
  const anio = num(sp, 'anio');
  const mes = num(sp, 'mes');
  if (enRango(anio, mes)) {
    const ym = anio! * 100 + mes!;
    return {
      desdeAnio: anio!,
      desdeMes: mes!,
      hastaAnio: anio!,
      hastaMes: mes!,
      desdeYM: ym,
      hastaYM: ym,
      esMesUnico: true,
    };
  }

  return null;
}

/** Cuenta meses inclusivos entre dos pares (anio, mes). */
export function contarMeses(
  desdeAnio: number,
  desdeMes: number,
  hastaAnio: number,
  hastaMes: number,
): number {
  return (hastaAnio - desdeAnio) * 12 + (hastaMes - desdeMes) + 1;
}

/** Resta N meses a un par (anio, mes). */
export function restarMeses(anio: number, mes: number, n: number): { anio: number; mes: number } {
  const total = anio * 12 + (mes - 1) - n;
  return { anio: Math.floor(total / 12), mes: (total % 12) + 1 };
}

/** Convierte lista separada por comas en array limpio (para tipos/lotes). */
export function parseCsv(sp: URLSearchParams, key: string): string[] {
  return (sp.get(key) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
