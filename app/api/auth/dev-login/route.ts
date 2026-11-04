import { NextRequest, NextResponse } from 'next/server';
import { signToken, ponerCookieSesion } from '@/lib/auth';
import { buildSessionPayload } from '@/lib/users';

// Login de desarrollo: emite sesión para un Usuario real de AdelanteSBX
// SIN validar contraseña. Solo habilitado fuera de producción. El login real
// con contraseña vive en /api/auth/login.
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

    const { token, segundos } = signToken(payload);
    const res = NextResponse.json({ ok: true, usuario: payload });
    ponerCookieSesion(res, token, segundos);
    return res;
  } catch (err) {
    console.error('/api/auth/dev-login error:', err);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
