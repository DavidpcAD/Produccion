import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { asignarObra } from '@/lib/concreto/coladas-workflow';
import { obtenerColada } from '@/lib/concreto/coladas';

// POST /api/concreto/coladas/[id]/asignar-obra — set/cambia/quita obra.
// Body: { obra_works_no: string | null }  (null limpia la obra)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const idColada = Number(id);
  if (!Number.isInteger(idColada) || idColada <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  let obraWorksNo: string | null;
  if (body?.obra_works_no === null || body?.obra_works_no === undefined) {
    obraWorksNo = null;
  } else if (typeof body.obra_works_no === 'string') {
    const w = body.obra_works_no.trim();
    if (w.length > 20) {
      return NextResponse.json({ error: 'obra_works_no inválido (máx 20).' }, { status: 400 });
    }
    obraWorksNo = w === '' ? null : w;
  } else {
    return NextResponse.json({ error: 'obra_works_no inválido.' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();
    const r = await asignarObra(db, idColada, obraWorksNo);
    if (!r.ok) {
      return NextResponse.json({ error: r.error, codigo: r.codigo, ...r.extra }, { status: r.status });
    }
    const detalle = await obtenerColada(db, idColada);
    if (!detalle) return NextResponse.json({ error: 'Colada no encontrada' }, { status: 404 });
    return NextResponse.json(detalle);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/coladas/[id]/asignar-obra error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
