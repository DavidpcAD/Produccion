import { NextResponse } from 'next/server';
import { sesionMovil } from '@/lib/movil/sesion';
import { errorDeTaller, repuestosTaller } from '@/lib/movil/taller';

// GET → todos los repuestos de mant.Repuestos (consulta; se gastan al terminar una OT).
export async function GET(req: Request) {
  const auth = await sesionMovil(req, 'mecanico');
  if (auth.error) return auth.error;
  try {
    return NextResponse.json({ repuestos: await repuestosTaller() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const e = errorDeTaller('/api/movil/taller/repuestos', err, 'No se pudieron cargar los repuestos.');
    return NextResponse.json(e.body, { status: e.status });
  }
}
