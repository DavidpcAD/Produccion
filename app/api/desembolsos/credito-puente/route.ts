import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import {
  mapResumen,
  type BancoOpcion,
  type CreditoPuenteEstado,
  type RespuestaListaCreditoPuente,
} from '@/lib/desembolsos/credito-puente';

export const dynamic = 'force-dynamic';

/**
 * Crédito Puente — cabecera. Portado de adelante-flujo-desembolsos
 * `creditoPuente.ts` (listar / crear).
 *
 *   GET  /api/desembolsos/credito-puente?idBan=&estado=  → lista + catálogo de bancos
 *   POST /api/desembolsos/credito-puente                 → crea uno (devuelve id)
 *
 * Lectura: vista `pro_app.vw_credito_puente_resumen` (idéntica al fuente).
 * Escritura: INSERT directo (la base de Producción no tiene el SP
 * `sp_actualizar_credito_puente`).
 */

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const url = new URL(req.url);
    const idBanRaw = url.searchParams.get('idBan');
    const estadoRaw = url.searchParams.get('estado');

    const db = await getAdelanteDb();
    const request = db.request();
    const conds: string[] = ['1=1'];
    if (idBanRaw) {
      const idBan = Number(idBanRaw);
      if (!Number.isInteger(idBan) || idBan <= 0) {
        return NextResponse.json({ error: 'idBan inválido' }, { status: 400 });
      }
      conds.push('IDBan = @idBan');
      request.input('idBan', sql.Int, idBan);
    }
    if (estadoRaw) {
      if (estadoRaw !== 'ACTIVO' && estadoRaw !== 'CANCELADO') {
        return NextResponse.json({ error: 'estado inválido' }, { status: 400 });
      }
      conds.push('Estado = @estado');
      request.input('estado', sql.VarChar(20), estadoRaw as CreditoPuenteEstado);
    }

    const r = await request.query<Record<string, unknown>>(`
      SELECT *
      FROM [pro_app].vw_credito_puente_resumen
      WHERE ${conds.join(' AND ')}
      ORDER BY FechaCreacion DESC, IDCreditoPuente DESC
    `);

    const bancosRes = await db.request().query<BancoOpcion>(`
      SELECT IDBan, Abreviatura, NombreEntidad, ColorHEXBan
      FROM pro_ventas.Bancos
      WHERE Activo = 1
      ORDER BY Abreviatura
    `);

    const body: RespuestaListaCreditoPuente = {
      creditos: r.recordset.map(mapResumen),
      bancos: bancosRes.recordset,
    };
    return NextResponse.json(body);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 });

    const idBan = Number(body.IDBan);
    const montoTotal = Number(body.MontoTotal_CRC);
    if (!Number.isInteger(idBan) || idBan <= 0) {
      return NextResponse.json({ error: 'IDBan obligatorio' }, { status: 400 });
    }
    if (!(montoTotal > 0)) {
      return NextResponse.json({ error: 'MontoTotal_CRC > 0 obligatorio' }, { status: 400 });
    }

    const codigo = body.Codigo != null ? String(body.Codigo).slice(0, 60) : null;
    const gastos = body.GastosFormalizacion_CRC != null ? Number(body.GastosFormalizacion_CRC) : null;
    const tasa = body.TasaAnual != null ? Number(body.TasaAnual) : null;
    const fAprob = fechaOnull(body.FechaAprobacion);
    const fVenc = fechaOnull(body.FechaVencimiento);
    const notas = body.Notas != null ? String(body.Notas) : null;
    if (gastos != null && !(gastos >= 0)) {
      return NextResponse.json({ error: 'GastosFormalizacion_CRC inválido' }, { status: 400 });
    }

    const usuario = session.cedula || session.nombre || 'desconocido';
    const db = await getAdelanteDb();
    const r = await db
      .request()
      .input('IDBan', sql.Int, idBan)
      .input('Codigo', sql.NVarChar(60), codigo)
      .input('MontoTotal', sql.Money, montoTotal)
      .input('Gastos', sql.Money, gastos)
      .input('Tasa', sql.Decimal(5, 2), tasa)
      .input('FAprob', sql.Date, fAprob)
      .input('FVenc', sql.Date, fVenc)
      .input('Notas', sql.NVarChar(sql.MAX), notas)
      .input('Usuario', sql.NVarChar(400), usuario)
      .query<{ IDCreditoPuente: number }>(`
        INSERT INTO [pro_app].credito_puente
          (IDBan, Codigo, MontoTotal_CRC, GastosFormalizacion_CRC, TasaAnual,
           FechaAprobacion, FechaVencimiento, Estado, Notas, CreadoPor, FechaCreacion)
        OUTPUT INSERTED.IDCreditoPuente
        VALUES
          (@IDBan, @Codigo, @MontoTotal, @Gastos, @Tasa,
           @FAprob, @FVenc, 'ACTIVO', @Notas, @Usuario, SYSUTCDATETIME())
      `);
    return NextResponse.json({ ok: true, IDCreditoPuente: r.recordset[0]?.IDCreditoPuente }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}

// Devuelve null si viene vacío; valida formato ISO YYYY-MM-DD.
function fechaOnull(v: unknown): string | null {
  if (v == null || v === '') return null;
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
