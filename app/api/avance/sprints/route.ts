import { NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import type { SprintCatalogoDetalle } from '@/lib/avance/sprints';

export const dynamic = 'force-dynamic';

/**
 * Catálogo global de sprints (obc.sprints_catalogo). Portado de obrascontrol
 * `sprint.ts` (GET /api/sprints).
 *   GET /api/avance/sprints → { sprints: SprintCatalogoDetalle[] }
 *
 * Incluye el nº de sub-partidas críticas activas de cada sprint para que la
 * pantalla lo muestre sin un endpoint aparte. Marcar/desmarcar "de espera" se
 * hace con PATCH /api/avance/sprints/{numero}.
 */
export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const db = await getAdelanteDb();
    const r = await db.request().query<SprintCatalogoDetalle>(`
      SELECT sc.id, sc.codigo, sc.numero_global, sc.nombre, sc.descripcion,
             sc.categoria, sc.es_espera,
             (SELECT COUNT(*)
                FROM obc.sub_partidas sp
               WHERE sp.sprint_numero = sc.numero_global
                 AND sp.es_critica = 1 AND sp.activo = 1) AS criticas
      FROM obc.sprints_catalogo sc
      WHERE sc.activo = 1
      ORDER BY sc.numero_global
    `);
    const sprints: SprintCatalogoDetalle[] = r.recordset.map((s) => ({
      id: Number(s.id),
      codigo: s.codigo,
      numero_global: s.numero_global,
      nombre: s.nombre,
      descripcion: s.descripcion ?? null,
      categoria: s.categoria,
      es_espera: !!s.es_espera,
      criticas: Number(s.criticas ?? 0),
    }));
    return NextResponse.json({ sprints });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
