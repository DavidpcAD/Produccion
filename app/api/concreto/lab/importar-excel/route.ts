import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { importarExcelLab } from '@/lib/concreto/lab-write';

// POST /api/concreto/lab/importar-excel — importación / reconciliación del
// Excel histórico de laboratorio. Recibe el archivo .xlsx como multipart
// (campo "file"). Idempotente: correr dos veces no duplica nada.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get('file');
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: 'Se esperaba multipart/form-data con campo "file"' }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: 'Falta el archivo (campo "file")' }, { status: 400 });

  const ab = await file.arrayBuffer();
  if (ab.byteLength === 0) return NextResponse.json({ error: 'Archivo vacío' }, { status: 400 });
  if (ab.byteLength > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'Archivo demasiado grande (máx 20 MB)' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();
    const actor = { oid: String(session.idUsuario || session.idCol), email: session.cedula };
    const resumen = await importarExcelLab(db, Buffer.from(ab), actor);
    return NextResponse.json(resumen);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/importar-excel POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
