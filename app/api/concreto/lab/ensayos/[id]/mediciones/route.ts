import { NextRequest, NextResponse } from 'next/server';
import { mensajeParaCliente } from '@/lib/errores';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { guardConcreto, esRechazo } from '@/lib/concreto/guard';
import { crearMedicion, ErrorLab } from '@/lib/concreto/lab-write';
import type { CrearMedicionParams } from '@/lib/concreto/tipos-lab';

// POST /api/concreto/lab/ensayos/[id]/mediciones — agregar una probeta (MPa).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await guardConcreto();
  if (esRechazo(session)) return session;

  const { id } = await params;
  const idEnsayo = Number(id);
  if (!Number.isInteger(idEnsayo) || idEnsayo <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const mpa = Number(body.resistencia_mpa);
  if (!Number.isFinite(mpa) || mpa <= 0 || mpa > 200) {
    return NextResponse.json({ error: 'resistencia_mpa inválida (0-200)' }, { status: 400 });
  }
  const orden = body.orden != null ? Number(body.orden) : 1;

  const parcial: CrearMedicionParams = {
    resistencia_mpa: mpa,
    orden: Number.isInteger(orden) && orden > 0 ? orden : 1,
    notas: (body.notas as string | null) ?? null,
  };

  try {
    const db = await getAdelanteDb();
    const med = await crearMedicion(db, idEnsayo, parcial);
    return NextResponse.json(med, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof ErrorLab) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = mensajeParaCliente(err);
    console.error('/api/concreto/lab/ensayos/[id]/mediciones POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
