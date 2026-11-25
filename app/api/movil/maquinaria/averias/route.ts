import { NextResponse } from 'next/server';
import { sesionMovil } from '@/lib/movil/sesion';
import { equipoAsignado, leerFotos, operadorMant, reportarAveria } from '@/lib/movil/maquinaria';
import { guardarUbicacion, leerUbicacion } from '@/lib/movil/telefonos';

const PRIORIDADES = ['baja', 'media', 'alta', 'urgente'] as const;

// Reportar una avería = abrir una OT correctiva en Mantenimiento.
export async function POST(req: Request) {
  const auth = await sesionMovil(req, 'maquinaria');
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => null);
  const equipoId = typeof body?.equipoId === 'string' ? body.equipoId : '';
  const titulo = typeof body?.titulo === 'string' ? body.titulo.trim().slice(0, 200) : '';
  const descripcion = typeof body?.descripcion === 'string' ? body.descripcion.trim().slice(0, 4000) : '';
  const prioridad = PRIORIDADES.includes(body?.prioridad) ? body.prioridad : 'media';
  if (!titulo) return NextResponse.json({ error: 'Contá en pocas palabras qué pasó.' }, { status: 400 });

  try {
    const op = await operadorMant(auth.sesion);
    if (!(await equipoAsignado(op.id, equipoId))) {
      return NextResponse.json({ error: 'Esa máquina no está asignada a vos.' }, { status: 403 });
    }
    const ot = await reportarAveria({ equipoId, operador: op, titulo, descripcion, prioridad, fotos: leerFotos(body?.fotos) });
    await guardarUbicacion({
      tipo: 'averia', referenciaId: ot.id, equipoId, usuario: op.usuario,
      identificador: typeof body?.identificador === 'string' ? body.identificador.slice(0, 100) : null,
      ubicacion: leerUbicacion(body?.ubicacion),
    });
    return NextResponse.json(ot);
  } catch (err) {
    console.error('/api/movil/maquinaria/averias:', err);
    return NextResponse.json({ error: 'No se pudo enviar el reporte. Probá de nuevo.' }, { status: 500 });
  }
}
