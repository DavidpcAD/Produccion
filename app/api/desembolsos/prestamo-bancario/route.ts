import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import {
  mapPrestamo,
  type AccionUpsert,
  type ActualizarPrestamoBancarioResponse,
} from '@/lib/desembolsos/prestamo-bancario';

export const dynamic = 'force-dynamic';

/**
 * Préstamo Bancario por caso. Portado de adelante-flujo-desembolsos
 * `prestamoBancario.ts` (PATCH /casos/:idCaso/monto-financia-banco).
 *
 *   GET   /api/desembolsos/prestamo-bancario?idCaso=  → fila del caso (o null)
 *   PATCH /api/desembolsos/prestamo-bancario          → upsert por IDCaso (body.IDCaso)
 *
 * Datos en `app.caso_lote_banco` (una fila por caso). Upsert con SQL directo
 * (la base de Producción no tiene `sp_actualizar_monto_financia_banco`).
 * SUPUESTO: al insertar una fila nueva, `MontoPagaBancoPorLote_CRC` (NOT NULL)
 * se siembra con `MontoFinanciaBanco_CRC` (o 0), ya que ese SP lo resolvía.
 */

function numOnull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}
// Resultado de parsear la fecha del body:
//   { provided:false }                         → no vino en el body (no tocar)
//   { provided:true, value:null }              → vino vacía (limpiar)
//   { provided:true, value:'YYYY-MM-DD' }      → fecha válida
//   { provided:true, invalid:true }            → formato inválido
function parseFecha(v: unknown): { provided: boolean; value?: string | null; invalid?: boolean } {
  if (v === undefined) return { provided: false };
  if (v === null || v === '') return { provided: true, value: null };
  const s = String(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { provided: true, invalid: true };
  return { provided: true, value: s };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const idCaso = Number(new URL(req.url).searchParams.get('idCaso'));
  if (!Number.isInteger(idCaso) || idCaso <= 0) {
    return NextResponse.json({ error: 'idCaso inválido' }, { status: 400 });
  }
  try {
    const db = await getAdelanteDb();
    const r = await db.request().input('idCaso', sql.Int, idCaso).query<Record<string, unknown>>(`
      SELECT TOP 1 IDCasoLoteBanco, IDCaso, MontoPagaBancoPorLote_CRC, MontoFinanciaBanco_CRC,
             MontoLoteFinanciado_CRC, LoteHistoricoCobrado_CRC, PagoCliente_CRC,
             FechaPagoCliente, Notas
      FROM [app].caso_lote_banco
      WHERE IDCaso = @idCaso
      ORDER BY IDCasoLoteBanco DESC
    `);
    const row = r.recordset[0];
    return NextResponse.json({ prestamo: row ? mapPrestamo(row) : null });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 });

    const idCaso = Number(body.IDCaso);
    if (!Number.isInteger(idCaso) || idCaso <= 0) {
      return NextResponse.json({ error: 'IDCaso obligatorio' }, { status: 400 });
    }

    const financia = numOnull(body.MontoFinanciaBanco_CRC);
    const loteFin = numOnull(body.MontoLoteFinanciado_CRC);
    const historico = numOnull(body.LoteHistoricoCobrado_CRC);
    const pagoCli = numOnull(body.PagoCliente_CRC);
    const fechaPago = parseFecha(body.FechaPagoCliente);
    const notas = body.Notas != null ? String(body.Notas).slice(0, 1000) : undefined;

    // Validaciones: montos no negativos; fecha ISO.
    for (const [k, v] of [
      ['MontoFinanciaBanco_CRC', financia],
      ['MontoLoteFinanciado_CRC', loteFin],
      ['LoteHistoricoCobrado_CRC', historico],
      ['PagoCliente_CRC', pagoCli],
    ] as const) {
      if (v != null && (Number.isNaN(v) || v < 0)) {
        return NextResponse.json({ error: `${k} debe ser un número ≥ 0` }, { status: 400 });
      }
    }
    if (fechaPago.invalid) {
      return NextResponse.json({ error: 'FechaPagoCliente debe ser ISO YYYY-MM-DD' }, { status: 400 });
    }

    // Al menos un campo a actualizar.
    if (
      body.MontoFinanciaBanco_CRC == null &&
      body.MontoLoteFinanciado_CRC == null &&
      body.LoteHistoricoCobrado_CRC == null &&
      body.PagoCliente_CRC == null &&
      !fechaPago.provided &&
      body.Notas == null
    ) {
      return NextResponse.json({ error: 'Debe enviar al menos un campo a actualizar' }, { status: 400 });
    }

    const uid = session.idCol || null;
    const db = await getAdelanteDb();
    const existente = await db.request().input('idCaso', sql.Int, idCaso).query<{ IDCasoLoteBanco: number }>(`
      SELECT TOP 1 IDCasoLoteBanco FROM [app].caso_lote_banco WHERE IDCaso = @idCaso ORDER BY IDCasoLoteBanco DESC
    `);

    let idClb: number;
    let accion: AccionUpsert;

    if (existente.recordset[0]) {
      // UPDATE — solo los campos enviados (COALESCE preserva lo actual).
      idClb = existente.recordset[0].IDCasoLoteBanco;
      accion = 'UPDATE';
      const request = db
        .request()
        .input('id', sql.Int, idClb)
        .input('financia', sql.Money, financia)
        .input('loteFin', sql.Money, loteFin)
        .input('historico', sql.Money, historico)
        .input('pagoCli', sql.Money, pagoCli)
        .input('uid', sql.Int, uid);
      // FechaPago y Notas: solo se tocan si vinieron en el body.
      const sets = [
        'MontoFinanciaBanco_CRC = COALESCE(@financia, MontoFinanciaBanco_CRC)',
        'MontoLoteFinanciado_CRC = COALESCE(@loteFin, MontoLoteFinanciado_CRC)',
        'LoteHistoricoCobrado_CRC = COALESCE(@historico, LoteHistoricoCobrado_CRC)',
        'PagoCliente_CRC = COALESCE(@pagoCli, PagoCliente_CRC)',
        'IDModificadopor = @uid',
        'FechaModificacion = SYSUTCDATETIME()',
      ];
      if (fechaPago.provided) {
        request.input('fechaPago', sql.Date, fechaPago.value ?? null);
        sets.push('FechaPagoCliente = @fechaPago');
      }
      if (notas !== undefined) {
        request.input('notas', sql.NVarChar(1000), notas);
        sets.push('Notas = @notas');
      }
      await request.query(`UPDATE [app].caso_lote_banco SET ${sets.join(', ')} WHERE IDCasoLoteBanco = @id`);
    } else {
      // INSERT — la tabla exige MontoPagaBancoPorLote_CRC > 0 (CK_monto_positivo).
      // El SP original lo resolvía; acá lo sembramos con el primer monto positivo
      // disponible (financia → loteFin → historico → pagoCli). Si no hay ninguno,
      // no se puede crear la fila: se pide MontoFinanciaBanco_CRC.
      const seed = [financia, loteFin, historico, pagoCli].find((v) => v != null && v > 0) ?? null;
      if (seed == null) {
        return NextResponse.json(
          {
            error:
              'Para crear el préstamo del caso enviá MontoFinanciaBanco_CRC (> 0); la tabla exige un monto base positivo.',
          },
          { status: 400 },
        );
      }
      accion = 'INSERT';
      const r = await db
        .request()
        .input('idCaso', sql.Int, idCaso)
        .input('paga', sql.Money, seed)
        .input('financia', sql.Money, financia)
        .input('loteFin', sql.Money, loteFin)
        .input('historico', sql.Money, historico)
        .input('pagoCli', sql.Money, pagoCli)
        .input('fechaPago', sql.Date, fechaPago.value ?? null)
        .input('notas', sql.NVarChar(1000), notas ?? null)
        .input('uid', sql.Int, uid)
        .query<{ IDCasoLoteBanco: number }>(`
          INSERT INTO [app].caso_lote_banco
            (IDCaso, MontoPagaBancoPorLote_CRC, MontoFinanciaBanco_CRC, MontoLoteFinanciado_CRC,
             LoteHistoricoCobrado_CRC, PagoCliente_CRC, FechaPagoCliente, Notas,
             FechaRegistro, IDCreadopor)
          OUTPUT INSERTED.IDCasoLoteBanco
          VALUES
            (@idCaso, @paga, @financia, @loteFin, @historico, @pagoCli, @fechaPago, @notas,
             SYSUTCDATETIME(), @uid)
        `);
      idClb = r.recordset[0]?.IDCasoLoteBanco;
    }

    const body2: ActualizarPrestamoBancarioResponse = { IDCasoLoteBanco: idClb, Accion: accion };
    return NextResponse.json(body2);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
