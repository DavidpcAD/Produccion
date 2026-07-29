import { NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import type { SemanaOperativaDetalle } from '@/lib/avance/sprints';

export const dynamic = 'force-dynamic';

/**
 * GET /api/avance/semanas/actual → la semana operativa abierta (o null si no
 * hay ninguna). Portado de obrascontrol `semanas.ts` (GET /api/semanas/actual).
 */
export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const db = await getAdelanteDb();
    const r = await db.request().query<SemanaOperativaDetalle>(`
      SELECT TOP 1 id, anio, numero_semana,
             CONVERT(varchar(10), fecha_inicio, 23) AS fecha_inicio,
             CONVERT(varchar(10), fecha_fin, 23) AS fecha_fin,
             estado, descripcion, dias_efectivos
      FROM obc.semanas_operativas
      WHERE estado = 'abierta'
      ORDER BY fecha_inicio DESC
    `);
    return NextResponse.json({ semana: r.recordset[0] ?? null });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
