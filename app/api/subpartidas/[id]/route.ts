import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

const TIPOS_CASA = new Set(['1N-Techo', '1N-Azotea', '2N-Techo', '2N-Azotea']);

// Editar una subpartida del catálogo unificado (pro_obc.sub_partidas +
// sub_partida_tipos). Solo Super Admin (nivel 4).
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
  const activo = body.activo === undefined ? true : !!body.activo;
  const descripcion = String(body.descripcion ?? '').trim() || null;
  const tiposCasa: string[] = Array.isArray(body.tiposCasa)
    ? body.tiposCasa.filter((t: unknown) => TIPOS_CASA.has(String(t)))
    : [];

  if (!codigo) return NextResponse.json({ error: 'El código es requerido' }, { status: 400 });
  if (!nombre) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
  if (codigo.length > 50) return NextResponse.json({ error: 'El código no puede superar 50 caracteres' }, { status: 400 });
  if (nombre.length > 150) return NextResponse.json({ error: 'El nombre no puede superar 150 caracteres' }, { status: 400 });
  if (numSprint < 1 || numSprint > 50) return NextResponse.json({ error: 'Sprint inválido (1–50)' }, { status: 400 });
  if (tiposCasa.length === 0) return NextResponse.json({ error: 'Elegí al menos un tipo de casa' }, { status: 400 });

  const db = await getAdelanteDb();
  try {
    const dup = await db.request()
      .input('cod', sql.VarChar(50), codigo)
      .input('id', sql.Int, idSubPartida)
      .query('SELECT 1 AS ok FROM pro_obc.sub_partidas WHERE codigo = @cod AND id <> @id');
    if (dup.recordset.length > 0) {
      return NextResponse.json({ error: `Ya existe otra subpartida con el código "${codigo}"` }, { status: 409 });
    }

    const tx = new sql.Transaction(db);
    await tx.begin();
    try {
      const upd = await new sql.Request(tx)
        .input('id', sql.Int, idSubPartida)
        .input('codigo', sql.VarChar(50), codigo)
        .input('nombre', sql.NVarChar(150), nombre)
        .input('numSprint', sql.SmallInt, numSprint)
        .input('esCritica', sql.Bit, esCritica)
        .input('descripcion', sql.NVarChar(sql.MAX), descripcion)
        .input('activo', sql.Bit, activo)
        .query(`
          UPDATE pro_obc.sub_partidas
          SET codigo = @codigo, nombre = @nombre, sprint_numero = @numSprint,
              es_critica = @esCritica, descripcion = @descripcion, activo = @activo
          WHERE id = @id
        `);
      if (upd.rowsAffected[0] === 0) {
        await tx.rollback();
        return NextResponse.json({ error: 'La subpartida no existe' }, { status: 404 });
      }
      // Reemplazar tipos de casa.
      await new sql.Request(tx).input('id', sql.Int, idSubPartida)
        .query('DELETE FROM pro_obc.sub_partida_tipos WHERE sub_partida_id = @id');
      for (const tc of tiposCasa) {
        await new sql.Request(tx)
          .input('id', sql.Int, idSubPartida)
          .input('tc', sql.VarChar(20), tc)
          .query('INSERT INTO pro_obc.sub_partida_tipos (sub_partida_id, tipo_casa) VALUES (@id, @tc)');
      }
      await tx.commit();
    } catch (e) {
      try { await tx.rollback(); } catch { /* ignorar */ }
      throw e;
    }

    await logAudit({
      idColAccion: session.idCol, accion: 'EDITAR_SUBPARTIDA', entidad: 'SubPartida',
      idEntidad: idSubPartida, detalleNuevo: { codigo, nombre, numSprint, esCritica, descripcion, tiposCasa, activo }, ip,
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

  const db = await getAdelanteDb();
  try {
    const upd = await db.request()
      .input('id', sql.Int, idSubPartida)
      .query('UPDATE pro_obc.sub_partidas SET activo = 0 WHERE id = @id AND activo = 1');
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
