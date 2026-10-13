import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { bcFacturarRecibido } from "@/lib/compras/bc";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `exigeTodo`: Facturar lo recibido en BC es de contabilidad. Quien solo pide
// material no tiene pantalla para esto, pero el proxy dejaba pasar la llamada.

// MODO 2 — Registrar la factura de lo YA recibido (Kattya, tras revisar).
// body: { orderNo, vendorInvoiceNo, lineas: [{itemNo, qty}] }
export async function POST(req: Request) {
  const g = await guardCompras({ exigeTodo: true });
  if (esRechazo(g)) return g;

  try {
    const { orderNo, vendorInvoiceNo, lineas } = await req.json();
    // g.usuario = nombre del usuario logueado (del token, nunca del body). Se firma
    // en BC como "Realizado Por" de la factura registrada.
    const postedNo = await bcFacturarRecibido(orderNo, vendorInvoiceNo, lineas ?? [], "", g.usuario);
    return NextResponse.json({ ok: true, postedNo });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: mensajeParaCliente(e) }, { status: 502 });
  }
}
