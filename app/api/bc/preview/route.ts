import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { bcProductionConfigured } from '@/lib/bc/production-lines';
import { construirPreview } from '@/lib/bc/integracion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/bc/preview?obra=VN-K.26 → comparación OC vs BC por partida + monto a registrar. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const obra = req.nextUrl.searchParams.get('obra')?.trim();
  if (!obra) return NextResponse.json({ error: 'Falta el parámetro obra' }, { status: 400 });
  if (!bcProductionConfigured()) {
    return NextResponse.json(
      { error: 'La integración con BC no está configurada en el servidor (revisá BC_*).' },
      { status: 503 },
    );
  }
  try {
    return NextResponse.json(await construirPreview(obra));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
