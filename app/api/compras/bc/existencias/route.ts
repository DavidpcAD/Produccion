import { NextRequest, NextResponse } from "next/server";
import { jsonComprimido } from '@/lib/http/json-comprimido';
import { mensajeParaCliente } from "@/lib/errores";
import { bcExistencias } from "@/lib/compras/bc";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/compras/bc/existencias?itemNo=M01-0001  ó  ?locationCode=OR-4321 (al menos uno).
// Devuelve el stock neto físico por ubicación/variante desde BC (inventoryByLocation).
//
// La pantalla de Inventarios la llama UNA VEZ POR ALMACÉN (45 en el Sandbox) y
// cada respuesta pesa ~150 KB cruda, así que acá la compresión no es un detalle:
// se probó pedirle a BC el inventario completo de una, sin `$filter`, y
// `inventoryByLocation` devuelve vacío — el filtro no es opcional del lado de BC.
export async function GET(req: NextRequest) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  const { searchParams } = new URL(req.url);
  const itemNo = searchParams.get("itemNo") ?? undefined;
  const locationCode = searchParams.get("locationCode") ?? undefined;
  if (!itemNo?.trim() && !locationCode?.trim()) {
    return NextResponse.json({ error: "Se requiere itemNo o locationCode." }, { status: 400 });
  }
  try {
    return jsonComprimido(req, { existencias: await bcExistencias({ itemNo, locationCode }) });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
