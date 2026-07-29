import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { anular } from '@/lib/concreto/coladas-workflow';
import { obtenerColada } from '@/lib/concreto/coladas';

// POST /api/concreto/coladas/[id]/anular — * (no cerrada) → anulada.
// Solo admin (nivelAdmin >= 4). Body: { motivo_anulacion: string }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.nivelAdmin < 4) return NextResponse.json({ error: 'Solo admin' }, { status: 403 });

  const { id } = await params;
  const idColada = Number(id);
  if (!Number.isInteger(idColada) || idColada <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }
  const actor = session.cedula || String(session.idUsuario || session.idCol);

  const body = await req.json().catch(() => ({}));
  const motivo = typeof body?.motivo_anulacion === 'string' ? body.motivo_anulacion.trim() : '';
  if (!motivo || motivo.length > 2000) {
    return NextResponse.json(
      { error: 'Se requiere motivo_anulacion (1..2000 caracteres).' },
      { status: 400 },
    );
  }

  try {
    const db = await getAdelanteDb();
    const r = await anular(db, idColada, actor, motivo);
    if (!r.ok) {
      return NextResponse.json({ error: r.error, codigo: r.codigo, ...r.extra }, { status: r.status });
    }
    const detalle = await obtenerColada(db, idColada);
    if (!detalle) return NextResponse.json({ error: 'Colada no encontrada' }, { status: 404 });
    return NextResponse.json(detalle);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/coladas/[id]/anular error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
