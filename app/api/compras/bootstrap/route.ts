import { NextResponse } from "next/server";
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
export async function GET() {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    const [pedidos, ordenes, recepciones, movimientos] = await Promise.all([
      listPedidos(), listOrdenes(), listRecepciones(), listMovimientosResumen(),
    ]);
    const todo = { pedidos, ordenes, recepciones, movimientos };
    return NextResponse.json(
      g.alcance === "todo" ? todo : recortarAMisSolicitudes(todo, sesionDeActor(g)),
    );
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
