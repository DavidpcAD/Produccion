import { NextResponse } from 'next/server';
import { sesionMovil } from '@/lib/movil/sesion';
import { equiposDelOperador, operadorMant } from '@/lib/movil/maquinaria';

// Quién soy y qué máquinas tengo asignadas, con si ya hice el checklist de hoy.
// Es lo primero que pide la app: con 1 máquina entra directo a sus botones, con
// varias muestra la lista.
export async function GET(req: Request) {
  const auth = await sesionMovil(req, 'maquinaria');
  if (auth.error) return auth.error;
  try {
    const op = await operadorMant(auth.sesion);
    const equipos = await equiposDelOperador(op.id);
    return NextResponse.json(
      { nombre: auth.sesion.nombre, usuario: op.usuario, equipos },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('/api/movil/maquinaria/yo:', err);
    return NextResponse.json({ error: 'No se pudieron cargar tus máquinas.' }, { status: 500 });
  }
}
