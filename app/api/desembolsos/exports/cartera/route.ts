import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { cartera } from '@/lib/desembolsos/reportes';

export const dynamic = 'force-dynamic';

// GET /api/desembolsos/exports/cartera?idProyecto=&idBanco=&estado=&q=
// Devuelve las filas; el Excel se arma en el cliente (patrón loadXLSX).
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  try {
    const db = await getAdelanteDb();
    const filas = await cartera(db, {
      idBanco: sp.get('idBanco') ? Number(sp.get('idBanco')) : undefined,
      idProyecto: sp.get('idProyecto') ? Number(sp.get('idProyecto')) : undefined,
      estado: sp.get('estado') ?? undefined,
      q: sp.get('q') ?? undefined,
    });
    return NextResponse.json({ filas });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
