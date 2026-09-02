import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getTipoObra, listarTiposObra } from '@/lib/partidas/tipos-obra';

export const dynamic = 'force-dynamic';

// Catálogo ÚNICO de partidas y subpartidas = el núcleo de ObrasControl
// (pro_obc.grupos_partida → partidas → sub_partidas + sub_partida_tipos), el
// mismo que usa Avance. Antes esta pantalla leía dbo.Etapa/Partida/SubPartida
// (catálogo duplicado); se unificó a pro_obc — mismos IDs, sin migrar datos.
// Se exponen con alias a la forma que ya espera el frontend (idEtapa/idPartida/
// idSubPartida/numSprint/esCritica) y se agregan tiposCasa[] y activo.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // El catálogo está partido por TIPO DE OBRA (pro_obc.tipos_obra): VIVIENDA,
  // INFRA, ADMIN, FABRICA y TORRES. Sin `tipo` se devuelve VIVIENDA para no
  // cambiarle nada a quien ya consumía este endpoint.
  const url = new URL(req.url);
  const tipoParam = (url.searchParams.get('tipo') ?? 'VIVIENDA').toUpperCase();
  // Solo para los tipos con catálogo POR OBRA (admin / fábrica): deja los grupos
  // de esa obra de BC más los compartidos (bc_works_no NULL).
  const obra = (url.searchParams.get('obra') ?? '').trim();

  const tipo = await getTipoObra(tipoParam);
  if (!tipo) {
    const validos = (await listarTiposObra()).map((t) => t.codigo).join(', ');
    return NextResponse.json(
      { error: `Tipo de obra desconocido "${tipoParam}". Válidos: ${validos}` },
      { status: 400 },
    );
  }

  const filtroObra = obra ? 'AND (g.bc_works_no IS NULL OR g.bc_works_no = @obra)' : '';
  const conObra = <T extends sql.Request>(r: T): T => {
    if (obra) r.input('obra', sql.VarChar(20), obra);
    return r;
  };

  const db = await getAdelanteDb();
  const [etapas, partidas, subpartidas, obras] = await Promise.all([
    conObra(db.request().input('tipo', sql.VarChar(20), tipo.codigo)).query(`
      SELECT g.id AS idEtapa, g.codigo, g.nombre, g.tipo_obra AS tipoObra,
             g.orden, g.bc_task_no AS bcTaskNo, g.bc_works_no AS bcWorksNo
      FROM pro_obc.grupos_partida g
      WHERE g.tipo_obra = @tipo AND g.activo = 1 ${filtroObra}
      ORDER BY g.bc_works_no, g.orden, g.codigo
    `),
    conObra(db.request().input('tipo', sql.VarChar(20), tipo.codigo)).query(`
      SELECT p.id AS idPartida, p.codigo, p.nombre, p.grupo_id AS idEtapa, p.activo,
             p.orden, p.bc_task_no AS bcTaskNo
      FROM pro_obc.partidas p
      JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
      WHERE g.tipo_obra = @tipo AND g.activo = 1 AND p.activo = 1 ${filtroObra}
      ORDER BY p.orden, p.codigo
    `),
    conObra(db.request().input('tipo', sql.VarChar(20), tipo.codigo)).query(`
      SELECT
        sp.id AS idSubPartida, sp.codigo, sp.nombre, sp.partida_id AS idPartida,
        sp.sprint_numero AS numSprint, sp.es_critica AS esCritica, sp.descripcion,
        sp.activo,
        STUFF((
          SELECT ',' + t.tipo_casa
          FROM pro_obc.sub_partida_tipos t
          WHERE t.sub_partida_id = sp.id
          ORDER BY t.tipo_casa
          FOR XML PATH('')
        ), 1, 1, '') AS tiposCasaStr
      FROM pro_obc.sub_partidas sp
      JOIN pro_obc.partidas p ON p.id = sp.partida_id
      JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
      WHERE g.tipo_obra = @tipo AND g.activo = 1 ${filtroObra}
      ORDER BY sp.codigo
    `),
    // Obras de BC que tienen estructura propia en este tipo (para el filtro de la
    // pantalla). En vivienda/infra viene vacío: ahí el catálogo es compartido.
    db.request().input('tipo', sql.VarChar(20), tipo.codigo).query(`
      SELECT g.bc_works_no AS worksNo, COUNT(*) AS grupos
      FROM pro_obc.grupos_partida g
      WHERE g.tipo_obra = @tipo AND g.activo = 1 AND g.bc_works_no IS NOT NULL
      GROUP BY g.bc_works_no
      ORDER BY g.bc_works_no
    `),
  ]);

  return NextResponse.json({
    tipo,
    etapas: etapas.recordset,
    partidas: partidas.recordset,
    subpartidas: subpartidas.recordset.map((r: Record<string, unknown>) => ({
      idSubPartida: r.idSubPartida,
      codigo: r.codigo,
      nombre: r.nombre,
      idPartida: r.idPartida,
      numSprint: r.numSprint,
      esCritica: r.esCritica,
      descripcion: r.descripcion,
      activo: r.activo,
      tiposCasa: String(r.tiposCasaStr ?? '').split(',').filter(Boolean),
    })),
    obras: obras.recordset,
  });
}

