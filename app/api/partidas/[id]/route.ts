import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

// Editar / desactivar una partida del catálogo unificado (pro_obc.partidas).
// Solo Super Admin (nivel 4).
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
  if (codigo.length > 20) return NextResponse.json({ error: 'El código no puede superar 20 caracteres' }, { status: 400 });
  if (nombre.length > 100) return NextResponse.json({ error: 'El nombre no puede superar 100 caracteres' }, { status: 400 });

  const db = await getAdelanteDb();
  try {
    // Único DENTRO del tipo de obra (infraestructura repite los códigos de
    // vivienda a propósito: son catálogos aparte).
    const dup = await db.request()
      .input('cod', sql.VarChar(20), codigo)
      .input('id', sql.Int, idPartida)
      .input('idE', sql.Int, idEtapa)
      .query(`SELECT 1 AS ok
              FROM pro_obc.partidas p
              JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
              WHERE p.codigo = @cod AND p.id <> @id
                AND g.tipo_obra = (SELECT tipo_obra FROM pro_obc.grupos_partida WHERE id = @idE)`);
    if (dup.recordset.length > 0) {
      return NextResponse.json({ error: `Ya existe otra partida con el código "${codigo}"` }, { status: 409 });
    }

    const upd = await db.request()
      .input('id', sql.Int, idPartida)
      .input('codigo', sql.VarChar(20), codigo)
      .input('nombre', sql.NVarChar(100), nombre)
      .input('idEtapa', sql.Int, idEtapa)
      .query(`
        UPDATE pro_obc.partidas SET codigo = @codigo, nombre = @nombre, grupo_id = @idEtapa
        WHERE id = @id
      `);
    if (upd.rowsAffected[0] === 0) {
      return NextResponse.json({ error: 'La partida no existe' }, { status: 404 });
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

  const db = await getAdelanteDb();
  try {
    // No permitir desactivar si tiene subpartidas activas.
    const subs = await db.request()
      .input('id', sql.Int, idPartida)
      .query('SELECT COUNT(*) AS n FROM pro_obc.sub_partidas WHERE partida_id = @id AND activo = 1');
    if (subs.recordset[0].n > 0) {
      return NextResponse.json({ error: 'La partida tiene subpartidas activas. Borralas o movelas primero.' }, { status: 409 });
    }
    const upd = await db.request()
      .input('id', sql.Int, idPartida)
      .query('UPDATE pro_obc.partidas SET activo = 0 WHERE id = @id AND activo = 1');
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
