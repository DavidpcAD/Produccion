import { NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { desactivarProyeccion, mapDbError } from '@/lib/desembolsos/formalizacion';

export const dynamic = 'force-dynamic';

// DELETE /api/desembolsos/formalizacion/{idCaso} — devolver a "sin proyectar".
export async function DELETE(_req: Request, { params }: { params: Promise<{ idCaso: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const idCaso = Number((await params).idCaso);
  if (!Number.isInteger(idCaso) || idCaso <= 0) return NextResponse.json({ error: 'idCaso inválido' }, { status: 400 });
  try {
    const db = await getAdelanteDb();
    return NextResponse.json(await desactivarProyeccion(db, idCaso, session.cedula));
  } catch (e) {
    const { status, error } = mapDbError(e);
    return NextResponse.json({ error }, { status });
  }
}
