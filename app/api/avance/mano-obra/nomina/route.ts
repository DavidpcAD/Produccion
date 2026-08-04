import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import type { NominaSemanal } from '@/lib/avance/mano-obra';

export const dynamic = 'force-dynamic';

/**
 * Nómina semanal (mano de obra directa). Portado de obrascontrol `mano-obra.ts`.
 *   GET  /api/avance/mano-obra/nomina  → nómina por semana + datos de la semana
 *   POST /api/avance/mano-obra/nomina  → upsert (MERGE) de la semana
 */

export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const db = await getAdelanteDb();
    const r = await db.request().query<NominaSemanal>(`
      SELECT n.semana_operativa_id, n.monto_nomina_directa, n.costo_teorico_m2, n.notas,
             s.anio, s.numero_semana,
             CONVERT(varchar(10), s.fecha_inicio, 23) AS fecha_inicio,
             CONVERT(varchar(10), s.fecha_fin, 23) AS fecha_fin
      FROM pro_obc.mo_nomina_semanal n
      JOIN pro_obc.semanas_operativas s ON s.id = n.semana_operativa_id
      ORDER BY s.fecha_inicio DESC
    `);
    return NextResponse.json({ nomina: r.recordset });
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
    const monto = Number(body?.monto_nomina_directa);
    const teorico = Number(body?.costo_teorico_m2);
    const notas = body?.notas != null ? String(body.notas).slice(0, 500) : null;
    if (!Number.isInteger(semana) || semana <= 0) {
      return NextResponse.json({ error: 'semana_operativa_id inválido' }, { status: 400 });
    }
    if (!(monto >= 0) || !(teorico >= 0)) {
      return NextResponse.json({ error: 'Montos inválidos' }, { status: 400 });
    }
    const db = await getAdelanteDb();
    await db
      .request()
      .input('sem', sql.BigInt, semana)
      .input('monto', sql.Decimal(18, 2), monto)
      .input('teo', sql.Decimal(18, 2), teorico)
      .input('notas', sql.NVarChar(500), notas)
      .query(`
        MERGE pro_obc.mo_nomina_semanal AS dst
        USING (SELECT @sem AS s) AS src ON dst.semana_operativa_id = src.s
        WHEN MATCHED THEN UPDATE SET
          monto_nomina_directa = @monto, costo_teorico_m2 = @teo, notas = @notas,
          actualizado_en = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT
          (semana_operativa_id, monto_nomina_directa, costo_teorico_m2, notas)
          VALUES (@sem, @monto, @teo, @notas);
      `);
    return NextResponse.json({ ok: true, semana_operativa_id: semana });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
