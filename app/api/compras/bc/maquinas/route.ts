import { NextResponse } from "next/server";
import { bcMaquinas } from "@/lib/compras/bc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Catálogo de MÁQUINAS de BC (MAQ00005…) para las solicitudes de tipo "repuesto".
// Es la tabla del parque de maquinaria (GomEqp Machine), leída por la página
// publicada `Maquinaria`; ver `bcMaquinas`.
export async function GET() {
  try {
    return NextResponse.json({ maquinas: await bcMaquinas() });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
