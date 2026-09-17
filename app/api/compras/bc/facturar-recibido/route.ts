import { NextResponse } from "next/server";
import { bcFacturarRecibido } from "@/lib/compras/bc";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// MODO 2 — Registrar la factura de lo YA recibido (Kattya, tras revisar).
// body: { orderNo, vendorInvoiceNo, lineas: [{itemNo, qty}] }
export async function POST(req: Request) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    const { orderNo, vendorInvoiceNo, lineas } = await req.json();
    const postedNo = await bcFacturarRecibido(orderNo, vendorInvoiceNo, lineas ?? []);
    return NextResponse.json({ ok: true, postedNo });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 502 });
  }
}
