// Búsqueda de PARECIDOS: "lo que escribo se parece a algo que ya existe".
//
// `coincideBusqueda` (lib/utilidades/buscar.ts) exige que TODAS las palabras
// aparezcan tal cual, y eso está bien para un buscador: el que busca escribe lo
// que sabe que está. Para no duplicar un producto hace falta lo contrario: quien
// crea "TUBO PVC SDR 41 DE 4 PULG" tiene que ver que ya existe
// «TUBO SDR41 JC PVC 4"», aunque lo haya escrito distinto. Así que acá cada
// palabra se compara de forma tolerante:
//   · orden libre y palabras de relleno fuera (de, para, con…)
//   · sin tildes, mayúsculas ni comillas; 4" = 4 PULG = 4 PULGADAS
//   · letras pegadas a números se separan: SDR41 = SDR 41, PVC4 = PVC 4
//   · plural = singular (TUBOS = TUBO)
//   · abreviaturas: GALV = GALVANIZADO, TORN = TORNILLO
//   · faltas de ortografía: SERRUCHO = CERRUCHO, VALVULA = BALBULA, TUVO = TUBO
//     (misma pronunciación) y una o dos letras cambiadas (ALAMBRE = ALMBRE)
// Los números NO se aproximan: 4 no se parece a 41, ni 1/2 a 1/4.

const RELLENO = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'para', 'p', 'con', 'en', 'y', 'a', 'al', 'x', 'c', 'un', 'una']);

