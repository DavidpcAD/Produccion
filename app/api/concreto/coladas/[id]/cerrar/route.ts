import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { cerrar } from '@/lib/concreto/coladas-workflow';
import { obtenerColada } from '@/lib/concreto/coladas';

// POST /api/concreto/coladas/[id]/cerrar — digitada → cerrada (FINAL).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const idColada = Number(id);
  if (!Number.isInteger(idColada) || idColada <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }
  const actor = session.cedula || String(session.idUsuario || session.idCol);

  try {
    const db = await getAdelanteDb();
    const r = await cerrar(db, idColada, actor);
    if (!r.ok) {
      return NextResponse.json({ error: r.error, codigo: r.codigo, ...r.extra }, { status: r.status });
    }
    const detalle = await obtenerColada(db, idColada);
    if (!detalle) return NextResponse.json({ error: 'Colada no encontrada' }, { status: 404 });
    return NextResponse.json(detalle);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/coladas/[id]/cerrar error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
