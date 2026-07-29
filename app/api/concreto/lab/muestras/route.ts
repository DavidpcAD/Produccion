import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { consultarMuestras } from '@/lib/concreto/lab';
import { crearMuestra, ErrorLab } from '@/lib/concreto/lab-write';
import type { CrearMuestraParams } from '@/lib/concreto/tipos-lab';

// GET /api/concreto/lab/muestras — listado paginado de muestras de laboratorio.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const idActividad = sp.get('id_actividad');
  const fcObjetivo = sp.get('fc_objetivo');
  const obra = sp.get('obra_works_no');
  const desde = sp.get('desde');
  const hasta = sp.get('hasta');
  const q = sp.get('q');
  const pagina = Math.max(1, parseInt(sp.get('pagina') || '1', 10) || 1);
  const porPagina = Math.min(500, Math.max(1, parseInt(sp.get('por_pagina') || '50', 10) || 50));

  try {
    const db = await getAdelanteDb();
    const res = await consultarMuestras(db, {
      obra_works_no: obra || undefined,
      id_actividad: idActividad ? Number(idActividad) : undefined,
      fc_objetivo: fcObjetivo ? Number(fcObjetivo) : undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
      q: q || undefined,
      pagina,
      por_pagina: porPagina,
    });
    return NextResponse.json(res);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/muestras GET error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/concreto/lab/muestras — crear muestra (+ ensayos pre-creados).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  // Parseo manual (sin zod). Validamos lo mínimo obligatorio.
  const idActividad = Number(body.id_actividad);
  const fcObjetivo = Number(body.fc_objetivo);
  const fechaColado = typeof body.fecha_colado === 'string' ? body.fecha_colado : '';
  if (!Number.isInteger(idActividad) || idActividad <= 0) {
    return NextResponse.json({ error: 'id_actividad requerido' }, { status: 400 });
  }
  if (!Number.isFinite(fcObjetivo) || fcObjetivo <= 0) {
    return NextResponse.json({ error: "f'c objetivo inválido" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaColado)) {
    return NextResponse.json({ error: 'fecha_colado inválida (YYYY-MM-DD)' }, { status: 400 });
  }

  const params: CrearMuestraParams = {
    id_actividad: idActividad,
    fc_objetivo: fcObjetivo,
    fecha_colado: fechaColado,
    obra_works_no: (body.obra_works_no as string | null) ?? null,
    id_casa: (body.id_casa as string | null) ?? null,
    planta_nombre: (body.planta_nombre as string | null) ?? null,
    proveedor: typeof body.proveedor === 'string' ? body.proveedor : undefined,
    id_colada: body.id_colada != null ? Number(body.id_colada) : null,
    id_receta_bc: body.id_receta_bc != null ? Number(body.id_receta_bc) : null,
    categoria_concreto: (body.categoria_concreto as CrearMuestraParams['categoria_concreto']) ?? null,
    tipo_concreto_libre: (body.tipo_concreto_libre as string | null) ?? null,
    notas: (body.notas as string | null) ?? null,
    edades_ensayos: Array.isArray(body.edades_ensayos)
      ? (body.edades_ensayos as unknown[]).map(Number).filter((n) => Number.isFinite(n))
      : undefined,
  };

  try {
    const db = await getAdelanteDb();
    const actor = { oid: String(session.idUsuario || session.idCol), email: session.cedula };
    const detalle = await crearMuestra(db, params, actor);
    return NextResponse.json(detalle, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof ErrorLab) {
      return NextResponse.json({ error: err.message, codigo: err.codigo }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/concreto/lab/muestras POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
