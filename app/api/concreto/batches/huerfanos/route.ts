import { NextRequest, NextResponse } from 'next/server';
import { mensajeParaCliente } from '@/lib/errores';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { guardConcreto, esRechazo } from '@/lib/concreto/guard';
import { listarBatchesHuerfanos } from '@/lib/concreto/coladas-workflow';

// GET /api/concreto/batches/huerfanos — batches excluidos, listos para reasignar.
export async function GET(_req: NextRequest) {
  const session = await guardConcreto();
  if (esRechazo(session)) return session;

  try {
    const db = await getAdelanteDb();
    const huerfanos = await listarBatchesHuerfanos(db);
    return NextResponse.json({ huerfanos, total: huerfanos.length });
  } catch (err: unknown) {
    const msg = mensajeParaCliente(err);
    console.error('/api/concreto/batches/huerfanos error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
