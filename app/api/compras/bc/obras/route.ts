import { NextResponse } from "next/server";
import { jsonComprimido } from '@/lib/http/json-comprimido';
import { mensajeParaCliente } from "@/lib/errores";
import { bcObras } from "@/lib/compras/bc";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    return jsonComprimido(req, { obras: await bcObras() });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
