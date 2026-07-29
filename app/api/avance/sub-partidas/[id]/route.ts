import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import type { ConnectionPool, ISqlType } from 'mssql';
import {
  TIPOS_CASA,
  type PesoPartida,
  type PesoSprint,
  type SubPartidaDetalle,
  type TipoCasa,
} from '@/lib/avance/sub-partidas';

export const dynamic = 'force-dynamic';

/**
 * Sub-partida individual. Portado de obrascontrol `sub-partidas.ts`.
 *   GET   /api/avance/sub-partidas/{id} → detalle + pesos por partida y por sprint
 *   PATCH /api/avance/sub-partidas/{id} → editar campos (parcial) + reemplazo de tipos_casa
 *
 * Nota: la edición de pesos no está implementada en el fuente (los pesos se
 * muestran read-only en el detalle; su captura vive en la pantalla de Pesos).
 */

const TIPOS_CASA_SET = new Set<string>(TIPOS_CASA);

/** Arma el detalle completo (cabecera + tipos + pesos). Null si no existe. */
async function armarDetalle(
  db: ConnectionPool,
  id: number,
): Promise<SubPartidaDetalle | null> {
  const cab = await db
    .request()
    .input('id', sql.Int, id)
    .query<{
      id: number;
      codigo: string;
      nombre: string;
      sprint_numero: number;
      es_critica: boolean;
      activo: boolean;
      descripcion: string | null;
      partida_id: number;
      partida_codigo: string;
      partida_nombre: string;
      grupo_id: number;
      grupo_codigo: string;
      grupo_nombre: string;
    }>(`
      SELECT sp.id, sp.codigo, sp.nombre, sp.sprint_numero, sp.es_critica,
             sp.activo, sp.descripcion,
             p.id AS partida_id, p.codigo AS partida_codigo, p.nombre AS partida_nombre,
             g.id AS grupo_id, g.codigo AS grupo_codigo, g.nombre AS grupo_nombre
      FROM obc.sub_partidas sp
      JOIN obc.partidas p       ON p.id = sp.partida_id
      JOIN obc.grupos_partida g ON g.id = p.grupo_id
      WHERE sp.id = @id
    `);
  if (cab.recordset.length === 0) return null;
  const c = cab.recordset[0]!;

  const tipos = await db
    .request()
    .input('id', sql.Int, id)
    .query<{ tipo_casa: TipoCasa }>(
      'SELECT tipo_casa FROM obc.sub_partida_tipos WHERE sub_partida_id = @id ORDER BY tipo_casa',
    );

  const pesosPartida = await db.request().input('id', sql.Int, id).query<PesoPartida>(
    'SELECT tipo_casa, partida_id, peso FROM obc.sub_partida_pesos_partida WHERE sub_partida_id = @id ORDER BY tipo_casa, partida_id',
  );

  const pesosSprint = await db.request().input('id', sql.Int, id).query<PesoSprint>(
    'SELECT tipo_casa, sprint_numero, peso FROM obc.sub_partida_pesos_sprint WHERE sub_partida_id = @id ORDER BY tipo_casa, sprint_numero',
  );

  return {
    id: c.id,
    codigo: c.codigo,
    nombre: c.nombre,
    sprint_numero: c.sprint_numero,
    es_critica: c.es_critica,
    activo: c.activo,
    descripcion: c.descripcion,
    partida_id: c.partida_id,
    partida_codigo: c.partida_codigo,
    partida_nombre: c.partida_nombre,
    grupo_id: c.grupo_id,
    grupo_codigo: c.grupo_codigo,
    grupo_nombre: c.grupo_nombre,
    tipos_casa: tipos.recordset.map((r) => r.tipo_casa),
    pesos_partida: pesosPartida.recordset.map((r) => ({ ...r, peso: Number(r.peso) })),
    pesos_sprint: pesosSprint.recordset.map((r) => ({ ...r, peso: Number(r.peso) })),
  };
}

// =============================================================================
// GET /api/avance/sub-partidas/{id}
// =============================================================================
export async function GET(
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
    const detalle = await armarDetalle(db, id);
    if (!detalle) {
      return NextResponse.json({ error: `Sub-partida ${id} no encontrada` }, { status: 404 });
    }
    return NextResponse.json({ subPartida: detalle });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}

