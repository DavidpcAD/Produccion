import { NextRequest, NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { bcPostedReceiptLines } from "@/lib/compras/bc";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/compras/bc/recepciones-registradas?vendor=&item=&doc=
// Líneas de recepciones de compra YA REGISTRADAS (albaranes) para asignarles un
// cargo de producto (flete de un tercero). Filtros: proveedor del material,
// artículo, N.º de recepción. Nunca 500: si la API custom aún no está publicada,
// devuelve { lineas: [], error } para que la UI avise sin romperse.
export async function GET(req: NextRequest) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  const sp = req.nextUrl.searchParams;
  try {
    const lineas = await bcPostedReceiptLines({
      vendorNo: sp.get("vendor") ?? undefined,
      itemNo: sp.get("item") ?? undefined,
      documentNo: sp.get("doc") ?? undefined,
    });
    return NextResponse.json({ lineas });
  } catch (e: any) {
    return NextResponse.json({ lineas: [], error: mensajeParaCliente(e) });
  }
}
