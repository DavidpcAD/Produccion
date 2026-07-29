import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { vincularMov, mapDbError } from '@/lib/desembolsos/pagos-cliente';

export const dynamic = 'force-dynamic';

// POST /api/desembolsos/pagos-cliente/vincular/{idMov} — vincula mov ↔ pago.
// (origen: POST /movimientos/{idMov}/vincular-pago-cliente).
export async function POST(req: NextRequest, { params }: { params: Promise<{ idMov: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const idMov = Number((await params).idMov);
  if (!Number.isInteger(idMov) || idMov <= 0) return NextResponse.json({ error: 'idMov inválido' }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body inválido (no es JSON)' }, { status: 400 }); }

  const idPago = Number(body.IDPago);
  if (!Number.isInteger(idPago) || idPago <= 0) return NextResponse.json({ error: 'IDPago obligatorio (entero > 0)' }, { status: 400 });
  const monto = Number(body.MontoAplicado_CRC);
  if (!Number.isFinite(monto) || monto <= 0) return NextResponse.json({ error: 'MontoAplicado_CRC > 0 obligatorio' }, { status: 400 });

  try {
    const db = await getAdelanteDb();
    const res = await vincularMov(db, { IDMovimiento: idMov, IDPago: idPago, MontoAplicado_CRC: monto, Notas: body.Notas != null ? String(body.Notas) : null, UsuarioEmail: session.cedula });
    return NextResponse.json(res, { status: 201 });
  } catch (e) {
    const { status, error } = mapDbError(e);
    return NextResponse.json({ error }, { status });
  }
}
