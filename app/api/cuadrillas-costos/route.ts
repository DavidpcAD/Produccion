import { NextResponse } from 'next/server';
import { jsonComprimido } from '@/lib/http/json-comprimido';
import { mensajeParaCliente } from '@/lib/errores';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { puedeAbrirRuta, getRouteLevel } from '@/lib/permissions';
import { getCostoCuadrillas, getSemanasPlanilla } from '@/lib/cuadrillas-costo';

// GET /api/cuadrillas-costos?semanas=6,5,4 — Cuadrillas → Costo por semana
// (lib/cuadrillas-costo.ts). Devuelve las semanas con planilla guardada en H4 y
// el costo de las pedidas, por cuadrilla, obra, partida y subpartida. Sin
// `semanas`, las últimas cuatro.
//
// Vive en /api/cuadrillas-costos y NO en /api/cuadrillas/...: esa rama es
// catálogo compartido (lib/permissions.ts → API_CATALOGO_COMPARTIDO) y el proxy
// la deja pasar por nivel. Esta trae plata de la planilla, así que va con el
// módulo Cuadrillas, igual que su pantalla.

const POR_DEFECTO = 4;
const TOPE = 13; // un trimestre

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeAbrirRuta('/cuadrillas', session.modules, session.nivelAdmin, getRouteLevel('/cuadrillas'))) {
    return NextResponse.json({ error: 'Sin permiso para ver el costo de las cuadrillas' }, { status: 403 });
  }

  try {
    const db = await getDb();
    const semanas = await getSemanasPlanilla(db);
    const pedidas = new URL(req.url).searchParams.get('semanas');
    const ids = pedidas
      ? new Set(pedidas.split(',').map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))
      : null;
    const elegidas = (ids ? semanas.filter((s) => ids.has(s.id)) : semanas.slice(0, POR_DEFECTO)).slice(0, TOPE);
    const filas = await getCostoCuadrillas(db, elegidas);
    return jsonComprimido(req, { semanas, elegidas: elegidas.map((s) => s.id), filas });
  } catch (e) {
    return NextResponse.json({ error: mensajeParaCliente(e) }, { status: 500 });
  }
}
