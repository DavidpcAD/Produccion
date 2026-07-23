import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

// Encargados por subpartida (fuente única, tabla dbo.EncargadoPartida).
// Cada subpartida tiene UN solo encargado; un encargado puede tomar varias.
export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const db = await getDb();

  let directos: unknown[] = [];
  let tablaFaltante = false;
  try {
    const res = await db.request().query(`
      SELECT ep.idEncargadoPartida, ep.idColaborador,
             col.calcNombreCompleto AS encargado,
             ep.idSubPartida,
             sp.codigo AS subPartidaCodigo, sp.nombre AS subPartida,
             sp.idPartida AS partidaId, pa.codigo AS partidaCodigo, pa.nombre AS partida
      FROM dbo.EncargadoPartida ep
      JOIN dbo.Colaborador col ON col.idColaborador = ep.idColaborador
      JOIN dbo.SubPartida sp   ON sp.idSubPartida = ep.idSubPartida
      LEFT JOIN dbo.Partida pa ON pa.idPartida = sp.idPartida
      ORDER BY pa.codigo, sp.codigo
    `);
    directos = res.recordset;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/Invalid object name|EncargadoPartida/i.test(msg)) {
      tablaFaltante = true;
    } else {
      console.error('/api/encargados-partida GET error:', err);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ directos, tablaFaltante });
}

// Asigna un encargado a una subpartida. Falla si la subpartida ya tiene encargado.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const body = await req.json();
  const idColaborador = Number(body.idColaborador) || 0;
  const idSubPartida = Number(body.idSubPartida) || 0;

  if (!idColaborador) return NextResponse.json({ error: 'Falta el usuario' }, { status: 400 });
  if (!idSubPartida) return NextResponse.json({ error: 'Falta la subpartida' }, { status: 400 });

  const db = await getDb();
  try {
    const userCheck = await db.request()
      .input('sid', sql.Int, session.idCol)
      .query('SELECT 1 AS ok FROM dbo.Colaborador WHERE idColaborador = @sid');
    const creadoPor = userCheck.recordset.length > 0 ? session.idCol : null;

    const ins = await db.request()
      .input('idCol', sql.Int, idColaborador)
      .input('idSub', sql.Int, idSubPartida)
      .input('creadoPor', sql.Int, creadoPor)
      .query(`
        INSERT INTO dbo.EncargadoPartida (idColaborador, idSubPartida, creadoPor)
        OUTPUT INSERTED.idEncargadoPartida
        VALUES (@idCol, @idSub, @creadoPor)
      `);
    const idEncargadoPartida = ins.recordset[0].idEncargadoPartida;

    const det = await db.request()
      .input('id', sql.Int, idEncargadoPartida)
      .query(`
        SELECT col.calcNombreCompleto AS encargado, sp.codigo AS subCodigo
        FROM dbo.EncargadoPartida ep
        JOIN dbo.Colaborador col ON col.idColaborador = ep.idColaborador
        JOIN dbo.SubPartida sp   ON sp.idSubPartida = ep.idSubPartida
        WHERE ep.idEncargadoPartida = @id
      `);
    const d = det.recordset[0];

    await logAudit({
      idColAccion: session.idCol,
      accion: 'ASIGNAR_ENCARGADO_PARTIDA',
      entidad: 'EncargadoPartida',
      idEntidad: idEncargadoPartida,
      detalleNuevo: { encargado: d?.encargado, subpartida: d?.subCodigo },
      ip,
    });

    return NextResponse.json({ idEncargadoPartida }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Índice único sobre idSubPartida → la subpartida ya tiene encargado.
    if (/duplicate key|UNIQUE KEY|ux_EncargadoPartida_subpartida/i.test(msg)) {
      return NextResponse.json({ error: 'Esa subpartida ya tiene un encargado. Quitalo primero para reasignar.' }, { status: 409 });
    }
    if (/Invalid object name|EncargadoPartida/i.test(msg)) {
      return NextResponse.json({ error: 'Falta correr la migración dbo.EncargadoPartida en la base.' }, { status: 500 });
    }
    console.error('/api/encargados-partida POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Quita una asignación por su id.
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const body = await req.json();
  const idEncargadoPartida = Number(body.idEncargadoPartida) || 0;
  if (!idEncargadoPartida) {
    return NextResponse.json({ error: 'Falta el id de la asignación' }, { status: 400 });
  }

  const db = await getDb();
  try {
    const det = await db.request()
      .input('id', sql.Int, idEncargadoPartida)
      .query(`
        SELECT col.calcNombreCompleto AS encargado, sp.codigo AS subCodigo
        FROM dbo.EncargadoPartida ep
        JOIN dbo.Colaborador col ON col.idColaborador = ep.idColaborador
        JOIN dbo.SubPartida sp   ON sp.idSubPartida = ep.idSubPartida
        WHERE ep.idEncargadoPartida = @id
      `);
    const d = det.recordset[0];

    const res = await db.request()
      .input('id', sql.Int, idEncargadoPartida)
      .query('DELETE FROM dbo.EncargadoPartida WHERE idEncargadoPartida = @id');
    if (res.rowsAffected[0] === 0) {
      return NextResponse.json({ error: 'Asignación no encontrada' }, { status: 404 });
    }

    await logAudit({
      idColAccion: session.idCol,
      accion: 'QUITAR_ENCARGADO_PARTIDA',
      entidad: 'EncargadoPartida',
      idEntidad: idEncargadoPartida,
      detallePrevio: { encargado: d?.encargado, subpartida: d?.subCodigo },
      ip,
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/encargados-partida DELETE error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
