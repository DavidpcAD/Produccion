import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { revocarSesion } from '@/lib/sesiones';
import { logAudit } from '@/lib/audit';
import { tokenDeRequest } from '@/lib/movil/sesion';

// Cerrar sesión en el teléfono: se revoca el jti del token (igual que la web),
// así una copia del token deja de valer aunque no haya vencido. Siempre 204: el
// teléfono borra su token pase lo que pase.
export async function POST(req: Request) {
  const token = tokenDeRequest(req);
  const s = token ? verifyToken(token) : null;
  if (s?.jti && s.idUsuario > 0) {
    try {
      await revocarSesion(s.jti, s.idUsuario);
      await logAudit({ idColAccion: s.idCol, accion: 'LOGOUT', detalleNuevo: { idUsuario: s.idUsuario, app: 'maquinaria' } });
    } catch (err) {
      console.error('/api/movil/auth/logout: no se pudo revocar:', err);
    }
  }
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
