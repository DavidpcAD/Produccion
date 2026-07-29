import { NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { listarCasos } from '@/lib/desembolsos/casos';

export const dynamic = 'force-dynamic';

/** GET /api/desembolsos/casos — cartera operativa. */
export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const db = await getAdelanteDb();
    return NextResponse.json(await listarCasos(db));
  } catch (err) {
    console.error('/api/desembolsos/casos GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
