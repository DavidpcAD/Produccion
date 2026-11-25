import { NextResponse } from 'next/server';
import { avisarVersionNueva, PLATAFORMA, runtimeVersionDe, visorWeb } from '@/lib/movil/telefonos';
import { aplicarReparto, ErrorReparto } from '@/lib/movil/updates';

export const dynamic = 'force-dynamic'; // releases.json es el puntero vivo

// POST → mover el reparto de versiones de la app de maquinaria:
//   enviar      una publicación a UN teléfono, para probarla
//   quitar      ese teléfono vuelve a la de todos
//   distribuir  una publicación a toda la flota (una anterior = volver atrás)
//
// Esto no publica ni firma nada: las publicaciones ya están en el servidor,
// firmadas en la Mac. Lo único que se mueve es releases.json. Solo el Super Admin.
export async function POST(req: Request) {
  const { visor, error } = await visorWeb();
  if (error) return error;
  if (!visor.puedeRepartir) {
    return NextResponse.json({ error: 'Solo el Super Admin reparte versiones de la app.' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { accion?: unknown; equipo?: unknown; updateId?: unknown } | null;
  const accion = body?.accion;
  if (accion !== 'enviar' && accion !== 'quitar' && accion !== 'distribuir') {
    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
  }
  const equipo = typeof body?.equipo === 'string' ? body.equipo.slice(0, 100) : null;
  const updateId = typeof body?.updateId === 'string' ? body.updateId.slice(0, 80) : null;
  if (accion !== 'distribuir' && !equipo) return NextResponse.json({ error: 'Falta el teléfono' }, { status: 400 });
  if (accion !== 'quitar' && !updateId) return NextResponse.json({ error: 'Falta la publicación' }, { status: 400 });

  try {
    // El APK que reportó el teléfono: una publicación de otro APK no le sirve.
    const runtimeVersionEquipo = equipo ? await runtimeVersionDe(equipo) : null;
    const r = await aplicarReparto(accion, { platform: PLATAFORMA, equipo, updateId, runtimeVersionEquipo });

    if (accion !== 'quitar' && updateId) {
      const avisados = await avisarVersionNueva(accion, { updateId, equipo });
      if (avisados > 0) {
        r.mensaje +=
          accion === 'enviar'
            ? ' Se le mandó el aviso al teléfono: tocándolo se actualiza.'
            : ` Se les mandó el aviso a ${avisados} teléfono${avisados === 1 ? '' : 's'}: tocándolo se actualiza.`;
      }
    }
    return NextResponse.json(r);
  } catch (err) {
    if (err instanceof ErrorReparto) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('/api/movil/maquinaria/reparto:', err);
    return NextResponse.json({ error: 'No se pudo mover el reparto.' }, { status: 500 });
  }
}
