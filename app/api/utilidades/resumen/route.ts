import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { resolverRango, parseCsv } from '@/lib/utilidades/periodo';
import { REPORTE_CACHE } from '@/lib/cache-headers';

// GET /api/utilidades/resumen?anio=&mes=  (o desde/hasta)&tipos=&lotes=
//
// Ecuación de utilidad + componentes de la utilidad gastada + distribución por
// tipo de movimiento + movimientos/devoluciones por lote. Portado de la Azure
// Function `utilidades-resumen`. Todo se SUMA sobre el rango de meses.
//
// Depende de las vistas del schema `uti`:
//   pro_uti.v_resumen_mensual, pro_uti.v_ingresos_utilidad_por_lote,
//   pro_uti.v_por_tipo_movimiento, pro_uti.v_resumen_mensual_por_lote
// que a su vez leen dbo.*/pro_app.vw_utilidad_powerbi (ver docs/migracion-adelantedb.md).

const ECUACION_VACIA = {
  utilidad_ingresada: 0,
  devolucion_utilidad: 0,
  utilidad_total: 0,
  utilidad_gastada: 0,
  utilidad_neta: 0,
  ingreso_bruto: 0,
  ingreso_neto_ad: 0,
};

const COMPONENTES_VACIOS = {
  inversion_casas: 0,
  inversion_proyectos: 0,
  otros: 0,
  salida_quinta: 0,
  salida_homes: 0,
  salida_socios: 0,
  credito_clientes: 0,
  credito_colaboradores: 0,
  compra_maquinaria: 0,
};

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
  const tipos = parseCsv(sp, 'tipos');
  const lotes = parseCsv(sp, 'lotes');

  try {
    const db = await getAdelanteDb();

    // Ecuación + componentes de la utilidad gastada — SUM sobre el rango.
    const ecuRes = await db
      .request()
      .input('desdeYM', sql.Int, rango.desdeYM)
      .input('hastaYM', sql.Int, rango.hastaYM).query(`
        SELECT
          SUM(utilidad_ingresada)     AS utilidad_ingresada,
          SUM(devolucion_utilidad)    AS devolucion_utilidad,
          SUM(utilidad_total)         AS utilidad_total,
          SUM(utilidad_gastada)       AS utilidad_gastada,
          SUM(utilidad_neta)          AS utilidad_neta,
          SUM(inversion_casas)        AS inversion_casas,
          SUM(inversion_proyectos)    AS inversion_proyectos,
          SUM(otros)                  AS otros,
          SUM(salida_quinta)          AS salida_quinta,
          SUM(salida_homes)           AS salida_homes,
          SUM(salida_socios)          AS salida_socios,
          SUM(credito_clientes)       AS credito_clientes,
          SUM(credito_colaboradores)  AS credito_colaboradores,
          SUM(compra_maquinaria)      AS compra_maquinaria
        FROM pro_uti.v_resumen_mensual
        WHERE (anio * 100 + mes) BETWEEN @desdeYM AND @hastaYM
      `);
    const ecuRow = ecuRes.recordset[0];

    // Ingresos del período (Bruto + Neto AD).
    const ingRes = await db
      .request()
      .input('desdeYM', sql.Int, rango.desdeYM)
      .input('hastaYM', sql.Int, rango.hastaYM).query(`
        SELECT
          COALESCE(SUM(ingresos), 0)        AS ingreso_bruto,
          COALESCE(SUM(ingreso_neto_ad), 0) AS ingreso_neto_ad
        FROM pro_uti.v_ingresos_utilidad_por_lote
        WHERE (anio * 100 + mes) BETWEEN @desdeYM AND @hastaYM
      `);
    const ingRow = ingRes.recordset[0];

    const ecuacionPrincipal = ecuRow
      ? {
          utilidad_ingresada: Number(ecuRow.utilidad_ingresada ?? 0),
          devolucion_utilidad: Number(ecuRow.devolucion_utilidad ?? 0),
          utilidad_total: Number(ecuRow.utilidad_total ?? 0),
          utilidad_gastada: Number(ecuRow.utilidad_gastada ?? 0),
          utilidad_neta: Number(ecuRow.utilidad_neta ?? 0),
          ingreso_bruto: Number(ingRow?.ingreso_bruto ?? 0),
          ingreso_neto_ad: Number(ingRow?.ingreso_neto_ad ?? 0),
        }
      : ECUACION_VACIA;

    const componentesGastada = ecuRow
      ? {
          inversion_casas: Number(ecuRow.inversion_casas ?? 0),
          inversion_proyectos: Number(ecuRow.inversion_proyectos ?? 0),
          otros: Number(ecuRow.otros ?? 0),
          salida_quinta: Number(ecuRow.salida_quinta ?? 0),
          salida_homes: Number(ecuRow.salida_homes ?? 0),
          salida_socios: Number(ecuRow.salida_socios ?? 0),
          credito_clientes: Number(ecuRow.credito_clientes ?? 0),
          credito_colaboradores: Number(ecuRow.credito_colaboradores ?? 0),
          compra_maquinaria: Number(ecuRow.compra_maquinaria ?? 0),
        }
      : COMPONENTES_VACIOS;

    // Distribución por tipo de movimiento — GROUP BY tipo, SUM en el rango.
    const distReq = db
      .request()
      .input('desdeYM', sql.Int, rango.desdeYM)
      .input('hastaYM', sql.Int, rango.hastaYM);
    tipos.forEach((t, i) => distReq.input(`tipo${i}`, sql.NVarChar(50), t));
    const tiposClause =
      tipos.length > 0
        ? `AND tipo_movimiento IN (${tipos.map((_, i) => `@tipo${i}`).join(',')})`
        : '';
    const distRes = await distReq.query(`
      SELECT
        tipo_movimiento,
        SUM(monto_total)          AS monto_total,
        SUM(cantidad_movimientos) AS cantidad_movimientos
      FROM pro_uti.v_por_tipo_movimiento
      WHERE (anio * 100 + mes) BETWEEN @desdeYM AND @hastaYM ${tiposClause}
      GROUP BY tipo_movimiento
      ORDER BY SUM(monto_total) DESC
    `);

    // Devolución y movimientos por lote — GROUP BY lote, SUM en el rango.
    const lotesClause =
      lotes.length > 0 ? `AND lote IN (${lotes.map((_, i) => `@lote${i}`).join(',')})` : '';

    const devReq = db
      .request()
      .input('desdeYM', sql.Int, rango.desdeYM)
      .input('hastaYM', sql.Int, rango.hastaYM);
    lotes.forEach((l, i) => devReq.input(`lote${i}`, sql.NVarChar(100), l));
    const devRes = await devReq.query(`
      SELECT lote, SUM(devolucion_utilidad) AS monto
      FROM pro_uti.v_resumen_mensual_por_lote
      WHERE (anio * 100 + mes) BETWEEN @desdeYM AND @hastaYM ${lotesClause}
      GROUP BY lote
      HAVING SUM(devolucion_utilidad) <> 0
      ORDER BY SUM(devolucion_utilidad)
    `);

    const movReq = db
      .request()
      .input('desdeYM', sql.Int, rango.desdeYM)
      .input('hastaYM', sql.Int, rango.hastaYM);
    lotes.forEach((l, i) => movReq.input(`lote${i}`, sql.NVarChar(100), l));
    const movRes = await movReq.query(`
      SELECT lote, SUM(monto_total) AS monto
      FROM pro_uti.v_resumen_mensual_por_lote
      WHERE (anio * 100 + mes) BETWEEN @desdeYM AND @hastaYM ${lotesClause}
      GROUP BY lote
      ORDER BY SUM(monto_total) DESC
    `);

    return NextResponse.json({
      ecuacionPrincipal,
      componentesGastada,
      distribucionPorTipo: distRes.recordset,
      devolucionPorLote: devRes.recordset,
      movimientosPorLote: movRes.recordset,
    }, { headers: REPORTE_CACHE });
  } catch (e) {
    console.error('Error en GET /api/utilidades/resumen:', e);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
