import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { obtenerMuestra } from '@/lib/concreto/lab';

// GET /api/concreto/lab/muestras/[id] — detalle: header + ensayos + mediciones.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const idMuestra = Number(id);
  if (!Number.isInteger(idMuestra) || idMuestra <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();
    const muestra = await obtenerMuestra(db, idMuestra);
    if (!muestra) return NextResponse.json({ error: 'Muestra no encontrada' }, { status: 404 });
    return NextResponse.json(muestra);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/muestras/[id] GET error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
