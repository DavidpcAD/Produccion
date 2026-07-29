import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import {
  actualizarProyeccion,
  esErrorCliente,
  ESTADOS_VALIDOS,
  type ActualizarProyeccionRequest,
} from '@/lib/desembolsos/matriz';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/desembolsos/desembolsos/:idCaso/:idHito — actualiza la proyección
 * de un hito de un caso (fechas + estado). Portado de la Azure Function
 * `desembolsos.ts` (PATCH /api/desembolsos/{idCaso}/{idHito}).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ idCaso: string; idHito: string }> },
) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { idCaso: idCasoRaw, idHito: idHitoRaw } = await params;
  const idCaso = Number(idCasoRaw);
  const idHito = Number(idHitoRaw);
  if (!Number.isInteger(idCaso) || idCaso <= 0) {
    return NextResponse.json({ error: 'idCaso inválido' }, { status: 400 });
  }
  if (!Number.isInteger(idHito) || idHito <= 0) {
    return NextResponse.json({ error: 'idHito inválido' }, { status: 400 });
  }

  let body: ActualizarProyeccionRequest;
  try {
    body = (await req.json()) as ActualizarProyeccionRequest;
  } catch {
    return NextResponse.json({ error: 'Body inválido (no es JSON)' }, { status: 400 });
  }
  if (!body.EstadoTramite || !ESTADOS_VALIDOS.has(body.EstadoTramite)) {
    return NextResponse.json({ error: 'EstadoTramite inválido' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();
    const data = await actualizarProyeccion(
      db,
      idCaso,
      idHito,
      body,
      session.cedula ?? 'desembolsos',
    );
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hint = (err as { statusHint?: number }).statusHint;
    console.error('/api/desembolsos/desembolsos/[idCaso]/[idHito] PATCH error:', err);
    const status = hint ?? (esErrorCliente(message) ? 400 : 500);
    return NextResponse.json({ error: message }, { status });
  }
}
