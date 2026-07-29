// Mapping crudo CSV Blend → códigos BC de `hor.materiales`.
//
// Portado de `api/src/lib/mapeo-materiales.ts` de la app original. Blend exporta
// los nombres de áridos como texto libre corto en `arido_a_nombre` /
// `arido_b_nombre`; esos textos NO matchean con `hor.materiales.nombre` ni con
// `tipo`. Este módulo centraliza la traducción.
//
// Aditivos: las 3 columnas `aditivo1/2/3` son posicionales (no traen nombre).
//   aditivo1_l → M10-0009 (Aditivo Ergo 4000 PG50)
//   aditivo2_l → null  (slot reservado, no usado)
//   aditivo3_l → M10-0003 (Fibra de vidrio)

export const MAP_ARIDO_NOMBRE_A_CODIGO_BC: ReadonlyMap<string, string> = new Map([
  ['arena', 'M10-0010'], // Arena lavada
  ['quintilla', 'M10-0016'], // Piedra quintilla
  ['cuarta', 'M10-0015'], // Piedra cuartilla
  ['cuartilla', 'M10-0015'], // Piedra cuartilla (alias)
]);

/**
 * Mapping posicional de `aditivoN_l` → `codigo_bc`. Slot 2 es null porque no
 * hay material seedeado para esa posición.
 */
export const MAP_ADITIVO_POSICION_A_CODIGO_BC: ReadonlyMap<1 | 2 | 3, string | null> = new Map([
  [1, 'M10-0009'], // Aditivo Ergo 4000 PG50
  [2, null],
  [3, 'M10-0003'], // Fibra de vidrio
]);

/**
 * Resuelve el código BC de un árido a partir del texto crudo del CSV.
 * Devuelve `null` si el texto no matchea ninguna entrada conocida.
 */
export function resolverCodigoBcDeArido(nombreCsv: string | null): string | null {
  if (!nombreCsv) return null;
  const clave = nombreCsv.trim().toLowerCase();
  return MAP_ARIDO_NOMBRE_A_CODIGO_BC.get(clave) ?? null;
}
