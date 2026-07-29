import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { actualizarEnsayo, borrarEnsayo, ErrorLab } from '@/lib/concreto/lab-write';
import type { ActualizarEnsayoParams } from '@/lib/concreto/tipos-lab';

// PATCH /api/concreto/lab/ensayos/[id] — editar fecha_prueba / notas del ensayo.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const idEnsayo = Number(id);
  if (!Number.isInteger(idEnsayo) || idEnsayo <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const parcial: ActualizarEnsayoParams = {};
  if ('fecha_prueba' in body) {
    const fp = body.fecha_prueba;
    if (fp != null && typeof fp === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(fp)) {
      return NextResponse.json({ error: 'fecha_prueba inválida (YYYY-MM-DD)' }, { status: 400 });
    }
    parcial.fecha_prueba = (fp as string | null) ?? null;
  }
  if ('fecha_ajustada_motivo' in body) {
    parcial.fecha_ajustada_motivo = (body.fecha_ajustada_motivo as string | null) ?? null;
  }
  if ('notas' in body) parcial.notas = (body.notas as string | null) ?? null;

  try {
    const db = await getAdelanteDb();
    const actor = { oid: String(session.idUsuario || session.idCol), email: session.cedula };
    await actualizarEnsayo(db, idEnsayo, parcial, actor);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof ErrorLab) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/ensayos/[id] PATCH error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/concreto/lab/ensayos/[id] — borrar ensayo. Solo admin.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.nivelAdmin < 4) return NextResponse.json({ error: 'Prohibido' }, { status: 403 });

  const { id } = await params;
  const idEnsayo = Number(id);
  if (!Number.isInteger(idEnsayo) || idEnsayo <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();
    await borrarEnsayo(db, idEnsayo);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof ErrorLab) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/ensayos/[id] DELETE error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