// =============================================================================
// PATCH /api/avance/sub-partidas/{id}
// =============================================================================
export async function PATCH(
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
    const body = await req.json().catch(() => ({}));

    // Recolectar solo los campos presentes en el body, validando cada uno.
    // Los inputs se aplican al Request dentro de la transacción.
    const sets: string[] = [];
    const updInputs: Array<{
      name: string;
      type: (() => ISqlType) | ISqlType;
      value: unknown;
    }> = [];

    if (body?.codigo !== undefined) {
      const v = String(body.codigo).trim();
      if (v.length < 1 || v.length > 50) {
        return NextResponse.json({ error: 'Código inválido' }, { status: 400 });
      }
      sets.push('codigo = @codigo');
      updInputs.push({ name: 'codigo', type: sql.VarChar(50), value: v });
    }
    if (body?.nombre !== undefined) {
      const v = String(body.nombre).trim();
      if (v.length < 1 || v.length > 150) {
        return NextResponse.json({ error: 'Nombre inválido' }, { status: 400 });
      }
      sets.push('nombre = @nombre');
      updInputs.push({ name: 'nombre', type: sql.NVarChar(150), value: v });
    }
    if (body?.partida_id !== undefined) {
      const v = Number(body.partida_id);
      if (!Number.isInteger(v) || v <= 0) {
        return NextResponse.json({ error: 'Partida inválida' }, { status: 400 });
      }
      sets.push('partida_id = @partida_id');
      updInputs.push({ name: 'partida_id', type: sql.Int, value: v });
    }
    if (body?.sprint_numero !== undefined) {
      const v = Number(body.sprint_numero);
      if (!Number.isInteger(v) || v < 1 || v > 50) {
        return NextResponse.json({ error: 'Sprint inválido (1–50)' }, { status: 400 });
      }
      sets.push('sprint_numero = @sprint_numero');
      updInputs.push({ name: 'sprint_numero', type: sql.SmallInt, value: v });
    }
    if (body?.es_critica !== undefined) {
      sets.push('es_critica = @es_critica');
      updInputs.push({ name: 'es_critica', type: sql.Bit, value: Boolean(body.es_critica) });
    }
    if (body?.activo !== undefined) {
      sets.push('activo = @activo');
      updInputs.push({ name: 'activo', type: sql.Bit, value: Boolean(body.activo) });
    }
    if (body?.descripcion !== undefined) {
      const v = body.descripcion != null ? String(body.descripcion).slice(0, 4000) : null;
      sets.push('descripcion = @descripcion');
      updInputs.push({ name: 'descripcion', type: sql.NVarChar(4000), value: v });
    }

    let tiposCasa: TipoCasa[] | undefined;
    if (body?.tipos_casa !== undefined) {
      if (!Array.isArray(body.tipos_casa)) {
        return NextResponse.json({ error: 'tipos_casa inválido' }, { status: 400 });
      }
      tiposCasa = body.tipos_casa.filter((t: unknown) =>
        TIPOS_CASA_SET.has(String(t)),
      ) as TipoCasa[];
    }

    if (sets.length === 0 && tiposCasa === undefined) {
      return NextResponse.json(
        { error: 'El body no contiene campos para actualizar' },
        { status: 400 },
      );
    }

    const db = await getAdelanteDb();

    const existe = await db
      .request()
      .input('id', sql.Int, id)
      .query<{ id: number }>('SELECT id FROM obc.sub_partidas WHERE id = @id');
    if (existe.recordset.length === 0) {
      return NextResponse.json({ error: `Sub-partida ${id} no encontrada` }, { status: 404 });
    }

    const tx = new sql.Transaction(db);
    await tx.begin();
    try {
      if (sets.length > 0) {
        const r = new sql.Request(tx).input('id', sql.Int, id);
        for (const inp of updInputs) r.input(inp.name, inp.type, inp.value);
        await r.query(`UPDATE obc.sub_partidas SET ${sets.join(', ')} WHERE id = @id`);
      }
      if (tiposCasa !== undefined) {
        // Reemplazo completo del set de tipos para esta sub-partida.
        await new sql.Request(tx)
          .input('id', sql.Int, id)
          .query('DELETE FROM obc.sub_partida_tipos WHERE sub_partida_id = @id');
        for (const tc of tiposCasa) {
          await new sql.Request(tx)
            .input('id', sql.Int, id)
            .input('tc', sql.VarChar(20), tc)
            .query(
              'INSERT INTO obc.sub_partida_tipos (sub_partida_id, tipo_casa) VALUES (@id, @tc)',
            );
        }
      }
      await tx.commit();
    } catch (e: unknown) {
      try {
        await tx.rollback();
      } catch {
        /* ignorar */
      }
      if (e && typeof e === 'object' && 'number' in e) {
        const n = (e as { number?: number }).number;
        if (n === 2601 || n === 2627) {
          return NextResponse.json(
            { error: 'Ya existe una sub-partida con ese código' },
            { status: 409 },
          );
        }
      }
      throw e;
    }

    const detalle = await armarDetalle(db, id);
    return NextResponse.json({ ok: true, subPartida: detalle });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
