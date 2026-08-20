// Búsqueda por palabras para los buscadores (materiales, artículos, tablas).
//
// El problema que resuelve: antes se comparaba el término ENTERO contra el texto
// (`texto.includes("tubo 3\"")`), así que escribir "tubo 3\"" NO encontraba un
// material llamado «TUBO PVC TIPO … 3"» porque esas palabras no están juntas.
//
// Ahora el término se parte en palabras y se exige que TODAS aparezcan en el
// texto, en cualquier orden. Así "tubo 3\"" trae todos los tubos de 3".

/** Normaliza para comparar sin tildes ni mayúsculas. */
export const normalizarBusqueda = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * ¿El texto contiene TODAS las palabras del término (en cualquier orden)?
 * Sin tildes ni mayúsculas. Un término vacío coincide con todo.
 * Ej.: coincide("TUBO PVC TIPO X 3\"", "tubo 3\"") === true
 */
export function coincideBusqueda(texto: string, termino: string): boolean {
  const t = normalizarBusqueda(texto);
  const palabras = normalizarBusqueda(termino).split(/\s+/).filter(Boolean);
  return palabras.every((p) => t.includes(p));
}
