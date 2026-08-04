import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import type { TipoCasa } from '@/lib/avance/tipos-casa';
import { TIPOS } from '@/lib/avance/tipos-casa';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/avance/tipos-casa/{tipo} — reemplaza la secuencia de sprints de un
 * tipo de casa (pro_obc.tipo_casa_sprints). Portado de obrascontrol `tipos-casa.ts`.
 *
 * Body: { sprints: number[] }. Se guardan únicos, ascendente; el orden va en
 * orden de sprint global (1-based).
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ tipo: string }> },
) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { tipo: tipoRaw } = await params;
  const tipo = decodeURIComponent(tipoRaw) as TipoCasa;
  if (!TIPOS.includes(tipo)) {
    return NextResponse.json({ error: 'Tipo de casa inválido' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const raw = Array.isArray(body?.sprints) ? body.sprints : null;
    if (!raw) {
      return NextResponse.json({ error: 'sprints debe ser un arreglo' }, { status: 400 });
    }
    const nums = raw.map((n: unknown) => Number(n));
    if (nums.some((n: number) => !Number.isInteger(n) || n <= 0)) {
      return NextResponse.json({ error: 'sprints inválidos' }, { status: 400 });
    }
    if (nums.length > 60) {
      return NextResponse.json({ error: 'Demasiados sprints (máx. 60)' }, { status: 400 });
    }

    // Únicos, ascendente — la secuencia va en orden de sprint global.
    const sprints = [...new Set<number>(nums)].sort((a, b) => a - b);

    const db = await getAdelanteDb();
    const tx = new sql.Transaction(db);
    await tx.begin();
    try {
      await new sql.Request(tx)
        .input('tc', sql.VarChar(20), tipo)
        .query('DELETE FROM pro_obc.tipo_casa_sprints WHERE tipo_casa = @tc');

      if (sprints.length > 0) {
        const request = new sql.Request(tx).input('tc', sql.VarChar(20), tipo);
        const values = sprints.map((s, i) => {
          request.input(`s${i}`, sql.SmallInt, s);
          request.input(`o${i}`, sql.SmallInt, i + 1); // orden 1-based, ascendente
          return `(@tc, @s${i}, @o${i})`;
        });
        await request.query(
          `INSERT INTO pro_obc.tipo_casa_sprints (tipo_casa, sprint_global, orden) VALUES ${values.join(', ')}`,
        );
      }
      await tx.commit();
    } catch (e) {
      try {
        await tx.rollback();
      } catch {
        /* ignorar */
      }
      throw e;
    }

    return NextResponse.json({ ok: true, tipo_casa: tipo, sprints });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
