import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import {
  ErrorPedidoBC,
  crearPedidoEnsamblado,
  previewPedidoEnsamblado,
} from '@/lib/concreto/pedido-bc';
import type { OpcionesCrearPedidoBC } from '@/lib/concreto/tipos-deps';

// Integración Business Central — Pedido de Ensamblado desde una colada.
//   GET  /api/concreto/coladas/[id]/pedido-bc  → preview { lineas, ... }
//   POST /api/concreto/coladas/[id]/pedido-bc  → crear { numero_pedido, ... }
//
// Idempotencia: si la colada ya tiene pedido, el POST responde 409 con
// { error, codigo: 'YA_TIENE_PEDIDO_BC' }.

function parsearId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// GET — preview (no llama a BC).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const idColada = parsearId(id);
  if (idColada === null) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

  try {
    const db = await getAdelanteDb();
    const preview = await previewPedidoEnsamblado(db, idColada);
    if (!preview) return NextResponse.json({ error: 'Colada no encontrada' }, { status: 404 });
    return NextResponse.json(preview);
  } catch (err: unknown) {
    if (err instanceof ErrorPedidoBC) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/coladas/[id]/pedido-bc GET error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST — crear el pedido en BC.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const idColada = parsearId(id);
  if (idColada === null) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

  // Parseo manual del body (overrides opcionales). Body vacío es válido.
  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text && text.trim() !== '') body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Body inválido (no es JSON)' }, { status: 400 });
  }

  const opciones: OpcionesCrearPedidoBC = {};
  if (typeof body.codigo_almacen_destino === 'string') {
    opciones.codigoAlmacenDestino = body.codigo_almacen_destino;
  }
  if (typeof body.fecha_registro === 'string') opciones.fechaRegistro = body.fecha_registro;
  if (typeof body.codigo_producto_bc === 'string') opciones.codigoProductoBc = body.codigo_producto_bc;
  if (typeof body.cantidad_m3 === 'number') opciones.cantidadM3 = body.cantidad_m3;

  try {
    const db = await getAdelanteDb();
    const resultado = await crearPedidoEnsamblado(db, idColada, session.cedula, opciones);
    return NextResponse.json(resultado, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof ErrorPedidoBC) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/coladas/[id]/pedido-bc POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
