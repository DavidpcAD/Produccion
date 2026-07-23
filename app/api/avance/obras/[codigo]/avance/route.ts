import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { obtenerPesosEfectivos, congelarScopeSiHaceFalta } from '@/lib/avance/pesos';
import type { AvanceSprint, AvanceSubPartida, TipoCasa } from '@/lib/avance/types';

/**
 * Captura de avance por sub-partida de una obra. Portado de la Azure Function
 * `avance.ts` de obrascontrol.
 *   GET /api/avance/obras/{codigo}/avance?sprint=N → sub-partidas + avance + peso
 *   PUT /api/avance/obras/{codigo}/avance          → registra avance de 1 sub-partida
 *
 * Al primer avance > 0 se congelan los pesos del sprint y de la partida de esa
 * sub-partida.
 */

interface EstadoRow {
  estado: string;
  sprint_actual: number;
  tipo_casa: TipoCasa | null;
}

async function leerEstado(
  db: Awaited<ReturnType<typeof getAdelanteDb>>,
  obraCodigo: string,
): Promise<EstadoRow | null> {
  const r = await db
    .request()
    .input('obra', sql.NVarChar(20), obraCodigo)
    .query<EstadoRow>(
      'SELECT estado, sprint_actual, tipo_casa FROM obc.obra_estado WHERE obra_codigo = @obra',
    );
  return r.recordset[0] ?? null;
}

