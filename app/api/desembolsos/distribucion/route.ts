import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import {
  crearDistribucion,
  esErrorCliente,
  listarDistribucion,
  validarNuevaConfig,
  type NuevaDistribucionRequest,
} from '@/lib/desembolsos/distribucion';

export const dynamic = 'force-dynamic';

/** GET /api/desembolsos/distribucion — proyectos con su config vigente. */
export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const db = await getAdelanteDb();
    return NextResponse.json(await listarDistribucion(db));
  } catch (err) {
    console.error('/api/desembolsos/distribucion GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}

/** POST /api/desembolsos/distribucion — crear nueva versión de distribución. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  let body: NuevaDistribucionRequest;
  try {
    body = (await req.json()) as NuevaDistribucionRequest;
  } catch {
    return NextResponse.json({ error: 'Body inválido (no es JSON)' }, { status: 400 });
  }
  const validacion = validarNuevaConfig(body);
  if (validacion) return NextResponse.json({ error: validacion }, { status: 400 });

  try {
    const db = await getAdelanteDb();
    const data = await crearDistribucion(db, body, session.cedula ?? 'desembolsos');
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('/api/desembolsos/distribucion POST error:', err);
    return NextResponse.json({ error: message }, { status: esErrorCliente(message) ? 400 : 500 });
  }
}
