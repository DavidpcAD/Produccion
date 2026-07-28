import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getResumenDia } from '@/lib/reporte-h4/queries';
import { REPORTE_CACHE } from '@/lib/cache-headers';

export const runtime = 'nodejs';

// Reporte H4 → Resumen del día por persona (marcas de hoy, activos/salieron).
// Portado de h4control (src/app/api/resumen-dia). No lo consume aún la pantalla
// de Cierre del Día; queda disponible para el detalle por colaborador.
// TODO(reporte-h4): construir la vista de detalle por persona sobre este endpoint.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const data = await getResumenDia();
    return NextResponse.json(data, { headers: REPORTE_CACHE });
  } catch (e) {
    console.error('[reporte-h4/resumen-dia]', e);
    return NextResponse.json({ error: 'No se pudo consultar el resumen del día' }, { status: 500 });
  }
}
