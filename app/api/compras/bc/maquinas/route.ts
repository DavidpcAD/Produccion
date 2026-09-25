import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { bcMaquinas } from "@/lib/compras/bc";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Catálogo de MÁQUINAS de BC (MAQ00005…) para las solicitudes de tipo "repuesto".
// Es la tabla del parque de maquinaria (GomEqp Machine), leída por la página
// publicada `Maquinaria`; ver `bcMaquinas`.
export async function GET() {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    return NextResponse.json({ maquinas: await bcMaquinas() });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
