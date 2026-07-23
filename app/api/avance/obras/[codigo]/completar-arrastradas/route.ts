import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import type { TipoCasa } from '@/lib/avance/types';

/**
 * POST /api/avance/obras/{codigo}/completar-arrastradas
 * Marca como completadas (100%) las sub-partidas de sprints ANTERIORES al
 * actual que sigan pendientes. Portado de la Azure Function `avance.ts`.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ codigo: string }> },
) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { codigo } = await params;

  try {
    const db = await getAdelanteDb();
    const estadoRes = await db
      .request()
      .input('obra', sql.NVarChar(20), codigo)
      .query<{ estado: string; sprint_actual: number; tipo_casa: TipoCasa | null }>(
        'SELECT estado, sprint_actual, tipo_casa FROM obc.obra_estado WHERE obra_codigo = @obra',
      );
    const estado = estadoRes.recordset[0];
    if (!estado || !estado.tipo_casa)
      return NextResponse.json(
        { error: `Obra ${codigo} no iniciada o sin tipo de casa` },
        { status: 400 },
      );

    const r = await db
      .request()
      .input('obra', sql.NVarChar(20), codigo)
      .input('sprint', sql.SmallInt, estado.sprint_actual)
      .input('tc', sql.VarChar(20), estado.tipo_casa)
      .input('uid', sql.Int, session.idCol || null)
      .query<{ accion: string }>(`
        MERGE obc.avance_sub_partidas AS dst
        USING (
          SELECT sp.id AS sub_partida_id
          FROM obc.sub_partidas sp
          JOIN obc.sub_partida_tipos t ON t.sub_partida_id = sp.id AND t.tipo_casa = @tc
          WHERE sp.sprint_numero < @sprint AND sp.activo = 1
        ) AS src
          ON dst.obra_codigo = @obra AND dst.sub_partida_id = src.sub_partida_id
        WHEN MATCHED AND ISNULL(dst.completada, 0) = 0 THEN UPDATE SET
          pct_completado = 100, completada = 1, nc_causa = NULL, nc_nota = NULL,
          usuario_id = @uid, actualizado_en = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT
          (obra_codigo, sub_partida_id, pct_completado, completada, usuario_id)
          VALUES (@obra, src.sub_partida_id, 100, 1, @uid)
        OUTPUT $action AS accion;
      `);

    return NextResponse.json({ data: { obra_codigo: codigo, completadas: r.recordset?.length ?? 0 } });
  } catch (err) {
    console.error('/api/avance/obras/[codigo]/completar-arrastradas error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
