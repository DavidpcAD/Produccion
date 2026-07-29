import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { listarBatchesHuerfanos } from '@/lib/concreto/coladas-workflow';

// GET /api/concreto/batches/huerfanos — batches excluidos, listos para reasignar.
export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const db = await getAdelanteDb();
    const huerfanos = await listarBatchesHuerfanos(db);
    return NextResponse.json({ huerfanos, total: huerfanos.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/batches/huerfanos error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
