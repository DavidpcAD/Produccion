import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { listarEnRango, mapDbError } from '@/lib/desembolsos/pagos-cliente';

export const dynamic = 'force-dynamic';

// GET /api/desembolsos/pagos-cliente?desde=&hasta= — pagos en rango (matriz).
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const desde = req.nextUrl.searchParams.get('desde');
  const hasta = req.nextUrl.searchParams.get('hasta');
  if (!desde || !/^\d{4}-\d{2}-\d{2}$/.test(desde)) return NextResponse.json({ error: 'desde YYYY-MM-DD obligatorio' }, { status: 400 });
  if (!hasta || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return NextResponse.json({ error: 'hasta YYYY-MM-DD obligatorio' }, { status: 400 });
  try {
    const db = await getAdelanteDb();
    return NextResponse.json({ pagos: await listarEnRango(db, desde, hasta) });
  } catch (e) {
    const { status, error } = mapDbError(e);
    return NextResponse.json({ error }, { status });
  }
}
