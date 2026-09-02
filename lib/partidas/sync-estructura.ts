import 'server-only';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getDb, sql as sqlApp } from '@/lib/db';
import { capituloDePartida, mapaAreaCosteoTipo, TIPO_POR_DEFECTO, type TipoObra } from './tipos-obra';

/**
 * Meter en el catálogo (`pro_obc.grupos_partida` → `partidas`) una estructura de
 * dos niveles que viene de afuera: capítulos ("Total") y partidas ("Posting") de
 * una obra. Lo usan los dos caminos que existen:
 *
 *   · /api/partidas/sync-bc         — la estructura la trae Business Central.
 *   · /api/presupuesto/catalogo     — la trae el Excel de presupuesto que se está
 *                                     cargando (crea lo que falte antes de subir).
 *
 * Reglas (las mismas en los dos casos):
 *   · Cada partida cuelga del capítulo cuyo código es su prefijo más largo
 *     (FG-01→FG, G1.1→G1). Las que no tienen capítulo cuelgan de un grupo con el
 *     código de la obra — pasa en administrativas, donde el presupuesto es plano.
 *   · Los capítulos sin ninguna partida NO se crean.
 *   · Es ADITIVO: crea lo que falta, refresca el nombre de las partidas que ya
 *     están y nunca borra ni mueve nada. Las subpartidas no se tocan: ese nivel
 *     no existe afuera, es solo de esta base.
 *   · Vivienda e infra escriben en el catálogo COMPARTIDO (bc_works_no NULL);
 *     administrativas y fábricas, en la estructura de ESA obra.
 */

export interface LineaEstructura {
  taskNo: string;
  /** 'Total' = capítulo · cualquier otra cosa se trata como partida ('Posting'). */
  taskType: string;
  description: string;
}

export interface ResultadoEstructura {
  obra: string;
  gruposCreados: string[];
  gruposActualizados: number;
  partidasCreadas: string[];
  partidasActualizadas: number;
  /** Capítulos que venían sin ninguna partida: no se crean. */
  capitulosSinPartidas: string[];
}

/** Nombre lindo de la obra, para el grupo "general" (el de las partidas sin capítulo). */
export async function nombreObra(obra: string): Promise<string> {
  try {
    const app = await getDb();
    const r = await app.request()
      .input('no', sqlApp.NVarChar(50), obra)
      .query<{ nombreMostrado: string | null; descripcion: string | null }>(
        'SELECT TOP 1 nombreMostrado, descripcion FROM dbo.Obra WHERE numeroObra = @no',
      );
    const f = r.recordset[0];
    const nombre = (f?.descripcion || f?.nombreMostrado || '').trim();
    return nombre && nombre !== obra ? nombre : obra;
  } catch {
    return obra;
  }
}

/** Obras de BC que pertenecen a un tipo, según el área de costeo de dbo.Obra. */
export async function obrasDelTipo(tipo: string): Promise<string[]> {
  const [app, mapa] = await Promise.all([getDb(), mapaAreaCosteoTipo()]);
  const r = await app.request().query<{ numeroObra: string; areaCosteo: string | null }>(
    'SELECT numeroObra, areaCosteo FROM dbo.Obra ORDER BY numeroObra',
  );
  return r.recordset
    .filter((o) => (mapa.get(String(o.areaCosteo ?? '').trim().toUpperCase()) ?? TIPO_POR_DEFECTO) === tipo)
    .map((o) => String(o.numeroObra).trim())
    .filter(Boolean);
}

/** Área de costeo de una obra en dbo.Obra. null si la obra no está. */
export async function areaCosteoDeObra(obra: string): Promise<string | null> {
  const app = await getDb();
  const r = await app.request()
    .input('no', sqlApp.NVarChar(50), obra)
    .query<{ areaCosteo: string | null }>('SELECT TOP 1 areaCosteo FROM dbo.Obra WHERE numeroObra = @no');
  if (r.recordset.length === 0) return null;
  return String(r.recordset[0].areaCosteo ?? '').trim();
}

