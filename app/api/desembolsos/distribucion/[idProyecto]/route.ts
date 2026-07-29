import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { distribucionPorProyecto } from '@/lib/desembolsos/distribucion';

export const dynamic = 'force-dynamic';

/** GET /api/desembolsos/distribucion/:idProyecto — histórico completo. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ idProyecto: string }> },
) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { idProyecto: raw } = await params;
  const idProyecto = Number(raw);
  if (!Number.isInteger(idProyecto) || idProyecto <= 0) {
    return NextResponse.json({ error: 'idProyecto inválido' }, { status: 400 });
  }
  try {
    const db = await getAdelanteDb();
    const data = await distribucionPorProyecto(db, idProyecto);
    if (!data) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    console.error('/api/desembolsos/distribucion/[idProyecto] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
