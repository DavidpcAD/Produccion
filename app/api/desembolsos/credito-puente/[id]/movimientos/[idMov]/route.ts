import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import type { MovimientoCpEstado } from '@/lib/desembolsos/credito-puente';

export const dynamic = 'force-dynamic';

/**
 * Movimiento individual del Crédito Puente. Portado de adelante-flujo-desembolsos
 * `creditoPuenteMovimientos.ts` (editar / anular / eliminar).
 *
 *   PATCH  /api/desembolsos/credito-puente/{id}/movimientos/{idMov} → editar / anular
 *   DELETE /api/desembolsos/credito-puente/{id}/movimientos/{idMov} → eliminar (sin links)
 *
 * Escrituras con SQL directo (sin SP). Un mov no se puede anular ni eliminar si
 * tiene links (montos aplicados a hitos).
 */

function parseId(v: string): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function contarLinks(db: Awaited<ReturnType<typeof getAdelanteDb>>, idMov: number): Promise<number> {
  const r = await db.request().input('idMov', sql.Int, idMov).query<{ n: number }>(`
    SELECT COUNT(*) AS n FROM [pro_app].credito_puente_link WHERE IDMovCP = @idMov
  `);
  return r.recordset[0]?.n ?? 0;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; idMov: string }> },
) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const p = await params;
  const idCp = parseId(p.id);
  const idMov = parseId(p.idMov);
  if (idCp == null) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  if (idMov == null) return NextResponse.json({ error: 'idMov inválido' }, { status: 400 });
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 });

    const fecha = String(body.FechaMovimiento ?? '');
    const monto = Number(body.MontoColones);
    const estado = (body.Estado ?? 'REGISTRADO') as MovimientoCpEstado;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return NextResponse.json({ error: 'FechaMovimiento (YYYY-MM-DD) obligatoria' }, { status: 400 });
    }
    if (!(monto > 0)) {
      return NextResponse.json({ error: 'MontoColones > 0 obligatorio' }, { status: 400 });
    }
    if (estado !== 'REGISTRADO' && estado !== 'ANULADO') {
      return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
    }

    const db = await getAdelanteDb();
    // El mov debe existir y pertenecer al crédito indicado.
    const actual = await db.request().input('idMov', sql.Int, idMov).query<{ IDCreditoPuente: number }>(`
      SELECT IDCreditoPuente FROM [pro_app].credito_puente_movimiento WHERE IDMovCP = @idMov
    `);
    const row = actual.recordset[0];
    if (!row) return NextResponse.json({ error: 'Movimiento no existe' }, { status: 404 });
    if (row.IDCreditoPuente !== idCp) {
      return NextResponse.json({ error: 'El movimiento no pertenece al crédito indicado' }, { status: 400 });
    }
    // Anular con links aplicados no se permite (habría que desvincular primero).
    if (estado === 'ANULADO' && (await contarLinks(db, idMov)) > 0) {
      return NextResponse.json(
        { error: 'No se puede anular un movimiento con montos aplicados a hitos. Desvincula primero.' },
        { status: 400 },
      );
    }

    const concepto = body.Concepto != null ? String(body.Concepto).slice(0, 200) : null;
    const comprobante = body.NumeroComprobante != null ? String(body.NumeroComprobante).slice(0, 100) : null;
    const notas = body.Notas != null ? String(body.Notas).slice(0, 1000) : null;
    const usuario = session.cedula || session.nombre || 'desconocido';

    await db
      .request()
      .input('idMov', sql.Int, idMov)
      .input('Fecha', sql.Date, fecha)
      .input('Monto', sql.Money, monto)
      .input('Concepto', sql.NVarChar(200), concepto)
      .input('Comprobante', sql.NVarChar(100), comprobante)
      .input('Estado', sql.VarChar(20), estado)
      .input('Notas', sql.NVarChar(1000), notas)
      .input('Usuario', sql.NVarChar(400), usuario)
      .query(`
        UPDATE [pro_app].credito_puente_movimiento
        SET FechaMovimiento = @Fecha,
            MontoColones = @Monto,
            Concepto = @Concepto,
            NumeroComprobante = @Comprobante,
            Estado = @Estado,
            Notas = @Notas,
            ModificadoPor = @Usuario,
            FechaModificacion = SYSUTCDATETIME()
        WHERE IDMovCP = @idMov
      `);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; idMov: string }> },
) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const p = await params;
  const idCp = parseId(p.id);
  const idMov = parseId(p.idMov);
  if (idCp == null) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  if (idMov == null) return NextResponse.json({ error: 'idMov inválido' }, { status: 400 });
  try {
    const db = await getAdelanteDb();
    const actual = await db.request().input('idMov', sql.Int, idMov).query<{ IDCreditoPuente: number }>(`
      SELECT IDCreditoPuente FROM [pro_app].credito_puente_movimiento WHERE IDMovCP = @idMov
    `);
    const row = actual.recordset[0];
    if (!row) return NextResponse.json({ error: 'Movimiento no existe' }, { status: 404 });
    if (row.IDCreditoPuente !== idCp) {
      return NextResponse.json({ error: 'El movimiento no pertenece al crédito indicado' }, { status: 400 });
    }
    if ((await contarLinks(db, idMov)) > 0) {
      return NextResponse.json(
        { error: 'No se puede eliminar un movimiento con montos aplicados a hitos. Desvincula primero.' },
        { status: 400 },
      );
    }
    await db.request().input('idMov', sql.Int, idMov).query(`
      DELETE FROM [pro_app].credito_puente_movimiento WHERE IDMovCP = @idMov
    `);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
