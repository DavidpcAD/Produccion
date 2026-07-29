import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import {
  actualizarHitoArgs,
  esErrorCliente,
  upsertHito,
  validarHito,
  type ActualizarHitoRequest,
} from '@/lib/desembolsos/esquemas';

export const dynamic = 'force-dynamic';

/** PATCH /api/desembolsos/catalogo-hitos/:idHito — actualizar hito existente. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ idHito: string }> },
) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { idHito: raw } = await params;
  const idHito = Number(raw);
  if (!Number.isInteger(idHito) || idHito <= 0) {
    return NextResponse.json({ error: 'idHito inválido' }, { status: 400 });
  }
  let body: ActualizarHitoRequest;
  try {
    body = (await req.json()) as ActualizarHitoRequest;
  } catch {
    return NextResponse.json({ error: 'Body inválido (no es JSON)' }, { status: 400 });
  }
  const validacion = validarHito(body);
  if (validacion) return NextResponse.json({ error: validacion }, { status: 400 });

  try {
    const db = await getAdelanteDb();
    const data = await upsertHito(db, session.cedula ?? 'desembolsos', actualizarHitoArgs(idHito, body));
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('/api/desembolsos/catalogo-hitos/[idHito] PATCH error:', err);
    return NextResponse.json({ error: message }, { status: esErrorCliente(message) ? 400 : 500 });
  }
}
