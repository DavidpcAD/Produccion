import { NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { listarActividades } from '@/lib/concreto/lab';

// GET /api/concreto/lab/actividades — catálogo de actividades (para filtros).
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const db = await getAdelanteDb();
    const data = await listarActividades(db, true);
    return NextResponse.json({ data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/actividades GET error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// TODO(concreto): POST/PUT gestión de actividades (crearActividad /
// actualizarActividad) — solo Admin, en la app original.
