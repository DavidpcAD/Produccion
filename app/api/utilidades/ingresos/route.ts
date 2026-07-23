import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { resolverRango, parseCsv, contarMeses, restarMeses } from '@/lib/utilidades/periodo';

// GET /api/utilidades/ingresos?anio=&mes=  (o desde/hasta)&lotes=
//
// KPIs de ingresos/utilidad del período + comparación con el período anterior
// (mismo largo, shifteado hacia atrás) + desglose por lote + evolución mensual
// de los últimos 24 meses. Portado de la Azure Function `utilidades-ingresos`.
//
// Depende de las vistas del schema `uti`:
//   uti.v_ingresos_utilidad_por_lote, uti.v_porcentaje_utilidad_mensual.

const KPIS_VACIOS = { ingresos: 0, ingreso_neto_ad: 0, utilidad: 0, porcentaje: null };

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const rango = resolverRango(sp);
  if (!rango) {
    return NextResponse.json(
      { error: 'Falta período — usar (anio, mes) o (desdeAnio, desdeMes, hastaAnio, hastaMes)' },
      { status: 400 },
    );
  }
  const lotes = parseCsv(sp, 'lotes');
  const lotesClause =
    lotes.length > 0 ? `AND lote IN (${lotes.map((_, i) => `@lote${i}`).join(',')})` : '';

  // "Período anterior" = rango shifteado hacia atrás por su propia longitud.
  const longitud = contarMeses(rango.desdeAnio, rango.desdeMes, rango.hastaAnio, rango.hastaMes);
  const antDesde = restarMeses(rango.desdeAnio, rango.desdeMes, longitud);
  const antHasta = restarMeses(rango.hastaAnio, rango.hastaMes, longitud);
  const antDesdeYM = antDesde.anio * 100 + antDesde.mes;
  const antHastaYM = antHasta.anio * 100 + antHasta.mes;

  try {
    const db = await getAdelanteDb();

    const kpisSql = `
      SELECT
        COALESCE(SUM(ingresos), 0)        AS ingresos,
        COALESCE(SUM(ingreso_neto_ad), 0) AS ingreso_neto_ad,
        COALESCE(SUM(utilidad), 0)        AS utilidad
      FROM uti.v_ingresos_utilidad_por_lote
      WHERE (anio * 100 + mes) BETWEEN @desdeYM AND @hastaYM ${lotesClause}
    `;
    const pctSql = `
      SELECT AVG(porcentaje_utilidad) AS porcentaje_utilidad
      FROM uti.v_porcentaje_utilidad_mensual
      WHERE (anio * 100 + mes) BETWEEN @desdeYM AND @hastaYM
    `;

    // KPIs período actual.
    const kpisReq = db
      .request()
      .input('desdeYM', sql.Int, rango.desdeYM)
      .input('hastaYM', sql.Int, rango.hastaYM);
    lotes.forEach((l, i) => kpisReq.input(`lote${i}`, sql.NVarChar(100), l));
    const kpisRes = await kpisReq.query(kpisSql);

    const pctRes = await db
      .request()
      .input('desdeYM', sql.Int, rango.desdeYM)
      .input('hastaYM', sql.Int, rango.hastaYM)
      .query(pctSql);

    const kpisActual = {
      ingresos: Number(kpisRes.recordset[0]?.ingresos ?? 0),
      ingreso_neto_ad: Number(kpisRes.recordset[0]?.ingreso_neto_ad ?? 0),
      utilidad: Number(kpisRes.recordset[0]?.utilidad ?? 0),
      porcentaje: pctRes.recordset[0]?.porcentaje_utilidad ?? null,
    };

    // KPIs período anterior.
    const kpisAntReq = db
      .request()
      .input('desdeYM', sql.Int, antDesdeYM)
      .input('hastaYM', sql.Int, antHastaYM);
    lotes.forEach((l, i) => kpisAntReq.input(`lote${i}`, sql.NVarChar(100), l));
    const kpisAntRes = await kpisAntReq.query(kpisSql);

    const pctAntRes = await db
      .request()
      .input('desdeYM', sql.Int, antDesdeYM)
      .input('hastaYM', sql.Int, antHastaYM)
      .query(pctSql);

    const kpisAnterior = kpisRes.recordset[0]
      ? {
          ingresos: Number(kpisAntRes.recordset[0]?.ingresos ?? 0),
          ingreso_neto_ad: Number(kpisAntRes.recordset[0]?.ingreso_neto_ad ?? 0),
          utilidad: Number(kpisAntRes.recordset[0]?.utilidad ?? 0),
          porcentaje: pctAntRes.recordset[0]?.porcentaje_utilidad ?? null,
        }
      : KPIS_VACIOS;

    // Por lote (agregado en el rango).
    const porLoteReq = db
      .request()
      .input('desdeYM', sql.Int, rango.desdeYM)
      .input('hastaYM', sql.Int, rango.hastaYM);
    lotes.forEach((l, i) => porLoteReq.input(`lote${i}`, sql.NVarChar(100), l));
    const porLoteRes = await porLoteReq.query(`
      SELECT
        lote,
        SUM(ingresos)        AS ingresos,
        SUM(ingreso_neto_ad) AS ingreso_neto_ad,
        SUM(utilidad)        AS utilidad
      FROM uti.v_ingresos_utilidad_por_lote
      WHERE (anio * 100 + mes) BETWEEN @desdeYM AND @hastaYM ${lotesClause}
      GROUP BY lote
      ORDER BY SUM(ingresos) DESC
    `);

    // Evolución: últimos 24 meses terminando en el `hasta` del rango (mensual).
    const evRes = await db
      .request()
      .input('hastaAnio', sql.SmallInt, rango.hastaAnio)
      .input('hastaMes', sql.TinyInt, rango.hastaMes).query(`
        SELECT
          anio, mes,
          COALESCE(SUM(ingresos), 0)        AS ingresos,
          COALESCE(SUM(ingreso_neto_ad), 0) AS ingreso_neto_ad,
          COALESCE(SUM(utilidad), 0)        AS utilidad
        FROM uti.v_ingresos_utilidad_por_lote
        WHERE (anio * 100 + mes) <= (@hastaAnio * 100 + @hastaMes)
          AND (anio * 100 + mes) >  ((@hastaAnio - 2) * 100 + @hastaMes)
        GROUP BY anio, mes
        ORDER BY anio, mes
      `);

    return NextResponse.json({
      kpisActual,
      kpisAnterior,
      porLote: porLoteRes.recordset,
      evolucionComparada: evRes.recordset,
    });
  } catch (e) {
    console.error('Error en GET /api/utilidades/ingresos:', e);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
