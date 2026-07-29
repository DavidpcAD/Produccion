import { NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { desvincularMov, mapDbError } from '@/lib/desembolsos/pagos-cliente';

export const dynamic = 'force-dynamic';

// DELETE /api/desembolsos/pagos-cliente/links/{idLink} — desvincular.
export async function DELETE(_req: Request, { params }: { params: Promise<{ idLink: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const idLink = Number((await params).idLink);
  if (!Number.isInteger(idLink) || idLink <= 0) return NextResponse.json({ error: 'idLink inválido' }, { status: 400 });
  try {
    const db = await getAdelanteDb();
    await desvincularMov(db, idLink, session.cedula);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const { status, error } = mapDbError(e);
    return NextResponse.json({ error }, { status });
  }
}
