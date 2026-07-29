import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { listarGlobal, ESTADOS_VALIDOS, TIPOS_VALIDOS, mapDbError, type ExtraEstado, type ExtraTipo } from '@/lib/desembolsos/extras';

export const dynamic = 'force-dynamic';

// GET /api/desembolsos/extras — lista global con filtros opcionales.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const estado = sp.get('estado') as ExtraEstado | null;
  const tipo = sp.get('tipo') as ExtraTipo | null;
  const idProyecto = sp.get('idProyecto') ? Number(sp.get('idProyecto')) : null;
  const q = sp.get('q')?.trim() || null;
  if (estado && !ESTADOS_VALIDOS.includes(estado)) return NextResponse.json({ error: 'estado inválido' }, { status: 400 });
  if (tipo && !TIPOS_VALIDOS.includes(tipo)) return NextResponse.json({ error: 'tipo inválido' }, { status: 400 });
  try {
    const db = await getAdelanteDb();
    return NextResponse.json({ extras: await listarGlobal(db, { estado, tipo, idProyecto, q }) });
  } catch (e) {
    const { status, error } = mapDbError(e);
    return NextResponse.json({ error }, { status });
  }
}
