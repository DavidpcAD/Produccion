import { NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import type { TipoCasa, SprintCatalogo, TipoCasaSprints } from '@/lib/avance/tipos-casa';
import { TIPOS } from '@/lib/avance/tipos-casa';

export const dynamic = 'force-dynamic';

/**
 * Tipos de casa — qué sprints (globales) participan en cada tipo de casa.
 * Portado de obrascontrol `tipos-casa.ts` (+ catálogo de `sprint.ts`).
 *
 *   GET /api/avance/tipos-casa → { tipos: TipoCasaSprints[], catalogo: SprintCatalogo[] }
 *
 * La secuencia editable de cada tipo se guarda con PUT /api/avance/tipos-casa/{tipo}.
 * El catálogo de sprints (obc.sprints_catalogo) se devuelve aquí mismo para que
 * la pantalla pinte las casillas sin un endpoint aparte.
 */

export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const db = await getAdelanteDb();

    // Sprints por tipo (obc.tipo_casa_sprints), en orden.
    const secQ = await db.request().query<{ tipo_casa: TipoCasa; sprint_global: number }>(`
      SELECT tipo_casa, sprint_global
      FROM obc.tipo_casa_sprints
      ORDER BY tipo_casa, orden
    `);

    // Descripción de cada tipo (obc.tipos_casa).
    const descQ = await db.request().query<{ codigo: TipoCasa; descripcion: string }>(`
      SELECT codigo, descripcion FROM obc.tipos_casa
    `);
    const descPorTipo = new Map<string, string>();
    for (const d of descQ.recordset) descPorTipo.set(d.codigo, d.descripcion);

    // Catálogo global de sprints activos (obc.sprints_catalogo).
    const catQ = await db.request().query<SprintCatalogo>(`
      SELECT numero_global, nombre, es_espera, categoria
      FROM obc.sprints_catalogo
      WHERE activo = 1
      ORDER BY numero_global
    `);

    const porTipo = new Map<TipoCasa, number[]>();
    for (const tc of TIPOS) porTipo.set(tc, []);
    for (const r of secQ.recordset) {
      const arr = porTipo.get(r.tipo_casa);
      if (arr) arr.push(r.sprint_global);
    }

    const tipos: TipoCasaSprints[] = TIPOS.map((tc) => ({
      tipo_casa: tc,
      descripcion: descPorTipo.get(tc) ?? null,
      sprints: porTipo.get(tc) ?? [],
    }));

    const catalogo: SprintCatalogo[] = catQ.recordset.map((c) => ({
      numero_global: c.numero_global,
      nombre: c.nombre,
      es_espera: !!c.es_espera,
      categoria: c.categoria,
    }));

    return NextResponse.json({ tipos, catalogo });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
