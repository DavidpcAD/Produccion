import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { createOrden, listOrdenes, listPedidos } from "@/lib/compras/repo";
import { guardCompras, esRechazo, sesionDeActor } from "@/lib/compras/guard";
import { ordenesDeMisPedidos } from "@/lib/compras/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    const ordenes = await listOrdenes();
    if (g.alcance === "todo") return NextResponse.json(ordenes);
    // Quien solo pide material ve las órdenes en las que entraron SUS solicitudes
    // —de ahí sale el avance de su pantalla— y ninguna otra. Hacen falta los
    // pedidos porque el enlace pedido↔orden vive a nivel de línea.
    const me = sesionDeActor(g);
    return NextResponse.json(ordenesDeMisPedidos(ordenes, await listPedidos(), me));
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}

// Crear una orden es de Proveeduría: quien solo pide material no tiene pantalla
// para esto, pero el proxy dejaba pasar la llamada igual (`modulosDeRuta` devuelve
// ['ingenieria','bodega','recepcion'] para TODA /api/compras).
export async function POST(req: Request) {
  const g = await guardCompras({ exigeTodo: true });
  if (esRechazo(g)) return g;

  try {
    // La identidad del actor sale de la SESIÓN, nunca del body: antes el cliente
    // decidía a nombre de quién quedaba el registro (y qué rol figuraba).
    const id = await createOrden({ ...(await req.json()), usuario: g.usuario, rol: g.rol });
    return NextResponse.json({ idOrdenCompra: id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
