import { NextResponse } from 'next/server';
import { jsonComprimido } from '@/lib/http/json-comprimido';
import { getSession } from '@/lib/auth';
import { mensajeParaCliente } from '@/lib/errores';
import { bcObras } from '@/lib/compras/bc';
import { getObrasConVersion } from '@/lib/bc-construction';
import { presupuestoLiquidado } from '@/lib/bc/presupuesto-liquidado';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/bc/presupuesto-liquidado                       → obras con presupuesto (selector)
// GET /api/bc/presupuesto-liquidado?obra=VN-L.20[&task=…] → comparación presupuesto vs liquidado
// SOLO Super Admin (N4). Portado de la app de Digitación.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const obra = (searchParams.get('obra') ?? '').trim();
  const task = (searchParams.get('task') ?? '').trim();
  try {
    if (!obra) {
      // Solo obras que ya tienen presupuesto cargado en BC.
      const [obras, conVersion] = await Promise.all([bcObras(), getObrasConVersion()]);
      const lista = obras
        .filter((o) => conVersion.has(o.codigo))
        .map((o) => ({ codigo: o.codigo, nombre: o.nombre }))
        .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
      return jsonComprimido(req, { obras: lista });
    }
    return jsonComprimido(req, await presupuestoLiquidado(obra, task || undefined));
  } catch (e) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
