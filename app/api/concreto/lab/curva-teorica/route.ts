import { NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { obtenerCurvaTeorica } from '@/lib/concreto/lab-write';

// GET /api/concreto/lab/curva-teorica — curva teórica de resistencia (ASTM
// C-150). Lookup compartido: resistencia esperada = F'C × pct_resistencia.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const db = await getAdelanteDb();
    const puntos = await obtenerCurvaTeorica(db);
    return NextResponse.json({ puntos });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/curva-teorica GET error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
