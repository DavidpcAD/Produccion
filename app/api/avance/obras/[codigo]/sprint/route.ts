import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { resolverUsuarioAppId } from '@/lib/avance/usuario-app';
import type { TipoCasa } from '@/lib/avance/types';
import type { SprintResultado } from '@/lib/avance/campo';

export const dynamic = 'force-dynamic';

/**
 * Operaciones manuales de sprint sobre una obra. Portado de la Azure Function
 * `sprint.ts` de obrascontrol (avanzarHandler + retrocederHandler), fusionadas
 * en un solo endpoint que discrimina por `accion` en el body.
 *
 *   POST /api/avance/obras/{codigo}/sprint  { accion: 'avanzar' | 'retroceder' }
 *
 * avanzar: pasa al siguiente sprint de pro_obc.tipo_casa_sprints; bloquea si quedan
 *   sub-partidas críticas del sprint actual sin completar.
 * retroceder: vuelve al sprint anterior SOLO si no está cerrado o es "de espera"
 *   (sprints_catalogo.es_espera). Si está en el primer sprint, vuelve a
 *   «Por Iniciar» (estado 'pendiente') salvo que ya tenga avance registrado.
 */

interface ObraRow {
  estado: string;
  sprint_actual: number;
  tipo_casa: TipoCasa | null;
}

async function leerEstado(
  db: Awaited<ReturnType<typeof getAdelanteDb>>,
  codigo: string,
): Promise<ObraRow | null> {
  const r = await db
    .request()
    .input('obra', sql.NVarChar(20), codigo)
    .query<ObraRow>(
      'SELECT estado, sprint_actual, tipo_casa FROM pro_obc.obra_estado WHERE obra_codigo = @obra',
    );
  return r.recordset[0] ?? null;
}

async function avanzar(
  db: Awaited<ReturnType<typeof getAdelanteDb>>,
  codigo: string,
  estado: ObraRow,
  uid: number | null,
): Promise<NextResponse> {
  const tc = estado.tipo_casa!;

  // Regla: no avanzar si las críticas del sprint actual no están todas al 100%.
  const critsQ = await db
    .request()
    .input('obra', sql.NVarChar(20), codigo)
    .input('sprint', sql.SmallInt, estado.sprint_actual)
    .input('tc', sql.VarChar(20), tc)
    .query<{ total: number; completas: number }>(`
      SELECT
        SUM(CASE WHEN sp.es_critica = 1 THEN 1 ELSE 0 END) AS total,
        SUM(CASE WHEN sp.es_critica = 1 AND ISNULL(a.completada, 0) = 1 THEN 1 ELSE 0 END) AS completas
      FROM pro_obc.sub_partidas sp
      JOIN pro_obc.sub_partida_tipos t ON t.sub_partida_id = sp.id AND t.tipo_casa = @tc
      LEFT JOIN pro_obc.avance_sub_partidas a
        ON a.sub_partida_id = sp.id AND a.obra_codigo = @obra
      WHERE sp.sprint_numero = @sprint AND sp.activo = 1
    `);
  const cr = critsQ.recordset[0]!;
  const total = Number(cr.total ?? 0);
  const completas = Number(cr.completas ?? 0);
  if (total > 0 && completas < total) {
    const pend = total - completas;
    return NextResponse.json(
      { error: `No se puede avanzar: ${pend} crítica${pend === 1 ? '' : 's'} sin completar del sprint actual.` },
      { status: 409 },
    );
  }

  const sigQ = await db
    .request()
    .input('tc', sql.VarChar(20), tc)
    .input('sprint', sql.SmallInt, estado.sprint_actual)
    .query<{ siguiente: number }>(`
      SELECT TOP 1 sig.sprint_global AS siguiente
      FROM pro_obc.tipo_casa_sprints cur
      JOIN pro_obc.tipo_casa_sprints sig
        ON sig.tipo_casa = cur.tipo_casa AND sig.orden = cur.orden + 1
      WHERE cur.tipo_casa = @tc AND cur.sprint_global = @sprint
    `);
  const siguiente = sigQ.recordset[0]?.siguiente;
  if (!siguiente) {
    return NextResponse.json(
      { error: 'La obra ya está en el último sprint de su tipo.' },
      { status: 409 },
    );
  }

  await db
    .request()
    .input('obra', sql.NVarChar(20), codigo)
    .input('sprint', sql.SmallInt, siguiente)
    .input('uid', sql.Int, uid)
    .query(`
      UPDATE pro_obc.obra_estado
      SET sprint_actual = @sprint,
          avanzo_semana_id = (
            SELECT TOP 1 id FROM pro_obc.semanas_operativas
            WHERE estado = 'abierta' ORDER BY fecha_inicio DESC
          ),
          actualizado_en = SYSUTCDATETIME(),
          actualizado_por = @uid
      WHERE obra_codigo = @obra
    `);

  const data: SprintResultado = {
    obra_codigo: codigo,
    sprint_de: estado.sprint_actual,
    sprint_a: siguiente,
  };
  return NextResponse.json({ data });
}

