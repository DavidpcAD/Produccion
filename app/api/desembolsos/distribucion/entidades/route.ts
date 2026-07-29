import { NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { listarEntidades } from '@/lib/desembolsos/distribucion';

export const dynamic = 'force-dynamic';

/** GET /api/desembolsos/distribucion/entidades — catálogo de entidades activas. */
export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const db = await getAdelanteDb();
    return NextResponse.json(await listarEntidades(db));
  } catch (err) {
    console.error('/api/desembolsos/distribucion/entidades GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
