import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { bcAlmacenes } from "@/lib/compras/bc";
import { leerClasesAlmacen } from "@/lib/compras/almacen-clase";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Almacenes de BC + la marca Real/Virtual de la app (dbo.AlmacenClase). `clase`
// null = sin marcar: el pedido decide por el código, como siempre.
export async function GET() {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    const [almacenes, clases] = await Promise.all([bcAlmacenes(), leerClasesAlmacen()]);
    return NextResponse.json({
      almacenes: almacenes.map((a) => ({
        ...a,
        clase: clases.get(a.codigo.trim().toUpperCase())?.clase ?? null,
      })),
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
