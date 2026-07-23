import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { refrescarEstadoVenta } from '@/lib/avance/venta';
import type {
  EstadoVenta,
  MatrizAvance,
  MatrizObraFila,
  MatrizPartida,
  TipoCasa,
} from '@/lib/avance/types';

/**
 * GET /api/avance/matriz?proyecto=VN[&bloque=B][&semana=N]
 *
 * Matriz "Por Costos": filas = obras habilitadas (en ejecución), columnas =
 * partidas. Cada celda obra×partida es el PROMEDIO SIMPLE del % de las
 * sub-partidas de esa partida que aplican al tipo de casa de la obra. La
 * columna Crono usa los pesos de sprint efectivos; la General pondera por
 * presupuesto. Portado de la Azure Function `matriz.ts` de obrascontrol.
 */

interface ObraRow {
  codigo: string;
  bloque_letra: string;
  sprint_actual: number;
  tipo_casa: TipoCasa | null;
  estado_venta: EstadoVenta | null;
  congelada: boolean;
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const proyecto = params.get('proyecto') ? params.get('proyecto')!.toUpperCase() : null;
  const bloque = params.get('bloque')?.toUpperCase() || null;
  const semanaRaw = params.get('semana');
  const semana = semanaRaw ? Number(semanaRaw) : null;

