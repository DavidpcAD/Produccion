import { NextResponse } from 'next/server';
import { sesionMovil } from '@/lib/movil/sesion';
import { equipoAsignado, operadorMant, reportesRecientes } from '@/lib/movil/maquinaria';

// Últimas averías y solicitudes de material de una máquina, para que el operario
// vea que lo suyo llegó y en qué estado va.
export async function GET(req: Request) {
  const auth = await sesionMovil(req, 'maquinaria');
  if (auth.error) return auth.error;
  const equipoId = new URL(req.url).searchParams.get('equipoId') ?? '';
  try {
    const op = await operadorMant(auth.sesion);
    if (!(await equipoAsignado(op.id, equipoId))) {
      return NextResponse.json({ error: 'Esa máquina no está asignada a vos.' }, { status: 403 });
    }
    return NextResponse.json({ reportes: await reportesRecientes(equipoId) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('/api/movil/maquinaria/reportes:', err);
    return NextResponse.json({ error: 'No se pudieron cargar los reportes.' }, { status: 500 });
  }
}
