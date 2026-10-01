import { NextResponse } from 'next/server';
import { jsonComprimido } from '@/lib/http/json-comprimido';
import { mensajeParaCliente } from '@/lib/errores';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { listarCasos } from '@/lib/desembolsos/casos';

export const dynamic = 'force-dynamic';

/** GET /api/desembolsos/casos — cartera operativa. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const db = await getAdelanteDb();
    return jsonComprimido(req, await listarCasos(db));
  } catch (err) {
    console.error('/api/desembolsos/casos GET error:', err);
    return NextResponse.json(
      { error: mensajeParaCliente(err) },
      { status: 500 },
    );
  }
}
