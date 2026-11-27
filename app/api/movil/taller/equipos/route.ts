import { NextResponse } from 'next/server';
import { sesionMovil } from '@/lib/movil/sesion';
import { operadorMant } from '@/lib/movil/maquinaria';
import { equiposTaller, errorDeTaller } from '@/lib/movil/taller';

// GET → todas las máquinas para el mecánico, primero las que tienen algo que hacer.
export async function GET(req: Request) {
  const auth = await sesionMovil(req, 'mecanico');
  if (auth.error) return auth.error;
  try {
    const yo = await operadorMant(auth.sesion, 'tecnico');
    const equipos = await equiposTaller(yo);
    return NextResponse.json({ nombre: yo.nombre, usuario: yo.usuario, equipos }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const e = errorDeTaller('/api/movil/taller/equipos', err, 'No se pudieron cargar las máquinas.');
    return NextResponse.json(e.body, { status: e.status });
  }
}