async function retroceder(
  db: Awaited<ReturnType<typeof getAdelanteDb>>,
  codigo: string,
  estado: ObraRow,
  uid: number | null,
): Promise<NextResponse> {
  const tc = estado.tipo_casa!;

  // Sprint anterior + si es de espera + si ya fue cerrado para esta obra.
  const prevQ = await db
    .request()
    .input('tc', sql.VarChar(20), tc)
    .input('obra', sql.NVarChar(20), codigo)
    .input('sprint', sql.SmallInt, estado.sprint_actual)
    .query<{ anterior: number; es_espera: boolean; cerrado: number }>(`
      SELECT TOP 1 prv.sprint_global AS anterior, sc.es_espera,
             (SELECT COUNT(*) FROM pro_obc.sprints_cerrados x
              WHERE x.sprint_numero = prv.sprint_global
                AND x.obra_codigo COLLATE DATABASE_DEFAULT = @obra COLLATE DATABASE_DEFAULT
             ) AS cerrado
      FROM pro_obc.tipo_casa_sprints cur
      JOIN pro_obc.tipo_casa_sprints prv
        ON prv.tipo_casa = cur.tipo_casa AND prv.orden = cur.orden - 1
      JOIN pro_obc.sprints_catalogo sc ON sc.numero_global = prv.sprint_global
      WHERE cur.tipo_casa = @tc AND cur.sprint_global = @sprint
    `);
  const prev = prevQ.recordset[0];

  if (!prev) {
    // Está en el PRIMER sprint de su tipo. "Atrás" = volver a «Por Iniciar»
    // (pendiente). Único bloqueante: que ya tenga avance.
    const avQ = await db
      .request()
      .input('obra', sql.NVarChar(20), codigo)
      .query<{ n: number }>(
        'SELECT COUNT(*) AS n FROM pro_obc.avance_sub_partidas WHERE obra_codigo = @obra AND (pct_completado > 0 OR completada = 1)',
      );
    if (Number(avQ.recordset[0]?.n ?? 0) > 0) {
      return NextResponse.json(
        { error: 'No se puede volver a «Por Iniciar»: la obra ya tiene avance registrado.' },
        { status: 409 },
      );
    }
    await db
      .request()
      .input('obra', sql.NVarChar(20), codigo)
      .input('uid', sql.Int, uid)
      .query(`
        UPDATE pro_obc.obra_estado
        SET estado = 'pendiente', avanzo_semana_id = NULL,
            actualizado_en = SYSUTCDATETIME(), actualizado_por = @uid
        WHERE obra_codigo = @obra
      `);
    const data: SprintResultado = {
      obra_codigo: codigo,
      sprint_de: estado.sprint_actual,
      sprint_a: null,
    };
    return NextResponse.json({ data });
  }

  const anteriorCerrado = Number(prev.cerrado) > 0;
  if (anteriorCerrado && !prev.es_espera) {
    return NextResponse.json(
      { error: `No se puede retroceder: el sprint ${prev.anterior} ya fue cerrado y no es de espera.` },
      { status: 409 },
    );
  }

  await db
    .request()
    .input('obra', sql.NVarChar(20), codigo)
    .input('sprint', sql.SmallInt, prev.anterior)
    .input('uid', sql.Int, uid)
    .query(`
      UPDATE pro_obc.obra_estado
      SET sprint_actual = @sprint,
          avanzo_semana_id = NULL,
          actualizado_en = SYSUTCDATETIME(),
          actualizado_por = @uid
      WHERE obra_codigo = @obra
    `);

  const data: SprintResultado = {
    obra_codigo: codigo,
    sprint_de: estado.sprint_actual,
    sprint_a: prev.anterior,
  };
  return NextResponse.json({ data });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ codigo: string }> },
) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { codigo } = await params;

  try {
    const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const accion = raw.accion;
    if (accion !== 'avanzar' && accion !== 'retroceder') {
      return NextResponse.json({ error: "accion inválida (avanzar | retroceder)" }, { status: 400 });
    }

    const db = await getAdelanteDb();
    const estado = await leerEstado(db, codigo);
    if (!estado || !estado.tipo_casa) {
      return NextResponse.json(
        { error: `Obra ${codigo} no habilitada o sin tipo de casa.` },
        { status: 400 },
      );
    }

    // Una obra congelada (en_espera) no se mueve de sprint: hay que descongelarla
    // primero. Antes "avanzaba" y notificaba éxito aunque no debía.
    if (estado.estado === 'en_espera') {
      return NextResponse.json(
        { error: `La obra ${codigo} está congelada. Descongelala antes de mover el sprint.` },
        { status: 409 },
      );
    }

    // actualizado_por → usuarios_app.id (o NULL). No session.idCol: es idColaborador
    // y viola FK_obra_estado_usuario.
    const uid = await resolverUsuarioAppId(db, session);
    return accion === 'avanzar'
      ? await avanzar(db, codigo, estado, uid)
      : await retroceder(db, codigo, estado, uid);
  } catch (err) {
    console.error('/api/avance/obras/[codigo]/sprint POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
