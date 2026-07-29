import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import {
  ErrorFotos,
  actualizarFotoEnsayo,
  eliminarFoto,
  fotosEnvConfigurada,
} from '@/lib/concreto/fotos';

// Metadatos / borrado de una foto de muestra.
//   PATCH  /api/concreto/lab/fotos/[id]  body { id_ensayo: number|null } → reasigna a ensayo
//   DELETE /api/concreto/lab/fotos/[id]  → borra (blob + fila)
// 501 si el almacenamiento no está configurado.

function parsearId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const idFoto = parsearId(id);
  if (idFoto === null) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

  if (!fotosEnvConfigurada()) {
    return NextResponse.json(
      { error: 'Storage de fotos no configurado.', codigo: 'FOTOS_NO_CONFIG' },
      { status: 501 },
    );
  }

  // Parseo manual: { id_ensayo: number | null }.
  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text && text.trim() !== '') body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Body inválido (no es JSON)' }, { status: 400 });
  }

  let idEnsayo: number | null;
  if (body.id_ensayo === null || body.id_ensayo === undefined) {
    idEnsayo = null;
  } else if (typeof body.id_ensayo === 'number' && Number.isInteger(body.id_ensayo) && body.id_ensayo > 0) {
    idEnsayo = body.id_ensayo;
  } else {
    return NextResponse.json({ error: 'id_ensayo debe ser un entero positivo o null' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();
    const foto = await actualizarFotoEnsayo(db, idFoto, idEnsayo);
    return NextResponse.json(foto);
  } catch (err: unknown) {
    if (err instanceof ErrorFotos) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/fotos/[id] PATCH error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const idFoto = parsearId(id);
  if (idFoto === null) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

  if (!fotosEnvConfigurada()) {
    return NextResponse.json(
      { error: 'Storage de fotos no configurado.', codigo: 'FOTOS_NO_CONFIG' },
      { status: 501 },
    );
  }

  try {
    const db = await getAdelanteDb();
    await eliminarFoto(db, idFoto);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof ErrorFotos) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/fotos/[id] DELETE error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
