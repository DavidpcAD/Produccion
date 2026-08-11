import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { refrescarEstadoVenta } from '@/lib/avance/venta';
import { REPORTE_CACHE } from '@/lib/cache-headers';
import type { ObraAvance } from '@/lib/avance/types';

/**
 * GET /api/avance/obras[?proyecto=VN]
 * Listado LIVIANO del estado operativo de las obras habilitadas
 * (en_ejecucion / en_espera) desde `pro_obc.obra_estado`. Alimenta el dashboard
 * del módulo (lista de casas por bloque). El proyecto y bloque se derivan del
 * código (formato PROYECTO-BLOQUE.NUMERO, ej. "VN-C.08").
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const proyectoRaw = new URL(req.url).searchParams.get('proyecto');
  const proyecto = proyectoRaw ? proyectoRaw.toUpperCase() : null;

  const db = await getAdelanteDb();
  await refrescarEstadoVenta(db);

  try {
    const r = await db
      .request()
      .input('like', sql.NVarChar(20), proyecto ? `${proyecto}-%` : null)
      .query<{
        codigo: string;
        estado: ObraAvance['estado'];
        tipo_casa: ObraAvance['tipo_casa'];
        sprint_actual: number;
        estado_venta: ObraAvance['estado_venta'];
        avanzo_esta_semana: boolean;
      }>(`
        SELECT oe.obra_codigo AS codigo, oe.estado, oe.tipo_casa, oe.sprint_actual, oe.estado_venta,
               CAST(CASE WHEN oe.avanzo_semana_id IS NOT NULL
                          AND oe.avanzo_semana_id = (
                            SELECT TOP 1 id FROM pro_obc.semanas_operativas
                            WHERE estado = 'abierta' ORDER BY fecha_inicio DESC
                          )
                     THEN 1 ELSE 0 END AS BIT) AS avanzo_esta_semana
        FROM pro_obc.obra_estado oe
        WHERE oe.estado IN ('en_ejecucion', 'en_espera')
          AND (@like IS NULL OR oe.obra_codigo LIKE @like)
        ORDER BY oe.obra_codigo
      `);

    const bloqueDe = (codigo: string) => codigo.split('-')[1]?.split('.')[0] ?? '';
    const proyectoDe = (codigo: string) => codigo.split('-')[0] ?? '';

    const data: ObraAvance[] = r.recordset.map((o) => ({
      ...o,
      avanzo_esta_semana: !!o.avanzo_esta_semana,
      bloque_letra: bloqueDe(o.codigo),
      proyecto_codigo: proyectoDe(o.codigo),
    }));

    return NextResponse.json({ data }, { headers: REPORTE_CACHE });
  } catch (err) {
    console.error('/api/avance/obras error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 },
    );
  }
}
