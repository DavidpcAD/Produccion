import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { listarObras } from '@/lib/concreto/coladas-workflow';

// GET /api/concreto/obras — lista desde bi.dim_obra para el picker de asignar
// obra. Params: q (búsqueda), solo_activas (default true), limite (default 200).
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const q = sp.get('q');
  const soloActivasRaw = sp.get('solo_activas');
  const limiteRaw = sp.get('limite');

  const limite = limiteRaw ? Math.min(500, Math.max(1, parseInt(limiteRaw, 10) || 200)) : 200;
  // solo_activas default true; solo se desactiva con 'false' explícito.
  const solo_activas = soloActivasRaw === null ? true : soloActivasRaw !== 'false';

  try {
    const db = await getAdelanteDb();
    const obras = await listarObras(db, {
      q: q && q.trim() !== '' ? q.trim() : undefined,
      solo_activas,
      limite,
    });
    return NextResponse.json({ obras, total: obras.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/obras error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
