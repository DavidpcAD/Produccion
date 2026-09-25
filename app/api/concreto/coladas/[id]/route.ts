import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { guardConcreto, esRechazo } from '@/lib/concreto/guard';
import { obtenerColada } from '@/lib/concreto/coladas';

// GET /api/concreto/coladas/[id] — detalle: header + batches + cilindros.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await guardConcreto();
  if (esRechazo(session)) return session;

  const { id } = await params;
  const idColada = Number(id);
  if (!Number.isInteger(idColada) || idColada <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();
    const detalle = await obtenerColada(db, idColada);
    if (!detalle) return NextResponse.json({ error: 'Colada no encontrada' }, { status: 404 });
    return NextResponse.json(detalle);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/coladas/[id] GET error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
