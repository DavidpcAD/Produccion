import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { consultarColadas } from '@/lib/concreto/coladas';
import { ESTADOS_COLADA } from '@/lib/concreto/estados';
import type { EstadoColada } from '@/lib/concreto/tipos';

// GET /api/concreto/coladas — listado paginado con filtros.
// TODO(concreto): login por PIN de laboratorio (pro_lab.pin_acceso) de la app
// original; hoy basta con sesión válida bajo (protected).
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const estadoRaw = sp.getAll('estado').filter((e): e is EstadoColada =>
    (ESTADOS_COLADA as string[]).includes(e),
  );
  const idPlanta = sp.get('id_planta');
  const desde = sp.get('desde');
  const hasta = sp.get('hasta');
  const q = sp.get('q');
  const pagina = Math.max(1, parseInt(sp.get('pagina') || '1', 10) || 1);
  const porPagina = Math.min(500, Math.max(1, parseInt(sp.get('por_pagina') || '50', 10) || 50));

  try {
    const db = await getAdelanteDb();
    const res = await consultarColadas(db, {
      estado: estadoRaw.length ? estadoRaw : undefined,
      id_planta: idPlanta ? Number(idPlanta) : undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
      q: q || undefined,
      pagina,
      por_pagina: porPagina,
    });
    return NextResponse.json(res);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/coladas GET error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// TODO(concreto): POST/transiciones de estado de colada (confirmar, digitar,
// cerrar, anular), consolidar sugeridas y crear pedido de ensamblado en BC.
// En la app original: coladas-consolidar.ts, coladas-transiciones.ts,
// coladas-crear-pedido-bc.ts (dependen del cliente BC / Graph — diferido).
