import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { ErrorConfig, actualizarActividad } from '@/lib/concreto/config';
import type { ActualizarActividadParams } from '@/lib/concreto/tipos-config';

// PATCH /api/concreto/lab/actividades/[id] — editar/activar actividad.
// Solo config (nivelAdmin >= 4).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.nivelAdmin < 4) return NextResponse.json({ error: 'Prohibido' }, { status: 403 });

  const { id } = await params;
  const idActividad = Number(id);
  if (!Number.isInteger(idActividad) || idActividad <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido (no es JSON)' }, { status: 400 });
  }

  // Parseo manual (sin zod), campo por campo.
  const cambios: ActualizarActividadParams = {};
  if (body.nombre !== undefined) {
    const nombre = String(body.nombre).trim();
    if (!nombre) return NextResponse.json({ error: 'nombre inválido' }, { status: 400 });
    cambios.nombre = nombre;
  }
  if (body.orden !== undefined) {
    const n = Number(body.orden);
    if (!Number.isInteger(n)) return NextResponse.json({ error: 'orden inválido' }, { status: 400 });
    cambios.orden = n;
  }
  if (body.activo !== undefined) cambios.activo = !!body.activo;

  try {
    const db = await getAdelanteDb();
    const data = await actualizarActividad(db, idActividad, cambios);
    return NextResponse.json({ data });
  } catch (err: unknown) {
    if (err instanceof ErrorConfig) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/actividades/[id] PATCH error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
