// ─── El reloj de todo lo que habla con Business Central ──────────────────────
// BC vive del otro lado de internet y sus llamadas no tenían tiempo límite: si
// BC se colgaba, la ruta de Next se colgaba con él hasta que la plataforma la
// mataba, y en la pantalla quedaba un spinner eterno sin nada que decirle al
// usuario. La conexión a SQL ya tiene su `requestTimeout` (45 s, lib/db.ts) y
// `lib/h4.ts` su AbortController para el otro servicio externo.
//
// Vive acá y no en cada cliente porque son cuatro —bc-client, compras/bc,
// bc-construction y concreto/pedido-bc— y el límite y el mensaje tienen que ser
// los mismos en los cuatro. Antes estaba copiado en dos.

/** 45 s, holgado a propósito: BC bajo carga tarda. Lo que se sabe más lento pasa
 *  el suyo (la página `Maquinaria` de compras/bc.ts tarda ~60 s por diseño). */
export const MS_LIMITE_BC = 45_000;

/**
 * `fetch` que se rinde a tiempo. Al cortar tira un Error con un mensaje que se
 * le puede mostrar a quien está esperando, en vez de un AbortError pelado.
 *
 * El límite es POR LLAMADA: quien reintente (ver el reintento ante 401 de
 * lib/compras/bc.ts) tiene que envolver CADA intento, o el segundo se queda con
 * lo que le sobró al primero.
 */
export async function fetchConReloj(
  url: string,
  init: RequestInit = {},
  msLimite: number = MS_LIMITE_BC,
): Promise<Response> {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), msLimite);
  try {
    return await fetch(url, { ...init, signal: control.signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(
        `Business Central no respondió en ${Math.round(msLimite / 1000)} s. Probá de nuevo; si sigue, avisá a soporte.`,
      );
    }
    throw e;
  } finally {
    clearTimeout(reloj);
  }
}
