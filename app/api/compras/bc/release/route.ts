import { NextResponse } from "next/server";
import { bcReleasePedidoVerificado } from "@/lib/compras/bc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lanza (Release) en BC un Pedido de compra YA CREADO, por su número (orderNo).
// Se usa para reintentar el lanzamiento cuando el pedido se creó pero el release
// falló (p.ej. el binding S2S del Sandbox parpadeó). No crea nada nuevo.
// `ok` solo si BC de verdad lo dejó "Released": un 200 con el pedido Abierto o
// Pendiente de aprobación se devuelve como fallo, con el motivo.
export async function POST(req: Request) {
  try {
    const { orderNo } = await req.json();
    if (!orderNo) return NextResponse.json({ error: "Falta orderNo" }, { status: 400 });
    const rel = await bcReleasePedidoVerificado(orderNo);
    if (!rel.lanzado) return NextResponse.json({ ok: false, status: rel.status, error: rel.motivo }, { status: 502 });
    return NextResponse.json({ ok: true, status: rel.status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 502 });
  }
}