/** Pasa el texto a minúsculas sin tildes y unifica las unidades más comunes. */
function limpiar(s: string): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // pulgadas: 4" · 4'' · 4 pulg · 4 pulgadas · 4 plg → 4
    .replace(/(\d)\s*(?:"|''|”|″|pulgadas?|pulg\.?|plg\.?)(?=[^a-z]|$)/g, '$1 ')
    .replace(/["'”″`´]/g, ' ')
    // 1-1/4 → 1 1/4
    .replace(/(\d)-(\d+\/\d+)/g, '$1 $2')
    // letras pegadas a números (y al revés): sdr41 → sdr 41, 4x4 → 4 x 4
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2');
}

/** Plural → singular. Se recorta igual de los dos lados (lo escrito y el
 *  catálogo), así que basta con que sea CONSISTENTE: CABLES y CABLE quedan los dos
 *  "cabl", INTERRUPTORES e INTERRUPTOR los dos "interruptor". */
function singular(t: string): string {
  let s = t;
  if (s.length > 3 && s.endsWith('s')) s = s.slice(0, -1);
  if (s.length > 4 && s.endsWith('e')) s = s.slice(0, -1);
  return s;
}

/** Clave fonética del español de CR: b=v, s=z=c(e,i), k=c(a,o,u)=qu, y=ll, h muda. */
function fonetica(t: string): string {
  return t
    .replace(/ch/g, 'x') // antes que la c y la h: CHAPA no es CAPA
    .replace(/qu/g, 'k')
    .replace(/c([ei])/g, 's$1')
    .replace(/c/g, 'k')
    .replace(/z/g, 's')
    .replace(/v/g, 'b')
    .replace(/w/g, 'u')
    .replace(/ll/g, 'y')
    .replace(/h/g, '')
    .replace(/(.)\1+/g, '$1');
}

const esNumero = (t: string) => /^\d+([./]\d+)?$/.test(t);

export interface Token { t: string; fon: string; num: boolean }

/** Parte un texto en palabras comparables. */
export function tokenizar(s: string): Token[] {
  const out: Token[] = [];
  for (const crudo of limpiar(s).split(/[^a-z0-9./]+/)) {
    const limpio = crudo.replace(/^[./]+|[./]+$/g, '');
    if (!limpio || RELLENO.has(limpio)) continue;
    const num = esNumero(limpio);
    // "1.68mm" ya quedó "1.68" + "mm"; un punto suelto entre letras (P.D.) se parte.
    const partes = num ? [limpio] : limpio.split(/[./]+/).filter(Boolean);
    for (const p of partes) {
      if (RELLENO.has(p)) continue;
      const t = num ? p : singular(p);
      out.push({ t, fon: num ? t : fonetica(t), num });
    }
  }
  return out;
}

/** Distancia de edición (con transposición), cortando apenas pasa de `tope`. */
function distancia(a: string, b: string, tope: number): number {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  const n = a.length, m = b.length;
  let prev2: number[] = [];
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    let minFila = i;
    for (let j = 1; j <= m; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + costo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < minFila) minFila = v;
    }
    if (minFila > tope) return tope + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[m];
}

/** Qué tanto se parece una palabra escrita a una palabra del catálogo (0..1). */
function parecidoPalabra(q: Token, c: Token): number {
  if (q.t === c.t) return 1;
  if (q.num || c.num) return 0; // 4 ≠ 41 · 1/2 ≠ 1/4
  if (q.fon === c.fon) return 0.92; // serrucho = cerrucho, valvula = balbula
  const corta = Math.min(q.t.length, c.t.length);
  // Abreviatura: galv → galvanizado, torn → tornillo (al menos 3 letras).
  if (corta >= 3 && (c.t.startsWith(q.t) || q.t.startsWith(c.t))) return 0.85;
  if (corta >= 4) {
    const tope = corta >= 7 ? 2 : 1;
    const d = Math.min(distancia(q.t, c.t, tope), distancia(q.fon, c.fon, tope));
    if (d <= tope) return d === 1 ? 0.8 : 0.65;
  }
  return 0;
}

export interface Parecido<T> { item: T; puntaje: number }

/**
 * Prepara un catálogo para buscar parecidos muchas veces (una vez por tecla):
 * tokeniza cada ítem UNA sola vez.
 */
export function indiceParecidos<T>(items: T[], texto: (t: T) => string, codigo?: (t: T) => string) {
  const filas = items.map((item) => {
    const s = texto(item);
    const tokens = tokenizar(s);
    return { item, tokens, pegado: tokens.map((x) => x.t).join(''), codigo: codigo ? codigo(item).toLowerCase() : '' };
  });

  /**
   * Los ítems que se parecen a `consulta`, del más al menos parecido.
   * puntaje 1 = mismas palabras; ~0,5 = la mitad de lo escrito coincide.
   */
  return function buscar(consulta: string, opts: { minimo?: number; max?: number } = {}): Parecido<T>[] {
    const minimo = opts.minimo ?? 0.5;
    const max = opts.max ?? 50;
    const q = tokenizar(consulta);
    if (!q.length) return [];
    // Si lo escrito es un código (M13-0179, m13-01) se busca por código.
    const codigoQ = /^[a-z]\d{2}-\d{1,4}$/i.test(consulta.trim()) ? consulta.trim().toLowerCase() : '';
    // Las letras pesan más que los números: "tubo pvc 3" tiene que traer también
    // los de 4", pero el de 3" primero.
    const peso = (t: Token) => (t.num ? 0.6 : 1);
    const pesoTotal = q.reduce((s, t) => s + peso(t), 0);
    const out: Parecido<T>[] = [];
    for (const f of filas) {
      if (codigoQ && f.codigo.startsWith(codigoQ)) { out.push({ item: f.item, puntaje: 1 }); continue; }
      if (!f.tokens.length) continue;
      let suma = 0;
      let letrasFuertes = 0;
      const usadas = new Set<number>();
      for (const qt of q) {
        let mejor = 0, idx = -1;
        for (let i = 0; i < f.tokens.length; i++) {
          const p = parecidoPalabra(qt, f.tokens[i]);
          if (p > mejor) { mejor = p; idx = i; if (p === 1) break; }
        }
        // "cielo raso" escrito "cielorraso" (o al revés): la palabra está pegada.
        if (mejor < 0.75 && !qt.num && qt.t.length >= 5 && f.pegado.includes(qt.t)) mejor = 0.75;
        if (idx >= 0 && mejor > 0) usadas.add(idx);
        if (!qt.num && mejor >= 0.8) letrasFuertes++;
        suma += peso(qt) * mejor;
      }
      // Hace falta al menos una palabra (no número) que de verdad calce.
      if (!letrasFuertes) continue;
      const cobertura = suma / pesoTotal;
      // Un poco de castigo a los nombres larguísimos donde lo escrito es una parte chica.
      const ajuste = usadas.size / f.tokens.length;
      const puntaje = cobertura * 0.88 + ajuste * 0.12;
      if (cobertura >= minimo) out.push({ item: f.item, puntaje: Math.min(1, puntaje) });
    }
    out.sort((a, b) => b.puntaje - a.puntaje);
    return out.slice(0, max);
  };
}
