import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import type { Causa } from '@/lib/avance/types';

/**
 * GET /api/avance/causas[?activo=true]
 * Catálogo de causas NC / inactividad (obc.causas_catalogo). Alimenta el
 * diálogo de "No cumplió" en la captura de avance.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const soloActivas = new URL(req.url).searchParams.get('activo') === 'true';
  const db = await getAdelanteDb();

  try {
    const r = await db.request().query<Causa>(`
      SELECT id, codigo, descripcion, aplica_nc, aplica_inactividad, activo, orden
      FROM obc.causas_catalogo
      ${soloActivas ? 'WHERE activo = 1' : ''}
      ORDER BY orden, descripcion
    `);
    return NextResponse.json({ data: r.recordset });
  } catch (err) {
    console.error('/api/avance/causas error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
