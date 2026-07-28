import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getCierreDia } from '@/lib/reporte-h4/queries';
import { REPORTE_CACHE } from '@/lib/cache-headers';

export const runtime = 'nodejs';

// Reporte H4 → Cierre del Día: KPIs de la jornada + anomalías pendientes.
// Acepta ?fecha=YYYY-MM-DD (opcional); por defecto usa el día local de CR.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const raw = new URL(req.url).searchParams.get('fecha');
  const fecha = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined;

  try {
    const data = await getCierreDia(fecha);
    return NextResponse.json(data, { headers: REPORTE_CACHE });
  } catch (e) {
    console.error('[reporte-h4/cierre-dia]', e);
    return NextResponse.json({ error: 'No se pudo consultar el cierre del día' }, { status: 500 });
  }
}
