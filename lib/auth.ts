import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { cargarSesion } from './sesiones';
import { SEGUNDOS_SIN_USO, SEGUNDOS_TOPE } from './sesion-duracion';
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
// Ahora se verifica, pero LA PRIMERA VEZ QUE SE USA, no al evaluar el módulo.
// Esa diferencia importa: `next build` evalúa los módulos de cada ruta para
// recolectar su configuración, y el runner del CI no tiene JWT_SECRET porque
// solo compila —no corre la app—. Validar arriba tumbaba el build entero con
// "Failed to collect configuration for /api/auth/logout", que es un mensaje que
// no lleva a ninguna parte. Verificándolo acá, el build pasa y quien se queda
// sin secreto es el proceso que de verdad iba a firmar una sesión.
//
// Falla cerrado: sin secreto, `signToken` tira (el login devuelve 500 con el
// motivo en el log) y `verifyToken` devuelve null (toda sesión va al login).
// Un secreto corto NO tumba nada: queda como error en el log, para cambiarlo con
// calma.
const LARGO_MINIMO = 32;
const PLACEHOLDERS = ['cambia-esto-por-un-secreto-largo-aleatorio', 'changeme', 'secret'];

let secretoOk: string | null = null;

function secreto(): string {
  if (secretoOk !== null) return secretoOk;
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
    // Una sola vez por proceso: se memoriza abajo, así no ensucia un log por request.
    console.error(
      `JWT_SECRET tiene ${s.length} caracteres; se recomiendan al menos ${LARGO_MINIMO} aleatorios. Un secreto corto se rompe por fuerza bruta y con él se firman sesiones de cualquier usuario.`,
    );
  }
  secretoOk = s;
  return s;
}

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
  /** Emisión del token (segundos epoch UTC). Lo agrega `jwt.sign` solo. Al
   *  renovar avanza: dice cuándo se firmó ESTE token, no cuándo se entró. */
  iat?: number;
  /** Vencimiento (segundos epoch UTC). Lo agrega `jwt.sign` solo. */
  exp?: number;
  /** Cuándo se entró con contraseña (segundos epoch UTC). Se conserva al
   *  renovar: el tope de lib/sesion-duracion.ts cuenta desde acá. Los tokens de
   *  antes de la renovación no lo traen y usan `iat`, que en ellos es lo mismo. */
  inicio?: number;
  /** Huella de la contraseña con que se entró (ver HUELLA_CLAVE_SQL en
   *  lib/sesiones.ts). Si ya no coincide con la guardada, la sesión no vale. */
  huella?: string;
}

/** Para renovar: la sesión que sigue, con su id y su hora de entrada. */
export interface SesionQueSigue {
  jti: string;
  inicio: number;
}

/**
 * Firma el token de una sesión.
 *
 * Sin `sigue` es una sesión NUEVA (un login): `jti` nuevo y el reloj del tope
 * arranca ahora. Con `sigue` es una RENOVACIÓN (/api/auth/renovar): mismo `jti`
 * —así «Cerrar sesión» sigue matando todas las copias de esta sesión, también
 * las firmadas antes— y mismo `inicio`.
 *
 * Dura SIN_USO, recortado para no pasarse del tope. `segundos` es lo que tiene
 * que durar la cookie, para que se vaya junto con el token.
 */
export function signToken(payload: JWTPayload, sigue?: SesionQueSigue): { token: string; segundos: number } {
  // Lo que firma `jwt.sign` (o la renovación) se descarta del payload: si
  // viniera un `jti` viejo se reusaría el id de otra sesión, y con `exp` puesto
  // `jwt.sign` se niega a firmar con `expiresIn`.
  const limpio: Partial<JWTPayload> = { ...payload };
  delete limpio.jti;
  delete limpio.iat;
  delete limpio.exp;
  delete limpio.inicio;
  const ahora = Math.floor(Date.now() / 1000);
  const inicio = sigue?.inicio ?? ahora;
  const segundos = Math.min(SEGUNDOS_SIN_USO, inicio + SEGUNDOS_TOPE - ahora);
  if (segundos <= 0) throw new Error('signToken: la sesión ya llegó al tope; hay que entrar de nuevo.');
  const token = jwt.sign({ ...limpio, inicio }, secreto(), {
    expiresIn: segundos,
    jwtid: sigue?.jti ?? randomUUID(),
  });
  return { token, segundos };
}

/** La cookie de sesión. Una sola definición para el login, el de desarrollo y
 *  la renovación: si cambia algo (duración, sameSite) cambia en los tres. */
export function ponerCookieSesion(res: NextResponse, token: string, segundos: number) {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: segundos,
    path: '/',
  });
}

/** ¿Lo que dice la base deja seguir a esta sesión? Lo comparten getSession (en
 *  cada request) y la renovación, para que no puedan separarse. */
export function sesionSigueValiendo(
  payload: JWTPayload,
  base: { revocada: boolean; activa: boolean; huella: string | null },
): boolean {
  if (base.revocada) return false; // cerró sesión, o le cortaron todas
  if (!base.activa) return false; // RH la desactivó (o la cuenta ya no está)
  // Le cambiaron la contraseña. Un token sin huella es de antes de esto: vale
  // hasta que se renueve, y al renovar ya sale con la huella de hoy.
  if (payload.huella && payload.huella !== base.huella) return false;
  return true;
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, secreto()) as JWTPayload;
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
  // En la MISMA consulta se mira si la sesión fue revocada (logout), si RH
  // desactivó a la persona y si le cambiaron la contraseña: con la sesión
  // renovándose sola, esto es lo que la corta (ver lib/sesion-duracion.ts).
  if (payload.idUsuario && payload.idUsuario > 0) {
    try {
      const base = await cargarSesion(payload.idUsuario, payload.jti, payload.inicio ?? payload.iat);
      if (!sesionSigueValiendo(payload, base)) return null;
      const { roles } = base;
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
