import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { resolverUsuarioAppId } from '@/lib/avance/usuario-app';
import type { EstadoObra, TipoCasa } from '@/lib/avance/types';
import type { EstadoResultado } from '@/lib/avance/campo';

export const dynamic = 'force-dynamic';

/**
 * Cambia el estado operativo de una obra. Portado de la Azure Function
 * `sprint.ts` de obrascontrol (estadoHandler).
 *
 *   POST /api/avance/obras/{codigo}/estado
 *     { estado: 'pendiente'|'en_ejecucion'|'en_espera'|'inactiva'|'finalizada',
 *       motivo_inactiva?: string | null }
 *
 * Usos: congelar (en_espera), reactivar/descongelar (en_ejecucion),
 * inactivar (inactiva), terminar (finalizada). El motivo queda en
 * obra_estado.motivo_inactiva.
 *
 * DIFERENCIAS vs. el fuente (documentadas): NO se corre `asegurarBaselineObra`
 * (pertenece al módulo de cierre / línea base, fuera del alcance de campo) ni la
 * pre-validación `faltanDatosArranque` al arrancar desde pendiente. SÍ se
 * conserva el CANDADO de finalización (todas las sub-partidas al 100%).
 */

const ESTADOS_VALIDOS: EstadoObra[] = [
  'pendiente',
  'en_ejecucion',
  'en_espera',
  'inactiva',
  'finalizada',
];

interface ObraRow {
  estado: EstadoObra;
  tipo_casa: TipoCasa | null;
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
    const nuevoEstado = raw.estado as EstadoObra;
    if (!ESTADOS_VALIDOS.includes(nuevoEstado)) {
      return NextResponse.json({ error: 'estado inválido' }, { status: 400 });
    }
    // Aceptamos `motivo_inactiva` o `motivo` (compatibilidad con el diálogo).
    const motivoRaw = (raw.motivo_inactiva ?? raw.motivo) as string | null | undefined;
    const motivo = motivoRaw != null ? String(motivoRaw).slice(0, 200) : null;

    const db = await getAdelanteDb();
    const estadoRes = await db
      .request()
      .input('obra', sql.NVarChar(20), codigo)
      .query<ObraRow>(
        'SELECT estado, tipo_casa FROM pro_obc.obra_estado WHERE obra_codigo = @obra',
      );
    const actual = estadoRes.recordset[0];
    if (!actual) {
      return NextResponse.json({ error: `Obra ${codigo} no habilitada` }, { status: 404 });
    }

    // CANDADO de finalización: solo se finaliza si TODAS las sub-partidas del
    // tipo de casa están al 100% (misma regla que el cierre).
    if (nuevoEstado === 'finalizada' && actual.estado !== 'finalizada' && actual.tipo_casa) {
      const pendQ = await db
        .request()
        .input('obra', sql.NVarChar(20), codigo)
        .input('tc', sql.VarChar(20), actual.tipo_casa)
        .query<{ pend: number }>(`
          SELECT COUNT(*) AS pend
          FROM pro_obc.sub_partidas sp
          JOIN pro_obc.sub_partida_tipos t ON t.sub_partida_id = sp.id AND t.tipo_casa = @tc
          LEFT JOIN pro_obc.avance_sub_partidas a
            ON a.sub_partida_id = sp.id AND a.obra_codigo = @obra
          WHERE sp.activo = 1 AND ISNULL(a.completada, 0) = 0
        `);
      const pend = Number(pendQ.recordset[0]?.pend ?? 0);
      if (pend > 0) {
        return NextResponse.json(
          { error: `No se puede finalizar ${codigo}: tiene ${pend} sub-partida(s) sin completar. Una obra solo se finaliza con todas las sub-partidas al 100%.` },
          { status: 409 },
        );
      }
    }

    const uid = await resolverUsuarioAppId(db, session);
    await db
      .request()
      .input('obra', sql.NVarChar(20), codigo)
      .input('estado', sql.VarChar(20), nuevoEstado)
      .input('motivo', sql.NVarChar(200), motivo)
      .input('uid', sql.Int, uid)
      .query(`
        UPDATE pro_obc.obra_estado
        SET estado = @estado,
            motivo_inactiva = @motivo,
            actualizado_en = SYSUTCDATETIME(),
            actualizado_por = @uid
        WHERE obra_codigo = @obra
      `);

    const data: EstadoResultado = { obra_codigo: codigo, estado: nuevoEstado };
    return NextResponse.json({ data });
  } catch (err) {
    console.error('/api/avance/obras/[codigo]/estado POST error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
