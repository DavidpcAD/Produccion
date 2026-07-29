import { NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import type { SemanaOperativa } from '@/lib/avance/mano-obra';

export const dynamic = 'force-dynamic';

/** GET /api/avance/semanas → semanas operativas (obc.semanas_operativas), recientes primero. */
export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const db = await getAdelanteDb();
    const r = await db.request().query<SemanaOperativa>(`
      SELECT id, anio, numero_semana,
             CONVERT(varchar(10), fecha_inicio, 23) AS fecha_inicio,
             CONVERT(varchar(10), fecha_fin, 23) AS fecha_fin
      FROM obc.semanas_operativas
      ORDER BY fecha_inicio DESC
    `);
    return NextResponse.json({ semanas: r.recordset });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
