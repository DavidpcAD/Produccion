import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { parsePlantilla, parseDescompuesto } from '@/lib/presupuesto-parse';

export const runtime = 'nodejs';

// Recibe los Excel (Plantilla y/o Descompuesto) y devuelve las líneas parseadas para
// previsualizar antes de subir a Business Central.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: 'Subí los archivos Excel' }, { status: 400 }); }

  const out: Record<string, unknown> = {};
  try {
    const plantilla = form.get('plantilla');
    if (plantilla && plantilla instanceof File && plantilla.size > 0) {
      const buf = Buffer.from(await plantilla.arrayBuffer());
      out.plantilla = { archivo: plantilla.name, ...parsePlantilla(buf) };
    }
    const descompuesto = form.get('descompuesto');
    if (descompuesto && descompuesto instanceof File && descompuesto.size > 0) {
      const buf = Buffer.from(await descompuesto.arrayBuffer());
      out.descompuesto = { archivo: descompuesto.name, ...parseDescompuesto(buf) };
    }
    if (!out.plantilla && !out.descompuesto) {
      return NextResponse.json({ error: 'No se reconoció ningún archivo válido' }, { status: 400 });
    }
    return NextResponse.json(out);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `No se pudo leer el Excel: ${msg}` }, { status: 400 });
  }
}
