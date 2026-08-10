import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { bcProductionConfigured, RegistrarNoDisponible, registrarObra } from '@/lib/bc/production-lines';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/bc/registrar { obra, fecha } → postea (registra) la producción en BC.
 * Depende del web service del partner (ver docs/integracion-bc-registrar.md); si
 * no está publicado, devuelve 501 no_disponible. Escribe a BC → exige nivel 4.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!bcProductionConfigured()) {
    return NextResponse.json(
      { error: 'La integración con BC no está configurada en el servidor (revisá BC_*).' },
      { status: 503 },
    );
  }
  let body: { obra?: unknown; fecha?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }
  const obra = typeof body.obra === 'string' ? body.obra.trim() : '';
  const fecha = typeof body.fecha === 'string' ? body.fecha.trim() : '';
  if (!obra) return NextResponse.json({ error: 'Falta obra' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'Fecha inválida (YYYY-MM-DD)' }, { status: 400 });
  }
  try {
    const resultado = await registrarObra(obra, fecha);
    return NextResponse.json({ obra, fecha, resultado });
  } catch (e) {
    if (e instanceof RegistrarNoDisponible) {
      return NextResponse.json({ error: e.message }, { status: 501 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
