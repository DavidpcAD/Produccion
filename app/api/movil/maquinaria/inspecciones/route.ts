import { NextResponse } from 'next/server';
import { sesionMovil } from '@/lib/movil/sesion';
import { checklistDelEquipo, equipoAsignado, guardarInspeccion, operadorMant, type RespuestaItem } from '@/lib/movil/maquinaria';

// Guarda el checklist completo de una máquina. Cada punto tiene que venir
// respondido (Bien, o Falla con lo que se encontró): la app no deja avanzar sin
// responder, y acá se vuelve a comprobar contra los puntos de la base.
export async function POST(req: Request) {
  const auth = await sesionMovil(req, 'maquinaria');
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => null);
  const equipoId = typeof body?.equipoId === 'string' ? body.equipoId : '';
  const respuestas: unknown[] = Array.isArray(body?.checklist) ? body.checklist : [];
  const horometroCrudo = body?.horometro;
  const horometro = horometroCrudo == null || horometroCrudo === '' ? null : Number(horometroCrudo);
  if (horometro != null && (!Number.isFinite(horometro) || horometro < 0 || horometro > 1_000_000)) {
    return NextResponse.json({ error: 'El horómetro no es un número válido.' }, { status: 400 });
  }

  try {
    const op = await operadorMant(auth.sesion);
    if (!(await equipoAsignado(op.id, equipoId))) {
      return NextResponse.json({ error: 'Esa máquina no está asignada a vos.' }, { status: 403 });
    }
    const items = await checklistDelEquipo(equipoId);
    const porId = new Map<string, { hecho: boolean; observacion: string }>();
    for (const r of respuestas) {
      const o = r as { itemId?: unknown; hecho?: unknown; observacion?: unknown };
      if (typeof o?.itemId !== 'string' || typeof o.hecho !== 'boolean') continue;
      porId.set(o.itemId.toUpperCase(), { hecho: o.hecho, observacion: typeof o.observacion === 'string' ? o.observacion.trim().slice(0, 1000) : '' });
    }
    const checklist: RespuestaItem[] = [];
    for (const it of items) {
      const r = porId.get(it.id);
      if (!r) return NextResponse.json({ error: `Falta responder «${it.titulo}».` }, { status: 400 });
      if (!r.hecho && !r.observacion) return NextResponse.json({ error: `Contá qué problema tiene «${it.titulo}».` }, { status: 400 });
      checklist.push({ itemId: it.id, titulo: it.titulo, hecho: r.hecho, ...(r.observacion ? { observacion: r.observacion } : {}) });
    }
    const id = await guardarInspeccion({ equipoId, usuarioId: op.id, horometro, checklist });
    return NextResponse.json({ id, fallas: checklist.filter((c) => !c.hecho).length });
  } catch (err) {
    console.error('/api/movil/maquinaria/inspecciones:', err);
    return NextResponse.json({ error: 'No se pudo guardar el checklist. Probá de nuevo.' }, { status: 500 });
  }
}
