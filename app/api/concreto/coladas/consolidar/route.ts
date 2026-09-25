import { NextRequest, NextResponse } from 'next/server';
import { mensajeParaCliente } from '@/lib/errores';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { guardConcreto, esRechazo } from '@/lib/concreto/guard';
import { consolidar } from '@/lib/concreto/coladas-workflow';
import { obtenerColada } from '@/lib/concreto/coladas';

// POST /api/concreto/coladas/consolidar — fusiona 2..20 coladas 'sugerida' de
// la misma planta en la de id más bajo. Body: { ids: number[] }
export async function POST(req: NextRequest) {
  const session = await guardConcreto();
  if (esRechazo(session)) return session;
  const actor = session.cedula || String(session.idUsuario || session.idCol);

  const body = await req.json().catch(() => ({}));
  const idsRaw = Array.isArray(body?.ids) ? body.ids : body?.ids_a_consolidar;
  if (!Array.isArray(idsRaw)) {
    return NextResponse.json({ error: 'Se requiere ids: number[].' }, { status: 400 });
  }
  const ids = idsRaw
    .map((n: unknown) => Number(n))
    .filter((n: number) => Number.isInteger(n) && n > 0);
  if (ids.length < 2) {
    return NextResponse.json(
      { error: 'Se requieren al menos 2 ids de colada válidos.' },
      { status: 400 },
    );
  }

  try {
    const db = await getAdelanteDb();
    const r = await consolidar(db, ids, actor);
    if (!r.ok) {
      return NextResponse.json({ error: r.error, codigo: r.codigo, ...r.extra }, { status: r.status });
    }
    const detalle = await obtenerColada(db, r.idPrincipal!);
    if (!detalle) return NextResponse.json({ error: 'Colada no encontrada' }, { status: 404 });
    return NextResponse.json(detalle);
  } catch (err: unknown) {
    const msg = mensajeParaCliente(err);
    console.error('/api/concreto/coladas/consolidar error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
