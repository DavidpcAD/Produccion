import { NextResponse } from "next/server";
import { bcActivosFijos } from "@/lib/compras/bc";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Catálogo de Activos Fijos de BC (AF-…) para las solicitudes de tipo "activo".
export async function GET() {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    return NextResponse.json({ activos: await bcActivosFijos() });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
