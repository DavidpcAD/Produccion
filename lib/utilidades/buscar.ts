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

/**
 * Puntaje de relevancia de UN campo contra el término (menor = más relevante).
 * 0 = el campo ES el término (código exacto) · 1 = empieza con el término
 * 2 = alguna palabra del campo empieza con el término · 3 = lo contiene
 * 4 = no lo contiene entero, pero sí todas sus palabras por separado.
 */
function relevanciaCampo(campo: string, termino: string): number {
  const c = normalizarBusqueda(campo);
  const t = normalizarBusqueda(termino);
  if (!t) return 4;
  if (c === t) return 0;
  if (c.startsWith(t)) return 1;
  // Palabra que empieza con el término: separadores reales de los catálogos de BC
  // (espacios, guiones, /, paréntesis, comas, puntos, #).
  if (c.split(/[^a-z0-9"']+/).some((p) => p.startsWith(t))) return 2;
  if (c.includes(t)) return 3;
  return 4;
}

/**
 * Filtra por palabras (como coincideBusqueda) y ORDENA por relevancia, sin
 * descartar nada por tipo. Resuelve el caso real: en un catálogo de ~5.000
 * artículos, buscar "servicio" traía primero los materiales que llevan la
 * palabra en el nombre (CONTACTOR SERVICIO PESADO…) y el tope de resultados
 * dejaba fuera los artículos de SERVICIO. Con el orden por relevancia,
 * "SERVICIO DE TRANSPORTE" (empieza con el término) va antes.
 *
 * `campos` de cada ítem: se puntea el MEJOR campo (ej. código y descripción por
 * separado), así "M02-0044" gana por código exacto aunque la descripción sea larga.
 */
export function buscarOrdenado<T>(items: T[], termino: string, campos: (t: T) => string[]): T[] {
  const q = termino.trim();
  if (!q) return items;
  const conPuntaje: { it: T; score: number; i: number }[] = [];
  items.forEach((it, i) => {
    const cs = campos(it);
    if (!coincideBusqueda(cs.join(' '), q)) return;
    const score = Math.min(...cs.map((c) => relevanciaCampo(c, q)));
    conPuntaje.push({ it, score, i });
  });
  // Empate → orden original del catálogo (BC lo devuelve por código).
  conPuntaje.sort((a, b) => a.score - b.score || a.i - b.i);
  return conPuntaje.map((x) => x.it);
}
