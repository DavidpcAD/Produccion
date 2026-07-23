import { NextResponse } from 'next/server';
import { listUsuariosParaDev } from '@/lib/users';

// Solo disponible en desarrollo local. En producción el login es normal
// (usuario + contraseña + verificación SMS) para todos, sin atajo sin contraseña.
function devEnabled() {
  return process.env.NODE_ENV !== 'production';
}

export async function GET() {
  if (!devEnabled()) {
    return NextResponse.json({ error: 'No disponible' }, { status: 404 });
  }
  try {
    const usuarios = await listUsuariosParaDev();
    return NextResponse.json({ data: usuarios });
  } catch (err) {
    console.error('/api/auth/dev-users error:', err);
    return NextResponse.json({ error: 'Error consultando usuarios' }, { status: 500 });
  }
}
