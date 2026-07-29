import { NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { listarMovimientosDelCaso } from '@/lib/desembolsos/movimientos';

export const dynamic = 'force-dynamic';

/**
 * GET /api/desembolsos/casos/:idCaso/movimientos — movimientos + hitos
 * vinculables (con sus links) de un caso. Portado de `listarMovimientosDelCaso`.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ idCaso: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const idCaso = Number((await params).idCaso);
  if (!Number.isInteger(idCaso) || idCaso <= 0) {
    return NextResponse.json({ error: 'idCaso inválido' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();
    const data = await listarMovimientosDelCaso(db, idCaso);
    return NextResponse.json(data);
  } catch (err) {
    console.error('/api/desembolsos/casos/:idCaso/movimientos GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
