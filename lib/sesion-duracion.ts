// ─── Cuánto dura una sesión ──────────────────────────────────────────────────
//
// Hasta el 2026-11-04 la sesión moría por dos lados: a los 30 min sin tocar la
// pantalla (el bloqueo por inactividad, que cerraba de verdad) y a las 8 h
// fijas aunque se estuviera usando. Los usuarios vivían entrando y saliendo, y
// la salida que encontraron fue guardar la contraseña en el navegador de la
// tableta —donde la ve o la usa el que venga después—. Se quitó el bloqueo y la
// sesión ahora se renueva sola:
//
//   · Con la app abierta (aunque nadie la toque), la pantalla le pide al
//     servidor renovar cada rato (hooks/useSession.ts → /api/auth/renovar) y el
//     token se vuelve a firmar por otros SIN_USO. O sea: no se cae.
//   · Con el navegador cerrado o la tableta apagada, la cookie sigue ahí: si se
//     vuelve antes de SIN_USO, entra directo.
//   · Ni renovándose pasa del TOPE contado desde que se escribió la contraseña.
//
// Lo que la corta antes de tiempo (todo del lado del servidor, ver
// lib/auth.ts → getSession y lib/sesiones.ts):
//   · «Cerrar sesión» —revoca el id de esa sesión, no solo borra la cookie—;
//   · RH desactiva a la persona;
//   · se le cambia la contraseña (el token guarda una huella de la contraseña
//     con que se entró: si ya no coincide, la sesión no vale).
//
// Este archivo no importa nada a propósito: lo leen el servidor (auth,
// sesiones) y la pantalla (useSession).

/** Sin abrir la app en este tiempo, pide la contraseña de nuevo. */
export const DIAS_SIN_USO = 7;
/** Tope absoluto desde que se entró con contraseña, aunque se renueve. */
export const DIAS_TOPE = 30;

export const SEGUNDOS_SIN_USO = DIAS_SIN_USO * 24 * 60 * 60;
export const SEGUNDOS_TOPE = DIAS_TOPE * 24 * 60 * 60;

/** El servidor vuelve a firmar el token, como mucho, una vez por hora: pedir
 *  más seguido es barato (solo verifica la firma) pero no cambia nada. */
export const RENOVAR_DESPUES_DE_S = 60 * 60;

/** Cada cuánto la pantalla abierta pide renovar. Bastante menos que SIN_USO:
 *  lo que importa es que pida alguna vez mientras la app está abierta. */
export const PEDIR_RENOVACION_CADA_MS = 15 * 60_000;
