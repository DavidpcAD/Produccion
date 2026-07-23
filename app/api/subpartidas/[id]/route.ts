import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

// Editar una subpartida. Solo Super Admin (nivel 4).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const idSubPartida = Number((await params).id) || 0;
  if (!idSubPartida) return NextResponse.json({ error: 'Subpartida inválida' }, { status: 400 });

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const body = await req.json().catch(() => ({}));
  const codigo = String(body.codigo ?? '').trim();
  const nombre = String(body.nombre ?? '').trim();
  const numSprint = Number.isFinite(Number(body.numSprint)) ? Number(body.numSprint) : 1;
  const esCritica = !!body.esCritica;
  const descripcion = String(body.descripcion ?? '').trim() || null;

  if (!codigo) return NextResponse.json({ error: 'El código es requerido' }, { status: 400 });
  if (!nombre) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
  if (codigo.length > 50) return NextResponse.json({ error: 'El código no puede superar 50 caracteres' }, { status: 400 });
  if (nombre.length > 50) return NextResponse.json({ error: 'El nombre no puede superar 50 caracteres' }, { status: 400 });
  if (descripcion && descripcion.length > 50) return NextResponse.json({ error: 'La descripción no puede superar 50 caracteres' }, { status: 400 });

  const db = await getDb();
  try {
    const dup = await db.request()
      .input('cod', sql.VarChar(50), codigo)
      .input('id', sql.Int, idSubPartida)
      .query('SELECT 1 AS ok FROM dbo.SubPartida WHERE codigo = @cod AND esActivo = 1 AND idSubPartida <> @id');
    if (dup.recordset.length > 0) {
      return NextResponse.json({ error: `Ya existe otra subpartida activa con el código "${codigo}"` }, { status: 409 });
    }

    const upd = await db.request()
      .input('id', sql.Int, idSubPartida)
      .input('codigo', sql.VarChar(50), codigo)
      .input('nombre', sql.NVarChar(50), nombre)
      .input('numSprint', sql.SmallInt, numSprint)
      .input('esCritica', sql.Bit, esCritica)
      .input('descripcion', sql.NVarChar(50), descripcion)
      .query(`
        UPDATE dbo.SubPartida
        SET codigo = @codigo, nombre = @nombre, numSprint = @numSprint,
            esCritica = @esCritica, descripcion = @descripcion
        WHERE idSubPartida = @id AND esActivo = 1
      `);
    if (upd.rowsAffected[0] === 0) {
      return NextResponse.json({ error: 'La subpartida no existe o está inactiva' }, { status: 404 });
    }

    await logAudit({
      idColAccion: session.idCol, accion: 'EDITAR_SUBPARTIDA', entidad: 'SubPartida',
      idEntidad: idSubPartida, detalleNuevo: { codigo, nombre, numSprint, esCritica, descripcion }, ip,
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/subpartidas/[id] PUT error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const idSubPartida = Number((await params).id) || 0;
  if (!idSubPartida) return NextResponse.json({ error: 'Subpartida inválida' }, { status: 400 });
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';

  const db = await getDb();
  try {
    const upd = await db.request()
      .input('id', sql.Int, idSubPartida)
      .query('UPDATE dbo.SubPartida SET esActivo = 0 WHERE idSubPartida = @id AND esActivo = 1');
    if (upd.rowsAffected[0] === 0) {
      return NextResponse.json({ error: 'La subpartida no existe o ya está inactiva' }, { status: 404 });
    }
    await logAudit({
      idColAccion: session.idCol, accion: 'ELIMINAR_SUBPARTIDA', entidad: 'SubPartida',
      idEntidad: idSubPartida, ip,
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/subpartidas/[id] DELETE error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
