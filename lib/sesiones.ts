import { getDb, sql } from './db';

/**
 * Revocación de sesiones.
 *
 * El problema que resuelve: la sesión es un JWT de 8 h y "cerrar sesión" solo
 * borraba la cookie del navegador. El token seguía siendo válido hasta vencer,
 * así que quien lo hubiera copiado entraba igual, y no había forma de echar a
 * nadie antes de las 8 h.
 *
 * Cómo: cada token lleva un id de sesión (`jti`). `dbo.SesionRevocada` lista
 * los que dejaron de valer, de dos formas:
 *   - fila con `jti`            -> muere ESA sesión (el logout de un dispositivo).
 *   - fila con `jti` NULL       -> mueren TODAS las del usuario emitidas antes
 *                                  de `revocadoEn` (contraseña cambiada, cuenta
 *                                  comprometida, salida de la empresa).
 *
 * Coste: cero viajes extra. `getSession()` ya consultaba los roles en cada
 * request; `cargarSesion` trae roles y revocación en la MISMA ida a la base.
 */

export interface RolDeUsuario {
  idRol: number;
  nombre: string;
  idApp?: number;
  tipo?: string;
}

export interface SesionCargada {
  roles: RolDeUsuario[];
  revocada: boolean;
}

/** Duración del token (8 h en `signToken`). Se usa para saber hasta cuándo hay
 *  que recordar una revocación: pasado eso el JWT ya está vencido por su cuenta. */
const HORAS_TOKEN = 8;

/**
 * Roles del usuario + si su sesión fue revocada, en una sola consulta.
 *
 * `emitidoEn` es el claim `iat` del JWT (segundos epoch UTC). Un token cuenta
 * como revocado si hay una fila con su `jti`, o una fila de corte del usuario
 * (jti NULL) posterior al momento en que ese token se emitió.
 *
 * Si algo falla, lanza: el llamador decide. Ver la nota de `getSession`.
 */
export async function cargarSesion(
  idUsuario: number,
  jti: string | undefined,
  emitidoEn: number | undefined,
): Promise<SesionCargada> {
  const db = await getDb();
  const req = db
    .request()
    .input('idUsuario', sql.Int, idUsuario)
    .input('jti', sql.NVarChar(64), jti ?? null)
    // `iat` viene en segundos; SQL necesita una fecha. Sin iat (tokens viejos)
    // se manda la fecha mínima: solo lo alcanza una revocación por jti.
    .input('emitidoEn', sql.DateTime2, emitidoEn ? new Date(emitidoEn * 1000) : new Date(0));

  const r = await req.query(`
    SELECT r.idRol, r.nombre, r.idApp, r.tipo
    FROM dbo.UsuarioRol ur
    JOIN dbo.Rol r ON r.idRol = ur.idRol
    WHERE ur.idUsuario = @idUsuario;

    SELECT TOP 1 1 AS revocada
    FROM dbo.SesionRevocada
    WHERE (jti IS NOT NULL AND @jti IS NOT NULL AND jti = @jti)
       OR (jti IS NULL AND idUsuario = @idUsuario AND revocadoEn > @emitidoEn);
  `);

  // Dos SELECT en una sola ida: recordsets[0] = roles, recordsets[1] = revocación.
  const recordsets = r.recordsets as unknown as [
    Array<{ idRol: number; nombre: string; idApp: number; tipo: string | null }>,
    Array<{ revocada: number }>,
  ];
  const filasRoles = recordsets[0] ?? [];
  const filasRevocacion = recordsets[1] ?? [];

  return {
    roles: filasRoles.map((x) => ({
      idRol: x.idRol,
      nombre: x.nombre,
      idApp: x.idApp,
      tipo: x.tipo?.trim() || undefined,
    })),
    revocada: filasRevocacion.length > 0,
  };
}

/** Mata UNA sesión: la que corresponde a ese `jti`. Es lo que hace el logout. */
export async function revocarSesion(
  jti: string,
  idUsuario: number,
  motivo = 'logout',
): Promise<void> {
  const db = await getDb();
  await db
    .request()
    .input('jti', sql.NVarChar(64), jti)
    .input('idUsuario', sql.Int, idUsuario)
    .input('expiraEn', sql.DateTime2, new Date(Date.now() + HORAS_TOKEN * 3600_000))
    .input('motivo', sql.NVarChar(50), motivo)
    .query(`
      INSERT dbo.SesionRevocada (jti, idUsuario, expiraEn, motivo)
      VALUES (@jti, @idUsuario, @expiraEn, @motivo)
    `);
}

/**
 * Mata TODAS las sesiones abiertas de una persona. Para cuando cambia su
 * contraseña, se sospecha de la cuenta, o deja la empresa: con esto no hay que
 * esperar a que venzan los tokens que ya andan dando vueltas.
 */
export async function revocarTodasLasSesiones(
  idUsuario: number,
  motivo = 'revocacion-total',
): Promise<void> {
  const db = await getDb();
  await db
    .request()
    .input('idUsuario', sql.Int, idUsuario)
    .input('expiraEn', sql.DateTime2, new Date(Date.now() + HORAS_TOKEN * 3600_000))
    .input('motivo', sql.NVarChar(50), motivo)
    .query(`
      INSERT dbo.SesionRevocada (jti, idUsuario, expiraEn, motivo)
      VALUES (NULL, @idUsuario, @expiraEn, @motivo)
    `);
}

/**
 * Borra las revocaciones ya vencidas: pasada `expiraEn` el token al que
 * apuntaban está vencido por su cuenta y la fila no aporta nada. Sin esto la
 * tabla crece para siempre. Devuelve cuántas borró.
 */
export async function limpiarRevocacionesVencidas(): Promise<number> {
  const db = await getDb();
  const r = await db.request().query(`
    DELETE FROM dbo.SesionRevocada WHERE expiraEn < SYSUTCDATETIME()
  `);
  return r.rowsAffected[0] ?? 0;
}
