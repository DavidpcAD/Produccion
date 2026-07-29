import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { liquidacionLote } from '@/lib/desembolsos/reportes';

export const dynamic = 'force-dynamic';

function inicioMes(): string { const h = new Date(); return new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), 1)).toISOString().slice(0, 10); }
function finMes(): string { const h = new Date(); return new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth() + 1, 0)).toISOString().slice(0, 10); }

// GET /api/desembolsos/exports/liquidacion-lote?desde=&hasta=&idProyecto=
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const desdeP = sp.get('desde');
  const hastaP = sp.get('hasta');
  const desde = desdeP && /^\d{4}-\d{2}-\d{2}$/.test(desdeP) ? desdeP : inicioMes();
  const hasta = hastaP && /^\d{4}-\d{2}-\d{2}$/.test(hastaP) ? hastaP : finMes();
  try {
    const db = await getAdelanteDb();
    const filas = await liquidacionLote(db, { desde, hasta, idProyecto: sp.get('idProyecto') ? Number(sp.get('idProyecto')) : undefined });
    return NextResponse.json({ filas, desde, hasta });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
