import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import type { Proyecto } from '@/lib/avance/types';

/**
 * GET /api/avance/proyectos
 * Lista los proyectos visibles para el módulo desde `obc.vw_proyectos`.
 * Por defecto solo Ciudad del Valle con desarrollos activos (o que tengan
 * obras habilitadas en obc.obra_estado); `?todos=true` devuelve todos.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const todos = new URL(req.url).searchParams.get('todos') === 'true';
  const db = await getAdelanteDb();

  const query = todos
    ? `SELECT id, codigo, nombre, categoria, es_desarrollo, es_homes, es_ventas, color_hex
       FROM obc.vw_proyectos
       ORDER BY codigo`
    : `SELECT id, codigo, nombre, categoria, es_desarrollo, es_homes, es_ventas, color_hex
       FROM obc.vw_proyectos
       WHERE categoria = 'Ciudad del Valle'
         AND (
           es_desarrollo = 1
           OR codigo COLLATE DATABASE_DEFAULT IN (
             SELECT DISTINCT LEFT(obra_codigo, CHARINDEX('-', obra_codigo) - 1) COLLATE DATABASE_DEFAULT
             FROM obc.obra_estado
             WHERE CHARINDEX('-', obra_codigo) > 1
           )
         )
       ORDER BY codigo`;

  try {
    const result = await db.request().query<Proyecto>(query);
    return NextResponse.json({ data: result.recordset });
  } catch (err) {
    console.error('/api/avance/proyectos error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
