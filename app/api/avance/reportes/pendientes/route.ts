import { NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { calcularPendientes } from '@/lib/avance/reporte-pendientes';

export const dynamic = 'force-dynamic';

/**
 * GET /api/avance/reportes/pendientes — sub-partidas pendientes arrastradas
 * (estado vivo): de sprints anteriores al sprint_actual de cada obra en
 * construcción, sin completar. Puerto de la Azure Function `pendientes.ts`.
 */
export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const db = await getAdelanteDb();
    const data = await calcularPendientes(db);
    return NextResponse.json({ data });
  } catch (err) {
    console.error('/api/avance/reportes/pendientes GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
