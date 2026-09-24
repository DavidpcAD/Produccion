import 'server-only';
import { getDb, sql } from '@/lib/db';

/**
 * TIPOS DE OBRA del catálogo (`h4.tipos_obra`). Son seis y los define el
 * negocio, no el código:
 *
 *   O = Obra Vivienda · I = Infraestructura · A = Administrativa
 *   F = Fábrica       · T = Torres         · P = Postventa
 *
 * Cada tipo tiene su propio catálogo de tres niveles:
 *
 *   grupo (h4.grupos_partida)  ← capítulo "Total" de la obra en BC
 *     partida (h4.partidas)    ← partida "Posting" de la obra en BC
 *       subpartida (h4.sub_partidas)  ← SOLO SQL, BC no tiene este nivel
 *
 * El rótulo del nivel 1 cambia por tipo (Etapa en vivienda, Sistema en infra,
 * Área en administrativas, Proceso en fábrica, Torre en torres) y vive en la
 * tabla — así se puede cambiar sin deploy.
 *
 * CATÁLOGO COMPARTIDO vs POR OBRA (`grupos_partida.bc_works_no`):
 *   NULL      → el grupo lo comparten TODAS las obras del tipo. Es como se usan
 *               vivienda e infra: un catálogo y muchas obras.
 *   con valor → el grupo es de ESA obra de BC. Es la realidad de administrativas
 *               y fábricas: cada una tiene su estructura y los códigos se repiten
 *               entre ellas (G1 "Generales" está en 7 casas; FM es "MOLDURERA" en
 *               F-MADERAS y "Fabrica de Maderas" en HER).
 */

export interface TipoObra {
  codigo: string;
  letra: string;
  nombre: string;
  terminoGrupo: string;
  terminoGrupoPlural: string;
  /** Género del rótulo del nivel 1: 'F' → "Nueva etapa", 'M' → "Nuevo proceso". */
  genero: 'F' | 'M';
  usaSprints: boolean;
  usaTiposCasa: boolean;
  /** true = catálogo compartido por todas las obras del tipo (vivienda / infra). */
  catalogoCompartido: boolean;
  /** true = cuando BC no da el capítulo de una partida, se deduce (del código o del orden). */
  deduceCapitulo: boolean;
  /** true = la subpartida es la misma partida; al traer de BC se crea `<partida>.1`. */
  subpartidaEspejo: boolean;
  orden: number;
  activo: boolean;
}

/** Tipos cuyo catálogo es UNO para todas sus obras; el resto es por obra de BC. */
const COMPARTIDOS = new Set(['VIVIENDA', 'INFRA']);

/**
 * Tipos donde BC NO siempre dice de qué capítulo cuelga la partida y hay que
 * deducirlo. Lo normal es que lo diga el código (VN-C.01 → VN-C, la regla de
 * `capituloDePartida`); en postventa hay dos huecos reales:
 *
 *   · El bloque existe en el código pero NO tiene línea "Total" en BC: VN-L.05,
 *     VN-L.15… en PV-NOVARUM, sin ningún VN-L arriba. Se crea la etapa VN-L
 *     (sin puente a BC, porque BC no la tiene) y ahí caen sus partidas. Sin esto
 *     se pegaban al bloque anterior —BLOQUE K— que no tiene nada que ver.
 *   · El código no dice nada: PV-MAT "MATERIALES GENERALES" cuelga de PV-GEN
 *     "GENERALES POST VENTA" y la única pista es que en BC va debajo de él. Ahí
 *     manda el ORDEN de las líneas, que es como se ve la obra en pantalla.
 */
const CAPITULO_DEDUCIDO = new Set(['POSTVENTA']);

/**
 * Tipos donde la subpartida ES la partida: no hay desglose abajo, así que al traer
 * de BC se crea la subpartida espejo `<partida>.1` con el mismo nombre. Es la regla
 * que el negocio ya fijó para postventa (cada casa es una sola cosa) y la misma que
 * dejó escrita a mano `migrations/2026-09-17_subpartida_espejo_toda_partida.sql`
 * para fábrica, infra y administrativas.
 */
const SUB_ESPEJO = new Set(['POSTVENTA']);

/** Tipo al que caen las obras cuya área de costeo no está mapeada. */
export const TIPO_POR_DEFECTO = 'ADMIN';

interface FilaTipo {
  codigo: string;
  letra: string;
  nombre: string;
  termino_grupo: string;
  termino_grupo_pl: string;
  genero: string;
  usa_sprints: boolean;
  usa_tipos_casa: boolean;
  orden: number;
  activo: boolean;
}

