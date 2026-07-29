import { NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { listarProyectos } from '@/lib/desembolsos/reportes';

export const dynamic = 'force-dynamic';

// GET /api/desembolsos/reportes/proyectos — catálogo de proyectos (AdelanteDB)
// para los filtros de Valoración / Reportes.
export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const db = await getAdelanteDb();
    return NextResponse.json({ proyectos: await listarProyectos(db) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
