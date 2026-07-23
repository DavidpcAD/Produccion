import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { consultarMuestras } from '@/lib/concreto/lab';

// GET /api/concreto/lab/muestras — listado paginado de muestras de laboratorio.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const idActividad = sp.get('id_actividad');
  const fcObjetivo = sp.get('fc_objetivo');
  const obra = sp.get('obra_works_no');
  const desde = sp.get('desde');
  const hasta = sp.get('hasta');
  const q = sp.get('q');
  const pagina = Math.max(1, parseInt(sp.get('pagina') || '1', 10) || 1);
  const porPagina = Math.min(500, Math.max(1, parseInt(sp.get('por_pagina') || '50', 10) || 50));

  try {
    const db = await getAdelanteDb();
    const res = await consultarMuestras(db, {
      obra_works_no: obra || undefined,
      id_actividad: idActividad ? Number(idActividad) : undefined,
      fc_objetivo: fcObjetivo ? Number(fcObjetivo) : undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
      q: q || undefined,
      pagina,
      por_pagina: porPagina,
    });
    return NextResponse.json(res);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/muestras GET error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// TODO(concreto): POST crear muestra + ensayos + mediciones (crearMuestra /
// crearEnsayo / crearMedicion en la app original), esclerómetro
// (esclerometro.ts) y fotos de muestra (Azure Blob — diferido).
