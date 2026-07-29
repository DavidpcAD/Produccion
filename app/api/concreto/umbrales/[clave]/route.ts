import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { ErrorConfig, actualizarUmbral } from '@/lib/concreto/config';
import { COMPARADORES_UMBRAL, type ActualizarUmbralParams } from '@/lib/concreto/tipos-config';

// PATCH /api/concreto/umbrales/[clave] — editar un umbral de alerta.
// Solo config (nivelAdmin >= 4).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ clave: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.nivelAdmin < 4) return NextResponse.json({ error: 'Prohibido' }, { status: 403 });

  const { clave: claveParam } = await params;
  const clave = (claveParam ?? '').trim();
  if (!clave) return NextResponse.json({ error: 'Clave vacía' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido (no es JSON)' }, { status: 400 });
  }

  // Parseo manual (sin zod) del cuerpo, campo por campo.
  const cambios: ActualizarUmbralParams = {};
  if (body.umbral !== undefined) {
    const n = Number(body.umbral);
    if (!Number.isFinite(n)) return NextResponse.json({ error: 'umbral inválido' }, { status: 400 });
    cambios.umbral = n;
  }
  if (body.comparador !== undefined) {
    if (!COMPARADORES_UMBRAL.includes(body.comparador as (typeof COMPARADORES_UMBRAL)[number])) {
      return NextResponse.json({ error: 'comparador inválido' }, { status: 400 });
    }
    cambios.comparador = body.comparador as (typeof COMPARADORES_UMBRAL)[number];
  }
  if (body.activo !== undefined) cambios.activo = !!body.activo;
  if (body.descripcion !== undefined) {
    cambios.descripcion = body.descripcion === null ? null : String(body.descripcion);
  }
  if (body.unidad !== undefined) {
    cambios.unidad = body.unidad === null ? null : String(body.unidad);
  }

  try {
    const db = await getAdelanteDb();
    const data = await actualizarUmbral(db, clave, cambios, {
      oid: String(session.idUsuario || session.idCol),
      email: session.cedula,
    });
    return NextResponse.json({ data });
  } catch (err: unknown) {
    if (err instanceof ErrorConfig) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/umbrales/[clave] PATCH error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
