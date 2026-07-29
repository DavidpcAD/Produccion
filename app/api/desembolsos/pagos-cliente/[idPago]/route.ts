import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { actualizarPago, eliminarPago, CONCEPTOS_VALIDOS, mapDbError, type PagoClienteConcepto } from '@/lib/desembolsos/pagos-cliente';

export const dynamic = 'force-dynamic';

// PUT /api/desembolsos/pagos-cliente/{idPago} — actualización parcial.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ idPago: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const idPago = Number((await params).idPago);
  if (!Number.isInteger(idPago) || idPago <= 0) return NextResponse.json({ error: 'idPago inválido' }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body inválido (no es JSON)' }, { status: 400 }); }

  const concepto = body.Concepto as PagoClienteConcepto | undefined;
  if (concepto != null && !CONCEPTOS_VALIDOS.includes(concepto)) return NextResponse.json({ error: 'Concepto inválido' }, { status: 400 });
  const monto = body.MontoPlaneado_CRC != null ? Number(body.MontoPlaneado_CRC) : null;
  if (monto != null && (!Number.isFinite(monto) || monto <= 0)) return NextResponse.json({ error: 'MontoPlaneado_CRC > 0' }, { status: 400 });

  try {
    const db = await getAdelanteDb();
    await actualizarPago(db, idPago, {
      Concepto: concepto ?? null,
      MontoPlaneado_CRC: monto,
      FechaPlaneada: body.FechaPlaneada != null ? String(body.FechaPlaneada) : null,
      FechaReal: body.FechaReal != null ? String(body.FechaReal) : null,
      IDMovimientoVinculado: body.IDMovimientoVinculado != null ? Number(body.IDMovimientoVinculado) : null,
      IDExtra: body.IDExtra != null ? Number(body.IDExtra) : null,
      Notas: body.Notas != null ? String(body.Notas) : null,
      UsuarioEmail: session.cedula,
    });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const { status, error } = mapDbError(e);
    return NextResponse.json({ error }, { status });
  }
}

// DELETE /api/desembolsos/pagos-cliente/{idPago}
export async function DELETE(_req: Request, { params }: { params: Promise<{ idPago: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const idPago = Number((await params).idPago);
  if (!Number.isInteger(idPago) || idPago <= 0) return NextResponse.json({ error: 'idPago inválido' }, { status: 400 });
  try {
    const db = await getAdelanteDb();
    await eliminarPago(db, idPago, session.cedula);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const { status, error } = mapDbError(e);
    return NextResponse.json({ error }, { status });
  }
}
