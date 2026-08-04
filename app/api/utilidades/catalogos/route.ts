import { NextResponse } from 'next/server';
import { getAdelanteDb } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';

// GET /api/utilidades/catalogos
//
// Catálogos para los filtros del reporte: tipos de movimiento y lotes activos.
// Une las dos Azure Functions originales (`catalogos-tipos-movimiento` y
// `catalogos-lotes`) en una sola respuesta, siguiendo el patrón de
// /api/partidas de la base (un endpoint devuelve varios catálogos).
//
// Depende de: pro_uti.tipo_movimiento, pro_uti.v_lotes_activos.

export async function GET() {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const db = await getAdelanteDb();
    const [tipos, lotes] = await Promise.all([
      db.request().query(`
        SELECT codigo AS valor, nombre_display AS etiqueta, categoria AS grupo
        FROM pro_uti.tipo_movimiento
        WHERE activo = 1
        ORDER BY orden_ui
      `),
      db.request().query(`
        SELECT lote AS valor, lote AS etiqueta, bloque AS grupo
        FROM pro_uti.v_lotes_activos
        ORDER BY bloque, lote
      `),
    ]);

    return NextResponse.json({
      tiposMovimiento: tipos.recordset,
      lotes: lotes.recordset,
    });
  } catch (e) {
    console.error('Error en GET /api/utilidades/catalogos:', e);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
