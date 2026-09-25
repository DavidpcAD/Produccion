import { NextRequest, NextResponse } from 'next/server';
import { mensajeParaCliente } from '@/lib/errores';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { guardConcreto, esRechazo } from '@/lib/concreto/guard';
import { crearEnsayo, ErrorLab } from '@/lib/concreto/lab-write';
import type { CrearEnsayoParams } from '@/lib/concreto/tipos-lab';

// POST /api/concreto/lab/muestras/[id]/ensayos — crear un ensayo para la muestra.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await guardConcreto();
  if (esRechazo(session)) return session;

  const { id } = await params;
  const idMuestra = Number(id);
  if (!Number.isInteger(idMuestra) || idMuestra <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const edadDias = Number(body.edad_dias);
  if (!Number.isInteger(edadDias) || edadDias <= 0 || edadDias > 365) {
    return NextResponse.json({ error: 'edad_dias inválida (1-365)' }, { status: 400 });
  }
  const fechaPrueba = body.fecha_prueba;
  if (fechaPrueba != null && typeof fechaPrueba === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(fechaPrueba)) {
    return NextResponse.json({ error: 'fecha_prueba inválida (YYYY-MM-DD)' }, { status: 400 });
  }

  const parcial: CrearEnsayoParams = {
    edad_dias: edadDias,
    fecha_prueba: (fechaPrueba as string | null) ?? null,
    notas: (body.notas as string | null) ?? null,
  };

  try {
    const db = await getAdelanteDb();
    const actor = { oid: String(session.idUsuario || session.idCol), email: session.cedula };
    const ensayo = await crearEnsayo(db, idMuestra, parcial, actor);
    return NextResponse.json(ensayo, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof ErrorLab) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = mensajeParaCliente(err);
    console.error('/api/concreto/lab/muestras/[id]/ensayos POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