function mapTipo(r: FilaTipo): TipoObra {
  return {
    codigo: r.codigo,
    letra: r.letra,
    nombre: r.nombre,
    terminoGrupo: r.termino_grupo,
    terminoGrupoPlural: r.termino_grupo_pl,
    genero: String(r.genero).toUpperCase() === 'M' ? 'M' : 'F',
    usaSprints: !!r.usa_sprints,
    usaTiposCasa: !!r.usa_tipos_casa,
    catalogoCompartido: COMPARTIDOS.has(r.codigo),
    deduceCapitulo: CAPITULO_DEDUCIDO.has(r.codigo),
    subpartidaEspejo: SUB_ESPEJO.has(r.codigo),
    orden: Number(r.orden) || 0,
    activo: !!r.activo,
  };
}

/** Los tipos activos, en el orden del negocio. */
export async function listarTiposObra(): Promise<TipoObra[]> {
  const db = await getDb();
  const r = await db.request().query<FilaTipo>(`
    SELECT codigo, letra, nombre, termino_grupo, termino_grupo_pl, genero,
           usa_sprints, usa_tipos_casa, orden, activo
    FROM h4.tipos_obra
    WHERE activo = 1
    ORDER BY orden, codigo
  `);
  return r.recordset.map(mapTipo);
}

/** Un tipo por código ('VIVIENDA', 'FABRICA'…). null si no existe. */
export async function getTipoObra(codigo: string): Promise<TipoObra | null> {
  const db = await getDb();
  const r = await db.request()
    .input('cod', sql.VarChar(20), String(codigo ?? '').trim().toUpperCase())
    .query<FilaTipo>(`
      SELECT codigo, letra, nombre, termino_grupo, termino_grupo_pl, genero,
             usa_sprints, usa_tipos_casa, orden, activo
      FROM h4.tipos_obra WHERE codigo = @cod
    `);
  return r.recordset[0] ? mapTipo(r.recordset[0]) : null;
}

/** El tipo de obra al que pertenece un grupo del catálogo. null si no existe. */
export async function getTipoObraDeGrupo(idGrupo: number): Promise<
  (TipoObra & { bcWorksNo: string | null }) | null
> {
  const db = await getDb();
  const r = await db.request()
    .input('id', sql.Int, idGrupo)
    .query<FilaTipo & { bc_works_no: string | null }>(`
      SELECT t.codigo, t.letra, t.nombre, t.termino_grupo, t.termino_grupo_pl, t.genero,
             t.usa_sprints, t.usa_tipos_casa, t.orden, t.activo, g.bc_works_no
      FROM h4.grupos_partida g
      JOIN h4.tipos_obra t ON t.codigo = g.tipo_obra
      WHERE g.id = @id
    `);
  const f = r.recordset[0];
  return f ? { ...mapTipo(f), bcWorksNo: f.bc_works_no } : null;
}

/**
 * De qué tipo es una obra según su ÁREA DE COSTEO de BC
 * (`h4.tipo_obra_area_costeo`). Lo que no esté mapeado cae en ADMIN, que es
 * donde viven los centros de costo de BC.
 */
export async function tipoObraDeAreaCosteo(areaCosteo: string | null | undefined): Promise<string> {
  const area = String(areaCosteo ?? '').trim();
  if (!area) return TIPO_POR_DEFECTO;
  const db = await getDb();
  const r = await db.request()
    .input('area', sql.VarChar(50), area)
    .query<{ tipo_obra: string }>(
      'SELECT tipo_obra FROM h4.tipo_obra_area_costeo WHERE area_costeo = @area',
    );
  return r.recordset[0]?.tipo_obra ?? TIPO_POR_DEFECTO;
}

/**
 * De qué tipo es UNA obra del app. Manda lo que eligió la gente
 * (`dbo.Obra.tipoObra`); si está vacío se deduce del área de costeo de BC, que es
 * como funcionaba antes de que la obra tuviera tipo propio.
 *
 * Devuelve null solo si la obra no existe en dbo.Obra.
 */
export async function tipoObraDeObra(numeroObra: string): Promise<
  { tipo: string; origen: 'obra' | 'area'; areaCosteo: string | null } | null
