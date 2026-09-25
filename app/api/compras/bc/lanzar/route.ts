import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { bcCrearYLanzarPedido, bcDeepLinkPedido } from "@/lib/compras/bc";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Crea el Pedido de compra en Business Central a partir de las líneas aprobadas
// y lo LANZA (Release) en el mismo paso, para que en BC aparezca directo como
// "Lanzado". Lo usa Aprobación cuando Luis Roberto aprueba la orden.
export async function POST(req: Request) {
  const g = await guardCompras({ soloAdmin: true });
  if (esRechazo(g)) return g;

  try {
    const body = await req.json();
    const { number, id, omitidas, creadas, lineError, cargoError, cargosCreados, released, releaseError, releaseStatus } = await bcCrearYLanzarPedido(body);
    return NextResponse.json(
      { number, id, omitidas, creadas, lineError, cargoError, cargosCreados, released, releaseError, releaseStatus, deepLink: bcDeepLinkPedido(number) },
      { status: 201 },
    );
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
