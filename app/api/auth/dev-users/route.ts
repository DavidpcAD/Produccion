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
    // Opcional, por máquina: DEV_LOGIN_USERS=stevencv,otro en .env.local deja en la
    // lista solo esos usernames. Sin la variable se listan todos (como siempre).
    const soloEstos = (process.env.DEV_LOGIN_USERS ?? '')
      .split(',').map(u => u.trim().toLowerCase()).filter(Boolean);
    const data = soloEstos.length
      ? usuarios.filter(u => soloEstos.includes(u.username.toLowerCase()))
      : usuarios;
    return NextResponse.json({ data });
  } catch (err) {
    console.error('/api/auth/dev-users error:', err);
    return NextResponse.json({ error: 'Error consultando usuarios' }, { status: 500 });
  }
}
