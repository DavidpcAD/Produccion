import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { consultarKpis } from '@/lib/concreto/batches';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DIAS = 90;

// GET /api/concreto/batches/kpis?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&id_planta=N
// KPIs agregados + serie diaria de m³. Rango máximo 90 días.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const desde = sp.get('desde') || '';
  const hasta = sp.get('hasta') || '';
  const idPlanta = sp.get('id_planta');

  if (!ISO_DATE.test(desde) || !ISO_DATE.test(hasta)) {
    return NextResponse.json({ error: 'desde/hasta requeridos (YYYY-MM-DD)' }, { status: 400 });
  }
  const d0 = new Date(`${desde}T00:00:00Z`).getTime();
  const d1 = new Date(`${hasta}T00:00:00Z`).getTime();
  if (isNaN(d0) || isNaN(d1) || d1 < d0) {
    return NextResponse.json({ error: 'Rango de fechas inválido' }, { status: 400 });
  }
  const dias = Math.round((d1 - d0) / 86400000) + 1;
  if (dias > MAX_DIAS) {
    return NextResponse.json({ error: `Rango máximo ${MAX_DIAS} días` }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();
    const kpis = await consultarKpis(db, {
      desde,
      hasta,
      id_planta: idPlanta ? Number(idPlanta) : undefined,
    });
    return NextResponse.json(kpis);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/batches/kpis GET error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
