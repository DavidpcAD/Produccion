import { NextResponse } from "next/server";
import { jsonComprimido } from "@/lib/http/json-comprimido";
import { mensajeParaCliente } from "@/lib/errores";
import { listMovimientosResumen, listOrdenes, listPedidos, listRecepciones } from "@/lib/compras/repo";
import { guardCompras, esRechazo, sesionDeActor } from "@/lib/compras/guard";
import { recortarAMisSolicitudes } from "@/lib/compras/scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Carga inicial de toda la data para el front-end (modo API).
//
// "Toda" es ahora toda LA DE QUIEN PREGUNTA. Hasta acá salían los pedidos y las
// órdenes enteros —precios, proveedores, obras de toda la empresa— para cualquiera
// con acceso al módulo, y el recorte lo hacía la pantalla; quien abriera las
// herramientas del navegador veía el resto igual. Ver lib/compras/scope.ts.
// `?parte=cola` es la PRIMERA carga de Aprobación: solo las órdenes pendientes.
// En producción son 7 de 634, así que la pantalla pinta con ~30 KB en vez de ~5 MB;
// el resto lo pide el cliente enseguida, de fondo, con el bootstrap completo.
// Solo con alcance "todo": a quien se le recorta a "mis solicitudes" el recorte
// encadena pedidos → órdenes → recepciones (ver lib/compras/scope.ts) y partido no
// sabría de quién es cada cosa; igual son pocas filas.
export async function GET(req: Request) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    if (new URL(req.url).searchParams.get("parte") === "cola" && g.alcance === "todo") {
      const ordenes = await listOrdenes({ estados: ["pendiente_aprobacion"] });
      return jsonComprimido(req, { ordenes, parcial: true });
    }

    const [pedidos, ordenes, recepciones, movimientos] = await Promise.all([
      listPedidos(), listOrdenes(), listRecepciones(), listMovimientosResumen(),
    ]);
    const todo = { pedidos, ordenes, recepciones, movimientos };
    // Comprimido: es la respuesta más pesada de la app (~5 MB en AdelantePRO) y
    // Next no comprime lo que devuelve un route handler. Ver lib/http/json-comprimido.ts.
    return jsonComprimido(
      req,
      g.alcance === "todo" ? todo : recortarAMisSolicitudes(todo, sesionDeActor(g)),
    );
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
