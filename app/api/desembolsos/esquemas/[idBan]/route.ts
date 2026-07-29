import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { esquemaPorBanco } from '@/lib/desembolsos/esquemas';

export const dynamic = 'force-dynamic';

/** GET /api/desembolsos/esquemas/:idBan — histórico completo de un banco. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ idBan: string }> },
) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { idBan: raw } = await params;
  const idBan = Number(raw);
  if (!Number.isInteger(idBan) || idBan <= 0) {
    return NextResponse.json({ error: 'idBan inválido' }, { status: 400 });
  }
  try {
    const db = await getAdelanteDb();
    const data = await esquemaPorBanco(db, idBan);
    if (!data) return NextResponse.json({ error: 'Banco no encontrado' }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    console.error('/api/desembolsos/esquemas/[idBan] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
