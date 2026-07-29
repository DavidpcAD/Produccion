import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { listarCasos, upsertProyeccion, validarProyeccion, mapDbError, type NivelConfianza } from '@/lib/desembolsos/formalizacion';

export const dynamic = 'force-dynamic';

// GET /api/desembolsos/formalizacion — casos reservados con proyección activa.
export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const db = await getAdelanteDb();
    return NextResponse.json({ casos: await listarCasos(db) });
  } catch (e) {
    const { status, error } = mapDbError(e);
    return NextResponse.json({ error }, { status });
  }
}

// POST /api/desembolsos/formalizacion — upsert de proyección.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Body inválido (no es JSON).' }, { status: 400 }); }

  const input = {
    IDCaso: Number(body.IDCaso),
    FechaProyectada: String(body.FechaProyectada ?? ''),
    NivelConfianza: body.NivelConfianza as NivelConfianza,
    Notas: body.Notas != null ? String(body.Notas) : null,
    UsuarioEmail: session.cedula,
  };
  const err = validarProyeccion(input);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  try {
    const db = await getAdelanteDb();
    return NextResponse.json(await upsertProyeccion(db, input), { status: 201 });
  } catch (e) {
    const { status, error } = mapDbError(e);
    return NextResponse.json({ error }, { status });
  }
}