// GET /api/avance/obras/{codigo}/avance?sprint=N
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ codigo: string }> },
) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { codigo } = await params;

  try {
    const db = await getAdelanteDb();
    const estado = await leerEstado(db, codigo);
    if (!estado) return NextResponse.json({ error: `Obra ${codigo} no iniciada` }, { status: 404 });
    if (!estado.tipo_casa)
      return NextResponse.json(
        { error: `La obra ${codigo} no tiene tipo de casa asignado` },
        { status: 400 },
      );

    const sprintParam = new URL(req.url).searchParams.get('sprint');
    const sprint = sprintParam ? Number(sprintParam) : estado.sprint_actual;

    // Todas las sub-partidas que aplican al tipo de casa (todas las partidas /
    // sprints). El peso/avance del sprint usa solo las del sprint actual.
    const subs = await db
      .request()
      .input('obra', sql.NVarChar(20), codigo)
      .input('tc', sql.VarChar(20), estado.tipo_casa)
      .query<{
        sub_partida_id: number;
        codigo: string;
        nombre: string;
        partida_id: number;
        partida_codigo: string;
        partida_nombre: string;
        sprint_numero: number;
        es_critica: boolean;
        pct_completado: number;
        completada: boolean;
        nc_causa: string | null;
        nc_nota: string | null;
        piso_pct: number;
      }>(`
        SELECT sp.id AS sub_partida_id, sp.codigo, sp.nombre, sp.sprint_numero,
               sp.es_critica,
               p.id AS partida_id, p.codigo AS partida_codigo, p.nombre AS partida_nombre,
               ISNULL(a.pct_completado, 0) AS pct_completado,
               ISNULL(a.completada, 0)     AS completada,
               a.nc_causa, a.nc_nota,
               ISNULL(piso.piso, 0) AS piso_pct
        FROM obc.sub_partidas sp
        JOIN obc.partidas p ON p.id = sp.partida_id
        JOIN obc.sub_partida_tipos t ON t.sub_partida_id = sp.id AND t.tipo_casa = @tc
        LEFT JOIN obc.avance_sub_partidas a
          ON a.sub_partida_id = sp.id AND a.obra_codigo = @obra
        LEFT JOIN (
          SELECT sub_partida_id, MAX(pct_completado) AS piso
          FROM obc.cierre_produccion_snapshots
          WHERE obra_codigo = @obra
          GROUP BY sub_partida_id
        ) piso ON piso.sub_partida_id = sp.id
        WHERE sp.activo = 1
        ORDER BY sp.sprint_numero, p.codigo, sp.codigo
      `);

    const pesos = await obtenerPesosEfectivos(db, codigo, 'sprint', sprint, estado.tipo_casa);
    const pesoPorSub = new Map(pesos.map((p) => [p.sub_partida_id, p.peso]));

    const subPartidas: AvanceSubPartida[] = subs.recordset.map((s) => {
      const arrastrada = s.sprint_numero < sprint;
      return {
        sub_partida_id: s.sub_partida_id,
        codigo: s.codigo,
        nombre: s.nombre,
        partida_id: s.partida_id,
        partida_codigo: s.partida_codigo,
        partida_nombre: s.partida_nombre,
        sprint_numero: s.sprint_numero,
        es_critica: !!s.es_critica,
        peso: arrastrada ? 0 : (pesoPorSub.get(s.sub_partida_id) ?? 0),
        pct_completado: Number(s.pct_completado),
        completada: !!s.completada,
        nc_causa: s.nc_causa,
        nc_nota: s.nc_nota,
        piso_pct: Number(s.piso_pct),
        arrastrada,
      };
    });

    const avanceSprint =
      Math.round(
        subPartidas
          .filter((sp) => !sp.arrastrada)
          .reduce((acc, sp) => acc + (sp.pct_completado * sp.peso) / 100, 0) * 100,
      ) / 100;

    const resultado: AvanceSprint = {
      obra_codigo: codigo,
      tipo_casa: estado.tipo_casa,
      sprint,
      estado_obra: estado.estado as AvanceSprint['estado_obra'],
      sprint_actual: estado.sprint_actual,
      avance_sprint: avanceSprint,
      sub_partidas: subPartidas,
    };
    return NextResponse.json({ data: resultado });
  } catch (err) {
    console.error('/api/avance/obras/[codigo]/avance GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}

// PUT /api/avance/obras/{codigo}/avance — registrar avance de una sub-partida
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ codigo: string }> },
) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { codigo } = await params;

  try {
    const raw = (await req.json()) as Record<string, unknown>;
    const subPartidaId = Number(raw.sub_partida_id);
    if (!Number.isInteger(subPartidaId) || subPartidaId <= 0) {
      return NextResponse.json({ error: 'sub_partida_id inválido' }, { status: 400 });
    }
    const pctRaw = raw.pct_completado;
    const completadaRaw = raw.completada;

    const db = await getAdelanteDb();
    const estado = await leerEstado(db, codigo);
    if (!estado || !estado.tipo_casa)
      return NextResponse.json(
        { error: `Obra ${codigo} no iniciada o sin tipo de casa` },
        { status: 400 },
      );

    const tocaPct = pctRaw !== undefined || completadaRaw !== undefined;
    const tocaNc = 'nc_causa' in raw || 'nc_nota' in raw;
    if (!tocaPct && !tocaNc)
      return NextResponse.json({ error: 'Nada para actualizar.' }, { status: 400 });

    const pct = completadaRaw === true ? 100 : Number(pctRaw ?? 0);
    if (pct < 0 || pct > 100)
      return NextResponse.json({ error: 'pct_completado fuera de rango (0-100)' }, { status: 400 });
    const completada = completadaRaw === true || pct >= 100;
    const ncCausa = (raw.nc_causa as string | null | undefined) ?? null;
    const ncNota = (raw.nc_nota as string | null | undefined) ?? null;

    // sprint y partida de la sub-partida (para el congelado).
    const sp = await db
      .request()
      .input('id', sql.Int, subPartidaId)
      .query<{ sprint_numero: number; partida_id: number }>(
        'SELECT sprint_numero, partida_id FROM obc.sub_partidas WHERE id = @id',
      );
    if (sp.recordset.length === 0)
      return NextResponse.json({ error: 'Sub-partida no encontrada' }, { status: 404 });
    const { sprint_numero, partida_id } = sp.recordset[0]!;

    // Regla 1b (solo si tocamos %): el % no puede bajar del último cerrado.
    if (tocaPct) {
      const pisoQ = await db
        .request()
        .input('obra', sql.NVarChar(20), codigo)
        .input('sub', sql.Int, subPartidaId)
        .query<{ piso: number }>(`
          SELECT ISNULL(MAX(pct_completado), 0) AS piso
          FROM obc.cierre_produccion_snapshots
          WHERE sub_partida_id = @sub AND obra_codigo = @obra
        `);
      const piso = Number(pisoQ.recordset[0]?.piso ?? 0);
      if (pct < piso) {
        return NextResponse.json(
          { error: `No se puede bajar el avance: el último cierre dejó esta sub-partida en ${piso}%.` },
          { status: 400 },
        );
      }
    }

    const tx = new sql.Transaction(db);
    await tx.begin();
    try {
      if (tocaPct && pct > 0) {
        await congelarScopeSiHaceFalta(tx, codigo, 'sprint', sprint_numero, estado.tipo_casa);
        await congelarScopeSiHaceFalta(tx, codigo, 'partida', partida_id, estado.tipo_casa);
      }

      await new sql.Request(tx)
        .input('obra', sql.NVarChar(20), codigo)
        .input('sub', sql.Int, subPartidaId)
        .input('pct', sql.Decimal(5, 2), pct)
        .input('comp', sql.Bit, completada)
        .input('nc', sql.NVarChar(200), ncCausa)
        .input('nota', sql.NVarChar(sql.MAX), ncNota)
        .input('tocaPct', sql.Bit, tocaPct)
        .input('tocaNc', sql.Bit, tocaNc)
        .input('uid', sql.Int, session.idCol || null)
        .query(`
          MERGE obc.avance_sub_partidas AS dst
          USING (SELECT @obra AS obra_codigo, @sub AS sub_partida_id) AS src
            ON dst.obra_codigo = src.obra_codigo AND dst.sub_partida_id = src.sub_partida_id
          WHEN MATCHED THEN UPDATE SET
            pct_completado = CASE WHEN @tocaPct = 1 THEN @pct ELSE pct_completado END,
            completada     = CASE WHEN @tocaPct = 1 THEN @comp ELSE completada END,
            nc_causa       = CASE WHEN @tocaNc = 1 THEN @nc ELSE nc_causa END,
            nc_nota        = CASE WHEN @tocaNc = 1 THEN @nota ELSE nc_nota END,
            usuario_id = @uid, actualizado_en = SYSUTCDATETIME()
          WHEN NOT MATCHED THEN INSERT
            (obra_codigo, sub_partida_id, pct_completado, completada, nc_causa, nc_nota, usuario_id)
            VALUES (@obra, @sub,
                    CASE WHEN @tocaPct = 1 THEN @pct ELSE 0 END,
                    CASE WHEN @tocaPct = 1 THEN @comp ELSE 0 END,
                    CASE WHEN @tocaNc = 1 THEN @nc ELSE NULL END,
                    CASE WHEN @tocaNc = 1 THEN @nota ELSE NULL END,
                    @uid);
        `);

      await tx.commit();
    } catch (e) {
      try {
        await tx.rollback();
      } catch {
        /* ignore */
      }
      throw e;
    }

    return NextResponse.json({ data: { obra_codigo: codigo, sub_partida_id: subPartidaId, pct } });
  } catch (err) {
    console.error('/api/avance/obras/[codigo]/avance PUT error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
