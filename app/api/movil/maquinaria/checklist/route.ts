import { NextResponse } from 'next/server';
import { sesionMovil } from '@/lib/movil/sesion';
import { checklistDelEquipo, equipoAsignado, operadorMant } from '@/lib/movil/maquinaria';

// Los puntos del checklist "antes de arrancar" de una máquina asignada.
export async function GET(req: Request) {
  const auth = await sesionMovil(req, 'maquinaria');
  if (auth.error) return auth.error;
  const equipoId = new URL(req.url).searchParams.get('equipoId') ?? '';
  try {
    const op = await operadorMant(auth.sesion);
    if (!(await equipoAsignado(op.id, equipoId))) {
      return NextResponse.json({ error: 'Esa máquina no está asignada a vos.' }, { status: 403 });
    }
    const items = await checklistDelEquipo(equipoId);
    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('/api/movil/maquinaria/checklist:', err);
    return NextResponse.json({ error: 'No se pudo cargar el checklist.' }, { status: 500 });
  }
}
