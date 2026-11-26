import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { bcRegistrarFactura } from "@/lib/compras/bc";
import { guardCompras, esRechazo } from "@/lib/compras/guard";
import { frenarAntesDePostear } from "@/lib/compras/frenar-registro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// `exigeTodo`: Registrar en BC es de quien recibe / contabilidad. Quien solo pide
// material no tiene pantalla para esto, pero el proxy dejaba pasar la llamada.

// Registra (Recibir + Facturar) una factura parcial del pedido en Business Central.
// body: { orderNo, vendorInvoiceNo, ordenId, lineas: [{itemNo, qty, variantCode?, tipo?}], postingDate?,
//         cargo?: { itemChargeNo, descripcion?, monto, metodo? } }  ← flete del viaje
// `ordenId` es lo que deja comparar contra la orden de la BASE (proveedor y precios):
// sin él, los frenos de proveedor y de precio no aplican.
export async function POST(req: Request) {
  const g = await guardCompras({ exigeTodo: true });
  if (esRechazo(g)) return g;

  try {
    const { orderNo, vendorInvoiceNo, ordenId, lineas, postingDate, cargo } = await req.json();
    // LOS FRENOS, antes de mover un peso: encabezado (proveedor + lanzado) → líneas
    // (que BC las tenga con saldo) → precio (precio, IVA y unidad). Si uno frena, 409
    // y no se postea nada. Ver lib/compras/frenar-registro.ts.
    const freno = await frenarAntesDePostear({ orderNo, ordenId, lineas, accion: "registrar" });
    if (freno) return NextResponse.json(freno, { status: 409 });
    const cargoValido = cargo && cargo.itemChargeNo && Number(cargo.monto) > 0
      ? { itemChargeNo: String(cargo.itemChargeNo), descripcion: cargo.descripcion ? String(cargo.descripcion) : undefined, monto: Number(cargo.monto), metodo: cargo.metodo ? String(cargo.metodo) : undefined }
      : undefined;
    // g.usuario = nombre del usuario logueado (del token, nunca del body). Se firma
    // en BC como "Realizado Por" de la factura registrada.
    const postedNo = await bcRegistrarFactura(orderNo, vendorInvoiceNo, lineas ?? [], postingDate ?? "", cargoValido, g.usuario);
    return NextResponse.json({ ok: true, postedNo });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: mensajeParaCliente(e) }, { status: 502 });
  }
}
