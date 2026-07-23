import { getDb, sql } from './db';

export async function logAudit(params: {
  idColAccion: number | null;
  accion: string;
  entidad?: string;
  idEntidad?: number;
  detallePrevio?: unknown;
  detalleNuevo?: unknown;
  ip?: string;
}) {
  try {
    const db = await getDb();

    // Verificar que idColAccion existe en Colaborador (modelo nuevo) para FK
    if (params.idColAccion !== null) {
      const check = await db.request()
        .input('id', sql.Int, params.idColAccion)
        .query('SELECT 1 AS found FROM dbo.Colaborador WHERE idColaborador = @id');
      if (check.recordset.length === 0) return; // No registrar si el usuario no existe
    } else {
      return; // Sin usuario válido, no registrar
    }

    await db.request()
      .input('idColAccion', sql.Int, params.idColAccion)
      .input('accion', sql.NVarChar, params.accion)
      .input('entidad', sql.NVarChar, params.entidad ?? null)
      .input('idEntidad', sql.Int, params.idEntidad ?? null)
      .input('detallePrevio', sql.NVarChar, params.detallePrevio ? JSON.stringify(params.detallePrevio) : null)
      .input('detalleNuevo', sql.NVarChar, params.detalleNuevo ? JSON.stringify(params.detalleNuevo) : null)
      .input('ip', sql.NVarChar, params.ip ?? null)
      .query(`
        INSERT INTO UsuarioAuditLog
          (IDColAccion, Accion, Entidad, IDEntidad, DetallePrevio, DetalleNuevo, IP)
        VALUES
          (@idColAccion, @accion, @entidad, @idEntidad, @detallePrevio, @detalleNuevo, @ip)
      `);
  } catch (err) {
    console.error('Audit log error:', err);
  }
}
