import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { listarDesembolsos, lunesDeEstaSemana } from '@/lib/desembolsos/matriz';

export const dynamic = 'force-dynamic';

/**
 * GET /api/desembolsos/matriz?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 * Matriz banco×hito×semana de desembolsos proyectados. Portado de la Azure
 * Function `desembolsos.ts` (GET /api/desembolsos). Si no se pasan fechas usa
 * el lunes de esta semana + 4 semanas (27 días).
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const desdeParam = sp.get('desde');
  const hastaParam = sp.get('hasta');

  let desde: Date;
  let hasta: Date;
  if (desdeParam && /^\d{4}-\d{2}-\d{2}$/.test(desdeParam)) {
    desde = new Date(desdeParam + 'T00:00:00Z');
  } else {
    desde = lunesDeEstaSemana();
  }
  if (hastaParam && /^\d{4}-\d{2}-\d{2}$/.test(hastaParam)) {
    hasta = new Date(hastaParam + 'T00:00:00Z');
  } else {
    hasta = new Date(desde);
    hasta.setUTCDate(desde.getUTCDate() + 27); // 4 semanas exactas
  }

  if (hasta < desde) {
    return NextResponse.json({ error: 'hasta debe ser posterior a desde' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();
    const data = await listarDesembolsos(db, desde, hasta);
    return NextResponse.json(data);
  } catch (err) {
    console.error('/api/desembolsos/matriz GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
