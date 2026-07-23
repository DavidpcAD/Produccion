import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';

// DELETE /api/utilidades/comentarios/:id — soft delete.
// Portado de la Azure Function `comentarios-delete`.

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();
    const result = await db
      .request()
      .input('id', sql.BigInt, id)
      .input('oid', sql.NVarChar(50), String(session.idUsuario || session.idCol)).query(`
        UPDATE uti.comentarios_reporte
        SET eliminado_en = SYSUTCDATETIME(), eliminado_por_oid = @oid
        WHERE id_comentario = @id AND eliminado_en IS NULL;
        SELECT @@ROWCOUNT AS afectados;
      `);

    if ((result.recordset[0]?.afectados ?? 0) === 0) {
      return NextResponse.json({ error: 'Comentario no encontrado' }, { status: 404 });
    }
    return NextResponse.json({ eliminado: true });
  } catch (e) {
    console.error('Error en DELETE /api/utilidades/comentarios/:id:', e);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
