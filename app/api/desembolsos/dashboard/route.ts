import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { calcularDashboard, type RangoDashboard } from '@/lib/desembolsos/dashboard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/desembolsos/dashboard?idProyecto=&idBanco=&q=&rango=4semanas|mes
 * Dashboard ejecutivo de la cartera (KPIs + serie semanal + casos). Portado de
 * la Azure Function `dashboard.ts` de adelante-flujo-desembolsos.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const idProyecto = sp.get('idProyecto') ? Number(sp.get('idProyecto')) : null;
  const idBanco = sp.get('idBanco') ? Number(sp.get('idBanco')) : null;
  const q = sp.get('q')?.trim() || null;
  const rango: RangoDashboard = sp.get('rango') === 'mes' ? 'mes' : '4semanas';

  if (idProyecto != null && (!Number.isInteger(idProyecto) || idProyecto <= 0)) {
    return NextResponse.json({ error: 'idProyecto inválido' }, { status: 400 });
  }
  if (idBanco != null && (!Number.isInteger(idBanco) || idBanco <= 0)) {
    return NextResponse.json({ error: 'idBanco inválido' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();
    const data = await calcularDashboard(db, { idProyecto, idBanco, q, rango });
    return NextResponse.json(data);
  } catch (err) {
    console.error('/api/desembolsos/dashboard GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
