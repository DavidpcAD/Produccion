import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import {
  crearHitoArgs,
  esErrorCliente,
  listarHitos,
  upsertHito,
  validarHito,
  type NuevoHitoRequest,
} from '@/lib/desembolsos/esquemas';

export const dynamic = 'force-dynamic';

/**
 * GET /api/desembolsos/catalogo-hitos?incluirInactivos=true — catálogo de hitos.
 * Sin el flag: solo activos. Con el flag: todos + conteo de uso por banco.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const incluirInactivos = new URL(req.url).searchParams.get('incluirInactivos') === 'true';
  try {
    const db = await getAdelanteDb();
    return NextResponse.json(await listarHitos(db, incluirInactivos));
  } catch (err) {
    console.error('/api/desembolsos/catalogo-hitos GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}

/** POST /api/desembolsos/catalogo-hitos — crear hito nuevo. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  let body: NuevoHitoRequest;
  try {
    body = (await req.json()) as NuevoHitoRequest;
  } catch {
    return NextResponse.json({ error: 'Body inválido (no es JSON)' }, { status: 400 });
  }
  const validacion = validarHito(body);
  if (validacion) return NextResponse.json({ error: validacion }, { status: 400 });

  try {
    const db = await getAdelanteDb();
    const data = await upsertHito(db, session.cedula ?? 'desembolsos', crearHitoArgs(body));
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('/api/desembolsos/catalogo-hitos POST error:', err);
    return NextResponse.json({ error: message }, { status: esErrorCliente(message) ? 400 : 500 });
  }
}
