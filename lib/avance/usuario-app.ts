import type { ConnectionPool } from 'mssql';
import { sql } from '@/lib/db-adelantedb';
import type { JWTPayload } from '@/lib/auth';

/**
 * Resuelve el id de `pro_obc.usuarios_app` que corresponde al usuario de la
 * sesión de Producción, para atribuir el avance SIN violar la FK
 * FK_avance_usuario (avance_sub_partidas.usuario_id → usuarios_app.id).
 *
 * `usuarios_app` es el padrón propio de la app de obrascontrol (login por PIN de
 * campo). Los usuarios de Producción viven en dbo.Usuario/Colaborador y NO están
 * ahí, así que `session.idCol` (idColaborador) NO es un id válido de usuarios_app
 * → escribirlo directo revienta la FK y bloquea el registro de avance.
 *
 * Estrategia: enlazar por `usuario` = username | cédula. Si existe, se usa ese id.
 * Si no existe (caso normal de un admin web), se devuelve `null`: la columna
 * usuario_id admite NULL, así que el avance se registra igual (sin autor de
 * usuarios_app) en vez de fallar. No se crean filas en el padrón de campo.
 */
export async function resolverUsuarioAppId(
  db: ConnectionPool,
  session: Pick<JWTPayload, 'cedula' | 'nombre' | 'username'>,
): Promise<number | null> {
  const usuario = (session.username || session.cedula || '').trim().slice(0, 50);
  if (!usuario) return null;
  try {
    const r = await db
      .request()
      .input('u', sql.VarChar(50), usuario)
      .query<{ id: number }>('SELECT TOP 1 id FROM pro_obc.usuarios_app WHERE usuario = @u');
    return r.recordset[0]?.id ?? null;
  } catch {
    return null;
  }
}
