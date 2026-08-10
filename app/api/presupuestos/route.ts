import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listarPresupuestos } from '@/lib/bc/presupuestos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/presupuestos[?works_no=VN-K.26] → presupuestos por obra (pro_bi.fact_presupuesto). */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const worksNo = req.nextUrl.searchParams.get('works_no')?.trim() || undefined;
  try {
    return NextResponse.json(await listarPresupuestos(worksNo));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
