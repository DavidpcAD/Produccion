import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import {
  ErrorEsclerometro,
  actualizarRebote,
  eliminarRebote,
} from '@/lib/concreto/esclerometro';
import type { ActualizarReboteRequest } from '@/lib/concreto/tipos-esclerometro';

function parsearId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// PATCH /api/concreto/lab/esclerometro/rebotes/[id] — edita un golpe.
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

  const datos: ActualizarReboteRequest = {};
  if (body.valor_rebote !== undefined) {
    const v = Number(body.valor_rebote);
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      return NextResponse.json({ error: 'valor_rebote inválido (0-100)' }, { status: 400 });
    }
    datos.valor_rebote = v;
  }
  if (body.numero_golpe !== undefined) {
    const n = Number(body.numero_golpe);
    if (!Number.isInteger(n) || n <= 0 || n > 99) {
      return NextResponse.json({ error: 'numero_golpe inválido (1-99)' }, { status: 400 });
    }
    datos.numero_golpe = n;
  }
  if (body.notas !== undefined) {
    datos.notas =
      body.notas === null || String(body.notas).trim() === ''
        ? null
        : String(body.notas).trim().slice(0, 300);
  }

  try {
    const db = await getAdelanteDb();
    await actualizarRebote(db, id, datos);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof ErrorEsclerometro) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/esclerometro/rebotes/[id] PATCH error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/concreto/lab/esclerometro/rebotes/[id] — borra un golpe.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id: idRaw } = await params;
  const id = parsearId(idRaw);
  if (id === null) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

  try {
    const db = await getAdelanteDb();
    await eliminarRebote(db, id);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof ErrorEsclerometro) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/esclerometro/rebotes/[id] DELETE error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
