import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { listarActividades } from '@/lib/concreto/lab';
import { ErrorConfig, crearActividad } from '@/lib/concreto/config';

// GET /api/concreto/lab/actividades — catálogo de actividades (para filtros).
// Con ?incluye_inactivas=true trae también las desactivadas (para configuración).
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const incluyeInactivas = req.nextUrl.searchParams.get('incluye_inactivas') === 'true';
  try {
    const db = await getAdelanteDb();
    const data = await listarActividades(db, !incluyeInactivas);
    return NextResponse.json({ data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/actividades GET error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/concreto/lab/actividades — crear actividad. Solo config (nivelAdmin >= 4).
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

  // Parseo manual (sin zod).
  const nombre = String(body.nombre ?? '').trim();
  if (!nombre) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 });
  let orden = 0;
  if (body.orden !== undefined) {
    const n = Number(body.orden);
    if (!Number.isInteger(n)) return NextResponse.json({ error: 'orden inválido' }, { status: 400 });
    orden = n;
  }

  try {
    const db = await getAdelanteDb();
    const data = await crearActividad(db, { nombre, orden });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof ErrorConfig) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/actividades POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
