import { NextResponse } from 'next/server';
import { mensajeParaCliente } from '@/lib/errores';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { guardConcreto, esRechazo } from '@/lib/concreto/guard';
import { listarUmbrales } from '@/lib/concreto/config';

// GET /api/concreto/umbrales — lista de umbrales de alerta (cualquier sesión).
export async function GET() {
  const session = await guardConcreto();
  if (esRechazo(session)) return session;

  try {
    const db = await getAdelanteDb();
    const data = await listarUmbrales(db);
    return NextResponse.json({ data });
  } catch (err: unknown) {
    const msg = mensajeParaCliente(err);
    console.error('/api/concreto/umbrales GET error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
