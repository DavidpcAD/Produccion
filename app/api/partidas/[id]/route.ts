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
  if (codigo.length > 50) return NextResponse.json({ error: 'El código no puede superar 50 caracteres' }, { status: 400 });
  if (nombre.length > 150) return NextResponse.json({ error: 'El nombre no puede superar 150 caracteres' }, { status: 400 });

  const db = await getAdelanteDb();
  try {
    // Único DENTRO DEL GRUPO (índice UX_partidas_grupo_codigo): infra repite a
    // propósito los códigos de vivienda, y cada obra administrativa/fábrica trae
    // los suyos de BC (G1.1 existe en siete casas).
    const dup = await db.request()
      .input('cod', sql.VarChar(50), codigo)
      .input('id', sql.Int, idPartida)
      .input('idE', sql.Int, idEtapa)
      .query('SELECT 1 AS ok FROM pro_obc.partidas WHERE codigo = @cod AND id <> @id AND grupo_id = @idE');
    if (dup.recordset.length > 0) {
      return NextResponse.json({ error: `Ya existe otra partida con el código "${codigo}" en esa etapa` }, { status: 409 });
    }

    // El puente con BC (bc_task_no) sigue al código mientras venga espejado —que
    // es el caso normal: el código de la partida ES el "Posting" de BC. Si alguien
    // lo desacopló a mano, se respeta.
    const upd = await db.request()
      .input('id', sql.Int, idPartida)
      .input('codigo', sql.VarChar(50), codigo)
      .input('nombre', sql.NVarChar(150), nombre)
      .input('idEtapa', sql.Int, idEtapa)
      .query(`
        UPDATE pro_obc.partidas
        SET codigo = @codigo, nombre = @nombre, grupo_id = @idEtapa,
            bc_task_no = CASE WHEN bc_task_no IS NULL OR bc_task_no = codigo THEN @codigo ELSE bc_task_no END
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
