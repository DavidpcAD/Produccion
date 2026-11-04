import { getDb, sql } from './db';
import { SEGUNDOS_SIN_USO } from './sesion-duracion';

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
 * request; `cargarSesion` trae roles, revocación y estado de la cuenta en la
 * MISMA ida a la base.
 *
 * Desde que la sesión se renueva sola (lib/sesion-duracion.ts) esto pesa más:
 * una sesión ya no se apaga sola a las 8 h, así que lo que la corta es esto.
 */

/**
 * Huella de la contraseña guardada: 16 caracteres del SHA-256 del hash. Va en el
 * token al entrar y se compara en cada request: si alguien le cambia la
 * contraseña a la persona (en RH o donde sea), la huella deja de coincidir y
 * las sesiones abiertas con la contraseña vieja dejan de valer.
 *
 * Se calcula EN LA BASE para que el hash bcrypt no tenga que viajar al app en
 * cada request, y siempre con esta misma expresión (al entrar y al verificar),
 * así no importa si la columna es varchar o nvarchar. No sirve para adivinar
 * nada: es un pedazo del SHA de un bcrypt.
 */
export const HUELLA_CLAVE_SQL =
  "LEFT(CONVERT(char(64), HASHBYTES('SHA2_256', u.passwordHash), 2), 16)";

export interface RolDeUsuario {
  idRol: number;
  nombre: string;
  idApp?: number;
  tipo?: string;
}

export interface SesionCargada {
  roles: RolDeUsuario[];
  revocada: boolean;
  /** La cuenta existe y RH la tiene activa (dbo.Colaborador.esActivo). */
  activa: boolean;
  /** Huella actual de la contraseña (ver HUELLA_CLAVE_SQL). null si no hay. */
  huella: string | null;
}

let faltaTablaAvisado = false;
/** Una vez por proceso: el log no se llena, pero queda a la vista al arrancar. */
function avisarFaltaTabla() {
  if (faltaTablaAvisado) return;
  faltaTablaAvisado = true;
  console.error(
    'dbo.SesionRevocada no existe en esta base: «Cerrar sesión» borra la cookie pero no revoca el token. '
    + 'Aplicar migrations/2026-09-16_sesiones_revocadas.sql.',
  );
}

/** Hasta cuándo hay que recordar una revocación. Una sesión revocada ya no se
 *  puede renovar (/api/auth/renovar consulta esto antes de firmar), así que su
 *  último token vence, como mucho, SIN_USO después de ahora. */
const MS_RECORDAR_REVOCACION = SEGUNDOS_SIN_USO * 1000;

/**
 * Roles del usuario + si su sesión fue revocada + estado de la cuenta, en una
 * sola consulta.
 *
 * `emitidoEn` es el momento del login de esa sesión (claim `inicio`, o `iat` en
 * tokens de antes de la renovación; segundos epoch UTC). Un token cuenta como
 * revocado si hay una fila con su `jti`, o una fila de corte del usuario (jti
 * NULL) posterior al login. Se mide contra el login y no contra `iat` porque al
 * renovar `iat` avanza: una sesión abierta antes del corte no se salva por
 * haberse renovado después.
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
    // Viene en segundos; SQL necesita una fecha. Sin dato (tokens viejos) se
    // manda la fecha mínima: solo lo alcanza una revocación por jti.
    .input('emitidoEn', sql.DateTime2, emitidoEn ? new Date(emitidoEn * 1000) : new Date(0));

  const r = await req.query(`
    SELECT r.idRol, r.nombre, r.idApp, r.tipo
    FROM dbo.UsuarioRol ur
    JOIN dbo.Rol r ON r.idRol = ur.idRol
    WHERE ur.idUsuario = @idUsuario;

    SELECT c.esActivo, ${HUELLA_CLAVE_SQL} AS huella
    FROM dbo.Usuario u
    JOIN dbo.Colaborador c ON c.idColaborador = u.idColaborador
    WHERE u.idUsuario = @idUsuario;

    IF OBJECT_ID('dbo.SesionRevocada') IS NULL
      SELECT CAST(NULL AS int) AS revocada, 1 AS sinTabla;
    ELSE
      SELECT TOP 1 1 AS revocada, 0 AS sinTabla
      FROM dbo.SesionRevocada
      WHERE (jti IS NOT NULL AND @jti IS NOT NULL AND jti = @jti)
         OR (jti IS NULL AND idUsuario = @idUsuario AND revocadoEn > @emitidoEn);
  `);

  // Tres SELECT en una sola ida: [0] roles, [1] la cuenta, [2] revocación.
  //
  // El IF es porque la tabla de revocaciones viene de una migración
  // (2026-09-16_sesiones_revocadas.sql) que hay que aplicar a mano en cada base.
  // Sin el IF, una base sin la tabla hacía reventar la consulta ENTERA y
  // getSession seguía con el token sin mirar nada —tampoco si RH desactivó a la
  // persona o le cambió la contraseña—. Así, si falta, solo se pierde la
  // revocación, y queda dicho en el log.
  const recordsets = r.recordsets as unknown as [
    Array<{ idRol: number; nombre: string; idApp: number; tipo: string | null }>,
    Array<{ esActivo: boolean | number | null; huella: string | null }>,
    Array<{ revocada: number | null; sinTabla: number }>,
  ];
  const filasRoles = recordsets[0] ?? [];
  const cuenta = recordsets[1]?.[0];
  const filasRevocacion = recordsets[2] ?? [];
  if (filasRevocacion[0]?.sinTabla) avisarFaltaTabla();

  return {
    roles: filasRoles.map((x) => ({
      idRol: x.idRol,
      nombre: x.nombre,
      idApp: x.idApp,
      tipo: x.tipo?.trim() || undefined,
    })),
    revocada: filasRevocacion.some((f) => f.revocada === 1),
    activa: !!cuenta?.esActivo,
    huella: cuenta?.huella?.trim() || null,
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
    .input('expiraEn', sql.DateTime2, new Date(Date.now() + MS_RECORDAR_REVOCACION))
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
    .input('expiraEn', sql.DateTime2, new Date(Date.now() + MS_RECORDAR_REVOCACION))
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
