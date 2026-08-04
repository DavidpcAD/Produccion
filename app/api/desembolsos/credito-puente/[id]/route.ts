import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import {
  mapLote,
  mapResumen,
  type CreditoPuenteEstado,
  type RespuestaCreditoPuenteDetalle,
} from '@/lib/desembolsos/credito-puente';

export const dynamic = 'force-dynamic';

/**
 * Crédito Puente — detalle / edición / borrado de una cabecera. Portado de
 * adelante-flujo-desembolsos `creditoPuente.ts` (detalle / actualizar / eliminar).
 *
 *   GET    /api/desembolsos/credito-puente/{id}  → cabecera (resumen) + lotes
 *   PUT    /api/desembolsos/credito-puente/{id}  → actualiza cabecera
 *   DELETE /api/desembolsos/credito-puente/{id}  → elimina (solo si no tiene lotes)
 *
 * Lecturas contra las vistas del fuente; escrituras con SQL directo (sin SP).
 */

function parseId(v: string): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}
function fechaOnull(v: unknown): string | null {
  if (v == null || v === '') return null;
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const id = parseId((await params).id);
  if (id == null) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  try {
    const db = await getAdelanteDb();
    const cab = await db.request().input('id', sql.Int, id).query<Record<string, unknown>>(`
      SELECT * FROM [pro_app].vw_credito_puente_resumen WHERE IDCreditoPuente = @id
    `);
    if (!cab.recordset[0]) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    }
    const lotes = await db.request().input('id', sql.Int, id).query<Record<string, unknown>>(`
      SELECT * FROM [pro_app].vw_lote_credito_puente
      WHERE IDCreditoPuente = @id
      ORDER BY AbreviaturaProyecto, CodigoLote
    `);
    const body: RespuestaCreditoPuenteDetalle = {
      credito: mapResumen(cab.recordset[0]),
      lotes: lotes.recordset.map(mapLote),
    };
    return NextResponse.json(body);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const id = parseId((await params).id);
  if (id == null) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 });

    const idBan = Number(body.IDBan);
    const montoTotal = Number(body.MontoTotal_CRC);
    const estado = body.Estado as CreditoPuenteEstado;
    if (!Number.isInteger(idBan) || idBan <= 0) {
      return NextResponse.json({ error: 'IDBan obligatorio' }, { status: 400 });
    }
    if (!(montoTotal > 0)) {
      return NextResponse.json({ error: 'MontoTotal_CRC > 0 obligatorio' }, { status: 400 });
    }
    if (estado !== 'ACTIVO' && estado !== 'CANCELADO') {
      return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
    }

    const codigo = body.Codigo != null ? String(body.Codigo).slice(0, 60) : null;
    const gastos = body.GastosFormalizacion_CRC != null ? Number(body.GastosFormalizacion_CRC) : null;
    const tasa = body.TasaAnual != null ? Number(body.TasaAnual) : null;
    const usuario = session.cedula || session.nombre || 'desconocido';

    const db = await getAdelanteDb();
    const r = await db
      .request()
      .input('id', sql.Int, id)
      .input('IDBan', sql.Int, idBan)
      .input('Codigo', sql.NVarChar(60), codigo)
      .input('MontoTotal', sql.Money, montoTotal)
      .input('Gastos', sql.Money, gastos)
      .input('Tasa', sql.Decimal(5, 2), tasa)
      .input('FAprob', sql.Date, fechaOnull(body.FechaAprobacion))
      .input('FVenc', sql.Date, fechaOnull(body.FechaVencimiento))
      .input('Estado', sql.VarChar(20), estado)
      .input('Notas', sql.NVarChar(sql.MAX), body.Notas != null ? String(body.Notas) : null)
      .input('Usuario', sql.NVarChar(400), usuario)
      .query(`
        UPDATE [pro_app].credito_puente
        SET IDBan = @IDBan,
            Codigo = @Codigo,
            MontoTotal_CRC = @MontoTotal,
            GastosFormalizacion_CRC = @Gastos,
            TasaAnual = @Tasa,
            FechaAprobacion = @FAprob,
            FechaVencimiento = @FVenc,
            Estado = @Estado,
            Notas = @Notas,
            ModificadoPor = @Usuario,
            FechaModificacion = SYSUTCDATETIME()
        WHERE IDCreditoPuente = @id
      `);
    if (r.rowsAffected[0] === 0) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const id = parseId((await params).id);
  if (id == null) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  try {
    const db = await getAdelanteDb();
    const lotes = await db.request().input('id', sql.Int, id).query<{ n: number }>(`
      SELECT COUNT(*) AS n FROM [pro_app].credito_puente_lote WHERE IDCreditoPuente = @id
    `);
    if ((lotes.recordset[0]?.n ?? 0) > 0) {
      return NextResponse.json(
        { error: 'No se puede eliminar: el crédito tiene lotes asociados.' },
        { status: 400 },
      );
    }
    const r = await db.request().input('id', sql.Int, id).query(`
      DELETE FROM [pro_app].credito_puente WHERE IDCreditoPuente = @id
    `);
    if (r.rowsAffected[0] === 0) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
