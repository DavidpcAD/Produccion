import { getDb, sql } from './db';
import { JWTPayload } from './auth';
import { computeNivelAdmin, rolLabelDeUsuario } from './permissions';

// ─────────────────────────────────────────────────────────────────────────
// Acceso al modelo nuevo de AdelanteSBX (dbo):
//   Colaborador (datos persona) ── 1:1 ── Usuario (login: username/passwordHash)
//   Usuario ── N:N ── Rol   (vía UsuarioRol)
// ─────────────────────────────────────────────────────────────────────────

export interface UsuarioLogin {
  idUsuario: number;
  idColaborador: number;
  username: string;
  passwordHash: string;
  cedula: string;
  nombre: string;
  telefono: string | null;
  esActivo: boolean;
}

/** Busca un Usuario por username o por cédula del colaborador. */
export async function findUsuarioByLogin(login: string): Promise<UsuarioLogin | null> {
  const db = await getDb();
  const r = await db.request()
    .input('login', sql.NVarChar, login)
    .query(`
      SELECT TOP 1
        u.idUsuario, u.idColaborador, u.username, u.passwordHash,
        c.cedula, c.calcNombreCompleto AS nombre,
        COALESCE(NULLIF(u.telefono, ''), c.telefono) AS telefono,
        c.esActivo
      FROM dbo.Usuario u
      JOIN dbo.Colaborador c ON c.idColaborador = u.idColaborador
      WHERE u.username = @login OR c.cedula = @login
    `);
  const row = r.recordset[0];
  if (!row) return null;
  return {
    idUsuario: row.idUsuario,
    idColaborador: row.idColaborador,
    username: row.username,
    passwordHash: row.passwordHash,
    cedula: row.cedula,
    nombre: (row.nombre ?? '').trim(),
    telefono: row.telefono,
    esActivo: !!row.esActivo,
  };
}

/** Roles (idRol + nombre + tipo) asignados a un Usuario vía dbo.UsuarioRol.
 *  El `tipo` sale de `dbo.Rol.tipo` — la VARIANTE del rol ("Super Admin",
 *  "Electrico", "General"…) que distingue los roles homónimos de Producción
 *  (Administracion ×3, Ingenieria ×3) y que muestra la pantalla de roles.
 *  Ojo: NO confundir con `dbo.UsuarioRol.esTipo` ni el catálogo `dbo.TipoRol`
 *  (opciones de asignación, hoy todas "Indefinido") — eso es otra cosa. */
export async function getRolesDeUsuario(idUsuario: number): Promise<Array<{ idRol: number; nombre: string; idApp?: number; tipo?: string }>> {
  const db = await getDb();
  const r = await db.request()
    .input('idUsuario', sql.Int, idUsuario)
    .query(`
      SELECT r.idRol, r.nombre, r.idApp, r.tipo
      FROM dbo.UsuarioRol ur
      JOIN dbo.Rol r ON r.idRol = ur.idRol
      WHERE ur.idUsuario = @idUsuario
    `);
  return r.recordset.map((x: { idRol: number; nombre: string; idApp: number; tipo: string | null }) => ({
    idRol: x.idRol,
    nombre: x.nombre,
    idApp: x.idApp,
    tipo: x.tipo?.trim() || undefined,
  }));
}

/** Construye el payload del JWT (sesión) para un idUsuario del modelo nuevo. */
export async function buildSessionPayload(idUsuario: number): Promise<JWTPayload | null> {
  const db = await getDb();
  const ures = await db.request()
    .input('idUsuario', sql.Int, idUsuario)
    .query(`
      SELECT u.idUsuario, u.idColaborador, u.username, c.cedula,
             c.calcNombreCompleto AS nombre
      FROM dbo.Usuario u
      JOIN dbo.Colaborador c ON c.idColaborador = u.idColaborador
      WHERE u.idUsuario = @idUsuario
    `);
  const u = ures.recordset[0];
  if (!u) return null;

  const roles = await getRolesDeUsuario(idUsuario);
  return {
    idCol: u.idColaborador,
    idUsuario: u.idUsuario,
    cedula: u.cedula ?? u.username,
    username: u.username ?? undefined,
    nombre: (u.nombre ?? u.username ?? '').trim(),
    roles: roles.map(r => r.idRol),
    roleNames: roles.map(r => r.nombre ?? ''),
    rolLabel: rolLabelDeUsuario(roles),
    nivelAdmin: computeNivelAdmin(roles),
  };
}

/** Lista de usuarios reales para el selector de dev-login (solo desarrollo). */
export async function listUsuariosParaDev(): Promise<Array<{
  idUsuario: number; username: string; nombre: string; cedula: string;
  nivelAdmin: number; roles: string;
}>> {
  const db = await getDb();
  const r = await db.request().query(`
    SELECT u.idUsuario, u.username, c.cedula,
           c.calcNombreCompleto AS nombre,
           STRING_AGG(rol.nombre, ', ') AS roles
    FROM dbo.Usuario u
    JOIN dbo.Colaborador c ON c.idColaborador = u.idColaborador
    LEFT JOIN dbo.UsuarioRol ur ON ur.idUsuario = u.idUsuario
    LEFT JOIN dbo.Rol rol ON rol.idRol = ur.idRol
    GROUP BY u.idUsuario, u.username, c.cedula, c.calcNombreCompleto
    ORDER BY c.calcNombreCompleto
  `);
  // calcular nivel a partir de los idRol
  const rolesRes = await db.request().query(`
    SELECT ur.idUsuario, ur.idRol, r.nombre
    FROM dbo.UsuarioRol ur JOIN dbo.Rol r ON r.idRol = ur.idRol
  `);
  const byUser = new Map<number, Array<{ idRol: number; nombre: string }>>();
  for (const x of rolesRes.recordset) {
    const arr = byUser.get(x.idUsuario) ?? [];
    arr.push({ idRol: x.idRol, nombre: x.nombre });
    byUser.set(x.idUsuario, arr);
  }
  return r.recordset.map((row: {
    idUsuario: number; username: string; nombre: string; cedula: string; roles: string | null;
  }) => ({
    idUsuario: row.idUsuario,
    username: row.username,
    nombre: (row.nombre ?? '').trim(),
    cedula: row.cedula,
    roles: row.roles ?? '',
    nivelAdmin: computeNivelAdmin(byUser.get(row.idUsuario) ?? []),
  }));
}
