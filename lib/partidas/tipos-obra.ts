import 'server-only';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';

/**
 * TIPOS DE OBRA del catálogo (`pro_obc.tipos_obra`). Son cinco y los define el
 * negocio, no el código:
 *
 *   O = Obra Vivienda · I = Infraestructura · A = Administrativa
 *   F = Fábrica       · T = Torres
 *
 * Cada tipo tiene su propio catálogo de tres niveles:
 *
 *   grupo (pro_obc.grupos_partida)  ← capítulo "Total" de la obra en BC
 *     partida (pro_obc.partidas)    ← partida "Posting" de la obra en BC
 *       subpartida (pro_obc.sub_partidas)  ← SOLO SQL, BC no tiene este nivel
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
  orden: number;
  activo: boolean;
}

/** Tipos cuyo catálogo es UNO para todas sus obras; el resto es por obra de BC. */
const COMPARTIDOS = new Set(['VIVIENDA', 'INFRA']);

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
    orden: Number(r.orden) || 0,
    activo: !!r.activo,
  };
}

/** Los cinco tipos, en el orden del negocio. */
export async function listarTiposObra(): Promise<TipoObra[]> {
  const db = await getAdelanteDb();
  const r = await db.request().query<FilaTipo>(`
    SELECT codigo, letra, nombre, termino_grupo, termino_grupo_pl, genero,
           usa_sprints, usa_tipos_casa, orden, activo
    FROM pro_obc.tipos_obra
    WHERE activo = 1
    ORDER BY orden, codigo
  `);
  return r.recordset.map(mapTipo);
}

/** Un tipo por código ('VIVIENDA', 'FABRICA'…). null si no existe. */
export async function getTipoObra(codigo: string): Promise<TipoObra | null> {
  const db = await getAdelanteDb();
  const r = await db.request()
    .input('cod', sql.VarChar(20), String(codigo ?? '').trim().toUpperCase())
    .query<FilaTipo>(`
      SELECT codigo, letra, nombre, termino_grupo, termino_grupo_pl, genero,
             usa_sprints, usa_tipos_casa, orden, activo
      FROM pro_obc.tipos_obra WHERE codigo = @cod
    `);
  return r.recordset[0] ? mapTipo(r.recordset[0]) : null;
}

/** El tipo de obra al que pertenece un grupo del catálogo. null si no existe. */
export async function getTipoObraDeGrupo(idGrupo: number): Promise<
  (TipoObra & { bcWorksNo: string | null }) | null
> {
  const db = await getAdelanteDb();
  const r = await db.request()
    .input('id', sql.Int, idGrupo)
    .query<FilaTipo & { bc_works_no: string | null }>(`
      SELECT t.codigo, t.letra, t.nombre, t.termino_grupo, t.termino_grupo_pl, t.genero,
             t.usa_sprints, t.usa_tipos_casa, t.orden, t.activo, g.bc_works_no
      FROM pro_obc.grupos_partida g
      JOIN pro_obc.tipos_obra t ON t.codigo = g.tipo_obra
      WHERE g.id = @id
    `);
  const f = r.recordset[0];
  return f ? { ...mapTipo(f), bcWorksNo: f.bc_works_no } : null;
}

/**
 * De qué tipo es una obra según su ÁREA DE COSTEO de BC
 * (`pro_obc.tipo_obra_area_costeo`). Lo que no esté mapeado cae en ADMIN, que es
 * donde viven los centros de costo de BC.
 */
export async function tipoObraDeAreaCosteo(areaCosteo: string | null | undefined): Promise<string> {
  const area = String(areaCosteo ?? '').trim();
  if (!area) return TIPO_POR_DEFECTO;
  const db = await getAdelanteDb();
  const r = await db.request()
    .input('area', sql.VarChar(50), area)
    .query<{ tipo_obra: string }>(
      'SELECT tipo_obra FROM pro_obc.tipo_obra_area_costeo WHERE area_costeo = @area',
    );
  return r.recordset[0]?.tipo_obra ?? TIPO_POR_DEFECTO;
}

/** Mapa completo área de costeo → tipo de obra (para clasificar varias obras de una). */
export async function mapaAreaCosteoTipo(): Promise<Map<string, string>> {
  const db = await getAdelanteDb();
  const r = await db.request().query<{ area_costeo: string; tipo_obra: string }>(
    'SELECT area_costeo, tipo_obra FROM pro_obc.tipo_obra_area_costeo',
  );
  return new Map(r.recordset.map((f) => [f.area_costeo.trim().toUpperCase(), f.tipo_obra]));
}

/**
 * Cuelga cada partida ("Posting" de BC) del capítulo ("Total") cuyo código es su
 * prefijo más largo: FG-01 → FG, G1.1 → G1, SPL-01 → SPL (no SP). Devuelve null
 * cuando BC no tiene capítulo para esa partida — pasa seguido en administrativas
 * (SSCC, HER, MAQ…), donde el presupuesto es plano.
 */
const SEPARADORES = ['.', '-', ' ', '/', '_'];
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
