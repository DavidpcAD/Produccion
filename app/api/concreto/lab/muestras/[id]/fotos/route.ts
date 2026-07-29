import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { ErrorFotos, crearFoto, fotosEnvConfigurada, listarFotos } from '@/lib/concreto/fotos';

// Fotos de muestras de laboratorio (Azure Blob Storage).
//   GET  /api/concreto/lab/muestras/[id]/fotos  → listar
//   POST /api/concreto/lab/muestras/[id]/fotos  → subir (cuerpo binario)
//
// La imagen llega como cuerpo binario (Content-Type image/jpeg|png). El nombre
// original opcional va en ?nombre= y el ensayo opcional en ?id_ensayo=.
// 501 si el almacenamiento no está configurado (env o SDK ausentes).
//
// El slug es [id] (no [idMuestra]) para no chocar con las otras rutas dinámicas
// de /lab/muestras/[id] (Next exige un único nombre de slug por segmento).

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB (la imagen ya viene comprimida)

function parsearId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const idM = parsearId(id);
  if (idM === null) return NextResponse.json({ error: 'idMuestra inválido' }, { status: 400 });

  // Sin config → lista vacía (la muestra existe aunque no haya fotos).
  if (!fotosEnvConfigurada()) return NextResponse.json({ fotos: [] });

  try {
    const db = await getAdelanteDb();
    const fotos = await listarFotos(db, idM);
    return NextResponse.json({ fotos });
  } catch (err: unknown) {
    if (err instanceof ErrorFotos) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/muestras/[id]/fotos GET error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const idM = parsearId(id);
  if (idM === null) return NextResponse.json({ error: 'idMuestra inválido' }, { status: 400 });

  if (!fotosEnvConfigurada()) {
    return NextResponse.json(
      { error: 'El almacenamiento de fotos no está configurado en el servidor.', codigo: 'FOTOS_NO_CONFIG' },
      { status: 501 },
    );
  }

  const ct = (req.headers.get('content-type') ?? 'image/jpeg').split(';')[0]?.trim();
  const contentType = ct === 'image/png' ? 'image/png' : 'image/jpeg';

  const ab = await req.arrayBuffer();
  if (ab.byteLength === 0) return NextResponse.json({ error: 'Imagen vacía' }, { status: 400 });
  if (ab.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'Imagen demasiado grande (máx 10 MB).' }, { status: 400 });
  }

  const nombreRaw = req.nextUrl.searchParams.get('nombre');
  const nombreOriginal = nombreRaw ? nombreRaw.slice(0, 200) : null;

  const idEnsayoRaw = req.nextUrl.searchParams.get('id_ensayo');
  let idEnsayo: number | null = null;
  if (idEnsayoRaw) {
    const n = Number(idEnsayoRaw);
    if (!Number.isInteger(n) || n <= 0) {
      return NextResponse.json({ error: `id_ensayo inválido: "${idEnsayoRaw}"` }, { status: 400 });
    }
    idEnsayo = n;
  }

  try {
    const db = await getAdelanteDb();
    const foto = await crearFoto(db, idM, {
      buffer: Buffer.from(ab),
      contentType,
      nombreOriginal,
      idEnsayo,
      actorEmail: session.cedula,
    });
    return NextResponse.json(foto, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof ErrorFotos) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/muestras/[id]/fotos POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
