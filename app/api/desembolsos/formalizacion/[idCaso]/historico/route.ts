import { NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { listarHistorico, mapDbError } from '@/lib/desembolsos/formalizacion';

export const dynamic = 'force-dynamic';

// GET /api/desembolsos/formalizacion/{idCaso}/historico — versiones anteriores.
export async function GET(_req: Request, { params }: { params: Promise<{ idCaso: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const idCaso = Number((await params).idCaso);
  if (!Number.isInteger(idCaso) || idCaso <= 0) return NextResponse.json({ error: 'idCaso inválido' }, { status: 400 });
  try {
    const db = await getAdelanteDb();
    return NextResponse.json({ versiones: await listarHistorico(db, idCaso) });
  } catch (e) {
    const { status, error } = mapDbError(e);
    return NextResponse.json({ error }, { status });
  }
}
