import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { bcConstructionConfigured, getWork } from '@/lib/bc-construction';

export const runtime = 'nodejs';

// Resumen de presupuesto de la obra traído de Business Central (venta / coste
// directo / coste indirecto / resultado + versión vigente). Es "la misma info"
// que muestra el panel "Información obra" de BC. Si BC no tiene la obra (o no hay
// versión), `cargado=false` → todavía no se ha presupuestado.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { id } = await params;

  const db = await getDb();
  const r = await db.request().input('id', sql.BigInt, id).query<{ numeroObra: string }>(
    'SELECT numeroObra FROM dbo.Obra WHERE idObra = @id');
  const numeroObra = r.recordset[0]?.numeroObra;
  if (!numeroObra) return NextResponse.json({ error: 'Obra no encontrada' }, { status: 404 });

  if (!bcConstructionConfigured()) {
    return NextResponse.json({ cargado: false, bcConfigurado: false, numeroObra });
  }

  try {
    const w = await getWork(String(numeroObra).trim());
    if (!w) return NextResponse.json({ cargado: false, numeroObra });
    const venta = Number(w.salesLineAmount ?? 0);
    const coste = Number(w.costLineAmount ?? 0);
    const indirecto = Number(w.indirectCostLineAmount ?? 0);
    const resultado = Number(w.result ?? 0);
    const version = (w.filterVersionCode ?? '').trim() || null;
    const cargado = !!(version || venta || coste || indirecto);
    return NextResponse.json({ cargado, numeroObra, version, venta, coste, indirecto, resultado });
  } catch (e: unknown) {
    // BC caído / no disponible: no rompemos el detalle de la obra, solo avisamos.
    return NextResponse.json({ cargado: false, error: String((e as Error)?.message ?? e) }, { status: 200 });
  }
}
