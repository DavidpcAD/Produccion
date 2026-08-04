import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import type { TipoCasa } from '@/lib/avance/types';
import type { IniciarLoteResultado } from '@/lib/avance/campo';

export const dynamic = 'force-dynamic';

/**
 * Habilita (pone en ejecución) varias obras de una. Portado de la Azure
 * Function `avance.ts` de obrascontrol (iniciarLoteHandler).
 *
 *   POST /api/avance/obras/iniciar-lote
 *     { codigos: string[], tipo_casa: TipoCasa | 'auto', sprint_inicial?: number }
 *
 * En modo 'auto' el tipo sale de pro_obc.vw_obras (se omiten las que no lo tienen);
 * con un tipo concreto se aplica a todas. Solo habilita obras que existan en
 * pro_obc.vw_obras (OPENJSON del array de códigos).
 */

const TIPOS: TipoCasa[] = ['1N-Techo', '1N-Azotea', '2N-Techo', '2N-Azotea'];

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const codigos = Array.isArray(raw.codigos)
      ? (raw.codigos as unknown[])
          .map((c) => String(c).trim())
          .filter((c) => c.length >= 3 && c.length <= 20)
      : [];
    if (codigos.length === 0) {
      return NextResponse.json({ error: 'Indicá al menos un código de obra.' }, { status: 400 });
    }
    if (codigos.length > 300) {
      return NextResponse.json({ error: 'Máximo 300 obras por lote.' }, { status: 400 });
    }

    const tipoCasa = raw.tipo_casa as TipoCasa | 'auto';
    if (tipoCasa !== 'auto' && !TIPOS.includes(tipoCasa)) {
      return NextResponse.json({ error: 'tipo_casa inválido' }, { status: 400 });
    }
    const esAuto = tipoCasa === 'auto';

    const sprintRaw = Number(raw.sprint_inicial ?? 1);
    const sprint = Number.isInteger(sprintRaw) && sprintRaw >= 1 && sprintRaw <= 50 ? sprintRaw : 1;

    const db = await getAdelanteDb();
    const request = db
      .request()
      .input('codigos', sql.NVarChar(sql.MAX), JSON.stringify(codigos))
      .input('sprint', sql.SmallInt, sprint)
      .input('uid', sql.Int, session.idCol || null);
    if (!esAuto) request.input('tc', sql.VarChar(20), tipoCasa);

    const tcExpr = esAuto ? 'o.tipo_casa' : '@tc';
    const filtroTc = esAuto ? 'AND o.tipo_casa IS NOT NULL' : '';

    const result = await request.query<{ accion: string }>(`
      MERGE pro_obc.obra_estado AS dst
      USING (
        SELECT o.codigo, ${tcExpr} AS tc
        FROM pro_obc.vw_obras o
        JOIN OPENJSON(@codigos) j
          ON j.value COLLATE DATABASE_DEFAULT = o.codigo COLLATE DATABASE_DEFAULT
        WHERE 1 = 1 ${filtroTc}
      ) AS src
        ON dst.obra_codigo COLLATE DATABASE_DEFAULT = src.codigo COLLATE DATABASE_DEFAULT
      WHEN MATCHED THEN UPDATE SET
        estado = 'en_ejecucion', tipo_casa = src.tc, sprint_actual = @sprint,
        actualizado_en = SYSUTCDATETIME(), actualizado_por = @uid
      WHEN NOT MATCHED THEN INSERT
        (obra_codigo, estado, sprint_actual, tipo_casa, actualizado_por)
        VALUES (src.codigo, 'en_ejecucion', @sprint, src.tc, @uid)
      OUTPUT $action AS accion;
    `);

    const habilitadas = result.recordset?.length ?? 0;
    const data: IniciarLoteResultado = {
      habilitadas,
      solicitadas: codigos.length,
      omitidas: codigos.length - habilitadas,
    };
    return NextResponse.json({ data });
  } catch (err) {
    console.error('/api/avance/obras/iniciar-lote POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
