import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { bcConstructionConfigured, subirVersionPresupuesto, subirDescompuesto, getWork, type BulkLine, type DecompLine } from '@/lib/bc-construction';

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
    // Totales/versión actuales de la obra en BC (para el panel de detalle).
    // Necesario sobre todo cuando solo se subió el descompuesto: así el panel
    // muestra venta/costo/indirecto/resultado y la versión vigente de la obra.
    if (!resultado.totales) {
      const work = await getWork(worksNo);
      if (work) {
        resultado.totales = { salesLineAmount: work.salesLineAmount, costLineAmount: work.costLineAmount, indirectCostLineAmount: work.indirectCostLineAmount, result: work.result };
        resultado.versionActual = work.filterVersionCode ?? null;
      }
    }
    await logAudit({ idColAccion: session.idCol, accion: 'SUBIR_PRESUPUESTO', entidad: 'Obra', idEntidad: 0, detalleNuevo: { worksNo, version: resultado.version, lineas: lineasVersion.length, materiales: materiales.length }, ip });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/presupuesto POST error:', err);
    return NextResponse.json({ error: `Error subiendo a Business Central: ${msg}`, parcial: resultado }, { status: 502 });
  }
}