  try {
    const db = await getAdelanteDb();
    await refrescarEstadoVenta(db);

    // 1) Obras en ejecución — SOLO de obc.obra_estado. El proyecto/bloque se
    //    derivan del código (formato PROYECTO-BLOQUE.NUMERO, ej. "VB-5.13").
    const obrasRes = await db
      .request()
      .input('proyectoLike', sql.NVarChar(10), proyecto ? `${proyecto}-%` : null)
      .query<{
        codigo: string;
        sprint_actual: number;
        tipo_casa: TipoCasa | null;
        estado_venta: EstadoVenta | null;
        estado: string;
      }>(`
        SELECT obra_codigo AS codigo, sprint_actual, tipo_casa, estado_venta, estado
        FROM obc.obra_estado
        WHERE estado IN ('en_ejecucion', 'en_espera') AND tipo_casa IS NOT NULL
          AND (@proyectoLike IS NULL OR obra_codigo LIKE @proyectoLike)
        ORDER BY obra_codigo
      `);
    const bloqueDe = (codigo: string) => codigo.split('-')[1]?.split('.')[0] ?? '';
    const obrasRaw: (ObraRow & { tipo_casa: TipoCasa })[] = obrasRes.recordset
      .filter((o) => Boolean(o.tipo_casa))
      .filter((o) => !bloque || bloqueDe(o.codigo) === bloque)
      .map((o) => ({
        codigo: o.codigo,
        sprint_actual: o.sprint_actual,
        tipo_casa: o.tipo_casa as TipoCasa,
        estado_venta: o.estado_venta,
        bloque_letra: bloqueDe(o.codigo),
        congelada: o.estado === 'en_espera',
      }));

    // 2) Partidas (columnas).
    const partidasRes = await db.request().query<{
      id: number;
      codigo: string;
      nombre: string;
      grupo_codigo: string | null;
      grupo_nombre: string | null;
    }>(`
      SELECT p.id, p.codigo, p.nombre,
             g.codigo AS grupo_codigo, g.nombre AS grupo_nombre
      FROM obc.partidas p
      LEFT JOIN obc.grupos_partida g ON g.id = p.grupo_id
      WHERE p.activo = 1
      ORDER BY p.orden, p.codigo
    `);
    const partidas: MatrizPartida[] = partidasRes.recordset.map((p) => ({
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      grupo_codigo: p.grupo_codigo,
      grupo_nombre: p.grupo_nombre,
    }));

    if (obrasRaw.length === 0) {
      const vacio: MatrizAvance = { proyecto: proyecto ?? 'TODOS', partidas, obras: [] };
      return NextResponse.json({ data: vacio });
    }

    // 3) Sub-partidas activas con su tipo de casa, partida y sprint.
    const subsRes = await db.request().query<{
      id: number;
      partida_id: number;
      sprint_numero: number;
      tipo_casa: TipoCasa;
    }>(`
      SELECT sp.id, sp.partida_id, sp.sprint_numero, t.tipo_casa
      FROM obc.sub_partidas sp
      JOIN obc.sub_partida_tipos t ON t.sub_partida_id = sp.id
      WHERE sp.activo = 1
    `);
    const subsPorTipo = new Map<TipoCasa, { id: number; partida_id: number; sprint: number }[]>();
    for (const s of subsRes.recordset) {
      const arr = subsPorTipo.get(s.tipo_casa) ?? [];
      arr.push({ id: s.id, partida_id: s.partida_id, sprint: s.sprint_numero });
      subsPorTipo.set(s.tipo_casa, arr);
    }

    // 4) Avances. Si la semana pedida tiene Cierre, el % sale de la FOTO del
    //    cierre (carry-forward: MAX sobre cierres ≤ esa semana). Si está abierta
    //    o no se pidió semana, usamos el estado VIVO.
    const obrasSet = new Set(obrasRaw.map((o) => o.codigo));
    let usarSnapshot = false;
    if (semana) {
      const cQ = await db
        .request()
        .input('sem', sql.BigInt, semana)
        .query<{ n: number }>(
          "SELECT COUNT(*) AS n FROM obc.cierres_produccion WHERE semana_operativa_id = @sem AND tipo = 'A'",
        );
      usarSnapshot = (cQ.recordset[0]?.n ?? 0) > 0;
    }
    const avRes = usarSnapshot
      ? await db
          .request()
          .input('sem', sql.BigInt, semana)
          .query<{ obra_codigo: string; sub_partida_id: number; pct_completado: number }>(`
            SELECT s.obra_codigo, s.sub_partida_id, MAX(s.pct_completado) AS pct_completado
            FROM obc.cierre_produccion_snapshots s
            JOIN obc.cierres_produccion cp ON cp.id = s.cierre_produccion_id
            WHERE cp.semana_operativa_id <= @sem
            GROUP BY s.obra_codigo, s.sub_partida_id
          `)
      : await db
          .request()
          .query<{ obra_codigo: string; sub_partida_id: number; pct_completado: number }>(`
            SELECT obra_codigo, sub_partida_id, pct_completado
            FROM obc.avance_sub_partidas
          `);
    const pctPorObraSub = new Map<string, number>();
    for (const a of avRes.recordset) {
      if (!obrasSet.has(a.obra_codigo)) continue;
      pctPorObraSub.set(`${a.obra_codigo}|${a.sub_partida_id}`, Number(a.pct_completado));
    }
    const pct = (obra: string, sub: number) => pctPorObraSub.get(`${obra}|${sub}`) ?? 0;

    // 5) Pesos de sprint efectivos (congelados o catálogo).
    const frozenRes = await db
      .request()
      .query<{ obra_codigo: string; scope_id: number; sub_partida_id: number; peso: number }>(`
        SELECT obra_codigo, scope_id, sub_partida_id, peso
        FROM obc.obra_pesos
        WHERE ambito = 'sprint'
      `);
    const frozenPesos = new Map<string, { sub_partida_id: number; peso: number }[]>();
    for (const r of frozenRes.recordset) {
      if (!obrasSet.has(r.obra_codigo)) continue;
      const k = `${r.obra_codigo}|${r.scope_id}`;
      const arr = frozenPesos.get(k) ?? [];
      arr.push({ sub_partida_id: r.sub_partida_id, peso: Number(r.peso) });
      frozenPesos.set(k, arr);
    }
    const catRes = await db.request().query<{
      sprint_numero: number;
      tipo_casa: string;
      sub_partida_id: number;
      peso: number;
    }>(`
      SELECT sprint_numero, tipo_casa, sub_partida_id, peso
      FROM obc.sub_partida_pesos_sprint
    `);
    const catPesos = new Map<string, { sub_partida_id: number; peso: number }[]>();
    for (const r of catRes.recordset) {
      const k = `${r.sprint_numero}|${r.tipo_casa}`;
      const arr = catPesos.get(k) ?? [];
      arr.push({ sub_partida_id: r.sub_partida_id, peso: Number(r.peso) });
      catPesos.set(k, arr);
    }
    const sprintsConSubsPorTipo = new Map<string, number[]>();
    for (const r of catRes.recordset) {
      const arr = sprintsConSubsPorTipo.get(r.tipo_casa) ?? [];
      if (!arr.includes(r.sprint_numero)) arr.push(r.sprint_numero);
      sprintsConSubsPorTipo.set(r.tipo_casa, arr);
    }
    const totalSprintsRes = await db
      .request()
      .query<{ tipo_casa: string; n: number }>(
        'SELECT tipo_casa, COUNT(*) AS n FROM obc.tipo_casa_sprints GROUP BY tipo_casa',
      );
    const totalSprintsPorTipo = new Map<string, number>();
    for (const r of totalSprintsRes.recordset) totalSprintsPorTipo.set(r.tipo_casa, Number(r.n));
    const sublessRes = await db.request().query<{ tipo_casa: string; sprint_global: number }>(`
      SELECT tcs.tipo_casa, tcs.sprint_global
      FROM obc.tipo_casa_sprints tcs
      WHERE NOT EXISTS (
        SELECT 1 FROM obc.sub_partidas sp
        JOIN obc.sub_partida_tipos t ON t.sub_partida_id = sp.id AND t.tipo_casa = tcs.tipo_casa
        WHERE sp.sprint_numero = tcs.sprint_global AND sp.activo = 1)
    `);
    const sublessPorTipo = new Map<string, number[]>();
    for (const r of sublessRes.recordset) {
      const arr = sublessPorTipo.get(r.tipo_casa) ?? [];
      arr.push(r.sprint_global);
      sublessPorTipo.set(r.tipo_casa, arr);
    }

    // 5b) Peso de PARTIDA (para el "General" ponderado por presupuesto).
    const opPartRes = await db
      .request()
      .query<{ obra_codigo: string; sub_partida_id: number; peso: number }>(
        "SELECT obra_codigo, sub_partida_id, peso FROM obc.obra_pesos WHERE ambito = 'partida'",
      );
    const pesoPartObra = new Map<string, number>();
    for (const r of opPartRes.recordset)
      if (obrasSet.has(r.obra_codigo))
        pesoPartObra.set(`${r.obra_codigo}|${r.sub_partida_id}`, Number(r.peso));
    const catPartRes = await db
      .request()
      .query<{ tipo_casa: string; sub_partida_id: number; peso: number }>(
        'SELECT tipo_casa, sub_partida_id, peso FROM obc.sub_partida_pesos_partida',
      );
    const pesoPartCat = new Map<string, number>();
    for (const r of catPartRes.recordset)
      pesoPartCat.set(`${r.tipo_casa}|${r.sub_partida_id}`, Number(r.peso));
    const pesoPartida = (obra: string, tipo: string, sub: number): number | null =>
      pesoPartObra.get(`${obra}|${sub}`) ?? pesoPartCat.get(`${tipo}|${sub}`) ?? null;

    // 5c) Presupuesto por obra+partida (Posting/Cost/última versión).
    const presupRes = await db
      .request()
      .query<{ works_no: string; task_no: string; monto: number }>(`
        SELECT works_no, task_no, SUM(line_amount) AS monto
        FROM bi.fact_presupuesto
        WHERE task_type = 'Posting' AND tipo_costo = 'Cost' AND CAST(es_ultima_version AS INT) = 1
        GROUP BY works_no, task_no
      `);
    const codigoPorPartida = new Map<number, string>();
    for (const p of partidas) codigoPorPartida.set(p.id, p.codigo.toUpperCase());
    const presupPorObra = new Map<string, { partidas: Map<string, number>; total: number }>();
    for (const r of presupRes.recordset) {
      let pe = presupPorObra.get(r.works_no);
      if (!pe) {
        pe = { partidas: new Map(), total: 0 };
        presupPorObra.set(r.works_no, pe);
      }
      const m = Number(r.monto) || 0;
      pe.partidas.set(r.task_no.toUpperCase(), m);
      pe.total += m;
    }

    // 6) Armar filas (celdas = promedio simple; crono = ponderado por sprint).
    const obras: MatrizObraFila[] = obrasRaw.map((o) => {
      const subs = subsPorTipo.get(o.tipo_casa) ?? [];

      const acum = new Map<number, { suma: number; n: number }>();
      for (const s of subs) {
        const c = acum.get(s.partida_id) ?? { suma: 0, n: 0 };
        c.suma += pct(o.codigo, s.id);
        c.n += 1;
        acum.set(s.partida_id, c);
      }
      const celdas: Record<number, number | null> = {};
      for (const p of partidas) {
        const c = acum.get(p.id);
        celdas[p.id] = !c || c.n === 0 ? null : redondear(c.suma / c.n);
      }

      // General = % acumulado PONDERADO POR PRESUPUESTO.
      const presup = presupPorObra.get(o.codigo);
      let costoActual = 0;
      if (presup && presup.total > 0) {
        for (const s of subs) {
          const pp = pesoPartida(o.codigo, o.tipo_casa, s.id);
          if (pp == null) continue;
          const monto = presup.partidas.get(codigoPorPartida.get(s.partida_id) ?? '') ?? 0;
          costoActual += (pct(o.codigo, s.id) / 100) * (pp / 100) * (monto / presup.total);
        }
      }
      const avanceGeneral = redondear(Math.min(100, costoActual * 100));

      // Crono ACUMULADO.
      const totalSprintsTipo = totalSprintsPorTipo.get(o.tipo_casa) ?? 0;
      const cfActual = (sprintsConSubsPorTipo.get(o.tipo_casa) ?? []).reduce((acc, spr) => {
        const ps =
          frozenPesos.get(`${o.codigo}|${spr}`) ?? catPesos.get(`${spr}|${o.tipo_casa}`) ?? [];
        return (
          acc + ps.reduce((s, pe) => s + (pct(o.codigo, pe.sub_partida_id) / 100) * (pe.peso / 100), 0)
        );
      }, 0);
      const sublessPasados = (sublessPorTipo.get(o.tipo_casa) ?? []).filter(
        (s) => s < o.sprint_actual,
      ).length;
      const avanceCrono =
        totalSprintsTipo > 0
          ? redondear(Math.min(100, ((cfActual + sublessPasados) / totalSprintsTipo) * 100))
          : 0;

      return {
        codigo: o.codigo,
        bloque_letra: o.bloque_letra,
        tipo_casa: o.tipo_casa,
        sprint_actual: o.sprint_actual,
        estado_venta: o.estado_venta,
        congelada: o.congelada,
        avance_crono: avanceCrono,
        avance_general: avanceGeneral,
        celdas,
      };
    });

    const resultado: MatrizAvance = { proyecto: proyecto ?? 'TODOS', partidas, obras };
    return NextResponse.json({ data: resultado });
  } catch (err) {
    console.error('/api/avance/matriz error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
