import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import type { LineaBaseResultado } from '@/lib/avance/sprints';

export const dynamic = 'force-dynamic';

/**
 * POST /api/avance/semanas/{id}/linea-base — re-fija la línea base de una
 * semana abierta. Portado de obrascontrol `semanas.ts`
 * (POST /api/semanas/{id}/linea-base).
 *
 * Captura el plan (sprint actual de cada obra en ejecución/espera) + la foto
 * completa del avance vivo. Es la base contra la que el reporte mide el
 * "logrado de la semana" (hoy − foto). Idempotente.
 *
 * BLOQUEO: si ya hay foto y alguna sub-partida tiene avance POR ENCIMA de ella,
 * re-fijar lo absorbería (se perdería del "logrado"). En ese caso → 409.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();

    // La semana debe existir y estar abierta.
    const semQ = await db
      .request()
      .input('id', sql.BigInt, id)
      .query<{ estado: string }>('SELECT estado FROM obc.semanas_operativas WHERE id = @id');
    if (semQ.recordset.length === 0) {
      return NextResponse.json({ error: 'Semana no encontrada' }, { status: 404 });
    }
    if (semQ.recordset[0]!.estado !== 'abierta') {
      return NextResponse.json(
        { error: 'Solo se puede fijar línea base en una semana abierta.' },
        { status: 409 },
      );
    }

    // Bloqueo de re-fijar con avance suelto (solo si ya hay foto previa).
    const fotoQ = await db
      .request()
      .input('sem', sql.BigInt, id)
      .query<{ n: number }>(
        'SELECT COUNT(*) AS n FROM obc.avance_base_semanal WHERE semana_operativa_id = @sem',
      );
    if ((fotoQ.recordset[0]?.n ?? 0) > 0) {
      const sueltoQ = await db
        .request()
        .input('sem', sql.BigInt, id)
        .query<{ obra_codigo: string }>(`
          SELECT DISTINCT a.obra_codigo
          FROM obc.avance_sub_partidas a
          LEFT JOIN obc.avance_base_semanal f
            ON f.semana_operativa_id = @sem
           AND f.obra_codigo = a.obra_codigo AND f.sub_partida_id = a.sub_partida_id
          WHERE ISNULL(a.pct_completado, 0) > ISNULL(f.pct_completado, 0)
        `);
      if (sueltoQ.recordset.length > 0) {
        const obras = sueltoQ.recordset.map((r) => r.obra_codigo).sort();
        const muestra = obras.slice(0, 10).join(', ');
        return NextResponse.json(
          {
            error: `No se puede re-fijar: hay avance posterior a la línea base en ${obras.length} obra(s) (${muestra}${obras.length > 10 ? '…' : ''}). Revertí ese avance o cerrá la semana antes de re-fijar — si no, se perdería del reporte.`,
          },
          { status: 409 },
        );
      }
    }

    // Snapshot del plan para todas las obras en ejecución/espera con tipo.
    const r = await db
      .request()
      .input('sem', sql.BigInt, id)
      .query<{ accion: 'INSERT' | 'UPDATE' }>(`
        MERGE obc.plan_semanal AS dst
        USING (
          SELECT @sem AS semana_operativa_id, e.obra_codigo, e.sprint_actual AS sprint_objetivo
          FROM obc.obra_estado e
          WHERE e.estado IN ('en_ejecucion', 'en_espera') AND e.tipo_casa IS NOT NULL
        ) AS src
          ON dst.semana_operativa_id = src.semana_operativa_id
         AND dst.obra_codigo COLLATE DATABASE_DEFAULT = src.obra_codigo COLLATE DATABASE_DEFAULT
        WHEN MATCHED THEN UPDATE SET
          sprint_objetivo = src.sprint_objetivo,
          actualizado_en = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (semana_operativa_id, obra_codigo, sprint_objetivo)
          VALUES (src.semana_operativa_id, src.obra_codigo, src.sprint_objetivo)
        OUTPUT $action AS accion;
      `);

    // Foto de línea base: estado COMPLETO de todas las sub-partidas con avance.
    await db
      .request()
      .input('sem', sql.BigInt, id)
      .query(`
        DELETE FROM obc.avance_base_semanal WHERE semana_operativa_id = @sem;
        INSERT INTO obc.avance_base_semanal (semana_operativa_id, obra_codigo, sub_partida_id, pct_completado)
        SELECT @sem, a.obra_codigo, a.sub_partida_id, ISNULL(a.pct_completado, 0)
        FROM obc.avance_sub_partidas a;
      `);

    const fijadas = r.recordset.length;
    const totalQ = await db.request().query<{ n: number }>(`
      SELECT COUNT(*) AS n
      FROM obc.obra_estado
      WHERE estado IN ('en_ejecucion', 'en_espera') AND tipo_casa IS NOT NULL
    `);
    const resultado: LineaBaseResultado = {
      semana_id: id,
      fijadas,
      total_obras: Number(totalQ.recordset[0]?.n ?? 0),
    };
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
