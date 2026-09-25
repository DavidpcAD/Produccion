import { NextResponse } from 'next/server';
import { mensajeParaCliente } from '@/lib/errores';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { listarTiposMovimiento } from '@/lib/desembolsos/movimientos';

export const dynamic = 'force-dynamic';

/** GET /api/desembolsos/tipos-movimiento — catálogo de tipos (pro_ventas.TipMovi). */
export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const db = await getAdelanteDb();
    const tipos = await listarTiposMovimiento(db);
    return NextResponse.json({ tipos });
  } catch (err) {
    console.error('/api/desembolsos/tipos-movimiento GET error:', err);
    return NextResponse.json(
      { error: mensajeParaCliente(err) },
      { status: 500 },
    );
  }
}
