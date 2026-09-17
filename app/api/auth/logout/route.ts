import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, verifyToken } from '@/lib/auth';
import { revocarSesion, limpiarRevocacionesVencidas } from '@/lib/sesiones';
import { logAudit } from '@/lib/audit';

// Se usa un Location RELATIVO ('/login') para que el navegador resuelva contra
// el dominio actual (usuarios.adelante.cr) y no salte al host interno de Azure
// (usuarios-ad.azurewebsites.net).
function logoutResponse() {
  const res = new NextResponse(null, { status: 303, headers: { Location: '/login' } });
  res.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/', httpOnly: true });
  return res;
}

/**
 * Cierra la sesión de verdad.
 *
 * Antes esto solo borraba la cookie: el token seguía siendo válido hasta las
 * 8 h, así que una copia suya (otra máquina, un log, una computadora
 * compartida) entraba igual. Ahora además se anota el id de sesión (jti) como
 * revocado, y `getSession` lo rechaza desde el siguiente request.
 *
 * La cookie se borra pase lo que pase: si la base falla, el usuario igual sale
 * de este navegador — nunca se le deja la sesión abierta en la cara por un
 * error de servidor.
 */
async function cerrarSesion(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const session = token ? verifyToken(token) : null;

  if (session?.jti && session.idUsuario > 0) {
    try {
      await revocarSesion(session.jti, session.idUsuario);
      await logAudit({
        idColAccion: session.idCol,
        accion: 'LOGOUT',
        ip: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '',
        detalleNuevo: { idUsuario: session.idUsuario },
      });
    } catch (err) {
      // Queda la sesión revocable solo por vencimiento. Se registra para poder
      // verlo: un logout que no revocó es justo lo que hay que poder auditar.
      console.error('/api/auth/logout: no se pudo revocar la sesión:', err);
    }

    // Barrido de las revocaciones ya vencidas, de vez en cuando: no hay cron en
    // este proyecto y la tabla no debe crecer para siempre. Es un DELETE por
    // índice y el logout no es una ruta caliente, así que 1 de cada 20 alcanza.
    if (Math.random() < 0.05) {
      limpiarRevocacionesVencidas().catch(() => { /* no afecta al logout */ });
    }
  }

  return logoutResponse();
}

export async function POST(req: NextRequest) {
  return cerrarSesion(req);
}

export async function GET(req: NextRequest) {
  return cerrarSesion(req);
}
