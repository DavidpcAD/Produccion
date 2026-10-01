import 'server-only';
import { NextResponse } from 'next/server';
import { gzip as gzipCb } from 'node:zlib';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';

const gzip = promisify(gzipCb);

/**
 * JSON COMPRIMIDO para las respuestas pesadas de la API.
 *
 * POR QUÉ EXISTE
 * --------------
 * `next.config.ts` trae `compress: true`, pero eso NO alcanza a lo que devuelve
 * un route handler. Medido el 2026-10-01 contra el servidor **standalone** —el
 * mismo `node server.js` que corre en el App Service— con una ruta de prueba que
 * devolvía 380 KB de JSON:
 *
 *     curl -H "Accept-Encoding: identity"  →  379 791 bytes
 *     curl -H "Accept-Encoding: gzip"      →  379 791 bytes   ← igual
 *     cabecera Content-Encoding            →  no viene
 *
 * El HTML de las páginas sí sale comprimido por ese mismo servidor (/login:
 * 26.7 KB → 6.7 KB), así que no es que falte la opción: es que la compresión de
 * Next no toca el cuerpo de un route handler. O sea que hoy TODA respuesta de
 * /api/* viaja cruda. Para `/api/compras/bootstrap`, que en AdelantePRO son
 * ~5 MB (634 órdenes con sus 2 049 líneas, 465 pedidos, 1 868 recepciones), son
 * ~5 MB por cada entrada a cualquier pantalla de Compras.
 *
 * CUÁNTO CUESTA COMPRIMIR
 * -----------------------
 * Medido con un JSON del tamaño y la forma de las 634 órdenes de producción:
 *
 *     gzip 1 → 6.6x en 2 ms  ·  gzip 4 → 8.0x en 3 ms  ·  gzip 6 → 9.8x en 5 ms
 *
 * Se usa el 6 (el de siempre de zlib): el que mejor comprime y aun así tarda
 * milisegundos. Va por la versión ASÍNCRONA, que trabaja en el pool de hilos de
 * libuv, para no congelar el bucle de eventos mientras se arma un cuerpo grande.
 *
 * CUÁNDO NO COMPRIME
 * ------------------
 * - Si el cliente no lo pide (`Accept-Encoding` sin gzip).
 * - Si el cuerpo es chico: debajo de ~1.4 KB gzip no compensa su propio
 *   encabezado y la respuesta puede salir más grande.
 * - Si `gzip` falla por lo que sea: se devuelve el JSON tal cual. Comprimir es
 *   una mejora, no un requisito, y nunca debe tumbar una respuesta buena.
 *
 * No hay riesgo de doble compresión si algún día el App Service agrega la suya:
 * un proxy no vuelve a comprimir un cuerpo que ya trae `Content-Encoding`.
 *
 * ETAG: NO MANDAR LO MISMO DOS VECES
 * ---------------------------------
 * El store de Compras vuelve a pedir el bootstrap cada 20 s mientras la pestaña
 * está a la vista (lib/compras/store.tsx, REFRESCO_MS), para enterarse de lo que
 * crea Proveeduría en la base compartida. Son ~180 descargas por hora de la MISMA
 * respuesta casi siempre: entre dos tics normalmente no cambió nada.
 *
 * Se le pone al cuerpo una huella (`ETag`). El cliente se la guarda EN MEMORIA y
 * la manda de vuelta en `If-None-Match`; si no cambió nada se le contesta 304 sin
 * cuerpo y él se queda con lo que ya tenía (ver `api.bootstrap` en
 * lib/compras/api.ts). No se usa la caché del navegador —la respuesta sigue
 * `no-store`— porque eso dejaría en el disco los precios y proveedores de todas
 * las órdenes, y estas pantallas se usan en tabletas compartidas de obra.
 *
 * La huella se calcula sobre el cuerpo REAL, así que no puede quedar vieja — a
 * diferencia de mirar una fecha de modificación, que dependería de que TODO el
 * que escribe en esas tablas la mantenga (y a `dbo.OrdenCompra*` también le
 * escribe la app de proveeduría, que es otro repo).
 *
 * Si entra otra persona en el mismo navegador no hay nada que pueda ver del
 * anterior: la respuesta es `no-store` (no queda guardada) y la huella vive en
 * memoria de la página, que se va con ella.
 */

/** Debajo de esto gzip agrega más de lo que quita. */
const MINIMO_BYTES = 1400;

/** ¿Quien llama trajo su propio Cache-Control? Sin mirar mayúsculas: las
 *  cabeceras no distinguen, pero un objeto de JavaScript sí, y con
 *  `Cache-Control` escrito distinto se colarían dos directivas peleadas. */
function traeCacheControl(h?: Record<string, string>): boolean {
  return !!h && Object.keys(h).some((k) => k.toLowerCase() === 'cache-control');
}

export async function jsonComprimido(
  req: Request,
  data: unknown,
  init?: { status?: number; headers?: Record<string, string> },
): Promise<NextResponse> {
  const cuerpo = JSON.stringify(data);
  const etag = `W/"${createHash('sha1').update(cuerpo).digest('base64url')}"`;
  const cabeceras: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    // Que las cachés intermedias no le sirvan la versión comprimida a un cliente
    // que no la pidió.
    vary: 'Accept-Encoding',
    etag,
    // `no-store`: la respuesta NO se guarda en el disco del navegador. El 304 de
    // abajo NO depende de la caché del navegador — la huella la guarda el cliente
    // en memoria y la manda a mano (ver lib/compras/api.ts). Se eligió así a
    // propósito: con `no-cache` el navegador guardaría en disco los precios y los
    // proveedores de todas las órdenes, cosa que hoy no pasa (el store solo
    // persiste en localStorage en modo mock), y estas pantallas se usan en
    // tabletas compartidas de obra.
    ...(traeCacheControl(init?.headers) ? {} : { 'cache-control': 'no-store' }),
    ...(init?.headers ?? {}),
  };

  // ¿El cliente ya tiene exactamente esto? 304 y se acabó. Solo para respuestas
  // buenas: un error no se cachea.
  const traia = req.headers.get('if-none-match');
  const status = init?.status ?? 200;
  if (traia && status === 200 && traia.split(',').some((t) => t.trim() === etag)) {
    return new NextResponse(null, { status: 304, headers: cabeceras });
  }

  const acepta = (req.headers.get('accept-encoding') ?? '').toLowerCase().includes('gzip');
  if (!acepta || Buffer.byteLength(cuerpo) < MINIMO_BYTES) {
    return new NextResponse(cuerpo, { status, headers: cabeceras });
  }

  try {
    const comprimido = await gzip(cuerpo, { level: 6 });
    return new NextResponse(new Uint8Array(comprimido), {
      status,
      headers: { ...cabeceras, 'content-encoding': 'gzip', 'content-length': String(comprimido.length) },
    });
  } catch {
    return new NextResponse(cuerpo, { status, headers: cabeceras });
  }
}
