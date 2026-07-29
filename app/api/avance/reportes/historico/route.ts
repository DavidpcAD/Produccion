import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { calcularHistorico } from '@/lib/avance/reporte-historico';

export const dynamic = 'force-dynamic';

/**
 * GET /api/avance/reportes/historico?semana=N — grilla sub-partida × obra de una
 * semana (foto del cierre o estado vivo). Puerto de la Azure Function
 * `historico.ts`. Alimenta las vistas Por Sprint / Por Partida / Kanban.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const semanaId = Number(new URL(req.url).searchParams.get('semana'));
  if (!Number.isInteger(semanaId) || semanaId <= 0) {
    return NextResponse.json({ error: 'Parámetro "semana" inválido' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();
    const data = await calcularHistorico(db, semanaId);
    if (!data) return NextResponse.json({ error: 'Semana no encontrada' }, { status: 404 });
    return NextResponse.json({ data });
  } catch (err) {
    console.error('/api/avance/reportes/historico GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
