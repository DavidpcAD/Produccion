import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { obtenerEstadoCuenta } from '@/lib/desembolsos/estado-cuenta';

export const dynamic = 'force-dynamic';

/**
 * GET /api/desembolsos/estado-cuenta?caso=N — estado de cuenta del cliente
 * (cabecera + precio + extras + pagos del banco + pagos del cliente + totales).
 * Portado de la Azure Function `estadoCuenta.ts` (solo la respuesta JSON).
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const idCaso = Number(new URL(req.url).searchParams.get('caso'));
  if (!Number.isInteger(idCaso) || idCaso <= 0) {
    return NextResponse.json({ error: 'Parámetro "caso" inválido' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();
    const data = await obtenerEstadoCuenta(db, idCaso);
    if (!data) return NextResponse.json({ error: 'Caso no encontrado' }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    console.error('/api/desembolsos/estado-cuenta GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
