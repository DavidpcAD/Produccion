import { NextRequest, NextResponse } from 'next/server';
import { signToken, COOKIE_NAME } from '@/lib/auth';
import { verifyOTP } from '@/lib/otp';
import { buildSessionPayload } from '@/lib/users';

// Usuarios de prueba (mismo mapa que en login/route.ts)
const DEV_USERS: Record<number, { idCol: number; cedula: string; nombre: string; nivelAdmin: number; roles: number[] }> = {
  [-1]: { idCol: -1, cedula: 'TEST001', nombre: 'Empleado Test',   nivelAdmin: 1, roles: [1] },
  [-2]: { idCol: -2, cedula: 'TEST002', nombre: 'Admin Test',      nivelAdmin: 2, roles: [1, 2] },
  [-4]: { idCol: -4, cedula: 'TEST004', nombre: 'SuperAdmin Test', nivelAdmin: 4, roles: [1, 2, 4] },
};
const DEV_OTP = '000000';

export async function POST(req: NextRequest) {
  try {
    const { idCol, code } = await req.json();
    if (!idCol || !code) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    // Bypass OTP para usuarios de prueba — SOLO fuera de producción.
    const devUser = process.env.NODE_ENV !== 'production' ? DEV_USERS[idCol as number] : undefined;
    if (devUser) {
      if (code !== DEV_OTP) {
        return NextResponse.json({ error: 'Código incorrecto o expirado' }, { status: 401 });
      }
      const token = signToken({
        idCol: devUser.idCol,
        idUsuario: 0,
        cedula: devUser.cedula,
        nombre: devUser.nombre,
        roles: devUser.roles,
        nivelAdmin: devUser.nivelAdmin,
      });
      const res = NextResponse.json({ ok: true });
      res.cookies.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 8 * 60 * 60,
        path: '/',
      });
      return res;
    }

    // Modelo nuevo: "idCol" que envía la UI es en realidad el idUsuario
    const valid = await verifyOTP(idCol, code);
    if (!valid) {
      return NextResponse.json({ error: 'Código incorrecto o expirado' }, { status: 401 });
    }

    const payload = await buildSessionPayload(idCol);
    if (!payload) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const token = signToken(payload);

    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60,
      path: '/',
    });

    return res;
  } catch (err) {
    console.error('/api/auth/verify-otp error:', err);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
