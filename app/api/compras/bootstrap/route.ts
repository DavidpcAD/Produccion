import { NextResponse } from "next/server";
import { armarCuerpo, responder, jsonComprimido } from "@/lib/http/json-comprimido";
import { mensajeParaCliente } from "@/lib/errores";
import { listMovimientosResumen, listOrdenes, listPedidos, listRecepciones } from "@/lib/compras/repo";
import { guardCompras, esRechazo, sesionDeActor } from "@/lib/compras/guard";
import { recortarAMisSolicitudes } from "@/lib/compras/scope";
import { snapshotBootstrap } from "@/lib/compras/cache-bootstrap";
import type { Orden, Pedido, Recepcion } from "@/lib/compras/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Carga inicial de toda la data para el front-end (modo API).
//
// "Toda" es ahora toda LA DE QUIEN PREGUNTA. Hasta acá salían los pedidos y las
// órdenes enteros —precios, proveedores, obras de toda la empresa— para cualquiera
// con acceso al módulo, y el recorte lo hacía la pantalla; quien abriera las
// herramientas del navegador veía el resto igual. Ver lib/compras/scope.ts.
// `?parte=cola` es la PRIMERA carga de Aprobación: solo las órdenes pendientes.
// En producción son 7 de 822, así que la pantalla pinta con ~30 KB en vez de ~5.7 MB;
// el resto lo pide el cliente enseguida, de fondo, con el bootstrap completo.
//
// El cuerpo COMPLETO (alcance "todo") va por una FOTO COMPARTIDA: varias pestañas
// que caen juntas —o el refresco de 20 s— reusan una sola corrida en vez de
// serializar ~5.7 MB cada una. Toda escritura la bota al instante
// (lib/compras/cache-bootstrap.ts + lib/compras/pedir.ts). A quien se le recorta a
// "mis solicitudes" (Digitación·Locales, pocas filas) se le arma aparte: el recorte
// encadena pedidos → órdenes → recepciones y es por persona.

/** Suma las LÍNEAS de cada documento: ahí está el peso, no en los encabezados. */
function contarLineas(pedidos: Pedido[], ordenes: Orden[], recepciones: Recepcion[]): number {
  const s = (arr: { lineas?: unknown[] }[]) => arr.reduce((n, d) => n + (d.lineas?.length ?? 0), 0);
  return s(pedidos) + s(ordenes) + s(recepciones);
}

/** `Server-Timing`: se ve desde las DevTools del navegador (pestaña Network ·
 *  Timing) sin instrumentar nada en el cliente. `dur` en ms; `desc` es texto. */
function serverTiming(campos: Record<string, string | number>): Record<string, string> {
  const partes = Object.entries(campos).map(([k, v]) =>
    typeof v === "number" ? `${k};dur=${Math.round(v)}` : `${k};desc=${JSON.stringify(String(v))}`,
  );
  return { "Server-Timing": partes.join(", ") };
}

const LOG = process.env.COMPRAS_BOOTSTRAP_LOG === "1";

/** Interruptor runtime de la caché local del cliente (PASO 3). `COMPRAS_CACHE_LOCAL=0`
 *  la apaga sin desplegar; viaja en cada respuesta (ver lib/compras/cache-local.ts). */
function cabeceras(timing: Record<string, string>): Record<string, string> {
  return { ...timing, "x-compras-cache-local": process.env.COMPRAS_CACHE_LOCAL === "0" ? "0" : "1" };
}

export async function GET(req: Request) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  const t0 = performance.now();
  try {
    if (new URL(req.url).searchParams.get("parte") === "cola" && g.alcance === "todo") {
      const ordenes = await listOrdenes({ estados: ["pendiente_aprobacion"] });
      return jsonComprimido(req, { ordenes, parcial: true },
        { headers: cabeceras(serverTiming({ parte: "cola", ordenes: ordenes.length, total: performance.now() - t0 })) });
    }

    // Alcance recortado (mis-solicitudes): por persona, pocas filas, sin foto.
    if (g.alcance !== "todo") {
      const [pedidos, ordenes, recepciones, movimientos] = await Promise.all([
        listPedidos(), listOrdenes(), listRecepciones(), listMovimientosResumen(),
      ]);
      const recortado = recortarAMisSolicitudes({ pedidos, ordenes, recepciones, movimientos }, sesionDeActor(g));
      return jsonComprimido(req, recortado,
        { headers: cabeceras(serverTiming({ parte: "mis", pedidos: recortado.pedidos.length, ordenes: recortado.ordenes.length, total: performance.now() - t0 })) });
    }

    // Alcance "todo", cuerpo completo: foto compartida (PASO 2).
    let metrica: Record<string, string | number> = {};
    const { snap, cache } = await snapshotBootstrap(async () => {
      const tDb = performance.now();
      const [pedidos, ordenes, recepciones, movimientos] = await Promise.all([
        listPedidos(), listOrdenes(), listRecepciones(), listMovimientosResumen(),
      ]);
      const dbMs = performance.now() - tDb;
      const tSer = performance.now();
      // Comprimido: es la respuesta más pesada de la app y Next no comprime lo que
      // devuelve un route handler (ver lib/http/json-comprimido.ts).
      const listo = await armarCuerpo({ pedidos, ordenes, recepciones, movimientos });
      metrica = {
        db: dbMs,
        serialize: performance.now() - tSer,
        docs: `${pedidos.length}p/${ordenes.length}o/${recepciones.length}r`,
        lineas: contarLineas(pedidos, ordenes, recepciones),
        bytes: `${Math.round(Buffer.byteLength(listo.cuerpo) / 1024)}KB->${Math.round((listo.gzip?.length ?? 0) / 1024)}KB`,
      };
      return listo;
    });

    const cabs = cabeceras(serverTiming({ ...metrica, cache, edad: Date.now() - snap.creado, total: performance.now() - t0 }));
    if (LOG) {
      console.log(`[bootstrap] cache=${cache} edad=${Date.now() - snap.creado}ms`,
        cache === "miss" ? metrica : `(foto; ${Math.round(snap.cuerpo.length / 1024)}KB)`);
    }
    return responder(req, snap, { headers: cabs });
  } catch (e: unknown) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
