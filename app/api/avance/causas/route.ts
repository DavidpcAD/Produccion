import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import type { Causa } from '@/lib/avance/causas';

export const dynamic = 'force-dynamic';

/**
 * Catálogo de causas NC / inactividad (pro_obc.causas_catalogo). Portado de
 * obrascontrol `causas.ts`.
 *   GET  /api/avance/causas[?activo=true] → lista (la lee la matriz de avance
 *        y el diálogo "No cumplió"). NO cambiar su forma de respuesta.
 *   POST /api/avance/causas               → crea una (admin).
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const soloActivas = new URL(req.url).searchParams.get('activo') === 'true';
  const db = await getAdelanteDb();

  try {
    const r = await db.request().query<Causa>(`
      SELECT id, codigo, descripcion, aplica_nc, aplica_inactividad, activo, orden
      FROM pro_obc.causas_catalogo
      ${soloActivas ? 'WHERE activo = 1' : ''}
      ORDER BY orden, descripcion
    `);
    return NextResponse.json({ data: r.recordset });
  } catch (err) {
    console.error('/api/avance/causas error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const codigo = String(body?.codigo ?? '').trim();
    const descripcion = String(body?.descripcion ?? '').trim();
    const aplicaNc = body?.aplica_nc === true;
    const aplicaInact = body?.aplica_inactividad === true;
    const ordenRaw = Number(body?.orden ?? 0);
    const orden = Number.isFinite(ordenRaw) && ordenRaw >= 0 ? Math.trunc(ordenRaw) : 0;

    if (codigo.length < 1 || codigo.length > 50) {
      return NextResponse.json({ error: 'codigo inválido (1-50 caracteres)' }, { status: 400 });
    }
    if (descripcion.length < 2 || descripcion.length > 200) {
      return NextResponse.json(
        { error: 'descripcion inválida (2-200 caracteres)' },
        { status: 400 },
      );
    }

    const db = await getAdelanteDb();
    const dup = await db
      .request()
      .input('c', sql.VarChar(50), codigo)
      .query('SELECT id FROM pro_obc.causas_catalogo WHERE codigo = @c');
    if (dup.recordset.length > 0) {
      return NextResponse.json(
        { error: `Ya existe una causa con código '${codigo}'` },
        { status: 409 },
      );
    }

    const r = await db
      .request()
      .input('codigo', sql.VarChar(50), codigo)
      .input('descripcion', sql.NVarChar(200), descripcion)
      .input('nc', sql.Bit, aplicaNc)
      .input('inact', sql.Bit, aplicaInact)
      .input('orden', sql.Int, orden)
      .query<{ id: number }>(`
        INSERT INTO pro_obc.causas_catalogo
          (codigo, descripcion, aplica_nc, aplica_inactividad, activo, orden)
        OUTPUT INSERTED.id
        VALUES (@codigo, @descripcion, @nc, @inact, 1, @orden)
      `);
    return NextResponse.json({ ok: true, id: r.recordset[0]?.id }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
