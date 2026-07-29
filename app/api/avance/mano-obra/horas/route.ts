import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import type { HorasObra } from '@/lib/avance/mano-obra';

export const dynamic = 'force-dynamic';

/**
 * Horas de mano de obra por obra/semana (definen el % de reparto de la nómina).
 * Portado de obrascontrol `mano-obra.ts`.
 *   GET  /api/avance/mano-obra/horas → todas las filas (semana + obra + horas)
 *   POST /api/avance/mano-obra/horas → REEMPLAZA las horas de una semana
 */

export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const db = await getAdelanteDb();
    const r = await db.request().query<HorasObra>(`
      SELECT semana_operativa_id, obra_codigo, horas
      FROM obc.mo_horas_obra
      ORDER BY semana_operativa_id DESC, obra_codigo
    `);
    return NextResponse.json({ horas: r.recordset });
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
    const filasRaw: unknown[] = Array.isArray(body?.filas) ? body.filas : [];
    if (!Number.isInteger(semana) || semana <= 0) {
      return NextResponse.json({ error: 'semana_operativa_id inválido' }, { status: 400 });
    }
    if (filasRaw.length > 500) {
      return NextResponse.json({ error: 'Máximo 500 filas' }, { status: 400 });
    }
    const filas = filasRaw
      .map((f) => {
        const r = f as { obra_codigo?: unknown; horas?: unknown };
        return { obra_codigo: String(r.obra_codigo ?? '').trim(), horas: Number(r.horas) };
      })
      .filter((f) => f.obra_codigo.length >= 3 && f.horas > 0);

    const db = await getAdelanteDb();
    const tx = new sql.Transaction(db);
    await tx.begin();
    try {
      await new sql.Request(tx)
        .input('sem', sql.BigInt, semana)
        .query('DELETE FROM obc.mo_horas_obra WHERE semana_operativa_id = @sem');
      for (const f of filas) {
        await new sql.Request(tx)
          .input('sem', sql.BigInt, semana)
          .input('obra', sql.NVarChar(20), f.obra_codigo)
          .input('horas', sql.Decimal(10, 2), f.horas)
          .query(`
            INSERT INTO obc.mo_horas_obra (semana_operativa_id, obra_codigo, horas)
            VALUES (@sem, @obra, @horas)
          `);
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
    return NextResponse.json({ ok: true, semana_operativa_id: semana, filas: filas.length });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
