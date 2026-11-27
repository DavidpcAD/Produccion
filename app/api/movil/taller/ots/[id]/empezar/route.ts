import { NextResponse } from 'next/server';
import { sesionMovil } from '@/lib/movil/sesion';
import { operadorMant } from '@/lib/movil/maquinaria';
import { empezarOt, errorDeTaller, esId } from '@/lib/movil/taller';

// POST → el mecánico empieza la OT: queda en proceso y a su nombre.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await sesionMovil(req, 'mecanico');
  if (auth.error) return auth.error;
  const { id } = await params;
  if (!esId(id)) return NextResponse.json({ error: 'Esa OT no existe.' }, { status: 404 });
  try {
    const yo = await operadorMant(auth.sesion, 'tecnico');
    await empezarOt(id, yo);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const e = errorDeTaller('/api/movil/taller/ots/[id]/empezar', err, 'No se pudo empezar la OT.');
    return NextResponse.json(e.body, { status: e.status });
  }
}
