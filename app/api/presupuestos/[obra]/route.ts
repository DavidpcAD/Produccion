import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { detallePresupuesto } from '@/lib/bc/presupuestos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/presupuestos/{works_no}[?version=CODE] → detalle (grupos + partidas). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ obra: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { obra } = await params;
  const worksNo = decodeURIComponent(obra).trim();
  if (worksNo.length < 3) {
    return NextResponse.json({ error: 'Obra inválida' }, { status: 400 });
  }
  const version = req.nextUrl.searchParams.get('version')?.trim() || null;
  try {
    const detalle = await detallePresupuesto(worksNo, version);
    if (!detalle) {
      return NextResponse.json({ error: `Sin presupuesto para ${worksNo}` }, { status: 404 });
    }
    return NextResponse.json(detalle);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
