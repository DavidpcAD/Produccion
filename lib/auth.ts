import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { getRolesDeUsuario } from './users';
import { computeNivelAdmin } from './permissions';

const JWT_SECRET = process.env.JWT_SECRET!;
const COOKIE_NAME = 'adelante_session';

export interface JWTPayload {
  /** = idColaborador en el modelo nuevo (dbo.Colaborador). Se mantiene el
   *  nombre `idCol` por compatibilidad con el resto del código. */
  idCol: number;
  /** id en dbo.Usuario (login del modelo nuevo). 0 para usuarios de prueba. */
  idUsuario: number;
  /** cédula o username con el que entró el usuario. */
  cedula: string;
  nombre: string;
  /** ids de dbo.Rol asignados (vía dbo.UsuarioRol). */
  roles: number[];
  nivelAdmin: number;
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
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
  if (payload.idUsuario && payload.idUsuario > 0) {
    try {
      const roles = await getRolesDeUsuario(payload.idUsuario);
      return { ...payload, roles: roles.map(r => r.idRol), nivelAdmin: computeNivelAdmin(roles) };
    } catch {
      return payload; // si la DB falla, se usa lo del token
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
