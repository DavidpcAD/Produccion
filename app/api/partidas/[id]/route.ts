import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

// Editar / desactivar una partida. Solo Super Admin (nivel 4).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const idPartida = Number((await params).id) || 0;
  if (!idPartida) return NextResponse.json({ error: 'Partida inválida' }, { status: 400 });

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const body = await req.json().catch(() => ({}));
  const codigo = String(body.codigo ?? '').trim();
  const nombre = String(body.nombre ?? '').trim();
  const idEtapa = Number(body.idEtapa) || 0;

  if (!idEtapa) return NextResponse.json({ error: 'Elegí la etapa' }, { status: 400 });
  if (!codigo) return NextResponse.json({ error: 'El código es requerido' }, { status: 400 });
  if (!nombre) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
  if (codigo.length > 50) return NextResponse.json({ error: 'El código no puede superar 50 caracteres' }, { status: 400 });
  if (nombre.length > 100) return NextResponse.json({ error: 'El nombre no puede superar 100 caracteres' }, { status: 400 });

  const db = await getDb();
  try {
    // Código único entre partidas activas (excluyendo la propia).
    const dup = await db.request()
      .input('cod', sql.VarChar(50), codigo)
      .input('id', sql.Int, idPartida)
      .query('SELECT 1 AS ok FROM dbo.Partida WHERE codigo = @cod AND esActivo = 1 AND idPartida <> @id');
    if (dup.recordset.length > 0) {
      return NextResponse.json({ error: `Ya existe otra partida activa con el código "${codigo}"` }, { status: 409 });
    }

    const upd = await db.request()
      .input('id', sql.Int, idPartida)
      .input('codigo', sql.VarChar(50), codigo)
      .input('nombre', sql.NVarChar(100), nombre)
      .input('idEtapa', sql.Int, idEtapa)
      .query(`
        UPDATE dbo.Partida SET codigo = @codigo, nombre = @nombre, idEtapa = @idEtapa
        WHERE idPartida = @id AND esActivo = 1
      `);
    if (upd.rowsAffected[0] === 0) {
      return NextResponse.json({ error: 'La partida no existe o está inactiva' }, { status: 404 });
    }

    await logAudit({
      idColAccion: session.idCol, accion: 'EDITAR_PARTIDA', entidad: 'Partida',
      idEntidad: idPartida, detalleNuevo: { codigo, nombre, idEtapa }, ip,
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/partidas/[id] PUT error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const idPartida = Number((await params).id) || 0;
  if (!idPartida) return NextResponse.json({ error: 'Partida inválida' }, { status: 400 });
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';

  const db = await getDb();
  try {
    // No permitir borrar si tiene subpartidas activas.
    const subs = await db.request()
      .input('id', sql.Int, idPartida)
      .query('SELECT COUNT(*) AS n FROM dbo.SubPartida WHERE idPartida = @id AND esActivo = 1');
    if (subs.recordset[0].n > 0) {
      return NextResponse.json({ error: 'La partida tiene subpartidas activas. Borralas o movelas primero.' }, { status: 409 });
    }
    const upd = await db.request()
      .input('id', sql.Int, idPartida)
      .query('UPDATE dbo.Partida SET esActivo = 0 WHERE idPartida = @id AND esActivo = 1');
    if (upd.rowsAffected[0] === 0) {
      return NextResponse.json({ error: 'La partida no existe o ya está inactiva' }, { status: 404 });
    }
    await logAudit({
      idColAccion: session.idCol, accion: 'ELIMINAR_PARTIDA', entidad: 'Partida',
      idEntidad: idPartida, ip,
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/partidas/[id] DELETE error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
