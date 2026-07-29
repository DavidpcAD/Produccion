import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import {
  ErrorEsclerometro,
  actualizarEnsayo,
  eliminarEnsayo,
  obtenerEnsayo,
} from '@/lib/concreto/esclerometro';
import type { ActualizarEnsayoEsclerometroRequest } from '@/lib/concreto/tipos-esclerometro';
import { ANGULOS_IMPACTO } from '@/lib/concreto/tipos-esclerometro';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parsearId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// GET /api/concreto/lab/esclerometro/[id] — detalle: header + rebotes +
// promedio calculado.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id: idRaw } = await params;
  const id = parsearId(idRaw);
  if (id === null) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

  try {
    const db = await getAdelanteDb();
    const det = await obtenerEnsayo(db, id);
    if (!det) return NextResponse.json({ error: 'Ensayo no encontrado' }, { status: 404 });
    return NextResponse.json(det);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/esclerometro/[id] GET error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/concreto/lab/esclerometro/[id] — actualiza campos del header.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id: idRaw } = await params;
  const id = parsearId(idRaw);
  if (id === null) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body inválido (no es JSON)' }, { status: 400 });
  }

  const datos: ActualizarEnsayoEsclerometroRequest = {};

  if (body.fecha !== undefined) {
    const fecha = String(body.fecha);
    if (!ISO_DATE.test(fecha)) {
      return NextResponse.json({ error: 'fecha inválida (YYYY-MM-DD)' }, { status: 400 });
    }
    datos.fecha = fecha;
  }
  if (body.elemento_estructural !== undefined) {
    const el = String(body.elemento_estructural).trim();
    if (el.length === 0 || el.length > 100) {
      return NextResponse.json({ error: 'elemento_estructural inválido (1-100)' }, { status: 400 });
    }
    datos.elemento_estructural = el;
  }
  if (body.angulo_impacto !== undefined) {
    const a = Number(body.angulo_impacto);
    if (!Number.isInteger(a) || !(ANGULOS_IMPACTO as readonly number[]).includes(a)) {
      return NextResponse.json({ error: 'angulo_impacto inválido' }, { status: 400 });
    }
    datos.angulo_impacto = a;
  }
  if (body.edad_dias !== undefined) {
    if (body.edad_dias === null || body.edad_dias === '') {
      datos.edad_dias = null;
    } else {
      const e = Number(body.edad_dias);
      if (!Number.isInteger(e) || e <= 0 || e > 3650) {
        return NextResponse.json({ error: 'edad_dias inválida (1-3650)' }, { status: 400 });
      }
      datos.edad_dias = e;
    }
  }

  const strOrNull = (v: unknown, max: number): string | null => {
    if (v === null) return null;
    const s = String(v).trim();
    return s === '' ? null : s.slice(0, max);
  };
  if (body.obra_works_no !== undefined) datos.obra_works_no = strOrNull(body.obra_works_no, 20);
  if (body.id_casa !== undefined) datos.id_casa = strOrNull(body.id_casa, 50);
  if (body.equipo_serial !== undefined) datos.equipo_serial = strOrNull(body.equipo_serial, 50);
  if (body.notas !== undefined) datos.notas = strOrNull(body.notas, 2000);

  try {
    const db = await getAdelanteDb();
    const det = await actualizarEnsayo(db, id, datos);
    return NextResponse.json(det);
  } catch (err: unknown) {
    if (err instanceof ErrorEsclerometro) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/esclerometro/[id] PATCH error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/concreto/lab/esclerometro/[id] — solo admin. Borra el ensayo y
// sus rebotes (CASCADE).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'Solo administradores pueden eliminar' }, { status: 403 });
  }

  const { id: idRaw } = await params;
  const id = parsearId(idRaw);
  if (id === null) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

  try {
    const db = await getAdelanteDb();
    await eliminarEnsayo(db, id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof ErrorEsclerometro) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/esclerometro/[id] DELETE error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