/** Capítulos y partidas del catálogo que aplican a una obra. */
export async function catalogoDeObra(tipo: TipoObra, obra: string): Promise<{
  grupos: { id: number; codigo: string; nombre: string; bcTaskNo: string | null }[];
  partidas: { id: number; codigo: string; nombre: string; idGrupo: number; grupoCodigo: string; grupoNombre: string }[];
}> {
  const scope = tipo.catalogoCompartido ? null : obra;
  const db = await getAdelanteDb();
  const [g, p] = await Promise.all([
    db.request()
      .input('tipo', sql.VarChar(20), tipo.codigo)
      .input('obra', sql.VarChar(20), scope)
      .query<{ id: number; codigo: string; nombre: string; bc_task_no: string | null }>(`
        SELECT id, codigo, nombre, bc_task_no
        FROM pro_obc.grupos_partida
        WHERE tipo_obra = @tipo AND activo = 1 AND ISNULL(bc_works_no, '') = ISNULL(@obra, '')
      `),
    db.request()
      .input('tipo', sql.VarChar(20), tipo.codigo)
      .input('obra', sql.VarChar(20), scope)
      .query<{ id: number; codigo: string; nombre: string; grupo_id: number; grupo_codigo: string; grupo_nombre: string }>(`
        SELECT p.id, p.codigo, p.nombre, p.grupo_id, g.codigo AS grupo_codigo, g.nombre AS grupo_nombre
        FROM pro_obc.partidas p
        JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
        WHERE g.tipo_obra = @tipo AND g.activo = 1 AND p.activo = 1
          AND ISNULL(g.bc_works_no, '') = ISNULL(@obra, '')
      `),
  ]);
  return {
    grupos: g.recordset.map((r) => ({ id: r.id, codigo: r.codigo, nombre: r.nombre, bcTaskNo: r.bc_task_no })),
    partidas: p.recordset.map((r) => ({
      id: r.id, codigo: r.codigo, nombre: r.nombre, idGrupo: r.grupo_id,
      grupoCodigo: r.grupo_codigo, grupoNombre: r.grupo_nombre,
    })),
  };
}

/** Arma la jerarquía capítulo → partidas a partir de las líneas crudas. */
export function armarJerarquia(lineas: LineaEstructura[]): {
  capitulos: Map<string, string>;
  hijos: Map<string, [string, string][]>;
  sueltas: [string, string][];
} {
  const capitulos = new Map<string, string>();
  const postings = new Map<string, string>();
  for (const l of lineas) {
    const cod = String(l.taskNo ?? '').trim();
    if (!cod || cod.length > 50) continue;
    const bag = l.taskType === 'Total' ? capitulos : postings;
    if (!bag.has(cod)) bag.set(cod, (String(l.description ?? '').trim() || cod).slice(0, 150));
  }
  const hijos = new Map<string, [string, string][]>();
  const sueltas: [string, string][] = [];
  for (const [cod, nombre] of [...postings.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { numeric: true }))) {
    const cap = capituloDePartida(cod, capitulos.keys());
    if (cap) {
      if (!hijos.has(cap)) hijos.set(cap, []);
      hijos.get(cap)!.push([cod, nombre]);
    } else sueltas.push([cod, nombre]);
  }
  return { capitulos, hijos, sueltas };
}

/**
 * Mete la estructura en el catálogo. Con `dryRun` no escribe nada: solo devuelve
 * qué crearía (lo que usa el botón "Ver qué traería" y el aviso de la pantalla de
 * presupuesto).
 */
