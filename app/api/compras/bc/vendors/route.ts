import { NextResponse } from "next/server";
import { bcVendors } from "@/lib/compras/bc";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    return NextResponse.json({ proveedores: await bcVendors() });
  } catch (e: any) {
    return NextResponse.json({ proveedores: [], error: String(e?.message ?? e) }, { status: 200 });
  }
}
