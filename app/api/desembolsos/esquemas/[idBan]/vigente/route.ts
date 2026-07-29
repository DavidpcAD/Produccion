import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import {
  editarEsquemaVigente,
  esErrorCliente,
  validarEditarEsquema,
  type EditarEsquemaVigenteRequest,
} from '@/lib/desembolsos/esquemas';

export const dynamic = 'force-dynamic';

/** PATCH /api/desembolsos/esquemas/:idBan/vigente — edita la vigente in-place. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ idBan: string }> },
) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { idBan: raw } = await params;
  const idBan = Number(raw);
  if (!Number.isInteger(idBan) || idBan <= 0) {
    return NextResponse.json({ error: 'idBan inválido' }, { status: 400 });
  }
  let body: EditarEsquemaVigenteRequest;
  try {
    body = (await req.json()) as EditarEsquemaVigenteRequest;
  } catch {
    return NextResponse.json({ error: 'Body inválido (no es JSON)' }, { status: 400 });
  }
  const validacion = validarEditarEsquema(body);
  if (validacion) return NextResponse.json({ error: validacion }, { status: 400 });

  try {
    const db = await getAdelanteDb();
    const data = await editarEsquemaVigente(db, idBan, body, session.cedula ?? 'desembolsos');
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('/api/desembolsos/esquemas/[idBan]/vigente PATCH error:', err);
    return NextResponse.json({ error: message }, { status: esErrorCliente(message) ? 400 : 500 });
  }
}
