import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import {
  listarMovimientosGlobal,
  type EstadoVinculacion,
  type FiltroMovimientos,
} from '@/lib/desembolsos/movimientos';

export const dynamic = 'force-dynamic';

const ESTADOS: EstadoVinculacion[] = ['TODOS', 'VINCULADOS', 'SIN_VINCULAR'];

/**
 * GET /api/desembolsos/movimientos — lista global de movimientos con filtros
 * (idCaso, idBanco, idProyecto, clasificacion, categoria, estadoVinculacion,
 * desde, hasta, q). Portado de `listarMovimientosGlobal`. Read-only (máx 500).
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const estadoRaw = sp.get('estadoVinculacion');
  const filtro: FiltroMovimientos = {
    idCaso: sp.get('idCaso') ? Number(sp.get('idCaso')) : undefined,
    idBanco: sp.get('idBanco') ? Number(sp.get('idBanco')) : undefined,
    idProyecto: sp.get('idProyecto') ? Number(sp.get('idProyecto')) : undefined,
    clasificacion: sp.get('clasificacion') ?? undefined,
    categoria: sp.get('categoria') ?? undefined,
    estadoVinculacion:
      estadoRaw && ESTADOS.includes(estadoRaw as EstadoVinculacion)
        ? (estadoRaw as EstadoVinculacion)
        : undefined,
    desde: sp.get('desde') ?? undefined,
    hasta: sp.get('hasta') ?? undefined,
    q: sp.get('q')?.trim() || undefined,
  };

  try {
    const db = await getAdelanteDb();
    const movimientos = await listarMovimientosGlobal(db, filtro);
    return NextResponse.json({ movimientos });
  } catch (err) {
    console.error('/api/desembolsos/movimientos GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
