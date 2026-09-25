import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { cookies } from 'next/headers';
import { cargarSesion } from './sesiones';
import { computeNivelAdmin, computeAllowedModules, rolLabelDeUsuario } from './permissions';

const COOKIE_NAME = 'adelante_session';

// ─── El secreto de firma ─────────────────────────────────────────────────────
// Antes era `process.env.JWT_SECRET!`: el `!` le promete a TypeScript que está,
// pero en tiempo de ejecución nadie lo comprobaba. Si faltaba, `jwt.sign`
// reventaba recién al primer login —con un mensaje que no dice qué falta— y si
// alguien dejaba puesto el placeholder del .env.local.example, la app arrancaba
// tan campante firmando sesiones con un secreto público: cualquiera con ese
// texto se fabrica un token de Super Admin.
//
// Ahora se verifica al arrancar y se falla de una, con el nombre de la variable
// en el mensaje. Un secreto corto NO tumba el arranque (no sé cuál está puesto
// en producción y no es este cambio el que debe sacar a nadie del aire): queda
// como error en el log, para cambiarlo con calma.
const LARGO_MINIMO = 32;
const PLACEHOLDERS = ['cambia-esto-por-un-secreto-largo-aleatorio', 'changeme', 'secret'];

function leerSecreto(): string {
  const s = process.env.JWT_SECRET ?? '';
  if (!s) {
    throw new Error(
      'Falta la variable de entorno JWT_SECRET: sin ella no se pueden firmar ni verificar las sesiones.',
    );
  }
  if (PLACEHOLDERS.includes(s.trim().toLowerCase())) {
    throw new Error(
      'JWT_SECRET tiene todavía el valor de ejemplo. Es público: cualquiera podría firmarse una sesión de Super Admin. Poné uno aleatorio.',
    );
  }
  if (s.length < LARGO_MINIMO) {
    console.error(
      `JWT_SECRET tiene ${s.length} caracteres; se recomiendan al menos ${LARGO_MINIMO} aleatorios. Un secreto corto se rompe por fuerza bruta y con él se firman sesiones de cualquier usuario.`,
    );
  }
  return s;
}

const JWT_SECRET = leerSecreto();

export interface JWTPayload {
  /** = idColaborador en el modelo nuevo (dbo.Colaborador). Se mantiene el
   *  nombre `idCol` por compatibilidad con el resto del código. */
  idCol: number;
  /** id en dbo.Usuario (login del modelo nuevo). 0 para usuarios de prueba. */
  idUsuario: number;
  /** cédula o username con el que entró el usuario. */
  cedula: string;
  nombre: string;
  /** username de login (dbo.Usuario.username) — id ESTABLE para atribuir autoría
   *  (ej. filtrar "mis solicitudes" de Compras por creador). undefined en tokens
   *  viejos y en usuarios de prueba. */
  username?: string;
  /** ids de dbo.Rol asignados (vía dbo.UsuarioRol). */
  roles: number[];
  /** nombres de los roles, alineados por índice con `roles`. */
  roleNames?: string[];
  /** Etiqueta del rol de Producción (nombre · tipo) para el pie del menú.
   *  undefined = sin rol de Producción → el front usa la etiqueta por nivel. */
  rolLabel?: string;
  /** Módulos de Producción habilitados (rol+tipo). undefined = sin rol de
   *  Producción → el front cae al filtro por nivel. Calculado en getSession. */
  modules?: string[];
  nivelAdmin: number;
  /** Id de ESTA sesión. Lo pone `signToken`; es lo que permite revocarla sin
   *  esperar a que venza el token (ver lib/sesiones.ts). Los tokens emitidos
   *  antes de esto no lo traen: siguen valiendo hasta vencer, pero solo se les
   *  puede cortar con una revocación total del usuario. */
  jti?: string;
  /** Emisión del token (segundos epoch UTC). Lo agrega `jwt.sign` solo. */
  iat?: number;
}

export function signToken(payload: JWTPayload): string {
  // `jti` nuevo en cada firma: identifica esta sesión y nada más. Si el payload
  // viniera con uno viejo se descarta, para no reusar el id de otra sesión.
  const { jti: _viejo, iat: _iat, ...limpio } = payload;
  return jwt.sign(limpio, JWT_SECRET, { expiresIn: '8h', jwtid: randomUUID() });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;

  // Para usuarios reales (idUsuario > 0) se recalculan roles y nivel desde la
  // base en cada lectura de sesión, así los cambios de rol se reflejan sin
  // necesidad de re-loguear (el token solo identifica a la persona). Los
  // usuarios de prueba (idUsuario 0) conservan lo que trae el token.
  // En la MISMA consulta se mira si la sesión fue revocada (logout), así la
  // revocación no cuesta un viaje extra a la base.
  if (payload.idUsuario && payload.idUsuario > 0) {
    try {
      const { roles, revocada } = await cargarSesion(payload.idUsuario, payload.jti, payload.iat);
      if (revocada) return null; // cerró sesión: el token ya no vale
      return {
        ...payload,
        roles: roles.map(r => r.idRol),
        roleNames: roles.map(r => r.nombre ?? ''),
        rolLabel: rolLabelDeUsuario(roles),
        modules: computeAllowedModules(roles) ?? undefined,
        nivelAdmin: computeNivelAdmin(roles),
      };
    } catch (err) {
      // Si la base no responde se sigue con lo que trae el token, igual que
      // antes. Es deliberado: cerrar el paso dejaría la app inutilizable ante
      // cualquier hipo de la base, y el token ya está firmado y sin vencer. El
      // costo es que mientras la base esté caída una sesión revocada podría
      // pasar, hasta que venza el token.
      console.error('getSession: no se pudo verificar la sesión contra la base:', err);
      return payload;
    }
  }
  return payload;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export { COOKIE_NAME };
