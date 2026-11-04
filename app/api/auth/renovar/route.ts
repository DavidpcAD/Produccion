import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, ponerCookieSesion, sesionSigueValiendo, signToken, verifyToken } from '@/lib/auth';
import { cargarSesion } from '@/lib/sesiones';
import { buildSessionPayload } from '@/lib/users';
import { RENOVAR_DESPUES_DE_S, SEGUNDOS_TOPE } from '@/lib/sesion-duracion';

/**
 * Renueva la sesión mientras la app esté abierta.
 *
 * La pantalla lo llama sola cada rato y al volver a la vista
 * (hooks/useSession.ts → useMantenerSesion). Así una sesión en uso —o una
 * tableta con la app abierta sobre la mesa— no se cae nunca por tiempo, hasta
 * el tope de lib/sesion-duracion.ts.
 *
 * Pedirlo es barato: si el token se firmó hace menos de una hora contesta 204
 * sin tocar la base. Cuando sí toca renovar, PRIMERO pregunta a la base si la
 * sesión sigue valiendo (no la cerraron, RH no desactivó a la persona, no le
 * cambiaron la contraseña) y recién ahí firma. Al revés de getSession, acá se
 * falla CERRADO: si la base no contesta no se renueva —el token que hay sigue
 * valiendo días, y se vuelve a intentar en el próximo pedido—. Renovar a ciegas
 * dejaría que una sesión revocada se estirara para siempre.
 *
 * El token nuevo sale con roles y módulos recalculados: un cambio de rol llega
 * también al proxy, que solo ve lo que trae el token, sin tener que re-entrar.
 *
 * `/api/auth/*` no pasa por el chequeo del proxy, así que esta ruta verifica
 * el token por su cuenta.
 */

function sinCambios() {
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

/** La sesión ya no vale: mismo 401 marcado que usa el proxy, así la pantalla
 *  prende el aviso amarillo (ver hooks/useSession.ts). Y se borra la cookie. */
function vencida() {
  const res = NextResponse.json({ error: 'Tu sesión terminó. Entrá de nuevo.' }, { status: 401 });
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('x-sesion', 'vencida');
  res.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/', httpOnly: true });
  return res;
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const actual = token ? verifyToken(token) : null;
  if (!actual) return vencida();

  // Usuarios de prueba (idUsuario 0) y tokens sin id de sesión (de antes de la
  // revocación): no hay contra qué validarlos en la base, así que viven lo que
  // dure el token que tienen y nada más.
  if (!actual.idUsuario || actual.idUsuario <= 0 || !actual.jti) return sinCambios();

  const ahora = Math.floor(Date.now() / 1000);
  const inicio = actual.inicio ?? actual.iat ?? ahora;
  if (actual.iat && ahora - actual.iat < RENOVAR_DESPUES_DE_S) return sinCambios();
  // Llegando al tope ya no se estira: el token que hay vence en el tope justo.
  if (inicio + SEGUNDOS_TOPE - ahora <= RENOVAR_DESPUES_DE_S) return sinCambios();

  try {
    const base = await cargarSesion(actual.idUsuario, actual.jti, inicio);
    if (!sesionSigueValiendo(actual, base)) return vencida();

    const payload = await buildSessionPayload(actual.idUsuario);
    if (!payload) return vencida();
    // Si la contraseña cambió entre las dos consultas, gana la del token: la
    // próxima verificación la corta. Un token viejo sin huella sale con la de hoy.
    if (actual.huella) payload.huella = actual.huella;

    const { token: nuevo, segundos } = signToken(payload, { jti: actual.jti, inicio });
    const res = new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    ponerCookieSesion(res, nuevo, segundos);
    return res;
  } catch (err) {
    console.error('/api/auth/renovar: no se pudo verificar la sesión; no se renueva:', err);
    return NextResponse.json(
      { error: 'No se pudo renovar la sesión ahora.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
