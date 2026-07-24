import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { bcConfigured } from '@/lib/bc-client';

// Recibe el presupuesto de una obra para subirlo a Business Central (job planning lines).
// Nota: el WRITE real a BC (entidad jobPlanningLines del API custom) queda pendiente de
// confirmar el mapeo exacto; por ahora validamos, dejamos traza en auditoría y devolvemos
// el estado honesto para no fingir un envío que no ocurrió.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const body = await req.json().catch(() => ({}));
  const idObra = Number(body.idObra) || 0;
  const vista = String(body.vista ?? 'general');
  const lineas = Array.isArray(body.lineas) ? body.lineas : [];

  if (!idObra) return NextResponse.json({ error: 'Falta la obra' }, { status: 400 });
  if (lineas.length === 0) return NextResponse.json({ error: 'No hay líneas de presupuesto' }, { status: 400 });

  const total = lineas.reduce((s: number, l: { monto?: number }) => s + (Number(l?.monto) || 0), 0);

  await logAudit({
    idColAccion: session.idCol,
    accion: 'SUBIR_PRESUPUESTO',
    entidad: 'Obra',
    idEntidad: idObra,
    detalleNuevo: { vista, lineas: lineas.length, total },
    ip,
  });

  if (!bcConfigured()) {
    return NextResponse.json({ ok: false, message: 'Presupuesto recibido (guardado en bitácora). Business Central no está configurado en este entorno.' });
  }
  // TODO(presupuesto): escribir jobPlanningLines en BC (mapear obra→job y partida→jobTask).
  // Pendiente de confirmar la entidad/campos del API custom de BC.
  return NextResponse.json({
    ok: false,
    message: `Presupuesto recibido: ${lineas.length} línea(s), total ₡${total.toLocaleString('es-CR')}. La subida a Business Central (job planning lines) queda lista para conectar una vez confirmado el mapeo.`,
  });
}
