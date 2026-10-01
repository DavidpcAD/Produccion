import 'server-only';
import { NextResponse } from 'next/server';
import { gzip as gzipCb } from 'node:zlib';
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
 */

/** Debajo de esto gzip agrega más de lo que quita. */
const MINIMO_BYTES = 1400;

export async function jsonComprimido(
  req: Request,
  data: unknown,
  init?: { status?: number; headers?: Record<string, string> },
): Promise<NextResponse> {
  const cuerpo = JSON.stringify(data);
  const cabeceras: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    // Que las cachés intermedias no le sirvan la versión comprimida a un cliente
    // que no la pidió.
    vary: 'Accept-Encoding',
    ...(init?.headers ?? {}),
  };

  const acepta = (req.headers.get('accept-encoding') ?? '').toLowerCase().includes('gzip');
  if (!acepta || Buffer.byteLength(cuerpo) < MINIMO_BYTES) {
    return new NextResponse(cuerpo, { status: init?.status ?? 200, headers: cabeceras });
  }

  try {
    const comprimido = await gzip(cuerpo, { level: 6 });
    return new NextResponse(new Uint8Array(comprimido), {
      status: init?.status ?? 200,
      headers: { ...cabeceras, 'content-encoding': 'gzip', 'content-length': String(comprimido.length) },
    });
  } catch {
    return new NextResponse(cuerpo, { status: init?.status ?? 200, headers: cabeceras });
  }
}
