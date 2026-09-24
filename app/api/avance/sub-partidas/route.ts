import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import {
  TIPOS_CASA,
  type PartidaConGrupo,
  type SubPartidaListado,
  type TipoCasa,
} from '@/lib/avance/sub-partidas';

export const dynamic = 'force-dynamic';

/**
 * Sub-partidas (catálogo editable, núcleo de ObrasControl).
 * Portado de obrascontrol `sub-partidas.ts`.
 *   GET  /api/avance/sub-partidas → listado (+ catálogo de partidas para el select)
 *   POST /api/avance/sub-partidas → crear (sin pesos; se asignan luego en Pesos)
 *
 * Fuente: dbo.SubPartida + dbo.Partida + dbo.Etapa + dbo.SubPartidaTipoCasa
 */

const TIPOS_CASA_SET = new Set<string>(TIPOS_CASA);

// =============================================================================
// GET /api/avance/sub-partidas
// =============================================================================
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const partidaId = Number(searchParams.get('partida_id')) || 0;
    const sprint = Number(searchParams.get('sprint')) || 0;
    const tipoCasa = searchParams.get('tipo_casa');
    const activoRaw = searchParams.get('activo'); // 'true' | 'false' | null (ambas)
    const q = (searchParams.get('q') ?? '').trim();

    const db = await getDb();

    const listReq = db.request();
    // Avance es un módulo de vivienda (sprints + tipos de casa). El catálogo
    // también tiene partidas de INFRAESTRUCTURA (grupos_partida.tipo_obra), que
    // no llevan sprint: no tienen nada que hacer en esta pantalla.
    const where: string[] = ["g.tipoObra = 'VIVIENDA'"];
    if (partidaId > 0) {
      where.push('sp.idPartida = @partida_id');
      listReq.input('partida_id', sql.Int, partidaId);
    }
    if (sprint > 0) {
      where.push('sp.numSprint = @sprint');
      listReq.input('sprint', sql.SmallInt, sprint);
    }
    if (activoRaw === 'true' || activoRaw === 'false') {
      where.push('sp.esActivo = @activo');
      listReq.input('activo', sql.Bit, activoRaw === 'true');
    }
    if (q.length > 0) {
      where.push('(sp.codigo LIKE @q OR sp.nombre LIKE @q)');
      listReq.input('q', sql.NVarChar(102), `%${q}%`);
    }
    if (tipoCasa && TIPOS_CASA_SET.has(tipoCasa)) {
      where.push(`EXISTS (
        SELECT 1 FROM dbo.SubPartidaTipoCasa t
        WHERE t.idSubPartida = sp.idSubPartida AND t.tipoCasa = @tipo_casa
      )`);
      listReq.input('tipo_casa', sql.VarChar(20), tipoCasa);
    }

    const listRes = await listReq.query<
      Omit<SubPartidaListado, 'tipos_casa'> & { tipos_casa_str: string | null }
    >(`
      SELECT
        sp.idSubPartida AS id, sp.codigo, sp.nombre, sp.numSprint AS sprint_numero, sp.esCritica AS es_critica, sp.esActivo AS activo,
        p.idPartida AS partida_id, p.codigo AS partida_codigo, p.nombre AS partida_nombre,
        g.id AS grupo_id, g.codigo AS grupo_codigo, g.nombre AS grupo_nombre,
        STUFF((
          SELECT ',' + t.tipoCasa
          FROM dbo.SubPartidaTipoCasa t
          WHERE t.idSubPartida = sp.idSubPartida
          ORDER BY t.tipoCasa
          FOR XML PATH('')
        ), 1, 1, '') AS tipos_casa_str
      FROM dbo.SubPartida sp
      JOIN dbo.Partida p       ON p.idPartida = sp.idPartida
      JOIN dbo.Etapa g ON g.id = p.idEtapa
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY sp.numSprint, p.codigo, sp.codigo
    `);

    const subPartidas: SubPartidaListado[] = listRes.recordset.map((r) => ({
      id: r.id,
      codigo: r.codigo,
      nombre: r.nombre,
      sprint_numero: r.sprint_numero,
      es_critica: r.es_critica,
      activo: r.activo,
      partida_id: r.partida_id,
      partida_codigo: r.partida_codigo,
      partida_nombre: r.partida_nombre,
      grupo_id: r.grupo_id,
      grupo_codigo: r.grupo_codigo,
      grupo_nombre: r.grupo_nombre,
      tipos_casa: (r.tipos_casa_str ?? '').split(',').filter(Boolean) as TipoCasa[],
    }));

    // Catálogo de partidas para el <select> de crear/editar (mismo endpoint,
    // así la pantalla carga con un solo fetch).
    const partidasRes = await db.request().query<PartidaConGrupo>(`
      SELECT p.idPartida AS id, p.codigo, p.nombre, p.orden, p.esActivo AS activo,
             g.id AS grupo_id, g.codigo AS grupo_codigo, g.nombre AS grupo_nombre
      FROM dbo.Partida p
      JOIN dbo.Etapa g ON g.id = p.idEtapa
      WHERE p.esActivo = 1 AND g.tipoObra = 'VIVIENDA'
      ORDER BY p.orden, p.codigo
    `);

    return NextResponse.json({ subPartidas, partidas: partidasRes.recordset });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}

