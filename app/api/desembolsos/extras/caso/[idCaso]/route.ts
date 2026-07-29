import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { listarPorCaso, crearExtra, TIPOS_VALIDOS, mapDbError, type ExtraTipo } from '@/lib/desembolsos/extras';

export const dynamic = 'force-dynamic';

// GET /api/desembolsos/extras/caso/{idCaso} — extras de un caso.
export async function GET(_req: Request, { params }: { params: Promise<{ idCaso: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const idCaso = Number((await params).idCaso);
  if (!Number.isInteger(idCaso) || idCaso <= 0) return NextResponse.json({ error: 'idCaso inválido' }, { status: 400 });
  try {
    const db = await getAdelanteDb();
    return NextResponse.json({ extras: await listarPorCaso(db, idCaso) });
  } catch (e) {
    const { status, error } = mapDbError(e);
    return NextResponse.json({ error }, { status });
  }
}

// POST /api/desembolsos/extras/caso/{idCaso} — crear extra (COTIZADA).
export async function POST(req: NextRequest, { params }: { params: Promise<{ idCaso: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const idCaso = Number((await params).idCaso);
  if (!Number.isInteger(idCaso) || idCaso <= 0) return NextResponse.json({ error: 'idCaso inválido' }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body inválido (no es JSON)' }, { status: 400 }); }

  const tipo = body.Tipo as ExtraTipo;
  if (!TIPOS_VALIDOS.includes(tipo)) return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
  const monto = Number(body.MontoAjuste_CRC);
  if (!Number.isFinite(monto) || monto <= 0) return NextResponse.json({ error: 'MontoAjuste_CRC > 0 obligatorio' }, { status: 400 });
  const desc = String(body.Descripcion ?? '').trim();
  if (!desc) return NextResponse.json({ error: 'Descripcion obligatoria' }, { status: 400 });
  const fecha = String(body.FechaCotizacion ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return NextResponse.json({ error: 'FechaCotizacion ISO obligatoria' }, { status: 400 });

  try {
    const db = await getAdelanteDb();
    const res = await crearExtra(db, {
      IDCaso: idCaso, Tipo: tipo, Descripcion: desc, MontoAjuste_CRC: monto,
      FechaCotizacion: fecha, Notas: body.Notas != null ? String(body.Notas) : null, UsuarioEmail: session.cedula,
    });
    return NextResponse.json(res, { status: 201 });
  } catch (e) {
    const { status, error } = mapDbError(e);
    return NextResponse.json({ error }, { status });
  }
}
