import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { bcRecibir } from "@/lib/compras/bc";
import { guardCompras, esRechazo } from "@/lib/compras/guard";
import { frenarAntesDePostear } from "@/lib/compras/frenar-registro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `exigeTodo`: Registrar la recepción en BC es de quien recibe. Quien solo pide
// material no tiene pantalla para esto, pero el proxy dejaba pasar la llamada.

// MODO 2 — Solo recepción en BC (material bien, factura en revisión).
// body: { orderNo, ordenId, lineas: [{itemNo, qty, variantCode?, tipo?}], postingDate? }
export async function POST(req: Request) {
  const g = await guardCompras({ exigeTodo: true });
  if (esRechazo(g)) return g;

  try {
    const { orderNo, ordenId, lineas, postingDate } = await req.json();
    // Los mismos tres frenos que al registrar la factura. El de precio va también
    // acá: después de la primera recepción el pedido ya no se puede reescribir desde
    // la app, y corregir el precio pasa a ser a mano en BC. Ver frenar-registro.ts.
    const freno = await frenarAntesDePostear({ orderNo, ordenId, lineas, accion: "recibir" });
    if (freno) return NextResponse.json(freno, { status: 409 });
    const receiptNo = await bcRecibir(orderNo, lineas ?? [], postingDate ?? "");
    return NextResponse.json({ ok: true, receiptNo });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: mensajeParaCliente(e) }, { status: 502 });
  }
}
