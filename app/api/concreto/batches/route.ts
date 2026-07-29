import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { consultarBatches } from '@/lib/concreto/batches';

// GET /api/concreto/batches — listado de batches con datos crudos de planta,
// para análisis de calidad. Filtros: id_colada, id_planta, desde/hasta, q,
// solo_anomalias + paginación.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const idColada = sp.get('id_colada');
  const idPlanta = sp.get('id_planta');
  const desde = sp.get('desde');
  const hasta = sp.get('hasta');
  const q = sp.get('q');
  const soloAnomalias = sp.get('solo_anomalias');
  const pagina = Math.max(1, parseInt(sp.get('pagina') || '1', 10) || 1);
  const porPagina = Math.min(500, Math.max(1, parseInt(sp.get('por_pagina') || '100', 10) || 100));

  try {
    const db = await getAdelanteDb();
    const res = await consultarBatches(db, {
      id_colada: idColada ? Number(idColada) : undefined,
      id_planta: idPlanta ? Number(idPlanta) : undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
      q: q || undefined,
      solo_anomalias: soloAnomalias === '1' || soloAnomalias === 'true',
      pagina,
      por_pagina: porPagina,
    });
    return NextResponse.json(res);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/batches GET error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
