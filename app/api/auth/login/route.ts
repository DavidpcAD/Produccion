import { NextRequest, NextResponse } from 'next/server';
import { comparePassword, signToken, COOKIE_NAME } from '@/lib/auth';
import { findUsuarioByLogin, buildSessionPayload } from '@/lib/users';

// Usuarios de prueba (solo para desarrollo, sin base de datos)
const DEV_USERS: Record<string, { idCol: number; cedula: string; nombre: string; nivelAdmin: number; roles: number[] }> = {
  'TEST001': { idCol: -1, cedula: 'TEST001', nombre: 'Empleado Test',    nivelAdmin: 1, roles: [1] },
  'TEST002': { idCol: -2, cedula: 'TEST002', nombre: 'Admin Test',       nivelAdmin: 2, roles: [1, 2] },
  'TEST004': { idCol: -4, cedula: 'TEST004', nombre: 'SuperAdmin Test',  nivelAdmin: 4, roles: [1, 2, 4] },
};
const DEV_PASSWORD = 'test1234';

function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60,
    path: '/',
  });
}

export async function POST(req: NextRequest) {
  try {
    const { cedula, password } = await req.json();
    if (!cedula || !password) {
      return NextResponse.json({ error: 'Cédula y contraseña requeridas' }, { status: 400 });
    }

    // Bypass de base de datos para usuarios de prueba
    const devUser = DEV_USERS[cedula];
    if (devUser) {
      if (password !== DEV_PASSWORD) {
        return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
      }
      const token = signToken({
        idCol: devUser.idCol, idUsuario: 0, cedula: devUser.cedula,
        nombre: devUser.nombre, roles: devUser.roles, nivelAdmin: devUser.nivelAdmin,
      });
      const res = NextResponse.json({ ok: true });
      setSessionCookie(res, token);
      return res;
    }

    // Modelo nuevo (AdelanteSBX): login por cédula o username -> dbo.Usuario
    const user = await findUsuarioByLogin(cedula);
    if (!user) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
    }
    if (!user.esActivo) {
      return NextResponse.json({ error: 'Usuario inactivo. Contacta a RRHH.' }, { status: 403 });
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
    }

    // Sin OTP: se crea la sesión directamente al validar usuario + contraseña.
    const payload = await buildSessionPayload(user.idUsuario);
    if (!payload) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }
    const token = signToken(payload);
    const res = NextResponse.json({ ok: true });
    setSessionCookie(res, token);
    return res;
  } catch (err) {
    console.error('/api/auth/login error:', err);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
