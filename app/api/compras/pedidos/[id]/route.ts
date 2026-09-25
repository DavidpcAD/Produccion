import { NextResponse } from "next/server";
import { mensajeParaCliente } from "@/lib/errores";
import { getPedido, setPedidoEstado, softDeletePedido, updatePedido } from "@/lib/compras/repo";
import { guardCompras, esRechazo, exigirPedidoPropio } from "@/lib/compras/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Los cuatro handlers pasan por `exigirPedidoPropio`: el id va en la URL y son
// correlativos, así que sin eso quien solo pide material podía leer, editar,
// mover de estado o borrar la solicitud de cualquier otro escribiendo el número.
// Quien ve todo el módulo no cambia: Proveeduría tiene que poder devolver y
// archivar lo ajeno, que es su oficio.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;
  const ajeno = await exigirPedidoPropio(g, Number((await params).id));
  if (ajeno) return ajeno;

  try {
    const p = await getPedido(Number((await params).id));
    if (!p) return NextResponse.json({ error: "no encontrado" }, { status: 404 });
    return NextResponse.json(p);
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;
  const ajeno = await exigirPedidoPropio(g, Number((await params).id));
  if (ajeno) return ajeno;

  try {
    const { estado, motivo } = await req.json();
    // La identidad del actor sale de la SESIÓN, nunca del body: antes el cliente
    // decidía a nombre de quién quedaba el registro (y qué rol figuraba).
    const { usuario, rol } = g;
    await setPedidoEstado(Number((await params).id), estado, usuario, rol, motivo);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;
  const ajeno = await exigirPedidoPropio(g, Number((await params).id));
  if (ajeno) return ajeno;

  try {
    const body = await req.json();
    await updatePedido({ id: Number((await params).id), ...body });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCompras();
  if (esRechazo(g)) return g;
  const ajeno = await exigirPedidoPropio(g, Number((await params).id));
  if (ajeno) return ajeno;

  try {
    await softDeletePedido(Number((await params).id), g.usuario, g.rol);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
