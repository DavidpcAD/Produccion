import { NextResponse } from "next/server";
import { bcUnidadesDeItem } from "@/lib/compras/bc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Unidades de medida de UN artículo, con su factor respecto de la unidad base
// (qtyPerUnitOfMeasure). Se pide al elegir el material en la solicitud, igual que
// las variantes. Devuelve la lista cruda de BC: qué unidades se OFRECEN (esconder
// HRS, garantizar la base) lo decide quien la muestra — ver `unidadesOfrecidas`
// en lib/compras/helpers.ts.
export async function GET(req: Request) {
  const item = new URL(req.url).searchParams.get("item") ?? "";
  try {
    return NextResponse.json({ unidades: await bcUnidadesDeItem(item) });
  } catch (e) {
    // Sin unidades el drawer se queda con la del catálogo: no es motivo para romper
    // la pantalla, así que se responde 200 con la lista vacía y el motivo.
    return NextResponse.json({ unidades: [], error: e instanceof Error ? e.message : String(e) }, { status: 200 });
  }
}
