import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { actualizarMedicion, borrarMedicion, ErrorLab } from '@/lib/concreto/lab-write';
import type { ActualizarMedicionParams } from '@/lib/concreto/tipos-lab';

// PATCH /api/concreto/lab/mediciones/[id] — editar una probeta.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const idMedicion = Number(id);
  if (!Number.isInteger(idMedicion) || idMedicion <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const parcial: ActualizarMedicionParams = {};
  if ('resistencia_mpa' in body) {
    const mpa = Number(body.resistencia_mpa);
    if (!Number.isFinite(mpa) || mpa <= 0 || mpa > 200) {
      return NextResponse.json({ error: 'resistencia_mpa inválida (0-200)' }, { status: 400 });
    }
    parcial.resistencia_mpa = mpa;
  }
  if ('orden' in body) {
    const orden = Number(body.orden);
    if (!Number.isInteger(orden) || orden <= 0) {
      return NextResponse.json({ error: 'orden inválido' }, { status: 400 });
    }
    parcial.orden = orden;
  }
  if ('notas' in body) parcial.notas = (body.notas as string | null) ?? null;

  try {
    const db = await getAdelanteDb();
    await actualizarMedicion(db, idMedicion, parcial);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof ErrorLab) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/mediciones/[id] PATCH error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/concreto/lab/mediciones/[id] — borrar una probeta. Solo admin.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.nivelAdmin < 4) return NextResponse.json({ error: 'Prohibido' }, { status: 403 });

  const { id } = await params;
  const idMedicion = Number(id);
  if (!Number.isInteger(idMedicion) || idMedicion <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();
    await borrarMedicion(db, idMedicion);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof ErrorLab) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/mediciones/[id] DELETE error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
