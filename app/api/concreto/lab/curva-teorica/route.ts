import { NextResponse } from 'next/server';
import { mensajeParaCliente } from '@/lib/errores';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { guardConcreto, esRechazo } from '@/lib/concreto/guard';
import { obtenerCurvaTeorica } from '@/lib/concreto/lab-write';

// GET /api/concreto/lab/curva-teorica — curva teórica de resistencia (ASTM
// C-150). Lookup compartido: resistencia esperada = F'C × pct_resistencia.
export async function GET() {
  const session = await guardConcreto();
  if (esRechazo(session)) return session;

  try {
    const db = await getAdelanteDb();
    const puntos = await obtenerCurvaTeorica(db);
    return NextResponse.json({ puntos });
  } catch (err: unknown) {
    const msg = mensajeParaCliente(err);
    console.error('/api/concreto/lab/curva-teorica GET error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
