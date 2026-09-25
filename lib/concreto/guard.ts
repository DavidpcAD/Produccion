import { NextResponse } from 'next/server';
import { getSession, type JWTPayload } from '@/lib/auth';

// ─────────────────────────────────────────────────────────────────────────────
// Puerta de entrada de las rutas de /api/concreto.
//
// Por qué existe: hasta ahora 31 de las 46 rutas del módulo solo pedían "sesión
// válida" (`if (!session) 401`). Eso NO es el permiso del módulo: Concreto sale
// del módulo 'concreto' del rol (ver modulosDeRol en lib/permissions.ts), que
// hoy solo tienen Super Admin y Digitación. Con la puerta vieja, cualquiera que
// entrara al app —un bodeguero, un presupuestista— podía, llamando la API a
// mano, cerrar una colada, escribir resultados de laboratorio o disparar un
// pedido a Business Central (`coladas/[id]/pedido-bc`). La pantalla no lo
// dejaba, pero una pantalla no es una frontera de seguridad.
//
// El gate del proxy es una comprobación OPTIMISTA (la propia doc de Next lo dice
// para `proxy.ts`: no es una solución de autorización). El permiso de verdad se
// verifica acá, en la ruta, igual que se hizo en `lib/compras/guard.ts`.
//
// Compatibilidad — acá NO se le quita el acceso a nadie que hoy trabaje en
// Concreto:
//   · Super Admin y Digitación traen 'concreto' en sus módulos → pasan.
//   · Un usuario SIN rol de Producción (`modules` undefined: token viejo o rol
//     legacy de otra app) cae al NIVEL, igual que en proxy.ts y en guardCompras.
//     El piso es 2 porque es el `minLevel` con el que el Sidebar ya muestra
//     Concreto: quien no lo ve en el menú tampoco tiene por qué llamar su API.
//   · El que queda afuera es justamente el que nunca debió entrar: el rol de
//     Producción cuyos módulos no incluyen Concreto (bodega, ingeniería,
//     presupuesto, recepción), que hoy ni siquiera puede abrir la pantalla
//     porque el layout lo rebota.
//
// Las rutas de configuración y las destructivas (anular/desanular, densidades,
// umbrales, actividades, roles) siguen exigiendo `nivelAdmin >= 4` por su
// cuenta, encima de esta puerta.
// ─────────────────────────────────────────────────────────────────────────────

/** Nivel mínimo para quien no trae módulos (el mismo `minLevel` del Sidebar). */
const NIVEL_MINIMO = 2;

/**
 * Verifica la sesión y el permiso de Concreto. Devuelve la sesión, o la
 * respuesta de error que la ruta debe retornar tal cual.
 */
export async function guardConcreto(): Promise<JWTPayload | NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const abreConcreto = session.modules
    ? session.modules.includes('concreto')
    : session.nivelAdmin >= NIVEL_MINIMO;

  if (!abreConcreto) {
    return NextResponse.json({ error: 'No tenés acceso a Concreto.' }, { status: 403 });
  }

  return session;
}

/** Discrimina el resultado de `guardConcreto`: `true` = hay que devolverlo ya. */
export function esRechazo(g: JWTPayload | NextResponse): g is NextResponse {
  return g instanceof NextResponse;
}
