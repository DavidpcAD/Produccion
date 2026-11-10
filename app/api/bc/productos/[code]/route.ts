import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { mensajeParaCliente } from '@/lib/errores';
import { bcEditarProducto, bcFichaProducto, bcOpcionesProducto, ProductoCambiadoEnBc } from '@/lib/compras/bc';
import { MAX_DESCRIPCION, TIPO_BC, type CambiosProducto, type FichaProductoBc, type TipoProducto } from '@/lib/bc/productos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Un producto de BC: verlo como está AHORA en BC, cambiarlo y bloquearlo.
//   GET   → la ficha leída en vivo (con su versión) + las listas del formulario.
//   PATCH { etag, ...cambios } → lo cambia en BC. `bloqueado: true|false` bloquea o
//         desbloquea. Si alguien lo cambió en BC después de abrirlo, responde 409
//         con la ficha actual en `actual` y no pisa nada.
// Mismo permiso que /api/bc/productos (módulo Presupuesto + nivel 2).

async function autorizado() {
  const session = await getSession();
  return session && session.nivelAdmin >= 2 ? session : null;
}

const codigoDe = async (params: Promise<{ code: string }>) => decodeURIComponent((await params).code ?? '').trim().toUpperCase();

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  if (!(await autorizado())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const code = await codigoDe(params);
  try {
    const [item, opciones] = await Promise.all([bcFichaProducto(code), bcOpcionesProducto()]);
    if (!item) return NextResponse.json({ error: `El producto ${code} no existe en Business Central.` }, { status: 404 });
    return NextResponse.json({ item, opciones }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('/api/bc/productos/[code] GET error:', e);
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await autorizado();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const code = await codigoDe(params);
  const body = await req.json().catch(() => ({}));
  const etag = String(body.etag ?? '');
  if (!etag) return NextResponse.json({ error: 'Falta la versión del producto: volvé a abrirlo.' }, { status: 400 });

  // Solo lo que vino en el cuerpo se cambia; lo demás queda como está en BC.
  const c: CambiosProducto = {};
  if (body.descripcion !== undefined) c.descripcion = String(body.descripcion).replace(/\s+/g, ' ').trim().toUpperCase();
  if (body.tipo !== undefined) c.tipo = String(body.tipo) as TipoProducto;
  if (body.categoria !== undefined) c.categoria = String(body.categoria).trim();
  if (body.unidad !== undefined) c.unidad = String(body.unidad).trim();
  if (body.grupoProducto !== undefined) c.grupoProducto = String(body.grupoProducto).trim();
  if (body.grupoInventario !== undefined) c.grupoInventario = String(body.grupoInventario).trim();
  if (body.precio !== undefined) c.precio = body.precio === '' || body.precio === null ? 0 : Number(body.precio);
  if (body.bloqueado !== undefined) c.bloqueado = !!body.bloqueado;

  if (c.descripcion !== undefined && !c.descripcion) return NextResponse.json({ error: 'La descripción no puede quedar vacía.' }, { status: 400 });
  if (c.descripcion && c.descripcion.length > MAX_DESCRIPCION) return NextResponse.json({ error: `La descripción no puede pasar de ${MAX_DESCRIPCION} caracteres.` }, { status: 400 });
  if (c.tipo !== undefined && !(c.tipo in TIPO_BC)) return NextResponse.json({ error: 'Tipo de producto inválido.' }, { status: 400 });
  if (c.precio !== undefined && (!Number.isFinite(c.precio) || c.precio < 0)) return NextResponse.json({ error: 'El precio de venta tiene que ser un número mayor o igual a cero.' }, { status: 400 });

  try {
    const opciones = await bcOpcionesProducto();
    if (c.categoria !== undefined && c.categoria && !opciones.categorias.some((x) => x.code === c.categoria)) return NextResponse.json({ error: `La categoría ${c.categoria} no existe en Business Central.` }, { status: 400 });
    if (c.unidad !== undefined && !opciones.unidades.some((x) => x.code === c.unidad)) return NextResponse.json({ error: `La unidad ${c.unidad} no existe en Business Central.` }, { status: 400 });
    if (c.grupoProducto !== undefined && !opciones.gruposProducto.some((x) => x.code === c.grupoProducto)) return NextResponse.json({ error: `El grupo contable ${c.grupoProducto} no existe en Business Central.` }, { status: 400 });
    if (c.grupoInventario && !opciones.gruposInventario.some((x) => x.code === c.grupoInventario)) return NextResponse.json({ error: `El grupo de inventario ${c.grupoInventario} no existe en Business Central.` }, { status: 400 });

    const antes: FichaProductoBc | null = await bcFichaProducto(code);
    if (!antes) return NextResponse.json({ error: `El producto ${code} ya no existe en Business Central.` }, { status: 404 });
    const item = await bcEditarProducto(code, etag, c);

    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
    await logAudit({
      idColAccion: session.idCol,
      accion: c.bloqueado === true && !antes.bloqueado ? 'BLOQUEAR_PRODUCTO_BC'
        : c.bloqueado === false && antes.bloqueado ? 'DESBLOQUEAR_PRODUCTO_BC'
        : 'EDITAR_PRODUCTO_BC',
      entidad: 'BC.Item',
      detallePrevio: { ...antes, etag: undefined },
      detalleNuevo: { code, ...c, por: session.username || session.nombre || null },
      ip,
    });
    console.info(`[bc/productos] ${session.username || session.idCol} cambió ${code}: ${JSON.stringify(c)}`);
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    if (e instanceof ProductoCambiadoEnBc) {
      return NextResponse.json({ error: e.message, actual: e.actual }, { status: 409 });
    }
    console.error('/api/bc/productos/[code] PATCH error:', e);
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
