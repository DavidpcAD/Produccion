import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getDb, sql } from '@/lib/db';
import { bcConstructionConfigured, subirVersionPresupuesto, subirDescompuesto, getWork, setAreaProrrateadaWork, type BulkLine, type DecompLine } from '@/lib/bc-construction';
import { actualizarTareasProyecto, setAreaProrrateadaJob } from '@/lib/bc-client';

export const runtime = 'nodejs';

// Sube el presupuesto de una obra a Business Central (versión + descompuesto).
// Recibe las líneas ya parseadas del Excel (endpoint /parse) y las empuja vía el API
// construction, replicando el flujo de Power Apps.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const body = await req.json().catch(() => ({}));

  const worksNo = String(body.worksNo ?? '').trim();
  const verBase = body.verBase ? String(body.verBase) : null;
  const plantilla = body.plantilla as { porTipo?: Record<string, BulkLine[]> } | undefined;
  const descompuesto = body.descompuesto as { lineas?: DecompLine[] } | undefined;
  // Área prorrateada (m²) que captura el presupuestista al subir; va al Job de BC y
  // a la obra de la app. null = no vino (no se toca).
  const areaRaw = body.areaProrrateada;
  const areaProrrateada = areaRaw != null && areaRaw !== '' && !Number.isNaN(Number(areaRaw)) ? Number(areaRaw) : null;

  if (!worksNo) return NextResponse.json({ error: 'Falta la obra (worksNo)' }, { status: 400 });

  // Líneas de versión = Venta + Costo + Indirecto (+ Producción si viene).
  const lineasVersion: BulkLine[] = [];
  for (const tipo of ['Sales', 'Cost', 'Indirect Cost']) {
    for (const l of plantilla?.porTipo?.[tipo] ?? []) lineasVersion.push(l);
  }
  const materiales = descompuesto?.lineas ?? [];

  if (lineasVersion.length === 0 && materiales.length === 0) {
    return NextResponse.json({ error: 'No hay líneas para subir (cargá la Plantilla y/o el Descompuesto)' }, { status: 400 });
  }

  if (!bcConstructionConfigured()) {
    return NextResponse.json({ error: 'Business Central no está configurado en este entorno.' }, { status: 400 });
  }

  const resultado: Record<string, unknown> = { worksNo };
  try {
    if (lineasVersion.length > 0) {
      const r = await subirVersionPresupuesto(worksNo, lineasVersion, verBase);
      resultado.version = r.versionCode;
      resultado.enviadas = r.enviadas;
      resultado.totales = r.totals;
      resultado.resultadoBC = r.resultado;
    }
    if (materiales.length > 0) {
      const d = await subirDescompuesto(worksNo, materiales);
      resultado.descompuestoChunks = d.chunks;
      resultado.materiales = d.enviadas;
      resultado.resultadoDescompuestoBC = d.resultado;
    }
    // Totales/versión + todos los importes de la obra en BC (para el panel de
    // detalle). getWork devuelve el registro completo de BC; se necesita sobre
    // todo cuando solo se sube el descompuesto (así el panel muestra venta/costo/
    // indirecto/resultado y la versión vigente) y para exponer campos extra como
    // "Importe línea previsto" / "Importe coste total descompuesto".
    const work = await getWork(worksNo);
    if (work) {
      if (!resultado.totales) {
        resultado.totales = { salesLineAmount: work.salesLineAmount, costLineAmount: work.costLineAmount, indirectCostLineAmount: work.indirectCostLineAmount, result: work.result };
        resultado.versionActual = work.filterVersionCode ?? null;
      }
      // Solo los campos numéricos (importes/cantidades) del registro de BC, para
      // el desglose "Ver todos los importes de la obra" del panel.
      resultado.obraCampos = Object.fromEntries(
        Object.entries(work as unknown as Record<string, unknown>).filter(([, v]) => typeof v === 'number')
      );
    }
    // Propagar al Proyecto (Job): crear/actualizar sus tareas desde la obra
    // ("Actualizar tareas proyecto", Obra→Job). Sin esto el Job queda en 0. NO
    // fatal: si falla, el presupuesto ya quedó en la obra (se avisa en la respuesta).
    try {
      await actualizarTareasProyecto(worksNo);
      resultado.tareasProyecto = 'ok';
    } catch (e) {
      resultado.tareasProyectoError = e instanceof Error ? e.message : String(e);
    }

    // Área prorrateada (m²): al Proyecto (Job) y a la Obra (works) de BC —para que
    // se vea en los dos— y a la obra de la app (dbo.Obra) para el detalle. Cada
    // destino es independiente y no fatal (un fallo no tumba la carga ni los otros).
    if (areaProrrateada != null) {
      resultado.areaProrrateada = areaProrrateada;
      try { await setAreaProrrateadaJob(worksNo, areaProrrateada); }
      catch (e) { resultado.areaJobError = e instanceof Error ? e.message : String(e); }
      try { await setAreaProrrateadaWork(worksNo, areaProrrateada); }
      catch (e) { resultado.areaObraError = e instanceof Error ? e.message : String(e); }
      try {
        const db = await getDb();
        await db.request()
          .input('area', sql.Decimal(18, 2), areaProrrateada)
          .input('no', sql.NVarChar(50), worksNo)
          .query('UPDATE dbo.Obra SET areaProrrateadaM2 = @area WHERE numeroObra = @no');
      } catch { /* no fatal: BC ya quedó con el área */ }
    }

    await logAudit({ idColAccion: session.idCol, accion: 'SUBIR_PRESUPUESTO', entidad: 'Obra', idEntidad: 0, detalleNuevo: { worksNo, version: resultado.version, lineas: lineasVersion.length, materiales: materiales.length, areaProrrateada, tareasProyecto: resultado.tareasProyecto ?? resultado.tareasProyectoError }, ip });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/presupuesto POST error:', err);
    return NextResponse.json({ error: `Error subiendo a Business Central: ${msg}`, parcial: resultado }, { status: 502 });
  }
}
