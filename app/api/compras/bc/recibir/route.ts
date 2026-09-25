import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { bcRecibir } from "@/lib/compras/bc";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `exigeTodo`: Registrar la recepción en BC es de quien recibe. Quien solo pide
// material no tiene pantalla para esto, pero el proxy dejaba pasar la llamada.

// MODO 2 — Solo recepción en BC (material bien, factura en revisión).
// body: { orderNo, lineas: [{itemNo, qty}], postingDate? }
export async function POST(req: Request) {
  const g = await guardCompras({ exigeTodo: true });
  if (esRechazo(g)) return g;

  try {
    const { orderNo, lineas, postingDate } = await req.json();
    const receiptNo = await bcRecibir(orderNo, lineas ?? [], postingDate ?? "");
    return NextResponse.json({ ok: true, receiptNo });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: mensajeParaCliente(e) }, { status: 502 });
  }
}
