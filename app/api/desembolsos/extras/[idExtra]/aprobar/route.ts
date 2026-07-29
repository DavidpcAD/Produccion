import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { aprobarExtra, mapDbError } from '@/lib/desembolsos/extras';

export const dynamic = 'force-dynamic';

// POST /api/desembolsos/extras/{idExtra}/aprobar — cambia a APROBADA.
export async function POST(req: NextRequest, { params }: { params: Promise<{ idExtra: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const idExtra = Number((await params).idExtra);
  if (!Number.isInteger(idExtra) || idExtra <= 0) return NextResponse.json({ error: 'idExtra inválido' }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }); }
  const fecha = String(body.FechaAprobacion ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return NextResponse.json({ error: 'FechaAprobacion ISO obligatoria' }, { status: 400 });
  try {
    const db = await getAdelanteDb();
    await aprobarExtra(db, idExtra, fecha, session.cedula);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const { status, error } = mapDbError(e);
    return NextResponse.json({ error }, { status });
  }
}
