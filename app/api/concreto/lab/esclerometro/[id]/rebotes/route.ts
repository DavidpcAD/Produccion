import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { ErrorEsclerometro, crearRebote } from '@/lib/concreto/esclerometro';

function parsearId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// POST /api/concreto/lab/esclerometro/[id]/rebotes — agrega un golpe al ensayo.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id: idRaw } = await params;
  const idEnsayo = parsearId(idRaw);
  if (idEnsayo === null) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body inválido (no es JSON)' }, { status: 400 });
  }

  const numeroGolpe = Number(body.numero_golpe);
  if (!Number.isInteger(numeroGolpe) || numeroGolpe <= 0 || numeroGolpe > 99) {
    return NextResponse.json({ error: 'numero_golpe inválido (1-99)' }, { status: 400 });
  }
  const valorRebote = Number(body.valor_rebote);
  if (!Number.isFinite(valorRebote) || valorRebote < 0 || valorRebote > 100) {
    return NextResponse.json({ error: 'valor_rebote inválido (0-100)' }, { status: 400 });
  }
  const notas =
    body.notas === undefined || body.notas === null || String(body.notas).trim() === ''
      ? null
      : String(body.notas).trim().slice(0, 300);

  try {
    const db = await getAdelanteDb();
    const rebote = await crearRebote(db, idEnsayo, {
      numero_golpe: numeroGolpe,
      valor_rebote: valorRebote,
      notas,
    });
    return NextResponse.json(rebote, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof ErrorEsclerometro) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/esclerometro/[id]/rebotes POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
