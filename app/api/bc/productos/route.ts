import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { mensajeParaCliente } from '@/lib/errores';
import { jsonComprimido } from '@/lib/http/json-comprimido';
import { bcCatalogoProductos, bcCrearProducto, bcNumerosProductos, bcOpcionesProducto, bcProductoExiste } from '@/lib/compras/bc';
import {
  normalizarNumero, siguientesNumeros, validarNuevoProducto,
  type NuevoProducto, type TipoProducto,
} from '@/lib/bc/productos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Business Central → Productos (pantalla /bc/productos/nuevo).
//   GET  → listas del formulario (unidades, grupos contables, categorías con su
//          padre) + TODO el catálogo leído en vivo de BC, bloqueados incluidos
//          (para los parecidos, para sacar el siguiente Nº de cada familia y para
//          que un cambio hecho en BC se vea al abrir la pantalla).
//   POST → crea el artículo en BC.
// Editar / bloquear uno que ya existe: /api/bc/productos/[code].
// Va bajo /api/bc para que sea del módulo Presupuesto (getRouteModule: /bc →
// presupuesto), igual que /api/bc/inventario; el proxy ya filtra por módulo y acá
// se pide además sesión de nivel 2, como el resto de /api/bc.

async function autorizado() {
  const session = await getSession();
  return session && session.nivelAdmin >= 2 ? session : null;
}

export async function GET(req: NextRequest) {
  if (!(await autorizado())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const [opciones, items] = await Promise.all([bcOpcionesProducto(), bcCatalogoProductos()]);
    return jsonComprimido(req, { ...opciones, items, leidoEn: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('/api/bc/productos GET error:', e);
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await autorizado();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const precioRaw = body.precio;
  const precio = precioRaw === '' || precioRaw == null ? undefined : Number(precioRaw);
  const p: NuevoProducto = {
    numero: normalizarNumero(body.numero),
    // La descripción va en mayúsculas, como el resto del catálogo de BC.
    descripcion: String(body.descripcion ?? '').replace(/\s+/g, ' ').trim().toUpperCase(),
    tipo: String(body.tipo ?? '') as TipoProducto,
    categoria: String(body.categoria ?? '').trim(),
    unidad: String(body.unidad ?? '').trim(),
    grupoProducto: String(body.grupoProducto ?? '').trim(),
    grupoInventario: String(body.grupoInventario ?? '').trim() || undefined,
    precio,
  };
  try {
    const opciones = await bcOpcionesProducto();
    const problema = validarNuevoProducto(p, opciones);
    if (problema) return NextResponse.json({ error: problema }, { status: 400 });

    if (await bcProductoExiste(p.numero)) {
      const sugerido = siguientesNumeros(await bcNumerosProductos())[p.numero.split('-')[0]];
      return NextResponse.json({
        error: `Ya existe un producto con el Nº ${p.numero} en Business Central.${sugerido ? ` El siguiente libre es ${sugerido}.` : ''}`,
        sugerido: sugerido ?? null,
      }, { status: 409 });
    }

    const item = await bcCrearProducto(p);
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
    await logAudit({
      idColAccion: session.idCol,
      accion: 'CREAR_PRODUCTO_BC',
      entidad: 'BC.Item',
      detalleNuevo: { ...p, por: session.username || session.nombre || null },
      ip,
    });
    console.info(`[bc/productos] ${session.username || session.idCol} creó ${item.code} "${item.descripcion}"`);
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    console.error('/api/bc/productos POST error:', e);
    const msg = mensajeParaCliente(e);
    return NextResponse.json({ error: msg }, { status: /ya existe/i.test(msg) ? 409 : 500 });
  }
}
