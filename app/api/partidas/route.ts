import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

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

  // El catálogo está partido por TIPO DE OBRA (grupos_partida.tipo_obra):
  // 'VIVIENDA' (casas, el de siempre) e 'INFRA' (infraestructura). Sin `tipo` se
  // devuelve VIVIENDA para no cambiarle nada a quien ya consumía este endpoint.
  const tipo = (new URL(req.url).searchParams.get('tipo') ?? 'VIVIENDA').toUpperCase();

  const db = await getAdelanteDb();
  const [etapas, partidas, subpartidas] = await Promise.all([
    db.request().input('tipo', sql.VarChar(20), tipo).query(`
      SELECT id AS idEtapa, codigo, nombre, tipo_obra AS tipoObra
      FROM pro_obc.grupos_partida
      WHERE tipo_obra = @tipo
      ORDER BY orden, codigo
    `),
    db.request().input('tipo', sql.VarChar(20), tipo).query(`
      SELECT p.id AS idPartida, p.codigo, p.nombre, p.grupo_id AS idEtapa, p.activo
      FROM pro_obc.partidas p
      JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
      WHERE g.tipo_obra = @tipo AND p.activo = 1
      ORDER BY p.orden, p.codigo
    `),
    db.request().input('tipo', sql.VarChar(20), tipo).query(`
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
      WHERE g.tipo_obra = @tipo
      ORDER BY sp.codigo
    `),
  ]);

  return NextResponse.json({
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

  if (!idEtapa) return NextResponse.json({ error: 'Elegí la etapa a la que pertenece' }, { status: 400 });
  if (!codigo) return NextResponse.json({ error: 'El código es requerido' }, { status: 400 });
  if (!nombre) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
  if (codigo.length > 20) return NextResponse.json({ error: 'El código no puede superar 20 caracteres' }, { status: 400 });
  if (nombre.length > 100) return NextResponse.json({ error: 'El nombre no puede superar 100 caracteres' }, { status: 400 });

  const db = await getAdelanteDb();
  try {
    const e = await db.request()
      .input('idE', sql.Int, idEtapa)
      .query('SELECT id, tipo_obra FROM pro_obc.grupos_partida WHERE id = @idE');
    if (e.recordset.length === 0) {
      return NextResponse.json({ error: 'La etapa no existe' }, { status: 400 });
    }

    // Los códigos son únicos DENTRO del tipo de obra: infraestructura repite a
    // propósito los códigos de vivienda (1.1, 2.1, 3.1…), son catálogos aparte.
    const dup = await db.request()
      .input('cod', sql.VarChar(20), codigo)
      .input('tipo', sql.VarChar(20), e.recordset[0].tipo_obra)
      .query(`SELECT 1 AS ok FROM pro_obc.partidas p
              JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
              WHERE p.codigo = @cod AND g.tipo_obra = @tipo`);
    if (dup.recordset.length > 0) {
      return NextResponse.json({ error: `Ya existe una partida con el código "${codigo}"` }, { status: 409 });
    }

    const ins = await db.request()
      .input('codigo', sql.VarChar(20), codigo)
      .input('nombre', sql.NVarChar(100), nombre)
      .input('idEtapa', sql.Int, idEtapa)
      .query(`
        INSERT INTO pro_obc.partidas (codigo, nombre, grupo_id, activo)
        OUTPUT INSERTED.id AS idPartida
        VALUES (@codigo, @nombre, @idEtapa, 1)
      `);
    const idPartida = ins.recordset[0].idPartida;

    await logAudit({
      idColAccion: session.idCol,
      accion: 'CREAR_PARTIDA',
      entidad: 'Partida',
      idEntidad: idPartida,
      detalleNuevo: { codigo, nombre, idEtapa },
      ip,
    });

    return NextResponse.json({ idPartida }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/partidas POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
