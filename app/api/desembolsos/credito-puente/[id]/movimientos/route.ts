import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import {
  mapMov,
  type RespuestaListaMovimientosCreditoPuente,
} from '@/lib/desembolsos/credito-puente';

export const dynamic = 'force-dynamic';

/**
 * Movimientos del Crédito Puente. Portado de adelante-flujo-desembolsos
 * `creditoPuenteMovimientos.ts` (listar / crear).
 *
 *   GET  /api/desembolsos/credito-puente/{id}/movimientos → movs del crédito
 *   POST /api/desembolsos/credito-puente/{id}/movimientos → crea un mov (REGISTRADO)
 *
 * Lectura contra `app.vw_credito_puente_movimiento`; escritura con INSERT
 * directo (sin SP). La vinculación de movimientos a hitos de lote
 * (credito_puente_link) queda fuera del alcance de este port.
 */

function parseId(v: string): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const idCp = parseId((await params).id);
  if (idCp == null) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  try {
    const db = await getAdelanteDb();
    const r = await db.request().input('idCp', sql.Int, idCp).query<Record<string, unknown>>(`
      SELECT * FROM [app].vw_credito_puente_movimiento
      WHERE IDCreditoPuente = @idCp
      ORDER BY FechaMovimiento DESC, IDMovCP DESC
    `);
    const body: RespuestaListaMovimientosCreditoPuente = {
      movimientos: r.recordset.map(mapMov),
    };
    return NextResponse.json(body);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const idCp = parseId((await params).id);
  if (idCp == null) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 });

    const fecha = String(body.FechaMovimiento ?? '');
    const monto = Number(body.MontoColones);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return NextResponse.json({ error: 'FechaMovimiento (YYYY-MM-DD) obligatoria' }, { status: 400 });
    }
    if (!(monto > 0)) {
      return NextResponse.json({ error: 'MontoColones > 0 obligatorio' }, { status: 400 });
    }

    // El crédito debe existir (evita insertar movs huérfanos).
    const db = await getAdelanteDb();
    const existe = await db.request().input('idCp', sql.Int, idCp).query<{ n: number }>(`
      SELECT COUNT(*) AS n FROM [app].credito_puente WHERE IDCreditoPuente = @idCp
    `);
    if ((existe.recordset[0]?.n ?? 0) === 0) {
      return NextResponse.json({ error: 'El crédito puente no existe' }, { status: 404 });
    }

    const concepto = body.Concepto != null ? String(body.Concepto).slice(0, 200) : null;
    const comprobante = body.NumeroComprobante != null ? String(body.NumeroComprobante).slice(0, 100) : null;
    const notas = body.Notas != null ? String(body.Notas).slice(0, 1000) : null;
    const usuario = session.cedula || session.nombre || 'desconocido';

    const r = await db
      .request()
      .input('idCp', sql.Int, idCp)
      .input('Fecha', sql.Date, fecha)
      .input('Monto', sql.Money, monto)
      .input('Concepto', sql.NVarChar(200), concepto)
      .input('Comprobante', sql.NVarChar(100), comprobante)
      .input('Notas', sql.NVarChar(1000), notas)
      .input('Usuario', sql.NVarChar(400), usuario)
      .query<{ IDMovCP: number }>(`
        INSERT INTO [app].credito_puente_movimiento
          (IDCreditoPuente, FechaMovimiento, MontoColones, Concepto, NumeroComprobante,
           Estado, Notas, CreadoPor, FechaCreacion)
        OUTPUT INSERTED.IDMovCP
        VALUES
          (@idCp, @Fecha, @Monto, @Concepto, @Comprobante,
           'REGISTRADO', @Notas, @Usuario, SYSUTCDATETIME())
      `);
    return NextResponse.json({ ok: true, IDMovCP: r.recordset[0]?.IDMovCP }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
