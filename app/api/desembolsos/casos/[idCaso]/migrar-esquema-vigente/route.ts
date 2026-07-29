import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { migrarEsquemaVigente } from '@/lib/desembolsos/casos';

export const dynamic = 'force-dynamic';

/**
 * POST /api/desembolsos/casos/:idCaso/migrar-esquema-vigente — sincroniza los
 * hitos del caso con el esquema vigente del banco. Idempotente. Errores del SP
 * (53100/53101) llegan como 400 con mensaje legible.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ idCaso: string }> },
) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { idCaso: raw } = await params;
  const idCaso = Number(raw);
  if (!Number.isInteger(idCaso) || idCaso <= 0) {
    return NextResponse.json({ error: 'idCaso inválido' }, { status: 400 });
  }
  try {
    const db = await getAdelanteDb();
    const data = await migrarEsquemaVigente(db, idCaso, session.cedula ?? 'desembolsos');
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('/api/desembolsos/casos/[idCaso]/migrar-esquema-vigente POST error:', err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
