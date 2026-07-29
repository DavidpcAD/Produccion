import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { ErrorConfig, actualizarDensidad } from '@/lib/concreto/config';
import type { ActualizarDensidadParams } from '@/lib/concreto/tipos-config';

// PATCH /api/concreto/densidades/[clave] — editar densidad. Solo config (nivelAdmin >= 4).
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

  // Parseo manual (sin zod), campo por campo.
  const cambios: ActualizarDensidadParams = {};
  if (body.nombre !== undefined) {
    const nombre = String(body.nombre).trim();
    if (!nombre) return NextResponse.json({ error: 'nombre inválido' }, { status: 400 });
    cambios.nombre = nombre;
  }
  if (body.codigo_bc !== undefined) {
    cambios.codigo_bc = body.codigo_bc === null ? null : String(body.codigo_bc).trim();
  }
  if (body.densidad !== undefined) {
    const n = Number(body.densidad);
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json({ error: 'densidad inválida (debe ser > 0)' }, { status: 400 });
    }
    cambios.densidad = n;
  }
  if (body.unidad !== undefined) cambios.unidad = String(body.unidad).trim();
  if (body.notas !== undefined) {
    cambios.notas = body.notas === null ? null : String(body.notas).trim();
  }
  if (body.activo !== undefined) cambios.activo = !!body.activo;

  try {
    const db = await getAdelanteDb();
    const data = await actualizarDensidad(db, clave, cambios, {
      oid: String(session.idUsuario || session.idCol),
      email: session.cedula,
    });
    return NextResponse.json({ data });
  } catch (err: unknown) {
    if (err instanceof ErrorConfig) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/densidades/[clave] PATCH error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