// Crear una partida dentro de una etapa/grupo. Solo Super Admin (nivel 4).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const body = await req.json().catch(() => ({}));

  const idEtapa = Number(body.idEtapa) || 0;
  const codigo = String(body.codigo ?? '').trim();
  const nombre = String(body.nombre ?? '').trim();
  // Código de la partida ("Posting") en BC. Por defecto el mismo código: en
  // vivienda e infra siempre coinciden (1.1, 3.4…) y en admin/fábrica el código
  // viene justamente de BC.
  const bcTaskNo = String(body.bcTaskNo ?? codigo).trim() || null;

  if (!idEtapa) return NextResponse.json({ error: 'Elegí la etapa a la que pertenece' }, { status: 400 });
  if (!codigo) return NextResponse.json({ error: 'El código es requerido' }, { status: 400 });
  if (!nombre) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
  if (codigo.length > 50) return NextResponse.json({ error: 'El código no puede superar 50 caracteres' }, { status: 400 });
  if (nombre.length > 150) return NextResponse.json({ error: 'El nombre no puede superar 150 caracteres' }, { status: 400 });

  const db = await getAdelanteDb();
  try {
    const e = await db.request()
      .input('idE', sql.Int, idEtapa)
      .query('SELECT id, tipo_obra, bc_works_no FROM pro_obc.grupos_partida WHERE id = @idE');
    if (e.recordset.length === 0) {
      return NextResponse.json({ error: 'La etapa no existe' }, { status: 400 });
    }

    // Los códigos son únicos DENTRO DEL GRUPO (índice UX_partidas_grupo_codigo).
    // No pueden ser únicos por tipo de obra: infra repite a propósito los códigos
    // de vivienda, y en administrativas/fábricas cada obra de BC trae los suyos
    // (G1.1 existe en siete casas, una por obra).
    const dup = await db.request()
      .input('cod', sql.VarChar(50), codigo)
      .input('idE', sql.Int, idEtapa)
      .query('SELECT 1 AS ok FROM pro_obc.partidas WHERE codigo = @cod AND grupo_id = @idE');
    if (dup.recordset.length > 0) {
      return NextResponse.json({ error: `Ya existe una partida con el código "${codigo}" en esta etapa` }, { status: 409 });
    }

    const ins = await db.request()
      .input('codigo', sql.VarChar(50), codigo)
      .input('nombre', sql.NVarChar(150), nombre)
      .input('idEtapa', sql.Int, idEtapa)
      .input('bcTaskNo', sql.VarChar(50), bcTaskNo)
      .query(`
        INSERT INTO pro_obc.partidas (codigo, nombre, grupo_id, orden, activo, bc_task_no)
        OUTPUT INSERTED.id AS idPartida
        VALUES (
          @codigo, @nombre, @idEtapa,
          (SELECT ISNULL(MAX(orden), 0) + 1 FROM pro_obc.partidas WHERE grupo_id = @idEtapa),
          1, @bcTaskNo
        )
      `);
    const idPartida = ins.recordset[0].idPartida;

    await logAudit({
      idColAccion: session.idCol,
      accion: 'CREAR_PARTIDA',
      entidad: 'Partida',
      idEntidad: idPartida,
      detalleNuevo: { codigo, nombre, idEtapa, bcTaskNo, tipoObra: e.recordset[0].tipo_obra },
      ip,
    });

    return NextResponse.json({ idPartida }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/partidas POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
