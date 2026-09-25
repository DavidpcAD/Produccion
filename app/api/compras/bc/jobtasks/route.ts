import { NextRequest, NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { bcJobTasks } from "@/lib/compras/bc";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/bc/jobtasks?jobNo=OR-4321  (jobNo opcional; sin él devuelve todas).
// Catálogo de tareas de obra desde BC (jobTasks, page 50154).
export async function GET(req: NextRequest) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  const { searchParams } = new URL(req.url);
  const jobNo = searchParams.get("jobNo") ?? undefined;
  try {
    return NextResponse.json({ jobTasks: await bcJobTasks(jobNo) });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
