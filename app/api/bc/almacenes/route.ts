import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { mensajeParaCliente } from '@/lib/errores';
import { bcAlmacenes } from '@/lib/compras/bc';
import { guardarClaseAlmacen, leerClasesAlmacen } from '@/lib/compras/almacen-clase';
import type { ClaseAlmacen } from '@/lib/compras/helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Business Central → Almacenes: dónde se dice qué almacén es REAL (bodega física)
// y cuál es VIRTUAL. SOLO Super Admin (N4).
//   GET  → todos los almacenes de BC con su marca y cómo cuentan hoy en el pedido
//   PUT  { codigo, clase: 'real' | 'virtual' | null } → marca (null = quitar marca)

async function autorizado() {
  const session = await getSession();
  return session && session.nivelAdmin >= 4 ? session : null;
}

export async function GET() {
  if (!(await autorizado())) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const [almacenes, clases] = await Promise.all([bcAlmacenes(), leerClasesAlmacen()]);
    const lista = almacenes.map((a) => {
      const marca = clases.get(a.codigo.trim().toUpperCase()) ?? null;
      return {
        codigo: a.codigo,
        nombre: a.nombre,
        // Lo que dice BC (Location."GJW Tipo Almacen"): casi siempre vacío. Solo
        // informativo; no decide nada.
        tipoBC: a.tipoAlmacen || null,
        clase: marca?.clase ?? null,
        actualizadoPor: marca?.actualizadoPor ?? null,
        actualizadoEn: marca?.actualizadoEn ?? null,
      };
    }).sort((x, y) => x.codigo.localeCompare(y.codigo, undefined, { numeric: true }));
    return NextResponse.json({ almacenes: lista });
  } catch (e) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await autorizado();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const codigo = String(body.codigo ?? '').trim().toUpperCase();
  const claseRaw = body.clase;
  const clase: ClaseAlmacen | null = claseRaw === 'real' || claseRaw === 'virtual' ? claseRaw : null;
  if (!codigo) return NextResponse.json({ error: 'Falta el almacén' }, { status: 400 });
  if (codigo.length > 20) return NextResponse.json({ error: 'Código de almacén inválido' }, { status: 400 });
  if (claseRaw != null && clase === null) {
    return NextResponse.json({ error: 'La clase tiene que ser "real" o "virtual"' }, { status: 400 });
  }
  try {
    // Solo almacenes que existen en BC: así no se juntan marcas huérfanas.
    const existe = (await bcAlmacenes()).some((a) => a.codigo.trim().toUpperCase() === codigo);
    if (!existe) return NextResponse.json({ error: `El almacén ${codigo} no existe en Business Central` }, { status: 404 });

    const antes = (await leerClasesAlmacen()).get(codigo)?.clase ?? null;
    const por = session.username || session.nombre || String(session.idCol);
    await guardarClaseAlmacen(codigo, clase, por);
    const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
    await logAudit({
      idColAccion: session.idCol,
      accion: 'MARCAR_ALMACEN',
      entidad: 'AlmacenClase',
      detallePrevio: { codigo, clase: antes },
      detalleNuevo: { codigo, clase },
      ip,
    });
    return NextResponse.json({
      ok: true, codigo, clase,
      actualizadoPor: clase ? por : null,
      actualizadoEn: clase ? new Date().toISOString() : null,
    });
  } catch (e) {
    console.error('/api/bc/almacenes PUT error:', e);
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
