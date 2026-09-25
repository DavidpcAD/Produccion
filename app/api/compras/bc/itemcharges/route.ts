import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { bcItemCharges } from "@/lib/compras/bc";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/bc/itemcharges → { itemCharges: [{ no, descripcion }] }
// Catálogo de Cargos de producto (Item Charge, BC 5800) para armar la orden.
// Nunca 500: si la API custom aún no está publicada, devuelve lista vacía.
export async function GET() {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    return NextResponse.json({ itemCharges: await bcItemCharges() });
  } catch (e: any) {
    return NextResponse.json({ itemCharges: [], error: mensajeParaCliente(e) });
  }
}
