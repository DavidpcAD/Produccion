import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Catálogo de pesos por sub-partida, en dos ámbitos:
 *  - sprint  → pro_obc.sub_partida_pesos_sprint  (peso dentro de su sprint)
 *  - partida → pro_obc.sub_partida_pesos_partida (peso dentro de su partida)
 * Cada peso es por tipo de casa. Regla de negocio: cada columna (tipo de casa)
 * de un grupo (sprint o partida) debe sumar 100%.
 *
 * Portado de la pantalla "Pesos" (Por Sprint / Por Partida) de obrascontrol.
 */

type Ambito = 'sprint' | 'partida';

interface Fila {
  subPartidaId: number;
  codigo: string;
  nombre: string;
  partidaId: number;
  partidaCodigo: string;
  partidaNombre: string;
  sprintNumero: number;
  aplica: string[];              // tipos de casa a los que aplica la sub-partida
  pesos: Record<string, number>; // peso por tipo de casa (solo los que existen)
}

// GET /api/avance/pesos?ambito=sprint|partida
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const ambito = (new URL(req.url).searchParams.get('ambito') as Ambito) || 'sprint';
  if (ambito !== 'sprint' && ambito !== 'partida') {
    return NextResponse.json({ error: 'ambito inválido (sprint | partida)' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();

    const [tipos, subs, aplica, pesos, sprints] = await Promise.all([
      db.request().query<{ codigo: string; descripcion: string }>(
        'SELECT codigo, descripcion FROM pro_obc.tipos_casa WHERE activo = 1 ORDER BY codigo'),
      db.request().query<{ subPartidaId: number; codigo: string; nombre: string; partidaId: number; partidaCodigo: string; partidaNombre: string; sprintNumero: number; orden: number }>(`
        SELECT sp.id AS subPartidaId, sp.codigo, sp.nombre,
               sp.partida_id AS partidaId, pa.codigo AS partidaCodigo, pa.nombre AS partidaNombre,
               sp.sprint_numero AS sprintNumero, pa.orden AS orden
        FROM pro_obc.sub_partidas sp
        JOIN pro_obc.partidas pa ON pa.id = sp.partida_id
        JOIN pro_obc.grupos_partida g ON g.id = pa.grupo_id
        -- Solo vivienda: los pesos son por sprint/tipo de casa y las subpartidas
        -- de infraestructura no llevan ni lo uno ni lo otro.
        WHERE sp.activo = 1 AND g.tipo_obra = 'VIVIENDA'`),
      db.request().query<{ sub_partida_id: number; tipo_casa: string }>(
        'SELECT sub_partida_id, tipo_casa FROM pro_obc.sub_partida_tipos'),
      ambito === 'sprint'
        ? db.request().query<{ sub_partida_id: number; tipo_casa: string; peso: number }>(
            'SELECT sub_partida_id, tipo_casa, peso FROM pro_obc.sub_partida_pesos_sprint')
        : db.request().query<{ sub_partida_id: number; tipo_casa: string; peso: number }>(
            'SELECT sub_partida_id, tipo_casa, peso FROM pro_obc.sub_partida_pesos_partida'),
      db.request().query<{ numero_global: number; nombre: string }>(
        'SELECT numero_global, nombre FROM pro_obc.sprints_catalogo WHERE activo = 1 ORDER BY numero_global'),
    ]);

    const aplicaMap = new Map<number, string[]>();
    for (const a of aplica.recordset) {
      const arr = aplicaMap.get(a.sub_partida_id) ?? [];
      arr.push(a.tipo_casa);
      aplicaMap.set(a.sub_partida_id, arr);
    }
    const pesoMap = new Map<string, number>(); // `${subId}|${tc}` → peso
    for (const p of pesos.recordset) pesoMap.set(`${p.sub_partida_id}|${p.tipo_casa}`, Number(p.peso));

    const filas: Fila[] = subs.recordset.map((s) => {
      const ap = aplicaMap.get(s.subPartidaId) ?? [];
      const ps: Record<string, number> = {};
      for (const tc of ap) {
        const v = pesoMap.get(`${s.subPartidaId}|${tc}`);
        if (v != null) ps[tc] = v;
      }
      return {
        subPartidaId: s.subPartidaId, codigo: s.codigo, nombre: s.nombre,
        partidaId: s.partidaId, partidaCodigo: s.partidaCodigo, partidaNombre: s.partidaNombre,
        sprintNumero: s.sprintNumero, aplica: ap, pesos: ps,
      };
    });

    return NextResponse.json({
      ambito,
      tiposCasa: tipos.recordset,
      sprints: sprints.recordset,
      filas,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}

// PUT /api/avance/pesos — guarda TODOS los pesos del ámbito. Body:
// { ambito, cambios: [{ subPartidaId, tipoCasa, peso }] } (solo celdas que aplican).
// Valida que cada columna (scope × tipo de casa) sume 100% antes de guardar.
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const ambito = body?.ambito as Ambito;
  const cambios = Array.isArray(body?.cambios) ? body.cambios : [];
  if (ambito !== 'sprint' && ambito !== 'partida') {
    return NextResponse.json({ error: 'ambito inválido (sprint | partida)' }, { status: 400 });
  }
  const celdas = cambios
    .map((c: Record<string, unknown>) => ({ subPartidaId: Number(c.subPartidaId), tipoCasa: String(c.tipoCasa), peso: Number(c.peso) }))
    .filter((c: { subPartidaId: number; tipoCasa: string; peso: number }) =>
      Number.isInteger(c.subPartidaId) && c.tipoCasa && !Number.isNaN(c.peso));
  if (celdas.length === 0) {
    return NextResponse.json({ error: 'No hay pesos para guardar.' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();

    // Scope de cada sub-partida (sprint_numero | partida_id) para agrupar y guardar.
    const ids = Array.from(new Set(celdas.map((c: { subPartidaId: number }) => c.subPartidaId)));
    const scopeRes = await db.request()
      .input('ids', sql.NVarChar(sql.MAX), JSON.stringify(ids))
      .query<{ id: number; sprint_numero: number; partida_id: number }>(`
        SELECT id, sprint_numero, partida_id FROM pro_obc.sub_partidas
        WHERE id IN (SELECT value FROM OPENJSON(@ids))`);
    const scopeMap = new Map<number, number>();
    for (const r of scopeRes.recordset) {
      scopeMap.set(r.id, ambito === 'sprint' ? r.sprint_numero : r.partida_id);
    }

    // Regla de negocio: cada columna (scope × tipo de casa) debería sumar 100%.
    // NO es bloqueante: el catálogo puede tener columnas incompletas (0% en sprints
    // sin pesos aún), y bloquear impediría corregirlas. Se guarda igual y se
    // devuelven las columnas fuera de 100% como aviso.
    const sumas = new Map<string, number>();
    for (const c of celdas) {
      const scope = scopeMap.get(c.subPartidaId);
      if (scope == null) continue;
      const k = `${scope}|${c.tipoCasa}`;
      sumas.set(k, (sumas.get(k) ?? 0) + c.peso);
    }
    const incompletas: string[] = [];
    for (const [k, suma] of sumas) {
      if (Math.abs(suma - 100) > 0.5) {
        const [scope, tc] = k.split('|');
        incompletas.push(`${ambito === 'sprint' ? 'Sprint' : 'Partida'} ${scope} · ${tc} = ${suma.toFixed(2)}%`);
      }
    }

    // Bulk upsert con OPENJSON (el scope se re-deriva de la sub-partida en SQL).
    const tabla = ambito === 'sprint' ? 'pro_obc.sub_partida_pesos_sprint' : 'pro_obc.sub_partida_pesos_partida';
    const scopeCol = ambito === 'sprint' ? 'sprint_numero' : 'partida_id';
    const scopeSrc = ambito === 'sprint' ? 's.sprint_numero' : 's.partida_id';
    await db.request()
      .input('json', sql.NVarChar(sql.MAX), JSON.stringify(celdas))
      .query(`
        MERGE ${tabla} AS dst
        USING (
          SELECT j.subPartidaId, ${scopeSrc} AS scope_val, j.tipoCasa, j.peso
          FROM OPENJSON(@json) WITH (
            subPartidaId int '$.subPartidaId',
            tipoCasa varchar(20) '$.tipoCasa',
            peso decimal(5,2) '$.peso'
          ) j
          JOIN pro_obc.sub_partidas s ON s.id = j.subPartidaId
        ) AS src
          ON dst.sub_partida_id = src.subPartidaId
         AND dst.${scopeCol} = src.scope_val
         AND dst.tipo_casa COLLATE DATABASE_DEFAULT = src.tipoCasa COLLATE DATABASE_DEFAULT
        WHEN MATCHED THEN UPDATE SET peso = src.peso
        WHEN NOT MATCHED THEN INSERT (sub_partida_id, ${scopeCol}, tipo_casa, peso)
          VALUES (src.subPartidaId, src.scope_val, src.tipoCasa, src.peso);
      `);

    return NextResponse.json({ ok: true, guardados: celdas.length, incompletas });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
