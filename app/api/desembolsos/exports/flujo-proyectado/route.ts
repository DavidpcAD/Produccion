import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { flujoProyectado, type VistaFlujo } from '@/lib/desembolsos/reportes';

export const dynamic = 'force-dynamic';

function lunesEstaSemana(): string {
  const hoy = new Date();
  const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
  const dia = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dia === 0 ? -6 : 1 - dia));
  return d.toISOString().slice(0, 10);
}

// GET /api/desembolsos/exports/flujo-proyectado?desde=&hasta=&idBanco=&idProyecto=&vista=bruto|netoAD
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const desdeP = sp.get('desde');
  const hastaP = sp.get('hasta');
  const desde = desdeP && /^\d{4}-\d{2}-\d{2}$/.test(desdeP) ? desdeP : lunesEstaSemana();
  let hasta: string;
  if (hastaP && /^\d{4}-\d{2}-\d{2}$/.test(hastaP)) {
    hasta = hastaP;
  } else {
    const d = new Date(desde + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 55); hasta = d.toISOString().slice(0, 10);
  }
  const vista: VistaFlujo = sp.get('vista') === 'netoAD' ? 'netoAD' : 'bruto';
  try {
    const db = await getAdelanteDb();
    return NextResponse.json(await flujoProyectado(db, {
      desde, hasta, vista,
      idBanco: sp.get('idBanco') ? Number(sp.get('idBanco')) : undefined,
      idProyecto: sp.get('idProyecto') ? Number(sp.get('idProyecto')) : undefined,
    }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
