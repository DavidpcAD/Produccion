import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import {
  crearEsquema,
  esErrorCliente,
  listarEsquemas,
  validarNuevoEsquema,
  type NuevoEsquemaRequest,
} from '@/lib/desembolsos/esquemas';

export const dynamic = 'force-dynamic';

/** GET /api/desembolsos/esquemas — bancos con su esquema vigente. */
export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const db = await getAdelanteDb();
    return NextResponse.json(await listarEsquemas(db));
  } catch (err) {
    console.error('/api/desembolsos/esquemas GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}

/** POST /api/desembolsos/esquemas — crear nueva versión de esquema. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  let body: NuevoEsquemaRequest;
  try {
    body = (await req.json()) as NuevoEsquemaRequest;
  } catch {
    return NextResponse.json({ error: 'Body inválido (no es JSON)' }, { status: 400 });
  }
  const validacion = validarNuevoEsquema(body);
  if (validacion) return NextResponse.json({ error: validacion }, { status: 400 });

  try {
    const db = await getAdelanteDb();
    const data = await crearEsquema(db, body, session.cedula ?? 'desembolsos');
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('/api/desembolsos/esquemas POST error:', err);
    return NextResponse.json({ error: message }, { status: esErrorCliente(message) ? 400 : 500 });
  }
}
