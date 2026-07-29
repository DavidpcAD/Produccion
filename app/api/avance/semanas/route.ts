import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import type { SemanaOperativaDetalle } from '@/lib/avance/sprints';

export const dynamic = 'force-dynamic';

/** Columnas devueltas de obc.semanas_operativas (fechas como YYYY-MM-DD). */
const SELECT_SEMANA = `
  id, anio, numero_semana,
  CONVERT(varchar(10), fecha_inicio, 23) AS fecha_inicio,
  CONVERT(varchar(10), fecha_fin, 23) AS fecha_fin,
  estado, descripcion, dias_efectivos
`;

/** GET /api/avance/semanas → semanas operativas (obc.semanas_operativas), recientes primero. */
export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const db = await getAdelanteDb();
    const r = await db.request().query<SemanaOperativaDetalle>(`
      SELECT ${SELECT_SEMANA}
      FROM obc.semanas_operativas
      ORDER BY fecha_inicio DESC, id DESC
    `);
    return NextResponse.json({ semanas: r.recordset });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}

/**
 * POST /api/avance/semanas → abre una nueva semana operativa. Portado de
 * obrascontrol `semanas.ts` (POST /api/semanas/abrir).
 *
 * Body: { anio, numero_semana, fecha_inicio (YYYY-MM-DD), fecha_fin (YYYY-MM-DD),
 *         dias_efectivos?, descripcion? }.
 *
 * Solo puede haber UNA semana 'abierta' a la vez (índice filtrado
 * UX_semanas_una_abierta). Al abrir, se auto-fija la LÍNEA BASE: captura el
 * plan (sprint actual de cada obra en ejecución/espera) + la foto del avance
 * vivo completo. Así la semana arranca en 0 avance semanal.
 */
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));

    const anio = Number(body?.anio);
    const numeroSemana = Number(body?.numero_semana);
    const fechaInicio = String(body?.fecha_inicio ?? '');
    const fechaFin = String(body?.fecha_fin ?? '');
    const diasEfectivos = body?.dias_efectivos != null ? Number(body.dias_efectivos) : 5;
    const descripcion =
      body?.descripcion != null ? String(body.descripcion).slice(0, 500) : null;

    if (!Number.isInteger(anio) || anio < 2024 || anio > 2100) {
      return NextResponse.json({ error: 'anio inválido' }, { status: 400 });
    }
    if (!Number.isInteger(numeroSemana) || numeroSemana < 1 || numeroSemana > 53) {
      return NextResponse.json({ error: 'numero_semana inválido (1–53)' }, { status: 400 });
    }
    if (!RE_FECHA.test(fechaInicio) || !RE_FECHA.test(fechaFin)) {
      return NextResponse.json({ error: 'Fechas inválidas (YYYY-MM-DD)' }, { status: 400 });
    }
    if (!Number.isInteger(diasEfectivos) || diasEfectivos < 1 || diasEfectivos > 7) {
      return NextResponse.json({ error: 'dias_efectivos inválido (1–7)' }, { status: 400 });
    }

    const db = await getAdelanteDb();

    // No puede haber dos semanas abiertas (el índice filtrado lo impide, pero
    // damos un 409 claro en vez de un error de constraint).
    const abierta = await db
      .request()
      .query<{ id: number }>(
        "SELECT TOP 1 id FROM obc.semanas_operativas WHERE estado = 'abierta'",
      );
    if (abierta.recordset.length > 0) {
      return NextResponse.json(
        { error: 'Ya hay una semana operativa abierta. Cerrala antes de abrir otra.' },
        { status: 409 },
      );
    }

    const r = await db
      .request()
      .input('anio', sql.SmallInt, anio)
      .input('num', sql.SmallInt, numeroSemana)
      .input('ini', sql.Date, fechaInicio)
      .input('fin', sql.Date, fechaFin)
      .input('dias', sql.SmallInt, diasEfectivos)
      .input('desc', sql.NVarChar(sql.MAX), descripcion)
      .query<SemanaOperativaDetalle>(`
        INSERT INTO obc.semanas_operativas
          (anio, numero_semana, fecha_inicio, fecha_fin, estado, dias_efectivos, descripcion)
        OUTPUT INSERTED.id, INSERTED.anio, INSERTED.numero_semana,
               CONVERT(varchar(10), INSERTED.fecha_inicio, 23) AS fecha_inicio,
               CONVERT(varchar(10), INSERTED.fecha_fin, 23) AS fecha_fin,
               INSERTED.estado, INSERTED.descripcion, INSERTED.dias_efectivos
        VALUES (@anio, @num, @ini, @fin, 'abierta', @dias, @desc)
      `);
    const nueva = r.recordset[0]!;

    // Auto-fijar LÍNEA BASE de la semana nueva: plan (sprint actual de cada obra
    // en ejecución/espera) + foto del avance vivo COMPLETO como base del
    // "logrado de la semana". Así toda semana arranca en 0 avance semanal.
    await db
      .request()
      .input('sem', sql.BigInt, Number(nueva.id))
      .query(`
        MERGE obc.plan_semanal AS dst
        USING (
          SELECT @sem AS semana_operativa_id, e.obra_codigo, e.sprint_actual AS sprint_objetivo
          FROM obc.obra_estado e
          WHERE e.estado IN ('en_ejecucion', 'en_espera') AND e.tipo_casa IS NOT NULL
        ) AS src
          ON dst.semana_operativa_id = src.semana_operativa_id
         AND dst.obra_codigo COLLATE DATABASE_DEFAULT = src.obra_codigo COLLATE DATABASE_DEFAULT
        WHEN MATCHED THEN UPDATE SET
          sprint_objetivo = src.sprint_objetivo, actualizado_en = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (semana_operativa_id, obra_codigo, sprint_objetivo)
          VALUES (src.semana_operativa_id, src.obra_codigo, src.sprint_objetivo);

        DELETE FROM obc.avance_base_semanal WHERE semana_operativa_id = @sem;
        INSERT INTO obc.avance_base_semanal (semana_operativa_id, obra_codigo, sub_partida_id, pct_completado)
        SELECT @sem, a.obra_codigo, a.sub_partida_id, ISNULL(a.pct_completado, 0)
        FROM obc.avance_sub_partidas a;
      `);

    return NextResponse.json({ ok: true, semana: nueva });
  } catch (e: unknown) {
    // UQ_semanas_anio_numero (semana repetida).
    if (e instanceof Error && /UQ_semanas_anio_numero/.test(e.message)) {
      return NextResponse.json(
        { error: 'Ya existe una semana con ese año y número.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
