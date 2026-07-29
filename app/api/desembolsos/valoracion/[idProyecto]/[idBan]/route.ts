import { NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { historicoPorProyectoBanco, mapDbError } from '@/lib/desembolsos/valoracion';

export const dynamic = 'force-dynamic';

// GET /api/desembolsos/valoracion/{idProyecto}/{idBan} — histórico completo.
export async function GET(_req: Request, { params }: { params: Promise<{ idProyecto: string; idBan: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const p = await params;
  const idProyecto = Number(p.idProyecto);
  const idBan = Number(p.idBan);
  if (!Number.isInteger(idProyecto) || idProyecto <= 0) return NextResponse.json({ error: 'idProyecto inválido' }, { status: 400 });
  if (!Number.isInteger(idBan) || idBan <= 0) return NextResponse.json({ error: 'idBan inválido' }, { status: 400 });
  try {
    const db = await getAdelanteDb();
    return NextResponse.json(await historicoPorProyectoBanco(db, idProyecto, idBan));
  } catch (e) {
    const { status, error } = mapDbError(e);
    return NextResponse.json({ error }, { status });
  }
}
