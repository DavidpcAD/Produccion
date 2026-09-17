import { NextResponse } from "next/server";
import { bcObras } from "@/lib/compras/bc";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    return NextResponse.json({ obras: await bcObras() });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
