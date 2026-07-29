import { NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { listarBancos } from '@/lib/desembolsos/dashboard';

export const dynamic = 'force-dynamic';

/** GET /api/desembolsos/bancos — catálogo de bancos para los filtros. */
export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const db = await getAdelanteDb();
    const bancos = await listarBancos(db);
    return NextResponse.json({ bancos });
  } catch (err) {
    console.error('/api/desembolsos/bancos GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