export async function sincronizarEstructura(
  tipo: TipoObra,
  obra: string,
  lineas: LineaEstructura[],
  dryRun = false,
): Promise<ResultadoEstructura> {
  const res: ResultadoEstructura = {
    obra, gruposCreados: [], gruposActualizados: 0,
    partidasCreadas: [], partidasActualizadas: 0, capitulosSinPartidas: [],
  };
  if (lineas.length === 0) return res;

  const { capitulos, hijos, sueltas } = armarJerarquia(lineas);
  res.capitulosSinPartidas = [...capitulos.keys()].filter((c) => !hijos.has(c));

  const scope = tipo.catalogoCompartido ? null : obra;
  const db = await getAdelanteDb();

  // Busca el grupo por su puente a BC y, si no, por código: en vivienda los grupos
  // se llaman `gris`/`acabados` y su capítulo es "1"/"2", así que buscar solo por
  // código crearía duplicados. Devuelve null cuando no existe y es dryRun.
  async function grupoId(codigo: string, nombre: string, bcTaskNo: string | null): Promise<number | null> {
    const q = await db.request()
      .input('tipo', sql.VarChar(20), tipo.codigo)
      .input('obra', sql.VarChar(20), scope)
      .input('cod', sql.VarChar(50), codigo)
      .input('task', sql.VarChar(50), bcTaskNo)
      .query<{ id: number }>(`
        SELECT TOP 1 id FROM pro_obc.grupos_partida
        WHERE tipo_obra = @tipo AND ISNULL(bc_works_no, '') = ISNULL(@obra, '')
          AND (codigo = @cod OR (@task IS NOT NULL AND bc_task_no = @task))
        ORDER BY CASE WHEN codigo = @cod THEN 0 ELSE 1 END
      `);
    if (q.recordset[0]) {
      const id = q.recordset[0].id;
      res.gruposActualizados++;
      if (dryRun) return id;
      // Se rellena el puente a BC si faltaba, sin tocar el nombre que ya le puso el
      // negocio (en vivienda son nombres propios, no los de BC).
      await db.request()
        .input('id', sql.Int, id)
        .input('task', sql.VarChar(50), bcTaskNo)
        .query('UPDATE pro_obc.grupos_partida SET bc_task_no = ISNULL(bc_task_no, @task) WHERE id = @id');
      return id;
    }
    res.gruposCreados.push(`${codigo} — ${nombre}`);
    if (dryRun) return null;
    const ins = await db.request()
      .input('cod', sql.VarChar(50), codigo)
      .input('nombre', sql.NVarChar(150), nombre)
      .input('tipo', sql.VarChar(20), tipo.codigo)
      .input('obra', sql.VarChar(20), scope)
      .input('task', sql.VarChar(50), bcTaskNo)
      .query<{ id: number }>(`
        INSERT INTO pro_obc.grupos_partida (codigo, nombre, tipo_obra, orden, activo, creado_en, bc_works_no, bc_task_no)
        OUTPUT INSERTED.id AS id
        VALUES (@cod, @nombre, @tipo,
          (SELECT ISNULL(MAX(orden), 0) + 1 FROM pro_obc.grupos_partida
            WHERE tipo_obra = @tipo AND ISNULL(bc_works_no, '') = ISNULL(@obra, '')),
          1, SYSUTCDATETIME(), @obra, @task)
      `);
    return ins.recordset[0].id;
  }

  // La partida se busca en TODO el catálogo del tipo (y de la obra, en admin y
  // fábrica), no solo dentro del capítulo calculado: el acomodo que hizo el negocio
  // manda. Ej: "1.6 Liviano" cuelga del capítulo 1 por su número, pero en el
  // catálogo está en Acabados — buscando solo dentro del grupo, cada corrida
  // crearía un 1.6 duplicado en Obra Gris.
  async function upsertPartida(idGrupo: number | null, codigo: string, nombre: string) {
    const q = await db.request()
      .input('tipo', sql.VarChar(20), tipo.codigo)
      .input('obra', sql.VarChar(20), scope)
      .input('cod', sql.VarChar(50), codigo)
      .query<{ id: number }>(`
        SELECT p.id FROM pro_obc.partidas p
        JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
        WHERE g.tipo_obra = @tipo AND ISNULL(g.bc_works_no, '') = ISNULL(@obra, '')
          AND p.codigo = @cod
      `);
    if (q.recordset[0]) {
      res.partidasActualizadas++;
      if (dryRun) return;
      await db.request()
        .input('id', sql.Int, q.recordset[0].id)
        .input('nombre', sql.NVarChar(150), nombre)
        .input('cod', sql.VarChar(50), codigo)
        .query(`UPDATE pro_obc.partidas
                SET nombre = @nombre, bc_task_no = ISNULL(bc_task_no, @cod), activo = 1
                WHERE id = @id`);
      return;
    }
    res.partidasCreadas.push(`${codigo} — ${nombre}`);
    // Grupo que todavía no existe (dryRun): no hay dónde insertar, ya quedó contada.
    if (dryRun || idGrupo === null) return;
    await db.request()
      .input('cod', sql.VarChar(50), codigo)
      .input('nombre', sql.NVarChar(150), nombre)
      .input('g', sql.Int, idGrupo)
      .query(`
        INSERT INTO pro_obc.partidas (codigo, nombre, grupo_id, orden, activo, bc_task_no, creado_en)
        VALUES (@cod, @nombre, @g,
          (SELECT ISNULL(MAX(orden), 0) + 1 FROM pro_obc.partidas WHERE grupo_id = @g),
          1, @cod, SYSUTCDATETIME())
      `);
  }

  if (sueltas.length > 0) {
    const id = await grupoId(obra.slice(0, 50), await nombreObra(obra), null);
    for (const [cod, nombre] of sueltas) await upsertPartida(id, cod, nombre);
  }
  for (const [cap, hs] of [...hijos.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { numeric: true }))) {
    const id = await grupoId(cap, capitulos.get(cap) ?? cap, cap);
    for (const [cod, nombre] of hs) await upsertPartida(id, cod, nombre);
  }
  return res;
}
