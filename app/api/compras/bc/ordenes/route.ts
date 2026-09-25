import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { bcCrearPedido, bcDeepLinkPedido } from "@/lib/compras/bc";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `exigeTodo`: Crear el pedido en BC es de Proveeduría. Quien solo pide
// material no tiene pantalla para esto, pero el proxy dejaba pasar la llamada.

// Crea un Pedido de compra (Purchase Order) en Business Central a partir del
// proveedor y las líneas de material seleccionadas en Proveeduría.
export async function POST(req: Request) {
  const g = await guardCompras({ exigeTodo: true });
  if (esRechazo(g)) return g;

  try {
    const body = await req.json();
    const { number, id, omitidas } = await bcCrearPedido(body);
    return NextResponse.json({ number, id, omitidas, deepLink: bcDeepLinkPedido(number) }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
