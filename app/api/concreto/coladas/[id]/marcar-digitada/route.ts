import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { marcarDigitada } from '@/lib/concreto/coladas-workflow';
import { obtenerColada } from '@/lib/concreto/coladas';

// POST /api/concreto/coladas/[id]/marcar-digitada — confirmada → digitada.
// Body: { numero_pedido_ensamblado_bc: string, obra_works_no?: string | null }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const idColada = Number(id);
  if (!Number.isInteger(idColada) || idColada <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }
  const actor = session.cedula || String(session.idUsuario || session.idCol);

  const body = await req.json().catch(() => ({}));
  const numeroPedido =
    typeof body?.numero_pedido_ensamblado_bc === 'string'
      ? body.numero_pedido_ensamblado_bc.trim()
      : '';
  if (!numeroPedido || numeroPedido.length > 50) {
    return NextResponse.json(
      { error: 'Se requiere numero_pedido_ensamblado_bc (1..50 caracteres).' },
      { status: 400 },
    );
  }
  let obraWorksNo: string | null | undefined;
  if (typeof body?.obra_works_no === 'string') {
    const w = body.obra_works_no.trim();
    obraWorksNo = w === '' ? null : w;
  } else if (body?.obra_works_no === null) {
    obraWorksNo = null;
  } else {
    obraWorksNo = undefined; // no especificado → mantiene la obra actual
  }

  try {
    const db = await getAdelanteDb();
    const r = await marcarDigitada(db, idColada, actor, numeroPedido, obraWorksNo);
    if (!r.ok) {
      return NextResponse.json({ error: r.error, codigo: r.codigo, ...r.extra }, { status: r.status });
    }
    const detalle = await obtenerColada(db, idColada);
    if (!detalle) return NextResponse.json({ error: 'Colada no encontrada' }, { status: 404 });
    return NextResponse.json(detalle);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/coladas/[id]/marcar-digitada error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
