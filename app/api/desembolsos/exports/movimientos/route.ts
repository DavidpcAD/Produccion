import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { movimientos } from '@/lib/desembolsos/reportes';

export const dynamic = 'force-dynamic';

// GET /api/desembolsos/exports/movimientos?idCaso=&idBanco=&idProyecto=&clasificacion=&categoria=&estadoVinculacion=&desde=&hasta=&q=
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const ev = sp.get('estadoVinculacion');
  try {
    const db = await getAdelanteDb();
    const filas = await movimientos(db, {
      idCaso: sp.get('idCaso') ? Number(sp.get('idCaso')) : undefined,
      idBanco: sp.get('idBanco') ? Number(sp.get('idBanco')) : undefined,
      idProyecto: sp.get('idProyecto') ? Number(sp.get('idProyecto')) : undefined,
      clasificacion: sp.get('clasificacion') ?? undefined,
      categoria: sp.get('categoria') ?? undefined,
      estadoVinculacion: ev === 'VINCULADOS' || ev === 'SIN_VINCULAR' ? ev : undefined,
      desde: sp.get('desde') ?? undefined,
      hasta: sp.get('hasta') ?? undefined,
      q: sp.get('q') ?? undefined,
    });
    return NextResponse.json({ filas });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
