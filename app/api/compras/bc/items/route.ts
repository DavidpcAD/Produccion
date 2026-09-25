import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { bcItems, bcItemsBloqueados } from "@/lib/compras/bc";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  try {
    // `bloqueados` viaja junto al catálogo porque NO alcanza con no ofrecerlos en el
    // buscador: una PLANTILLA (o un pedido copiado) trae códigos guardados, y el que no
    // está en el catálogo se sintetiza con la descripción que guardó la plantilla. Así
    // se colaba M06-0116 —bloqueado en BC— al lado de su reemplazo M06-0805, encima con
    // el nombre viejo. Con la lista, el drawer puede descartar esas líneas y decir por
    // qué. Ambos vienen del mismo caché de 5 min, así que no cuesta una llamada extra.
    const [items, bloqueados] = await Promise.all([bcItems(), bcItemsBloqueados()]);
    return NextResponse.json({ items, bloqueados: bloqueados ? [...bloqueados] : [] });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
