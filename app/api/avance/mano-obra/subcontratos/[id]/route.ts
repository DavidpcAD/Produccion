import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/avance/mano-obra/subcontratos/{id} — elimina un subcontrato.
 * Portado de obrascontrol `mano-obra.ts`.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }
  try {
    const db = await getAdelanteDb();
    await db
      .request()
      .input('id', sql.BigInt, id)
      .query('DELETE FROM pro_obc.mo_subcontratos WHERE id = @id');
    return NextResponse.json({ ok: true, id });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
