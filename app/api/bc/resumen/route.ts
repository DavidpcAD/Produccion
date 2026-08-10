import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { bcProductionConfigured } from '@/lib/bc/production-lines';
import { construirResumen } from '@/lib/bc/integracion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/bc/resumen → listado de obras con monto registrado / a registrar en BC. */
export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!bcProductionConfigured()) {
    return NextResponse.json(
      { error: 'La integración con BC no está configurada en el servidor (revisá BC_*).' },
      { status: 503 },
    );
  }
  try {
    return NextResponse.json(await construirResumen());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
