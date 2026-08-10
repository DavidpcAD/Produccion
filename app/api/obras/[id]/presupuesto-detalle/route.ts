import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { detallePresupuestoBC } from '@/lib/bc/presupuestos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Detalle del presupuesto de la obra (versión vigente) desglosado por partida y
 * por grupo, tomado del snapshot ETL pro_bi.fact_presupuesto — la misma fuente
 * que usan los reportes y la app AD Obras Control ("Detalle del presupuesto").
 * Filtra costo directo a nivel Posting de la última versión (mismo criterio que
 * calcularObraAvance).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { id } = await params;

  // N° de obra (works_no) desde dbo.Obra.
  const db = await getDb();
  const or = await db.request().input('id', sql.BigInt, id)
    .query<{ numeroObra: string }>('SELECT numeroObra FROM dbo.Obra WHERE idObra = @id');
  const worksNo = or.recordset[0]?.numeroObra?.trim();
  if (!worksNo) return NextResponse.json({ error: 'Obra no encontrada' }, { status: 404 });

  try {
    const bi = await getAdelanteDb();
    const [lineas, cat] = await Promise.all([
      bi.request().input('o', sql.NVarChar(20), worksNo).query<{ taskNo: string; monto: number; descripcion: string | null; versionCode: string | null }>(`
        SELECT fp.task_no AS taskNo, SUM(fp.line_amount) AS monto,
               MAX(fp.description) AS descripcion, MAX(fp.version_code) AS versionCode
        FROM pro_bi.fact_presupuesto fp
        WHERE fp.works_no = @o AND fp.task_type = 'Posting' AND fp.tipo_costo = 'Cost'
          AND CAST(fp.es_ultima_version AS INT) = 1
        GROUP BY fp.task_no`),
      bi.request().query<{ codigo: string; nombre: string; grupo: string | null; grupoOrden: number | null; partidaOrden: number | null }>(`
        SELECT p.codigo, p.nombre, g.nombre AS grupo, g.orden AS grupoOrden, p.orden AS partidaOrden
        FROM pro_obc.partidas p
        LEFT JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id`),
    ]);

    // Catálogo de partidas (código → nombre/grupo/orden).
    const catMap = new Map<string, { nombre: string; grupo: string; grupoOrden: number; partidaOrden: number }>();
    for (const c of cat.recordset) {
      catMap.set(c.codigo.toUpperCase(), {
        nombre: c.nombre, grupo: c.grupo ?? 'Otros',
        grupoOrden: c.grupoOrden ?? 999, partidaOrden: c.partidaOrden ?? 999,
      });
    }

    let total = 0;
    let version: string | null = null;
    const partidas = lineas.recordset.map((l) => {
      const monto = Number(l.monto) || 0;
      total += monto;
      if (!version && l.versionCode) version = l.versionCode.trim();
      const meta = catMap.get(l.taskNo.toUpperCase());
      return {
        codigo: l.taskNo,
        nombre: meta?.nombre ?? l.descripcion ?? l.taskNo,
        grupo: meta?.grupo ?? 'Otros',
        grupoOrden: meta?.grupoOrden ?? 999,
        partidaOrden: meta?.partidaOrden ?? 999,
        monto,
      };
    });

    // Sin filas en el snapshot ETL → fallback a BC en vivo (workLines). Cubre obras
    // administrativas o presupuestadas después de la última corrida del ETL (que en
    // BC ya tienen presupuesto pero aún no están en pro_bi.fact_presupuesto).
    if (partidas.length === 0) {
      const bc = await detallePresupuestoBC(worksNo).catch(() => null);
      if (bc && bc.partidas.length > 0) {
        const grupoDe = (taskNo: string) =>
          bc.grupos.find((g) => g.task_no === taskNo.split('.')[0])?.descripcion ?? 'Otros';
        return NextResponse.json({
          cargado: true,
          fuente: 'bc',
          worksNo,
          version: bc.version_code,
          total: bc.total_costo,
          grupos: bc.grupos.map((g) => ({ nombre: g.descripcion, monto: g.total, peso: g.peso_pct })),
          partidas: bc.partidas.map((p) => ({
            codigo: p.task_no,
            nombre: p.descripcion,
            grupo: grupoDe(p.task_no),
            monto: p.importe,
            peso: p.peso_pct,
          })),
        });
      }
    }

    // peso% por partida + orden estable (grupo, código).
    for (const p of partidas) (p as { peso?: number }).peso = total > 0 ? (p.monto / total) * 100 : 0;
    partidas.sort((a, b) =>
      a.grupoOrden - b.grupoOrden || a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));

    // Resumen por grupo.
    const gmap = new Map<string, { nombre: string; orden: number; monto: number }>();
    for (const p of partidas) {
      const g = gmap.get(p.grupo) ?? { nombre: p.grupo, orden: p.grupoOrden, monto: 0 };
      g.monto += p.monto;
      gmap.set(p.grupo, g);
    }
    const grupos = Array.from(gmap.values())
      .map((g) => ({ nombre: g.nombre, monto: g.monto, peso: total > 0 ? (g.monto / total) * 100 : 0 }))
      .sort((a, b) => (gmap.get(a.nombre)!.orden - gmap.get(b.nombre)!.orden));

    return NextResponse.json({
      cargado: partidas.length > 0,
      worksNo, version, total,
      grupos,
      partidas: partidas.map((p) => ({ codigo: p.codigo, nombre: p.nombre, grupo: p.grupo, monto: p.monto, peso: (p as { peso?: number }).peso ?? 0 })),
    });
  } catch (e: unknown) {
    return NextResponse.json({ cargado: false, error: e instanceof Error ? e.message : 'Error' }, { status: 200 });
  }
}
