import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { procesarIngesta } from '@/lib/concreto/ingesta';

// POST /api/concreto/batches/ingestar — ingesta de un CSV de planta Blend.
//
// La planta NO se pasa por parámetro: se detecta del propio contenido del CSV
// (columna Machine_SN → pro_hor.plantas.serial) y se valida que el archivo sea de
// UNA sola planta (regla single-plant del dominio).
//
// Acepta dos formatos de body:
//   1) multipart/form-data con un campo `file` (input file del navegador) y,
//      opcionalmente, `forzar_reingesta` ("1"/"true").
//   2) text/plain (o cualquier otro): el body crudo ES el CSV. `?nombre=` y
//      `?forzar=` pueden venir como query params.
//
// El contenido crudo del CSV viaja como UTF-8 plano (NO base64). Los CSV de
// Blend pesan ~5MB, manejables en el body default.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  // Actor de auditoría (mismo criterio que el resto del app: oid = idUsuario/idCol,
  // email = cédula/username con el que entró).
  const usuarioOid = String(session.idUsuario || session.idCol);
  const usuarioEmail = session.cedula ?? session.nombre ?? 'desconocido';

  let contenido: string;
  let nombreArchivo: string;
  let forzarReingesta = false;

  try {
    const contentType = req.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: 'Falta el archivo CSV (campo "file").' },
          { status: 400 },
        );
      }
      contenido = await file.text();
      nombreArchivo = file.name || 'ingesta.csv';
      const fr = form.get('forzar_reingesta');
      forzarReingesta = fr === '1' || fr === 'true';
    } else {
      contenido = await req.text();
      const sp = req.nextUrl.searchParams;
      nombreArchivo = sp.get('nombre') || 'ingesta.csv';
      const fr = sp.get('forzar');
      forzarReingesta = fr === '1' || fr === 'true';
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/batches/ingestar parse body error:', err);
    return NextResponse.json({ error: `No se pudo leer el body: ${msg}` }, { status: 400 });
  }

  if (!contenido || contenido.trim() === '') {
    return NextResponse.json({ error: 'El CSV está vacío.' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();
    const resultado = await procesarIngesta(db, {
      contenido,
      nombreArchivo,
      forzarReingesta,
      usuarioOid,
      usuarioEmail,
    });
    return NextResponse.json(resultado.body, { status: resultado.status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/batches/ingestar POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
