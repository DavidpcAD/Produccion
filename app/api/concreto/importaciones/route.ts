import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { listarImportaciones } from '@/lib/concreto/importaciones';

// GET /api/concreto/importaciones?limite=N&offset=N — historial paginado de
// ingestas de CSV, ordenado por fecha_archivo DESC.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const limiteRaw = sp.get('limite');
  const offsetRaw = sp.get('offset');
  const limite = limiteRaw ? parseInt(limiteRaw, 10) : undefined;
  const offset = offsetRaw ? parseInt(offsetRaw, 10) : undefined;

  try {
    const db = await getAdelanteDb();
    const res = await listarImportaciones(db, {
      limite: Number.isFinite(limite) ? limite : undefined,
      offset: Number.isFinite(offset) ? offset : undefined,
    });
    return NextResponse.json(res);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/importaciones GET error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
