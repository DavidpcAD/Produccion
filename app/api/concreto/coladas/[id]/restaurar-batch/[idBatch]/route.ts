import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { restaurarBatch } from '@/lib/concreto/coladas-workflow';
import { obtenerColada } from '@/lib/concreto/coladas';

// POST /api/concreto/coladas/[id]/restaurar-batch/[idBatch] — inverso de
// excluir en la MISMA colada. Sin body.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; idBatch: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id, idBatch } = await params;
  const idColada = Number(id);
  const idBatchNum = Number(idBatch);
  if (!Number.isInteger(idColada) || idColada <= 0) {
    return NextResponse.json({ error: 'idColada inválido' }, { status: 400 });
  }
  if (!Number.isInteger(idBatchNum) || idBatchNum <= 0) {
    return NextResponse.json({ error: 'idBatch inválido' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();
    const r = await restaurarBatch(db, idColada, idBatchNum);
    if (!r.ok) {
      return NextResponse.json({ error: r.error, codigo: r.codigo, ...r.extra }, { status: r.status });
    }
    const detalle = await obtenerColada(db, idColada);
    if (!detalle) return NextResponse.json({ error: 'Colada no encontrada' }, { status: 404 });
    return NextResponse.json(detalle);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/coladas/[id]/restaurar-batch/[idBatch] error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
