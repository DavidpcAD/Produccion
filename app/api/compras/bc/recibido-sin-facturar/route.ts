import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { bcRecibidoSinFacturar, bcSinFechaDeEntrega } from "@/lib/compras/bc";
import { guardCompras, esRechazo } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/compras/bc/recibido-sin-facturar[?hoy=YYYY-MM-DD]
// Los dos números del Resumen que NO están en la base de la app:
//   · recibido en bodega y todavía sin factura registrada en BC, con su antigüedad;
//   · material pedido al que nadie le puso fecha de entrega.
// Van juntos en una llamada porque salen del mismo web service (`purchaseDocumentLines`)
// y la pantalla los pinta en el mismo momento; dos rutas serían dos esperas.
//
// `hoy` lo manda el navegador porque el servidor puede estar en UTC y en Costa Rica
// (UTC−6) eso corre la antigüedad un día — con tramos de 15 días, un día importa.
export async function GET(req: Request) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;

  const { searchParams } = new URL(req.url);
  const hoy = searchParams.get("hoy") ?? new Date().toISOString().slice(0, 10);
  try {
    const [sinFacturar, sinFecha] = await Promise.all([
      bcRecibidoSinFacturar(hoy),
      bcSinFechaDeEntrega(),
    ]);
    return NextResponse.json({ sinFacturar, sinFecha });
  } catch (e: unknown) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