// =============================================================================
// POST /api/avance/sub-partidas  (crear — sin pesos)
// =============================================================================
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));

    const codigo = String(body?.codigo ?? '').trim();
    const nombre = String(body?.nombre ?? '').trim();
    const partidaId = Number(body?.partida_id);
    const sprint = Number(body?.sprint_numero);
    const esCritica = Boolean(body?.es_critica);
    const activo = body?.activo === undefined ? true : Boolean(body.activo);
    const descripcion =
      body?.descripcion != null ? String(body.descripcion).slice(0, 4000) : null;
    const tiposCasa: TipoCasa[] = Array.isArray(body?.tipos_casa)
      ? (body.tipos_casa.filter((t: unknown) => TIPOS_CASA_SET.has(String(t))) as TipoCasa[])
      : [];

    if (codigo.length < 1 || codigo.length > 50) {
      return NextResponse.json({ error: 'Código inválido' }, { status: 400 });
    }
    if (nombre.length < 1 || nombre.length > 150) {
      return NextResponse.json({ error: 'Nombre inválido' }, { status: 400 });
    }
    if (!Number.isInteger(partidaId) || partidaId <= 0) {
      return NextResponse.json({ error: 'Partida inválida' }, { status: 400 });
    }
    if (!Number.isInteger(sprint) || sprint < 1 || sprint > 50) {
      return NextResponse.json({ error: 'Sprint inválido (1–50)' }, { status: 400 });
    }
    if (tiposCasa.length === 0) {
      return NextResponse.json({ error: 'Elegí al menos un tipo de casa' }, { status: 400 });
    }

    const db = await getDb();

    // Código único (mensaje claro; la UNIQUE de la tabla es la red final).
    const dup = await db
      .request()
      .input('codigo', sql.VarChar(50), codigo)
      .query<{ id: number }>('SELECT idSubPartida AS id FROM dbo.SubPartida WHERE codigo = @codigo');
    if (dup.recordset.length > 0) {
      return NextResponse.json(
        { error: `Ya existe una sub-partida con el código ${codigo}` },
        { status: 409 },
      );
    }

    // La partida destino debe existir (FK).
    const partida = await db
      .request()
      .input('pid', sql.Int, partidaId)
      .query<{ id: number }>('SELECT idPartida AS id FROM dbo.Partida WHERE idPartida = @pid');
    if (partida.recordset.length === 0) {
      return NextResponse.json({ error: `La partida ${partidaId} no existe` }, { status: 400 });
    }

    const tx = new sql.Transaction(db);
    await tx.begin();
    let nuevoId: number;
    try {
      const ins = await new sql.Request(tx)
        .input('codigo', sql.VarChar(50), codigo)
        .input('nombre', sql.NVarChar(150), nombre)
        .input('partida_id', sql.Int, partidaId)
        .input('sprint_numero', sql.SmallInt, sprint)
        .input('es_critica', sql.Bit, esCritica)
        .input('descripcion', sql.NVarChar(4000), descripcion)
        .input('activo', sql.Bit, activo)
        .query<{ id: number }>(`
          INSERT INTO dbo.SubPartida
            (codigo, nombre, idPartida, numSprint, esCritica, descripcion, esActivo)
          OUTPUT INSERTED.idSubPartida AS id
          VALUES
            (@codigo, @nombre, @partida_id, @sprint_numero, @es_critica, @descripcion, @activo)
        `);
      nuevoId = ins.recordset[0]!.id;

      for (const tc of tiposCasa) {
        await new sql.Request(tx)
          .input('id', sql.Int, nuevoId)
          .input('tc', sql.VarChar(20), tc)
          .query(
            'INSERT INTO dbo.SubPartidaTipoCasa (idSubPartida, tipoCasa) VALUES (@id, @tc)',
          );
      }

      await tx.commit();
    } catch (e: unknown) {
      try {
        await tx.rollback();
      } catch {
        /* ignorar */
      }
      // Violación de UNIQUE del código (carrera entre el check y el insert).
      if (e && typeof e === 'object' && 'number' in e) {
        const n = (e as { number?: number }).number;
        if (n === 2601 || n === 2627) {
          return NextResponse.json(
            { error: `Ya existe una sub-partida con el código ${codigo}` },
            { status: 409 },
          );
        }
      }
      throw e;
    }

    return NextResponse.json({ ok: true, id: nuevoId }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
