import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { ErrorEsclerometro, crearEnsayo, listarEnsayos } from '@/lib/concreto/esclerometro';
import type { CrearEnsayoEsclerometroRequest } from '@/lib/concreto/tipos-esclerometro';
import { ANGULOS_IMPACTO } from '@/lib/concreto/tipos-esclerometro';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/concreto/lab/esclerometro — listado paginado de ensayos no
// destructivos (martillo Schmidt), con filtros por obra, rango de fecha y
// búsqueda libre (elemento / casa / equipo).
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const obra = sp.get('obra_works_no');
  const desde = sp.get('desde');
  const hasta = sp.get('hasta');
  const q = sp.get('q');
  const pagina = Math.max(1, parseInt(sp.get('pagina') || '1', 10) || 1);
  const porPagina = Math.min(100, Math.max(1, parseInt(sp.get('por_pagina') || '25', 10) || 25));

  if (desde && !ISO_DATE.test(desde)) {
    return NextResponse.json({ error: 'desde inválido (YYYY-MM-DD)' }, { status: 400 });
  }
  if (hasta && !ISO_DATE.test(hasta)) {
    return NextResponse.json({ error: 'hasta inválido (YYYY-MM-DD)' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();
    const res = await listarEnsayos(db, {
      obra_works_no: obra || undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
      q: q || undefined,
      pagina,
      por_pagina: porPagina,
    });
    return NextResponse.json(res);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/esclerometro GET error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/concreto/lab/esclerometro — crea el header del ensayo. Los rebotes
// se agregan luego en el detalle. El número se asigna automático (consecutivo).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body inválido (no es JSON)' }, { status: 400 });
  }

  // Validación manual (sin zod, por convención del repo).
  const fecha = String(body.fecha ?? '');
  if (!ISO_DATE.test(fecha)) {
    return NextResponse.json({ error: 'fecha inválida (YYYY-MM-DD)' }, { status: 400 });
  }
  const elemento = String(body.elemento_estructural ?? '').trim();
  if (elemento.length === 0 || elemento.length > 100) {
    return NextResponse.json({ error: 'elemento_estructural requerido (1-100)' }, { status: 400 });
  }
  const angulo = body.angulo_impacto === undefined ? 0 : Number(body.angulo_impacto);
  if (!Number.isInteger(angulo) || !(ANGULOS_IMPACTO as readonly number[]).includes(angulo)) {
    return NextResponse.json({ error: 'angulo_impacto inválido' }, { status: 400 });
  }
  let edadDias: number | null = null;
  if (body.edad_dias !== undefined && body.edad_dias !== null && body.edad_dias !== '') {
    edadDias = Number(body.edad_dias);
    if (!Number.isInteger(edadDias) || edadDias <= 0 || edadDias > 3650) {
      return NextResponse.json({ error: 'edad_dias inválida (1-3650)' }, { status: 400 });
    }
  }

  const strOrNull = (v: unknown, max: number): string | null => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === '' ? null : s.slice(0, max);
  };

  const datos: CrearEnsayoEsclerometroRequest = {
    fecha,
    obra_works_no: strOrNull(body.obra_works_no, 20),
    id_casa: strOrNull(body.id_casa, 50),
    elemento_estructural: elemento,
    edad_dias: edadDias,
    angulo_impacto: angulo,
    equipo_serial: strOrNull(body.equipo_serial, 50),
    notas: strOrNull(body.notas, 2000),
  };

  try {
    const db = await getAdelanteDb();
    // La sesión de este repo no expone oid/email; usamos el mismo actor de
    // auditoría que el resto del módulo lab (idUsuario/idCol + cédula).
    const actor = { oid: String(session.idUsuario || session.idCol), email: session.cedula };
    const ensayo = await crearEnsayo(db, datos, actor);
    return NextResponse.json(ensayo, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof ErrorEsclerometro) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/esclerometro POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
