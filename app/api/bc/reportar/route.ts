import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { bcProductionConfigured } from '@/lib/bc/production-lines';
import { reportarObra } from '@/lib/bc/integracion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/bc/reportar  { obra, partidas? } → PATCH Quantity en BC (solo sube).
 * Escribe a BC — exige nivel 4 (superadmin), igual que Compras.
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
  let body: { obra?: unknown; partidas?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }
  const obra = typeof body.obra === 'string' ? body.obra.trim() : '';
  if (!obra) return NextResponse.json({ error: 'Falta obra' }, { status: 400 });
  const partidas = Array.isArray(body.partidas)
    ? body.partidas.filter((p): p is string => typeof p === 'string')
    : undefined;
  try {
    const resultados = await reportarObra(obra, partidas);
    return NextResponse.json({ obra, resultados });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
