import { NextResponse } from 'next/server';
import { sesionMovil } from '@/lib/movil/sesion';
import { operadorMant } from '@/lib/movil/maquinaria';
import { detalleEquipoTaller, errorDeTaller, esId } from '@/lib/movil/taller';

// GET → una máquina para el mecánico: OT abiertas y últimas terminadas, checklist
// de hoy, preventivos y sus repuestos.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await sesionMovil(req, 'mecanico');
  if (auth.error) return auth.error;
  const { id } = await params;
  if (!esId(id)) return NextResponse.json({ error: 'Esa máquina no existe.' }, { status: 404 });
  try {
    const yo = await operadorMant(auth.sesion, 'tecnico');
    const detalle = await detalleEquipoTaller(id, yo);
    if (!detalle) return NextResponse.json({ error: 'Esa máquina no existe.' }, { status: 404 });
    return NextResponse.json(detalle, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const e = errorDeTaller('/api/movil/taller/equipos/[id]', err, 'No se pudo cargar la máquina.');
    return NextResponse.json(e.body, { status: e.status });
  }
}