> {
  const app = await getDb();
  const r = await app.request()
    .input('no', sql.NVarChar(50), String(numeroObra ?? '').trim())
    .query<{ tipoObra: string | null; areaCosteo: string | null }>(
      'SELECT TOP 1 tipoObra, areaCosteo FROM dbo.Obra WHERE numeroObra = @no',
    );
  const f = r.recordset[0];
  if (!f) return null;
  const explicito = String(f.tipoObra ?? '').trim().toUpperCase();
  const areaCosteo = String(f.areaCosteo ?? '').trim() || null;
  if (explicito) return { tipo: explicito, origen: 'obra', areaCosteo };
  return { tipo: await tipoObraDeAreaCosteo(areaCosteo), origen: 'area', areaCosteo };
}

/** Mapa completo área de costeo → tipo de obra (para clasificar varias obras de una). */
export async function mapaAreaCosteoTipo(): Promise<Map<string, string>> {
  const db = await getDb();
  const r = await db.request().query<{ area_costeo: string; tipo_obra: string }>(
    'SELECT area_costeo, tipo_obra FROM h4.tipo_obra_area_costeo',
  );
  return new Map(r.recordset.map((f) => [f.area_costeo.trim().toUpperCase(), f.tipo_obra]));
}

/** Separadores con los que se corta un código de BC: 'VN-L.05' → 'VN-L' → 'VN-'. */
const SEPARADORES = ['.', '-', ' ', '/', '_'];

/**
 * Cómo se llama un capítulo que BC no tiene. Pasa en postventa: PV-NOVARUM tiene
 * partidas VN-L.05, VN-L.15… y ninguna línea "Total" VN-L, así que no hay nombre
 * que copiar. Se saca del patrón de los HERMANOS: si VN-A…VN-K se llaman
 * "BLOQUE A"…"BLOQUE K", entonces VN-L es "BLOQUE L".
 *
 * Pide al menos dos hermanos con el mismo patrón para no inventar un nombre a
 * partir de una coincidencia; si no lo encuentra devuelve null y el capítulo se
 * queda con su código de nombre.
 */
export function nombreDeCapituloFaltante(codigo: string, capitulos: Map<string, string>): string | null {
  const cod = String(codigo ?? '').trim();
  // Corte en el último separador: 'VN-L' → prefijo 'VN-', sufijo 'L'.
  const corte = Math.max(...SEPARADORES.map((s) => cod.lastIndexOf(s)));
  if (corte <= 0 || corte === cod.length - 1) return null;
  const prefijo = cod.slice(0, corte + 1);
  const sufijo = cod.slice(corte + 1);

  const bases = new Map<string, number>();
  for (const [hermano, nombre] of capitulos) {
    if (hermano === cod || !hermano.startsWith(prefijo)) continue;
    const suf = hermano.slice(prefijo.length);
    // El nombre del hermano tiene que terminar en SU sufijo ("BLOQUE K" ← VN-K):
    // eso es lo que deja a la vista el patrón "<base> <sufijo>".
    if (!suf || !nombre.endsWith(suf)) continue;
    const base = nombre.slice(0, nombre.length - suf.length).trim();
    if (!base) continue;
    bases.set(base, (bases.get(base) ?? 0) + 1);
  }
  let mejor: string | null = null;
  let repeticiones = 0;
  for (const [base, n] of bases) if (n > repeticiones) { mejor = base; repeticiones = n; }
  return mejor && repeticiones >= 2 ? `${mejor} ${sufijo}` : null;
}

/**
 * Cuelga cada partida ("Posting" de BC) del capítulo ("Total") cuyo código es su
 * prefijo más largo: FG-01 → FG, G1.1 → G1, SPL-01 → SPL (no SP). Devuelve null
 * cuando BC no tiene capítulo para esa partida — pasa seguido en administrativas
 * (SSCC, HER, MAQ…), donde el presupuesto es plano.
 */
export function capituloDePartida(taskNo: string, capitulos: Iterable<string>): string | null {
  const t = String(taskNo ?? '').trim().toUpperCase();
  let mejor: string | null = null;
  for (const c of capitulos) {
    const cap = String(c ?? '').trim();
    if (!cap || cap.toUpperCase() === t) continue;
    if (!t.startsWith(cap.toUpperCase())) continue;
    const siguiente = t[cap.length];
    // 'SP' no es el capítulo de 'SPL-01': el corte tiene que caer en un separador.
    if (siguiente && !SEPARADORES.includes(siguiente)) continue;
    if (!mejor || cap.length > mejor.length) mejor = cap;
  }
  return mejor;
}
