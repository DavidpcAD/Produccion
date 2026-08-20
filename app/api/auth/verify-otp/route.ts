import { NextRequest, NextResponse } from 'next/server';
import { signToken, COOKIE_NAME } from '@/lib/auth';
import { verifyOTP } from '@/lib/otp';
import { buildSessionPayload } from '@/lib/users';

export async function POST(req: NextRequest) {
  try {
    const { idCol, code } = await req.json();
    if (!idCol || !code) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
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
