import { NextResponse } from 'next/server';
import { sesionMovil } from '@/lib/movil/sesion';
import { leerFotos, operadorMant } from '@/lib/movil/maquinaria';
import { errorDeTaller, esId, terminarOt, type LineaUsada } from '@/lib/movil/taller';

const UNA_SEMANA_MIN = 7 * 24 * 60; // tope de cordura

// POST → el mecánico termina la OT: cuánto duró, qué hizo y qué repuestos usó.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await sesionMovil(req, 'mecanico');
  if (auth.error) return auth.error;
  const { id } = await params;
  if (!esId(id)) return NextResponse.json({ error: 'Esa OT no existe.' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const duracionMinutos = Math.round(Number(body?.duracionMinutos));
  if (!Number.isFinite(duracionMinutos) || duracionMinutos <= 0) {
    return NextResponse.json({ error: 'Decí cuánto duró el trabajo.' }, { status: 400 });
  }
  if (duracionMinutos > UNA_SEMANA_MIN) return NextResponse.json({ error: 'Revisá cuánto duró: es más de una semana.' }, { status: 400 });
  const trabajoRealizado = typeof body?.trabajoRealizado === 'string' ? body.trabajoRealizado.trim().slice(0, 4000) : '';
  const h = body?.horometroCierre;
  const horometroCierre = h === null || h === undefined || h === '' ? null : Number(h);
  if (horometroCierre !== null && (!Number.isFinite(horometroCierre) || horometroCierre < 0)) {
    return NextResponse.json({ error: 'Revisá el horómetro.' }, { status: 400 });
  }
  const repuestos: LineaUsada[] = [];
  for (const l of Array.isArray(body?.repuestos) ? body.repuestos.slice(0, 50) : []) {
    const cantidad = Number(l?.cantidad);
    if (!esId(l?.repuestoId)) return NextResponse.json({ error: 'Uno de los repuestos no es válido.' }, { status: 400 });
    if (!Number.isFinite(cantidad) || cantidad <= 0) return NextResponse.json({ error: 'Cada repuesto tiene que llevar una cantidad mayor a cero.' }, { status: 400 });
    repuestos.push({ repuestoId: l.repuestoId, cantidad });
  }

  try {
    const yo = await operadorMant(auth.sesion, 'tecnico');
    const r = await terminarOt({ otId: id, yo, duracionMinutos, trabajoRealizado, horometroCierre, repuestos, fotos: leerFotos(body?.fotos) });
    return NextResponse.json({ ok: true, numero: r.numero });
  } catch (err) {
    const e = errorDeTaller('/api/movil/taller/ots/[id]/terminar', err, 'No se pudo terminar la OT.');
    return NextResponse.json(e.body, { status: e.status });
  }
}
