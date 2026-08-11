import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import type { SprintCatalogoDetalle } from '@/lib/avance/sprints';

export const dynamic = 'force-dynamic';

/**
 * Catálogo global de sprints (pro_obc.sprints_catalogo). Portado de obrascontrol
 * `sprint.ts` (GET /api/sprints).
 *   GET /api/avance/sprints → { sprints: SprintCatalogoDetalle[] }
 *
 * Incluye el nº de sub-partidas críticas activas de cada sprint para que la
 * pantalla lo muestre sin un endpoint aparte. Marcar/desmarcar "de espera" se
 * hace con PATCH /api/avance/sprints/{numero}.
 */
export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  try {
    const db = await getAdelanteDb();
    const r = await db.request().query<SprintCatalogoDetalle>(`
      SELECT sc.id, sc.codigo, sc.numero_global, sc.nombre, sc.descripcion,
             sc.categoria, sc.es_espera,
             (SELECT COUNT(*)
                FROM pro_obc.sub_partidas sp
               WHERE sp.sprint_numero = sc.numero_global
                 AND sp.es_critica = 1 AND sp.activo = 1) AS criticas
      FROM pro_obc.sprints_catalogo sc
      WHERE sc.activo = 1
      ORDER BY sc.numero_global
    `);
    const sprints: SprintCatalogoDetalle[] = r.recordset.map((s) => ({
      id: Number(s.id),
      codigo: s.codigo,
      numero_global: s.numero_global,
      nombre: s.nombre,
      descripcion: s.descripcion ?? null,
      categoria: s.categoria,
      es_espera: !!s.es_espera,
      criticas: Number(s.criticas ?? 0),
    }));
    return NextResponse.json({ sprints });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}

/**
 * POST /api/avance/sprints — crea un sprint nuevo al FINAL de la secuencia global
 * (numero_global = max + 1). Body: { nombre, categoria?, descripcion?, es_espera? }.
 * El código se autogenera (S## / SE##). Luego se asigna a cada tipo de casa desde
 * la pantalla de Tipos de casa, y sus pesos desde Pesos.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const nombre = String(body?.nombre ?? '').trim();
    if (!nombre) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
    const categoria = (String(body?.categoria ?? '').trim() || 'CASA').toUpperCase();
    const descripcion = body?.descripcion != null && String(body.descripcion).trim() ? String(body.descripcion).trim() : null;
    const esEspera = body?.es_espera === true;

    const db = await getAdelanteDb();
    const maxQ = await db.request().query<{ maxN: number }>(
      'SELECT ISNULL(MAX(numero_global), 0) AS maxN FROM pro_obc.sprints_catalogo',
    );
    const numero = Number(maxQ.recordset[0]?.maxN ?? 0) + 1;
    const codigo = esEspera ? `SE${numero}` : `S${String(numero).padStart(2, '0')}`;

    const r = await db
      .request()
      .input('codigo', sql.VarChar(20), codigo)
      .input('numero', sql.SmallInt, numero)
      .input('nombre', sql.NVarChar(200), nombre)
      .input('descripcion', sql.NVarChar(sql.MAX), descripcion)
      .input('categoria', sql.VarChar(50), categoria)
      .input('esEspera', sql.Bit, esEspera ? 1 : 0)
      .query(`
        INSERT INTO pro_obc.sprints_catalogo
          (codigo, numero_global, nombre, descripcion, categoria, es_espera, activo, creado_en)
        OUTPUT INSERTED.numero_global AS numero_global, INSERTED.codigo AS codigo
        VALUES (@codigo, @numero, @nombre, @descripcion, @categoria, @esEspera, 1, SYSUTCDATETIME())
      `);
    return NextResponse.json({ ok: true, ...r.recordset[0] }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}
