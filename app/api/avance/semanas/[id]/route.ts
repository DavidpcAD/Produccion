import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import type { SemanaOperativaDetalle } from '@/lib/avance/sprints';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/avance/semanas/{id} — edita dias_efectivos / descripcion de la
 * semana (solo si está 'abierta'). Portado de obrascontrol `semanas.ts`
 * (PATCH /api/semanas/{id}).
 *
 * Body: { dias_efectivos?, descripcion? }.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const db = await getAdelanteDb();
    const req2 = db.request().input('id', sql.BigInt, id);
    const sets: string[] = [];

    if (body?.dias_efectivos !== undefined) {
      const v = Number(body.dias_efectivos);
      if (!Number.isInteger(v) || v < 1 || v > 7) {
        return NextResponse.json({ error: 'dias_efectivos inválido (1–7)' }, { status: 400 });
      }
      sets.push('dias_efectivos = @dias');
      req2.input('dias', sql.SmallInt, v);
    }
    if (body?.descripcion !== undefined) {
      const v = body.descripcion != null ? String(body.descripcion).slice(0, 500) : null;
      sets.push('descripcion = @desc');
      req2.input('desc', sql.NVarChar(sql.MAX), v);
    }
    if (sets.length === 0) {
      return NextResponse.json({ error: 'Nada para actualizar.' }, { status: 400 });
    }

    const r = await req2.query<SemanaOperativaDetalle>(`
      UPDATE obc.semanas_operativas SET ${sets.join(', ')}
      OUTPUT INSERTED.id, INSERTED.anio, INSERTED.numero_semana,
             CONVERT(varchar(10), INSERTED.fecha_inicio, 23) AS fecha_inicio,
             CONVERT(varchar(10), INSERTED.fecha_fin, 23) AS fecha_fin,
             INSERTED.estado, INSERTED.descripcion, INSERTED.dias_efectivos
      WHERE id = @id AND estado = 'abierta'
    `);
    if (r.recordset.length === 0) {
      return NextResponse.json(
        { error: 'La semana no existe o ya está cerrada.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, semana: r.recordset[0] });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
