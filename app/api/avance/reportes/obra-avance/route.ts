import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { calcularObraAvance } from '@/lib/avance/reportes';

export const dynamic = 'force-dynamic';

/**
 * GET /api/avance/reportes/obra-avance?semana=N&obra=CODIGO — drill-down de una
 * obra: las sub-partidas que avanzaron esa semana con su % / m² / ₡. Portado de
 * la Azure Function `reportes-obra-avance.ts`.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const semanaId = Number(sp.get('semana'));
  if (!Number.isInteger(semanaId) || semanaId <= 0) {
    return NextResponse.json({ error: 'Parámetro "semana" inválido' }, { status: 400 });
  }
  const obra = (sp.get('obra') ?? '').trim();
  if (obra.length < 1 || obra.length > 20) {
    return NextResponse.json({ error: 'Parámetro "obra" inválido' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();
    const data = await calcularObraAvance(db, semanaId, obra);
    if (!data) return NextResponse.json({ error: 'Semana no encontrada' }, { status: 404 });
    return NextResponse.json({ data });
  } catch (err) {
    console.error('/api/avance/reportes/obra-avance GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
