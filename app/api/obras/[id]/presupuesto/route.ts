import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { bcConstructionConfigured } from '@/lib/bc-construction';
import { resumenPresupuestoObra } from '@/lib/bc/presupuestos';

export const runtime = 'nodejs';

// Resumen de presupuesto de la obra (venta / coste directo / coste indirecto /
// resultado + versión vigente). Es "la misma info" que muestra el panel
// "Información obra" de BC, pero calculada sobre las LÍNEAS de presupuesto y no
// sobre los importes de la cabecera: esos son FlowFields filtrados por
// works.filterVersionCode y se leen en ₡0 cuando el filtro apunta a un reestudio
// sin importes (ver lib/bc/presupuestos.ts::versionVigente). Si BC devuelve la obra
// en ₡0 se cae al snapshot ETL (pro_bi) — hay obras migradas a la compañía nueva de
// BC con la estructura de partidas pero sin importes.
//   cargado=false        → no hay presupuesto en ninguna fuente.
//   cargado=false + estructura=true → hay partidas cargadas, pero todas en ₡0.
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

  try {
    const p = await resumenPresupuestoObra(String(numeroObra).trim());
    if (!p) {
      return NextResponse.json({
        cargado: false, estructura: false, numeroObra,
        bcConfigurado: bcConstructionConfigured(),
      });
    }
    const cargado = !!(p.venta || p.coste || p.indirecto);
    return NextResponse.json({
      cargado,
      // Partidas cargadas pero sin importes: la obra "existe" en BC con su
      // estructura y el detalle por partida sí se puede abrir.
      estructura: !cargado && p.partidas > 0,
      partidas: p.partidas,
      fuente: p.fuente,
      compania: p.compania ?? null,
      fecha: p.fecha,
      numeroObra,
      version: p.version,
      venta: p.venta,
      coste: p.coste,
      indirecto: p.indirecto,
      resultado: p.resultado,
    });
  } catch (e: unknown) {
    // BC caído / no disponible: no rompemos el detalle de la obra, solo avisamos.
    return NextResponse.json({ cargado: false, error: String((e as Error)?.message ?? e) }, { status: 200 });
  }
}
