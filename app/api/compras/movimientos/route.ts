import { NextResponse } from "next/server";
import { listMovimientos } from "@/lib/compras/repo";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    const { searchParams } = new URL(req.url);
    const entidad = searchParams.get("entidad") ?? "";
    const id = Number(searchParams.get("id") ?? 0);
    return NextResponse.json(await listMovimientos(entidad, id));
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
