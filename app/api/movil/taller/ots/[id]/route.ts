import { NextResponse } from 'next/server';
import { sesionMovil } from '@/lib/movil/sesion';
import { operadorMant } from '@/lib/movil/maquinaria';
import { errorDeTaller, esId, otDelTaller } from '@/lib/movil/taller';

// GET → una OT, para la pantalla de terminarla.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await sesionMovil(req, 'mecanico');
  if (auth.error) return auth.error;
  const { id } = await params;
  if (!esId(id)) return NextResponse.json({ error: 'Esa OT no existe.' }, { status: 404 });
  try {
    const yo = await operadorMant(auth.sesion, 'tecnico');
    const ot = await otDelTaller(id, yo);
    if (!ot) return NextResponse.json({ error: 'Esa OT no existe.' }, { status: 404 });
    return NextResponse.json(ot, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const e = errorDeTaller('/api/movil/taller/ots/[id]', err, 'No se pudo cargar la OT.');
    return NextResponse.json(e.body, { status: e.status });
  }
}
