import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { listarPorCaso, crearPago, CONCEPTOS_VALIDOS, mapDbError, type PagoClienteConcepto } from '@/lib/desembolsos/pagos-cliente';

export const dynamic = 'force-dynamic';

// GET /api/desembolsos/pagos-cliente/caso/{idCaso} — pagos de un caso.
export async function GET(_req: Request, { params }: { params: Promise<{ idCaso: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const idCaso = Number((await params).idCaso);
  if (!Number.isInteger(idCaso) || idCaso <= 0) return NextResponse.json({ error: 'idCaso inválido' }, { status: 400 });
  try {
    const db = await getAdelanteDb();
    return NextResponse.json({ pagos: await listarPorCaso(db, idCaso) });
  } catch (e) {
    const { status, error } = mapDbError(e);
    return NextResponse.json({ error }, { status });
  }
}

// POST /api/desembolsos/pagos-cliente/caso/{idCaso} — crear pago.
export async function POST(req: NextRequest, { params }: { params: Promise<{ idCaso: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const idCaso = Number((await params).idCaso);
  if (!Number.isInteger(idCaso) || idCaso <= 0) return NextResponse.json({ error: 'idCaso inválido' }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body inválido (no es JSON)' }, { status: 400 }); }

  const concepto = body.Concepto as PagoClienteConcepto;
  if (!CONCEPTOS_VALIDOS.includes(concepto)) return NextResponse.json({ error: 'Concepto inválido' }, { status: 400 });
  const monto = Number(body.MontoPlaneado_CRC);
  if (!Number.isFinite(monto) || monto <= 0) return NextResponse.json({ error: 'MontoPlaneado_CRC > 0 obligatorio' }, { status: 400 });
  const fecha = String(body.FechaPlaneada ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return NextResponse.json({ error: 'FechaPlaneada YYYY-MM-DD obligatoria' }, { status: 400 });

  try {
    const db = await getAdelanteDb();
    const res = await crearPago(db, {
      IDCaso: idCaso, Concepto: concepto, MontoPlaneado_CRC: monto, FechaPlaneada: fecha,
      IDExtra: body.IDExtra != null ? Number(body.IDExtra) : null,
      Notas: body.Notas != null ? String(body.Notas) : null, UsuarioEmail: session.cedula,
    });
    return NextResponse.json(res, { status: 201 });
  } catch (e) {
    const { status, error } = mapDbError(e);
    return NextResponse.json({ error }, { status });
  }
}
