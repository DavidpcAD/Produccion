import { NextRequest, NextResponse } from 'next/server';
import { signToken, COOKIE_NAME } from '@/lib/auth';
import { buildSessionPayload } from '@/lib/users';

// Login de desarrollo: emite sesión para un Usuario real de AdelanteSBX
// SIN validar contraseña. Solo habilitado fuera de producción. El login real
// con contraseña+OTP vive en /api/auth/login y /api/auth/verify-otp.
function devEnabled() {
  return process.env.NODE_ENV !== 'production';
}

export async function POST(req: NextRequest) {
  if (!devEnabled()) {
    return NextResponse.json({ error: 'No disponible' }, { status: 404 });
  }
  try {
    const { idUsuario } = await req.json();
    if (!idUsuario) {
      return NextResponse.json({ error: 'idUsuario requerido' }, { status: 400 });
    }

    const payload = await buildSessionPayload(Number(idUsuario));
    if (!payload) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const token = signToken(payload);
    const res = NextResponse.json({ ok: true, usuario: payload });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 60 * 60,
      path: '/',
    });
    return res;
  } catch (err) {
    console.error('/api/auth/dev-login error:', err);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
