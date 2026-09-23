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
 *     no existe afuera, es solo de esta base. La ÚNICA excepción son los tipos
 *     con `subpartidaEspejo` (postventa), donde la subpartida ES la partida: ahí
 *     se crea la espejo `<partida>.1` para la partida que no tenga ninguna.
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
  /** Solo en tipos con subpartida espejo (postventa): las `<partida>.1` creadas. */
  subpartidasCreadas: string[];
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

/**
 * Obras del app que pertenecen a un tipo. Manda `dbo.Obra.tipoObra` (lo que
 * eligió la gente al crear/editar la obra) y, si está vacío, se deduce del área
 * de costeo de BC.
 */
export async function obrasDelTipo(tipo: string): Promise<string[]> {
  const [app, mapa] = await Promise.all([getDb(), mapaAreaCosteoTipo()]);
  const r = await app.request().query<{ numeroObra: string; areaCosteo: string | null; tipoObra: string | null }>(
    'SELECT numeroObra, areaCosteo, tipoObra FROM dbo.Obra ORDER BY numeroObra',
  );
  return r.recordset
    .filter((o) => {
      const explicito = String(o.tipoObra ?? '').trim().toUpperCase();
      const efectivo = explicito || (mapa.get(String(o.areaCosteo ?? '').trim().toUpperCase()) ?? TIPO_POR_DEFECTO);
      return efectivo === tipo;
    })
    .map((o) => String(o.numeroObra).trim())
    .filter(Boolean);
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

/**
 * Arma la jerarquía capítulo → partidas a partir de las líneas crudas.
 *
 * `porOrden` agrega el respaldo de los tipos cuya jerarquía en BC es el orden de
 * las líneas (postventa): la partida que no calza con ningún capítulo por código
 * cuelga del último capítulo que venía ARRIBA de ella, que es como se ve la obra
 * en la pantalla de BC. Sin eso, PV-MAT "MATERIALES GENERALES" quedaría suelta en
 * vez de colgar de PV-GEN "GENERALES POST VENTA".
 */
export function armarJerarquia(lineas: LineaEstructura[], porOrden = false): {
  capitulos: Map<string, string>;
  hijos: Map<string, [string, string][]>;
  sueltas: [string, string][];
} {
  const capitulos = new Map<string, string>();
  const postings = new Map<string, string>();
  // Capítulo que venía arriba de cada partida, en el orden en que las dio BC.
  const capituloArriba = new Map<string, string>();
  let ultimoCapitulo: string | null = null;
  for (const l of lineas) {
    const cod = String(l.taskNo ?? '').trim();
    if (!cod || cod.length > 50) continue;
    const nombre = (String(l.description ?? '').trim() || cod).slice(0, 150);
    if (l.taskType === 'Total') {
      if (!capitulos.has(cod)) capitulos.set(cod, nombre);
      ultimoCapitulo = cod;
      continue;
    }
    if (!postings.has(cod)) {
      postings.set(cod, nombre);
      if (ultimoCapitulo) capituloArriba.set(cod, ultimoCapitulo);
    }
  }
  const hijos = new Map<string, [string, string][]>();
  const sueltas: [string, string][] = [];
  for (const [cod, nombre] of [...postings.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { numeric: true }))) {
    const cap = capituloDePartida(cod, capitulos.keys())
      ?? (porOrden ? capituloArriba.get(cod) ?? null : null);
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
    partidasCreadas: [], partidasActualizadas: 0, subpartidasCreadas: [],
    capitulosSinPartidas: [],
  };
  if (lineas.length === 0) return res;

  const { capitulos, hijos, sueltas } = armarJerarquia(lineas, tipo.jerarquiaPorOrden);
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
      const id = q.recordset[0].id;
      res.partidasActualizadas++;
      if (!dryRun) {
        await db.request()
          .input('id', sql.Int, id)
          .input('nombre', sql.NVarChar(150), nombre)
          .input('cod', sql.VarChar(50), codigo)
          .query(`UPDATE pro_obc.partidas
                  SET nombre = @nombre, bc_task_no = ISNULL(bc_task_no, @cod), activo = 1
                  WHERE id = @id`);
      }
      await espejoDeLaPartida(id, codigo, nombre);
      return;
    }
    res.partidasCreadas.push(`${codigo} — ${nombre}`);
    // Grupo que todavía no existe (dryRun): no hay dónde insertar, ya quedó contada.
    if (dryRun || idGrupo === null) {
      await espejoDeLaPartida(null, codigo, nombre);
      return;
    }
    const ins = await db.request()
      .input('cod', sql.VarChar(50), codigo)
      .input('nombre', sql.NVarChar(150), nombre)
      .input('g', sql.Int, idGrupo)
      .query<{ id: number }>(`
        INSERT INTO pro_obc.partidas (codigo, nombre, grupo_id, orden, activo, bc_task_no, creado_en)
        OUTPUT INSERTED.id AS id
        VALUES (@cod, @nombre, @g,
          (SELECT ISNULL(MAX(orden), 0) + 1 FROM pro_obc.partidas WHERE grupo_id = @g),
          1, @cod, SYSUTCDATETIME())
      `);
    await espejoDeLaPartida(ins.recordset[0].id, codigo, nombre);
  }

  // LA SUBPARTIDA ES LA PARTIDA (postventa): cada casa es una sola cosa, no tiene
  // desglose abajo. Se crea la espejo `<partida>.1` con el mismo nombre y SOLO si
  // la partida no tiene ninguna subpartida — el desglose que haya hecho el negocio
  // manda. Mismo criterio que migrations/2026-09-17_subpartida_espejo_toda_partida.
  // `idPartida` null = la partida tampoco existe todavía (dryRun).
  async function espejoDeLaPartida(idPartida: number | null, codigo: string, nombre: string) {
    if (!tipo.subpartidaEspejo) return;
    const cod = `${codigo}.1`.slice(0, 50);
    if (idPartida !== null) {
      const ya = await db.request()
        .input('p', sql.Int, idPartida)
        .query<{ id: number }>('SELECT TOP 1 id FROM pro_obc.sub_partidas WHERE partida_id = @p');
      if (ya.recordset[0]) return;
    }
    res.subpartidasCreadas.push(`${cod} — ${nombre}`);
    if (dryRun || idPartida === null) return;
    await db.request()
      .input('cod', sql.VarChar(50), cod)
      .input('nombre', sql.NVarChar(300), nombre)
      .input('p', sql.Int, idPartida)
      .query(`
        INSERT INTO pro_obc.sub_partidas (codigo, nombre, partida_id, sprint_numero, es_critica, activo, creado_en)
        VALUES (@cod, @nombre, @p, NULL, 0, 1, SYSUTCDATETIME())
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
