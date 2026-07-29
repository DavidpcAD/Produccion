import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { actualizarExtra, eliminarExtra, mapDbError } from '@/lib/desembolsos/extras';

export const dynamic = 'force-dynamic';

// PUT /api/desembolsos/extras/{idExtra} — actualizar (solo COTIZADA).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ idExtra: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const idExtra = Number((await params).idExtra);
  if (!Number.isInteger(idExtra) || idExtra <= 0) return NextResponse.json({ error: 'idExtra inválido' }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }); }
  const monto = body.MontoAjuste_CRC != null ? Number(body.MontoAjuste_CRC) : null;
  if (monto != null && (!Number.isFinite(monto) || monto <= 0)) return NextResponse.json({ error: 'MontoAjuste_CRC > 0' }, { status: 400 });
  try {
    const db = await getAdelanteDb();
    await actualizarExtra(db, idExtra, {
      Descripcion: body.Descripcion != null ? String(body.Descripcion) : null,
      MontoAjuste_CRC: monto,
      FechaCotizacion: body.FechaCotizacion != null ? String(body.FechaCotizacion) : null,
      Notas: body.Notas != null ? String(body.Notas) : null,
      UsuarioEmail: session.cedula,
    });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const { status, error } = mapDbError(e);
    return NextResponse.json({ error }, { status });
  }
}

// DELETE /api/desembolsos/extras/{idExtra} — eliminar (no si APROBADA).
export async function DELETE(_req: Request, { params }: { params: Promise<{ idExtra: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const idExtra = Number((await params).idExtra);
  if (!Number.isInteger(idExtra) || idExtra <= 0) return NextResponse.json({ error: 'idExtra inválido' }, { status: 400 });
  try {
    const db = await getAdelanteDb();
    await eliminarExtra(db, idExtra, session.cedula);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const { status, error } = mapDbError(e);
    return NextResponse.json({ error }, { status });
  }
}
