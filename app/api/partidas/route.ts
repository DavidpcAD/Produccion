import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getTipoObra, listarTiposObra } from '@/lib/partidas/tipos-obra';

export const dynamic = 'force-dynamic';

// Catálogo ÚNICO de partidas y subpartidas = el núcleo de ObrasControl
// (dbo.Etapa → partidas → sub_partidas + sub_partida_tipos), el
// mismo que usa Avance. Antes esta pantalla leía dbo.Etapa/Partida/SubPartida
// (catálogo duplicado); se unificó a pro_obc — mismos IDs, sin migrar datos.
// Se exponen con alias a la forma que ya espera el frontend (idEtapa/idPartida/
// idSubPartida/numSprint/esCritica) y se agregan tiposCasa[] y activo.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // El catálogo está partido por TIPO DE OBRA (dbo.TipoObra): VIVIENDA
  // (construcción), VIVIENDA_GEN, INFRA, ADMIN, FABRICA, TORRES y POSTVENTA.
  // Sin `tipo` se devuelve VIVIENDA para no
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

  const filtroObra = obra ? 'AND (g.bcWorksNo IS NULL OR g.bcWorksNo = @obra)' : '';
  const conObra = <T extends sql.Request>(r: T): T => {
    if (obra) r.input('obra', sql.VarChar(20), obra);
    return r;
  };

  const db = await getDb();
  const [etapas, partidas, subpartidas, obras] = await Promise.all([
    conObra(db.request().input('tipo', sql.VarChar(20), tipo.codigo)).query(`
      SELECT g.id AS idEtapa, g.codigo, g.nombre, g.tipoObra,
             g.orden, g.bcTaskNo, g.bcWorksNo
      FROM dbo.Etapa g
      WHERE g.tipoObra = @tipo AND g.activo = 1 ${filtroObra}
      ORDER BY g.bcWorksNo, g.orden, g.codigo
    `),
    conObra(db.request().input('tipo', sql.VarChar(20), tipo.codigo)).query(`
      SELECT p.idPartida, p.codigo, p.nombre, p.idEtapa, p.esActivo AS activo,
             p.orden, p.bcTaskNo
      FROM dbo.Partida p
      JOIN dbo.Etapa g ON g.id = p.idEtapa
      WHERE g.tipoObra = @tipo AND g.activo = 1 AND p.esActivo = 1 ${filtroObra}
      ORDER BY p.orden, p.codigo
    `),
    conObra(db.request().input('tipo', sql.VarChar(20), tipo.codigo)).query(`
      SELECT
        sp.idSubPartida, sp.codigo, sp.nombre, sp.idPartida,
        sp.numSprint, sp.esCritica, sp.descripcion,
        sp.esActivo AS activo,
        STUFF((
          SELECT ',' + t.tipoCasa
          FROM dbo.SubPartidaTipoCasa t
          WHERE t.idSubPartida = sp.idSubPartida
          ORDER BY t.tipoCasa
          FOR XML PATH('')
        ), 1, 1, '') AS tiposCasaStr
      FROM dbo.SubPartida sp
      JOIN dbo.Partida p ON p.idPartida = sp.idPartida
      JOIN dbo.Etapa g ON g.id = p.idEtapa
      WHERE g.tipoObra = @tipo AND g.activo = 1 ${filtroObra}
      ORDER BY sp.codigo
    `),
    // Obras de BC que tienen estructura propia en este tipo (para el filtro de la
    // pantalla). En vivienda/infra viene vacío: ahí el catálogo es compartido.
    db.request().input('tipo', sql.VarChar(20), tipo.codigo).query(`
      SELECT g.bcWorksNo AS worksNo, COUNT(*) AS grupos
      FROM dbo.Etapa g
      WHERE g.tipoObra = @tipo AND g.activo = 1 AND g.bcWorksNo IS NOT NULL
      GROUP BY g.bcWorksNo
      ORDER BY g.bcWorksNo
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

  const db = await getDb();
  try {
    const e = await db.request()
      .input('idE', sql.Int, idEtapa)
      .query('SELECT id, tipoObra AS tipo_obra, bcWorksNo AS bc_works_no FROM dbo.Etapa WHERE id = @idE');
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
      .query('SELECT 1 AS ok FROM dbo.Partida WHERE codigo = @cod AND idEtapa = @idE');
    if (dup.recordset.length > 0) {
      return NextResponse.json({ error: `Ya existe una partida con el código "${codigo}" en esta etapa` }, { status: 409 });
    }

    const ins = await db.request()
      .input('codigo', sql.VarChar(50), codigo)
      .input('nombre', sql.NVarChar(150), nombre)
      .input('idEtapa', sql.Int, idEtapa)
      .input('bcTaskNo', sql.VarChar(50), bcTaskNo)
      .query(`
        INSERT INTO dbo.Partida (codigo, nombre, idEtapa, orden, esActivo, bcTaskNo, esPosting)
        OUTPUT INSERTED.idPartida AS idPartida
        VALUES (
          @codigo, @nombre, @idEtapa,
          (SELECT ISNULL(MAX(orden), 0) + 1 FROM dbo.Partida WHERE idEtapa = @idEtapa),
          1, @bcTaskNo,
          -- esPosting es lo que filtran las vistas de Boletas: solo las casas (catálogo
          -- compartido de vivienda construcción).
          (SELECT CASE WHEN e.tipoObra = 'VIVIENDA' AND e.bcWorksNo IS NULL THEN 1 ELSE 0 END FROM dbo.Etapa e WHERE e.id = @idEtapa)
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
