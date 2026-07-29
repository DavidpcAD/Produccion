import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * CRUD admin de una causa (obc.causas_catalogo). Portado de obrascontrol
 * `causas.ts` (allí era PATCH; aquí PUT parcial + DELETE).
 *   PUT    /api/avance/causas/{id} → edita (cualquier subconjunto de campos)
 *   DELETE /api/avance/causas/{id} → elimina
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }
  try {
    const body = await req.json();
    const db = await getAdelanteDb();
    const sets: string[] = [];
    const reqDb = db.request().input('id', sql.Int, id);

    if (body?.codigo !== undefined) {
      const codigo = String(body.codigo).trim();
      if (codigo.length < 1 || codigo.length > 50) {
        return NextResponse.json({ error: 'codigo inválido (1-50 caracteres)' }, { status: 400 });
      }
      // Evitar colisión de código con otra causa distinta.
      const dup = await db
        .request()
        .input('c', sql.VarChar(50), codigo)
        .input('id', sql.Int, id)
        .query('SELECT id FROM obc.causas_catalogo WHERE codigo = @c AND id <> @id');
      if (dup.recordset.length > 0) {
        return NextResponse.json(
          { error: `Ya existe otra causa con código '${codigo}'` },
          { status: 409 },
        );
      }
      sets.push('codigo = @codigo');
      reqDb.input('codigo', sql.VarChar(50), codigo);
    }
    if (body?.descripcion !== undefined) {
      const descripcion = String(body.descripcion).trim();
      if (descripcion.length < 2 || descripcion.length > 200) {
        return NextResponse.json(
          { error: 'descripcion inválida (2-200 caracteres)' },
          { status: 400 },
        );
      }
      sets.push('descripcion = @descripcion');
      reqDb.input('descripcion', sql.NVarChar(200), descripcion);
    }
    if (body?.aplica_nc !== undefined) {
      sets.push('aplica_nc = @nc');
      reqDb.input('nc', sql.Bit, body.aplica_nc === true);
    }
    if (body?.aplica_inactividad !== undefined) {
      sets.push('aplica_inactividad = @inact');
      reqDb.input('inact', sql.Bit, body.aplica_inactividad === true);
    }
    if (body?.activo !== undefined) {
      sets.push('activo = @activo');
      reqDb.input('activo', sql.Bit, body.activo === true);
    }
    if (body?.orden !== undefined) {
      const ordenRaw = Number(body.orden);
      const orden = Number.isFinite(ordenRaw) && ordenRaw >= 0 ? Math.trunc(ordenRaw) : 0;
      sets.push('orden = @orden');
      reqDb.input('orden', sql.Int, orden);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 });
    }

    const r = await reqDb.query(
      `UPDATE obc.causas_catalogo SET ${sets.join(', ')} WHERE id = @id`,
    );
    if (r.rowsAffected[0] === 0) {
      return NextResponse.json({ error: `Causa ${id} no encontrada` }, { status: 404 });
    }
    return NextResponse.json({ ok: true, id });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }
  try {
    const db = await getAdelanteDb();
    const r = await db
      .request()
      .input('id', sql.Int, id)
      .query('DELETE FROM obc.causas_catalogo WHERE id = @id');
    if (r.rowsAffected[0] === 0) {
      return NextResponse.json({ error: `Causa ${id} no encontrada` }, { status: 404 });
    }
    return NextResponse.json({ ok: true, id });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
