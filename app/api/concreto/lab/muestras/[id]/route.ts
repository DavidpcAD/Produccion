import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { obtenerMuestra } from '@/lib/concreto/lab';
import { actualizarMuestra, borrarMuestra, ErrorLab } from '@/lib/concreto/lab-write';
import type { ActualizarMuestraParams } from '@/lib/concreto/tipos-lab';

// GET /api/concreto/lab/muestras/[id] — detalle: header + ensayos + mediciones.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const idMuestra = Number(id);
  if (!Number.isInteger(idMuestra) || idMuestra <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();
    const muestra = await obtenerMuestra(db, idMuestra);
    if (!muestra) return NextResponse.json({ error: 'Muestra no encontrada' }, { status: 404 });
    return NextResponse.json(muestra);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/muestras/[id] GET error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/concreto/lab/muestras/[id] — editar la muestra (campos parciales).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const idMuestra = Number(id);
  if (!Number.isInteger(idMuestra) || idMuestra <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  // Solo agregamos las claves presentes en el body (para no pisar con null lo
  // que el usuario no envió). Los números se coercen; el resto pasa tal cual.
  const parcial: ActualizarMuestraParams = {};
  const asignarStr = (k: keyof ActualizarMuestraParams) => {
    if (k in body) (parcial as Record<string, unknown>)[k] = body[k] ?? null;
  };
  const asignarNum = (k: keyof ActualizarMuestraParams) => {
    if (k in body) (parcial as Record<string, unknown>)[k] = body[k] != null ? Number(body[k]) : null;
  };
  asignarStr('obra_works_no');
  asignarStr('id_casa');
  asignarStr('planta_nombre');
  asignarNum('id_actividad');
  asignarStr('fecha_colado');
  asignarStr('proveedor');
  asignarNum('id_colada');
  asignarNum('id_receta_bc');
  asignarNum('fc_objetivo');
  asignarStr('categoria_concreto');
  asignarStr('tipo_concreto_libre');
  asignarStr('notas');

  try {
    const db = await getAdelanteDb();
    const detalle = await actualizarMuestra(db, idMuestra, parcial);
    return NextResponse.json(detalle);
  } catch (err: unknown) {
    if (err instanceof ErrorLab) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/muestras/[id] PATCH error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/concreto/lab/muestras/[id] — borrar muestra (CASCADE). Solo admin.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.nivelAdmin < 4) return NextResponse.json({ error: 'Prohibido' }, { status: 403 });

  const { id } = await params;
  const idMuestra = Number(id);
  if (!Number.isInteger(idMuestra) || idMuestra <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();
    await borrarMuestra(db, idMuestra);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof ErrorLab) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/muestras/[id] DELETE error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
