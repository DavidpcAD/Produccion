import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import type { Subcontrato } from '@/lib/avance/mano-obra';

export const dynamic = 'force-dynamic';

/**
 * Subcontratos de mano de obra (M.O. externa, directa a la obra).
 * Portado de obrascontrol `mano-obra.ts`.
 *   GET  /api/avance/mano-obra/subcontratos → todos
 *   POST /api/avance/mano-obra/subcontratos → crea uno (devuelve id)
 */

export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const db = await getAdelanteDb();
    const r = await db.request().query<Subcontrato>(`
      SELECT id, semana_operativa_id, obra_codigo, tipo, monto, descripcion
      FROM obc.mo_subcontratos
      ORDER BY semana_operativa_id DESC, id DESC
    `);
    return NextResponse.json({ subcontratos: r.recordset });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const semana = Number(body?.semana_operativa_id);
    const obra = String(body?.obra_codigo ?? '').trim();
    const monto = Number(body?.monto);
    const tipo = body?.tipo != null ? String(body.tipo).slice(0, 100) : null;
    const descripcion = body?.descripcion != null ? String(body.descripcion).slice(0, 500) : null;
    if (!Number.isInteger(semana) || semana <= 0) {
      return NextResponse.json({ error: 'semana_operativa_id inválido' }, { status: 400 });
    }
    if (obra.length < 3) {
      return NextResponse.json({ error: 'obra_codigo inválido' }, { status: 400 });
    }
    if (!(monto >= 0)) {
      return NextResponse.json({ error: 'monto inválido' }, { status: 400 });
    }
    const db = await getAdelanteDb();
    const r = await db
      .request()
      .input('sem', sql.BigInt, semana)
      .input('obra', sql.NVarChar(20), obra)
      .input('tipo', sql.NVarChar(100), tipo)
      .input('monto', sql.Decimal(18, 2), monto)
      .input('desc', sql.NVarChar(500), descripcion)
      .query<{ id: number }>(`
        INSERT INTO obc.mo_subcontratos (semana_operativa_id, obra_codigo, tipo, monto, descripcion)
        OUTPUT INSERTED.id
        VALUES (@sem, @obra, @tipo, @monto, @desc)
      `);
    return NextResponse.json({ ok: true, id: r.recordset[0]?.id });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
