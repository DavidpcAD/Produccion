import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { calcularResumenMes, refrescarEstadoVenta, type FiltroVenta } from '@/lib/avance/reportes';

export const dynamic = 'force-dynamic';

const FILTROS: FiltroVenta[] = ['todas', 'formalizadas', 'no_formalizadas'];

/**
 * GET /api/avance/reportes/resumen-mes?semana=N&venta=todas — Resumen del Mes
 * (general + financiero): corre el reporte semanal para cada semana operativa
 * del mismo mes que la seleccionada y devuelve la tabla Crono/Costo esperado vs
 * real + los totales financieros producidos, con acumulado y diferencia.
 * Puerto server-side del hook `useResumenMes`.
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

  try {
    const db = await getAdelanteDb();
    await refrescarEstadoVenta(db);
    const data = await calcularResumenMes(db, semanaId, venta);
    if (!data) return NextResponse.json({ error: 'Semana no encontrada' }, { status: 404 });
    return NextResponse.json({ data });
  } catch (err) {
    console.error('/api/avance/reportes/resumen-mes GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
