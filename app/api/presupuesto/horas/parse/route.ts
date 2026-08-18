import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { parsePresupuestoHoras, sugerirCodigo } from '@/lib/presupuesto-horas-parse';

export const runtime = 'nodejs';

// Recibe la plantilla "Presupuesto de Horas y Cantidades", la parsea y devuelve:
//  · las filas con la obra resuelta, el código resuelto (si vino) y una SUGERENCIA
//    de subpartida (a partir del nombre original) para las que no traen código;
//  · el catálogo de subpartidas, para elegir/cambiar la subpartida en la vista previa.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: 'Subí el archivo Excel' }, { status: 400 }); }

  const file = [...form.values()].find((v): v is File => v instanceof File && v.size > 0);
  if (!file) return NextResponse.json({ error: 'No se subió ningún archivo' }, { status: 400 });

  let parsed;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    parsed = parsePresupuestoHoras(buf);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `No se pudo leer el Excel: ${msg}` }, { status: 400 });
  }

  if (parsed.filas.length === 0) {
    return NextResponse.json({ error: 'No se encontraron filas en la hoja "Presupuesto" (revisá que uses la plantilla oficial).' }, { status: 400 });
  }

  // Catálogos.
  const db = await getDb();
  const [obrasRes, subsRes] = await Promise.all([
    db.request().query<{ idObra: number; numeroObra: string; nombreMostrado: string }>(
      'SELECT idObra, numeroObra, nombreMostrado FROM dbo.Obra'),
    db.request().query<{ codigo: string; nombre: string; partida: string }>(
      `SELECT sp.codigo, sp.nombre, (p.codigo + ' ' + p.nombre) AS partida
       FROM dbo.SubPartida sp JOIN dbo.Partida p ON p.idPartida = sp.idPartida
       WHERE sp.esActivo = 1
       ORDER BY sp.codigo`),
  ]);
  const obraByNum = new Map(obrasRes.recordset.map((o) => [o.numeroObra.toLowerCase(), o]));
  const subByCod = new Map(subsRes.recordset.map((s) => [s.codigo.toLowerCase(), s]));
  const catalogoSug = subsRes.recordset.map((s) => ({ codigo: s.codigo, nombre: s.nombre }));

  const filas = parsed.filas.map((f) => {
    const obra = obraByNum.get(f.codigoObra.toLowerCase()) ?? null;
    const codResuelto = f.codigoSubpartida && subByCod.has(f.codigoSubpartida.toLowerCase())
      ? subByCod.get(f.codigoSubpartida.toLowerCase())!.codigo
      : '';
    // Sugerencia solo si no hay código válido y tenemos el nombre original.
    const sugerenciaCodigo = !codResuelto && f.nombre ? sugerirCodigo(f.nombre, catalogoSug) : null;
    return {
      fila: f.fila,
      codigoObra: f.codigoObra,
      obraNombre: obra?.nombreMostrado ?? null,
      obraOk: !!obra,
      codigoResuelto: codResuelto,
      sugerenciaCodigo,
      nombreOriginal: f.nombre || null,
      cantidad: f.cantidad,
      horas: f.horas,
    };
  });

  return NextResponse.json({
    hoja: parsed.hoja,
    filas,
    subpartidas: subsRes.recordset, // { codigo, nombre, partida }
  });
}
