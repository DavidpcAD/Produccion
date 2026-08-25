import { NextResponse } from "next/server";
import { bcUltimaCompra, bcItemLastCost, bcItemFichas } from "@/lib/compras/bc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Último precio de compra de un artículo, SIEMPRE por UNIDAD BASE y diciendo cuál es.
//
// Un precio suelto no sirve: el adhesivo M06-0009 vale ¢1,735 el gramo y ¢442.434 el
// estañón (255.000 gramos). El 21/08/2026 salió una orden con el precio del gramo en
// una línea de estañones. Por eso acá el número viaja con su unidad y quien lo use lo
// convierte a la unidad de SU línea (precioEnUnidad, en lib/compras/helpers.ts).
//
// Y con su MONEDA: los dos precios que devuelve esta ruta están en COLONES (BC guarda
// el costo del inventario en moneda local aunque la compra se haya hecho en dólares).
// La misma compra de M06-0009 es US$969,91 el estañón en la factura y ¢442.434,15 en el
// ledger: son el mismo número al tipo de cambio del día. Quien proponga el precio en una
// orden en otra moneda tiene que convertirlo o no proponerlo.
//
// Fuentes, en orden:
//  1) "compra": última compra REAL del material (API custom lastPurchasePrices),
//     prefiriendo la de ESE proveedor si le compró alguna vez.
//  2) "item": el costo unitario que BC guarda en la ficha (respaldo).
// La fuente vieja "proveedor" (líneas de factura de compra) se quitó: su $select daba
// 400 desde siempre y su `unitCost` no es el precio de compra — ver bcUltimoPrecioFacturado.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const item = (u.searchParams.get("item") ?? "").trim();
  const vendor = (u.searchParams.get("vendor") ?? "").trim();
  if (!item) return NextResponse.json({ precio: null, unidad: null, fuente: null });
  try {
    // La unidad base sale de la ficha del artículo: es la unidad del precio.
    const base = (await bcItemFichas([item])).get(item)?.base ?? "";

    const compra = await bcUltimaCompra(item, vendor);
    if (compra && base) {
      return NextResponse.json({
        precio: compra.precioBase, unidad: base, moneda: "CRC", fuente: "compra",
        detalle: { fecha: compra.fecha, documento: compra.documentoNo, proveedor: compra.vendorNo, delProveedor: compra.delProveedor, unidadDocumento: compra.unidadDocumento },
      });
    }
    const costo = await bcItemLastCost(item);
    if (costo != null && base) return NextResponse.json({ precio: costo, unidad: base, moneda: "CRC", fuente: "item" });

    // Sin unidad base no se devuelve precio: un número sin unidad es justo el problema.
    return NextResponse.json({ precio: null, unidad: null, fuente: null });
  } catch (e) {
    return NextResponse.json({ precio: null, unidad: null, fuente: null, error: e instanceof Error ? e.message : String(e) });
  }
}
