import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { ErrorConfig, crearDensidad, listarDensidades } from '@/lib/concreto/config';
import type { CrearDensidadParams } from '@/lib/concreto/tipos-config';

// GET /api/concreto/densidades — lista de densidades de materiales (cualquier sesión).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const db = await getAdelanteDb();
    const data = await listarDensidades(db);
    return NextResponse.json({ data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/densidades GET error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/concreto/densidades — crear densidad. Solo config (nivelAdmin >= 4).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.nivelAdmin < 4) return NextResponse.json({ error: 'Prohibido' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido (no es JSON)' }, { status: 400 });
  }

  // Parseo manual (sin zod). clave: snake_case obligatorio; densidad > 0.
  const clave = String(body.clave ?? '').trim();
  if (!clave || !/^[a-z0-9_]+$/.test(clave)) {
    return NextResponse.json(
      { error: 'clave inválida (solo letras minúsculas, dígitos y guion bajo)' },
      { status: 400 },
    );
  }
  const nombre = String(body.nombre ?? '').trim();
  if (!nombre) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 });
  const densidad = Number(body.densidad);
  if (!Number.isFinite(densidad) || densidad <= 0) {
    return NextResponse.json({ error: 'densidad inválida (debe ser > 0)' }, { status: 400 });
  }

  const params: CrearDensidadParams = {
    clave,
    nombre,
    densidad,
    unidad: body.unidad !== undefined ? String(body.unidad).trim() : 'kg/m³',
    codigo_bc:
      body.codigo_bc === undefined || body.codigo_bc === null
        ? null
        : String(body.codigo_bc).trim(),
    notas: body.notas === undefined || body.notas === null ? null : String(body.notas).trim(),
  };

  try {
    const db = await getAdelanteDb();
    const data = await crearDensidad(db, params, {
      oid: String(session.idUsuario || session.idCol),
      email: session.cedula,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof ErrorConfig) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/densidades POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
