import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { buscarCasos } from '@/lib/desembolsos/casos';

export const dynamic = 'force-dynamic';

/**
 * GET /api/desembolsos/casos/buscar?q=texto&soloVigentes=1 — búsqueda libre de
 * casos (cualquier estado). q debe tener al menos 2 caracteres.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const sp = new URL(req.url).searchParams;
  const q = (sp.get('q') ?? '').trim();
  const soloVigentes = sp.get('soloVigentes') === '1';
  if (q.length < 2) {
    return NextResponse.json({ error: 'q debe tener al menos 2 caracteres' }, { status: 400 });
  }
  try {
    const db = await getAdelanteDb();
    const casos = await buscarCasos(db, q, soloVigentes);
    return NextResponse.json({ casos });
  } catch (err) {
    console.error('/api/desembolsos/casos/buscar GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
