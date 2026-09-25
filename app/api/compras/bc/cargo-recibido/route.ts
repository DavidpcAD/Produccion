import { NextRequest, NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { bcPostChargeOnReceipts } from "@/lib/compras/bc";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `exigeTodo`: Los cargos sobre factura son de contabilidad. Quien solo pide
// material no tiene pantalla para esto, pero el proxy dejaba pasar la llamada.

// POST /api/bc/cargo-recibido
// Registra en BC un Cargo de producto (flete/transporte facturado por un tercero)
// sobre líneas de recepciones ya registradas: crea el pedido con solo la línea de
// cargo, lo asigna a las líneas de recepción elegidas con el método indicado, fija
// el N.º de factura del proveedor y registra. Body: ver bcPostChargeOnReceipts.
export async function POST(req: NextRequest) {
  const g = await guardCompras({ exigeTodo: true });
  if (esRechazo(g)) return g;

  try {
    const body = await req.json();
    const resultado = await bcPostChargeOnReceipts(body);
    return NextResponse.json({ ok: true, resultado });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: mensajeParaCliente(e) }, { status: 400 });
  }
}
