import { NextResponse } from 'next/server';
import { buscarDirectivaSinUpdate, buscarUpdate, respuestaMultipart } from '@/lib/movil/updates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // volver atrás es editar releases.json, sin deploy

// GET /api/movil/maquinaria/updates → endpoint de expo-updates (protocolo v1) de
// la app de maquinaria. Devuelve un manifest firmado o "no hay nada nuevo".
//
// Es PÚBLICO a propósito: expo-updates no manda el token de la app. La
// integridad la da la firma: el APK trae el certificado y rechaza cualquier
// manifest que no valide. Lo que se sirve es la misma app que ya está en los
// teléfonos, no datos de nadie.
//
// El `equipo` (ID de Android) tampoco es una credencial: solo decide si a ese
// teléfono le toca una publicación propia (la que se le mandó para probar) o la
// de todos. Sin él se sirve la de todos.

/** Lee `equipo="…"` de Expo-Extra-Params (campos estructurados, RFC 8941). */
function equipoDe(req: Request): string | null {
  const crudo = req.headers.get('expo-extra-params');
  if (!crudo) return null;
  for (const parte of crudo.split(',')) {
    const i = parte.indexOf('=');
    if (i < 0 || parte.slice(0, i).trim().toLowerCase() !== 'equipo') continue;
    const valor = parte.slice(i + 1).trim().replace(/^"|"$/g, '');
    return /^[A-Za-z0-9._-]{1,100}$/.test(valor) ? valor : null;
  }
  return null;
}

function error(mensaje: string, status: number) {
  return NextResponse.json({ error: mensaje }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(req: Request) {
  try {
    // El cliente los manda como headers; el query es para probar con curl.
    const qs = new URL(req.url).searchParams;
    const platform = req.headers.get('expo-platform') ?? qs.get('platform');
    const runtimeVersion = req.headers.get('expo-runtime-version') ?? qs.get('runtime-version');
    if (!platform) return error('Falta Expo-Platform', 400);
    if (!runtimeVersion) return error('Falta Expo-Runtime-Version', 400);

    const update = await buscarUpdate(platform, runtimeVersion, equipoDe(req));
    const alDia = update !== null && req.headers.get('expo-current-update-id') === update.updateId;
    // Fija al teléfono en la publicación que le toca, aunque sea más vieja que
    // la que corre. Va también con "no hay nada nuevo": el teléfono lo guarda y
    // lo usa al arrancar para elegir cuál de las bajadas abre.
    const filtro = update?.filtro ? { 'expo-manifest-filters': update.filtro } : undefined;

    if (!update || alDia) {
      const directiva = await buscarDirectivaSinUpdate();
      if (directiva) {
        return respuestaMultipart([{ nombre: 'directive', cuerpo: directiva.cuerpo, firma: directiva.firma }], filtro);
      }
      // Sin directiva firmada no se puede inventar una (la llave no vive acá).
      if (!update) return error('No hay update publicado para ese runtimeVersion', 404);
    }
    return respuestaMultipart([{ nombre: 'manifest', cuerpo: update.manifest, firma: update.firma }], filtro);
  } catch (e) {
    // Público: el detalle del store no viaja al cliente, pero sí queda en el log,
    // porque un store roto no se ve desde afuera (los teléfonos siguen andando).
    console.error('[maquinaria/updates] fallo resolviendo el update:', e);
    return error('No se pudo resolver la actualización', 500);
  }
}
