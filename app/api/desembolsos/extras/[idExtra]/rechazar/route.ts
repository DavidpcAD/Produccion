import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { rechazarExtra, mapDbError } from '@/lib/desembolsos/extras';

export const dynamic = 'force-dynamic';

// POST /api/desembolsos/extras/{idExtra}/rechazar — cambia a RECHAZADA.
export async function POST(req: NextRequest, { params }: { params: Promise<{ idExtra: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const idExtra = Number((await params).idExtra);
  if (!Number.isInteger(idExtra) || idExtra <= 0) return NextResponse.json({ error: 'idExtra inválido' }, { status: 400 });
  let notas: string | null = null;
  try { const body = await req.json(); notas = body?.Notas != null ? String(body.Notas) : null; } catch { /* body opcional */ }
  try {
    const db = await getAdelanteDb();
    await rechazarExtra(db, idExtra, notas, session.cedula);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const { status, error } = mapDbError(e);
    return NextResponse.json({ error }, { status });
  }
}
