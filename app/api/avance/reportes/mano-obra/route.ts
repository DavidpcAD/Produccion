import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { refrescarEstadoVenta, type FiltroVenta } from '@/lib/avance/reportes';
import { calcularReporteMO, calcularResumenMesMO } from '@/lib/avance/reporte-mo';

export const dynamic = 'force-dynamic';

const FILTROS: FiltroVenta[] = ['todas', 'formalizadas', 'no_formalizadas'];

/**
 * GET /api/avance/reportes/mano-obra?semana=N&venta=todas — Reporte de Mano de
 * Obra de una semana: KPIs (producción, horas hombre, costos) + distribución por
 * obra. Puerto server-side de obrascontrol (ManoObraReporteVista / calcularManoObra).
 *
 * Con &modo=resumen-mes devuelve, en cambio, el Resumen del Mes de M.O. (todas
 * las semanas del mismo mes) — carga bajo demanda, es más pesado.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const sp = new URL(req.url).searchParams;
  const semanaId = Number(sp.get('semana'));
  if (!Number.isInteger(semanaId) || semanaId <= 0) {
    return NextResponse.json({ error: 'Parámetro "semana" inválido' }, { status: 400 });
  }
  const ventaRaw = sp.get('venta') ?? 'todas';
  const venta: FiltroVenta = FILTROS.includes(ventaRaw as FiltroVenta)
    ? (ventaRaw as FiltroVenta)
    : 'todas';
  const modo = sp.get('modo');

  try {
    const db = await getAdelanteDb();
    await refrescarEstadoVenta(db);
    if (modo === 'resumen-mes') {
      const data = await calcularResumenMesMO(db, semanaId, venta);
      if (!data) return NextResponse.json({ error: 'Semana no encontrada' }, { status: 404 });
      return NextResponse.json({ data });
    }
    const data = await calcularReporteMO(db, semanaId, venta);
    if (!data) return NextResponse.json({ error: 'Semana no encontrada' }, { status: 404 });
    return NextResponse.json({ data });
  } catch (err) {
    console.error('/api/avance/reportes/mano-obra GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
