import { NextResponse } from 'next/server';
import { sesionMovil } from '@/lib/movil/sesion';
import { equipoAsignado, leerFotos, operadorMant, solicitarMaterial, type LineaMaterial } from '@/lib/movil/maquinaria';
import { guardarUbicacion, leerUbicacion } from '@/lib/movil/telefonos';

// Solicitar material para una máquina (aceite, filtros, grasa…). Queda en
// mant.SolicitudesMateriales con número SM-xxxx.
export async function POST(req: Request) {
  const auth = await sesionMovil(req, 'maquinaria');
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => null);
  const equipoId = typeof body?.equipoId === 'string' ? body.equipoId : '';
  const notas = typeof body?.notas === 'string' ? body.notas.trim().slice(0, 1000) : '';
  const crudos: unknown[] = Array.isArray(body?.items) ? body.items.slice(0, 30) : [];
  const items: LineaMaterial[] = [];
  for (const c of crudos) {
    const o = c as { nombre?: unknown; cantidad?: unknown; unidad?: unknown };
    const nombre = typeof o?.nombre === 'string' ? o.nombre.trim().slice(0, 200) : '';
    const cantidad = Number(o?.cantidad);
    const unidad = typeof o?.unidad === 'string' && o.unidad.trim() ? o.unidad.trim().slice(0, 30) : 'unidad';
    if (!nombre) continue;
    if (!Number.isFinite(cantidad) || cantidad <= 0) return NextResponse.json({ error: `La cantidad de «${nombre}» no es válida.` }, { status: 400 });
    items.push({ nombre, cantidad, unidad });
  }
  if (!items.length) return NextResponse.json({ error: 'Agregá al menos un material.' }, { status: 400 });

  try {
    const op = await operadorMant(auth.sesion);
    if (!(await equipoAsignado(op.id, equipoId))) {
      return NextResponse.json({ error: 'Esa máquina no está asignada a vos.' }, { status: 403 });
    }
    const sm = await solicitarMaterial({ equipoId, operador: op, items, notas, fotos: leerFotos(body?.fotos) });
    await guardarUbicacion({
      tipo: 'material', referenciaId: sm.id, equipoId, usuario: op.usuario,
      identificador: typeof body?.identificador === 'string' ? body.identificador.slice(0, 100) : null,
      ubicacion: leerUbicacion(body?.ubicacion),
    });
    return NextResponse.json(sm);
  } catch (err) {
    console.error('/api/movil/maquinaria/solicitudes:', err);
    return NextResponse.json({ error: 'No se pudo enviar la solicitud. Probá de nuevo.' }, { status: 500 });
  }
}
