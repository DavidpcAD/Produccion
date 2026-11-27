import { NextRequest, NextResponse } from 'next/server';
import { comparePassword, signToken } from '@/lib/auth';
import { findUsuarioByLogin, buildSessionPayload } from '@/lib/users';
import { logAudit } from '@/lib/audit';
import { checkRateLimit, registrarFallo, limpiarIntentos, ipDeRequest } from '@/lib/rate-limit';
import { mensajeSinRol, perfilesMovil } from '@/lib/movil/sesion';

// Login de la app móvil de maquinaria. Es el MISMO login de la web (cédula o
// usuario + contraseña contra dbo.Usuario, mismos techos de intentos, misma
// bitácora), con dos diferencias:
//   · el token vuelve en el cuerpo (el teléfono lo guarda en SecureStore y lo
//     manda en `Authorization: Bearer`), no en una cookie;
//   · solo entra quien tiene el rol de Producción "Operario Maquinaria" o
//     "Mecánico"; la respuesta dice con qué perfiles (la app arma sus pestañas).
const LIMITE_CUENTA = { maxFallos: 5, ventanaMs: 15 * 60_000, bloqueoMs: 15 * 60_000 };
const LIMITE_IP = { maxFallos: 25, ventanaMs: 15 * 60_000, bloqueoMs: 15 * 60_000 };

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export async function POST(req: NextRequest) {
  const ip = ipDeRequest(req);
  const llaveIp = `login:ip:${ip}`;
  try {
    const body = await req.json().catch(() => null);
    const login = typeof body?.usuario === 'string' ? body.usuario.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!login || !password) return json({ error: 'Escribí tu cédula o usuario y la contraseña.' }, 400);
    const llaveCuenta = `login:cuenta:${login.toLowerCase().slice(0, 64)}`;

    const porIp = checkRateLimit(llaveIp);
    if (porIp.limitado) return json({ error: 'Demasiados intentos. Probá de nuevo en unos minutos.' }, 429, { 'Retry-After': String(porIp.reintentarEn) });
    const porCuenta = checkRateLimit(llaveCuenta);
    if (porCuenta.limitado) return json({ error: 'Demasiados intentos. Probá de nuevo en unos minutos.' }, 429, { 'Retry-After': String(porCuenta.reintentarEn) });

    const user = await findUsuarioByLogin(login);
    if (!user || !(await comparePassword(password, user.passwordHash))) {
      registrarFallo(llaveIp, LIMITE_IP);
      const r = registrarFallo(llaveCuenta, LIMITE_CUENTA);
      await logAudit({
        idColAccion: user?.idColaborador ?? null, permitirSinActor: !user, accion: 'LOGIN_FALLIDO', ip,
        detalleNuevo: { login: login.slice(0, 64), app: 'maquinaria', motivo: user ? 'password_incorrecta' : 'usuario_no_encontrado', bloqueado: r.limitado },
      });
      return json({ error: 'Usuario o contraseña incorrectos.' }, 401);
    }
    if (!user.esActivo) return json({ error: 'Tu usuario está inactivo. Hablá con Recursos Humanos.' }, 403);

    const payload = await buildSessionPayload(user.idUsuario);
    if (!payload) return json({ error: 'Usuario no encontrado.' }, 404);
    const perfiles = perfilesMovil(payload.modules);
    if (!perfiles.length) return json({ error: mensajeSinRol() }, 403);

    const { token, segundos } = signToken(payload);
    limpiarIntentos(llaveCuenta);
    await logAudit({
      idColAccion: user.idColaborador, accion: 'LOGIN_OK', ip,
      detalleNuevo: { login: login.slice(0, 64), idUsuario: user.idUsuario, app: 'maquinaria' },
    });
    return json({ token, venceEn: segundos, nombre: payload.nombre, usuario: payload.username ?? null, perfiles });
  } catch (err) {
    console.error('/api/movil/auth/login error:', err);
    return json({ error: 'Error del servidor. Probá de nuevo.' }, 500);
  }
}
