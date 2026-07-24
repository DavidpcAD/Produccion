import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { parsePlantilla, parseDescompuesto } from '@/lib/presupuesto-parse';

export const runtime = 'nodejs';

// Recibe uno o varios Excel y AUTO-DETECTA cuál es Plantilla (Venta/Costo/Indirectos) y
// cuál es Descompuesto (materiales), sin importar en qué campo se subió. Devuelve las
// líneas parseadas para previsualizar antes de subir a Business Central.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: 'Subí los archivos Excel' }, { status: 400 }); }

  const files: File[] = [];
  for (const v of form.values()) if (v instanceof File && v.size > 0) files.push(v);
  if (files.length === 0) return NextResponse.json({ error: 'No se subió ningún archivo' }, { status: 400 });

  const out: Record<string, unknown> = {};
  const avisos: string[] = [];
  try {
    for (const f of files) {
      const buf = Buffer.from(await f.arrayBuffer());
      // 1) ¿es Plantilla? (tiene hojas VentaAD/CosteAD/IND/ProducAD)
      const pl = parsePlantilla(buf);
      if (pl.hojas.length > 0) { out.plantilla = { archivo: f.name, ...pl }; continue; }
      // 2) ¿es Descompuesto? (tiene la hoja de líneas descompuestas)
      const de = parseDescompuesto(buf);
      if (de.lineas.length > 0) { out.descompuesto = { archivo: f.name, ...de }; continue; }
      avisos.push(`No se reconoció "${f.name}" como Plantilla ni Descompuesto.`);
    }
    if (!out.plantilla && !out.descompuesto) {
      return NextResponse.json({ error: avisos[0] ?? 'No se reconoció ningún archivo válido' }, { status: 400 });
    }
    return NextResponse.json({ ...out, avisos });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `No se pudo leer el Excel: ${msg}` }, { status: 400 });
  }
}
