import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/avance/sprints/{numero} — marca/desmarca un sprint como "de
 * espera" (colado/curado). Portado de obrascontrol `sprint.ts`
 * (PATCH /api/sprints/{numero}).
 *
 * Body: { es_espera: boolean }.
 *
 * Regla de integridad: un sprint de espera NO puede tener sub-partidas activas
 * (en el fuente lo valida la pantalla; acá se refuerza en el servidor → 409).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ numero: string }> },
) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { numero: numeroRaw } = await params;
  const numero = Number(numeroRaw);
  if (!Number.isInteger(numero) || numero <= 0) {
    return NextResponse.json({ error: 'numero inválido' }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.es_espera !== 'boolean') {
      return NextResponse.json({ error: 'es_espera debe ser booleano' }, { status: 400 });
    }
    const esEspera: boolean = body.es_espera;

    const db = await getAdelanteDb();

    // No se puede marcar como espera un sprint que tiene sub-partidas activas.
    if (esEspera) {
      const subsQ = await db
        .request()
        .input('n', sql.SmallInt, numero)
        .query<{ n: number }>(
          'SELECT COUNT(*) AS n FROM obc.sub_partidas WHERE sprint_numero = @n AND activo = 1',
        );
      const nSubs = Number(subsQ.recordset[0]?.n ?? 0);
      if (nSubs > 0) {
        return NextResponse.json(
          {
            error: `El sprint ${numero} tiene ${nSubs} sub-partida(s) activa(s). Un sprint de espera no puede tenerlas — movelas a otro sprint primero.`,
          },
          { status: 409 },
        );
      }
    }

    const r = await db
      .request()
      .input('n', sql.SmallInt, numero)
      .input('esp', sql.Bit, esEspera ? 1 : 0)
      .query('UPDATE obc.sprints_catalogo SET es_espera = @esp WHERE numero_global = @n');
    if ((r.rowsAffected[0] ?? 0) === 0) {
      return NextResponse.json({ error: `Sprint ${numero} no encontrado` }, { status: 404 });
    }
    return NextResponse.json({ ok: true, numero_global: numero, es_espera: esEspera });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
