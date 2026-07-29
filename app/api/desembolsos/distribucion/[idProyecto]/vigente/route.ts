import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import {
  editarDistribucionVigente,
  esErrorCliente,
  validarEditarVigente,
  type EditarDistribucionVigenteRequest,
} from '@/lib/desembolsos/distribucion';

export const dynamic = 'force-dynamic';

/** PATCH /api/desembolsos/distribucion/:idProyecto/vigente — edita in-place. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ idProyecto: string }> },
) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { idProyecto: raw } = await params;
  const idProyecto = Number(raw);
  if (!Number.isInteger(idProyecto) || idProyecto <= 0) {
    return NextResponse.json({ error: 'idProyecto inválido' }, { status: 400 });
  }
  let body: EditarDistribucionVigenteRequest;
  try {
    body = (await req.json()) as EditarDistribucionVigenteRequest;
  } catch {
    return NextResponse.json({ error: 'Body inválido (no es JSON)' }, { status: 400 });
  }
  const validacion = validarEditarVigente(body);
  if (validacion) return NextResponse.json({ error: validacion }, { status: 400 });

  try {
    const db = await getAdelanteDb();
    const data = await editarDistribucionVigente(db, idProyecto, body, session.cedula ?? 'desembolsos');
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('/api/desembolsos/distribucion/[idProyecto]/vigente PATCH error:', err);
    return NextResponse.json({ error: message }, { status: esErrorCliente(message) ? 400 : 500 });
  }
}
