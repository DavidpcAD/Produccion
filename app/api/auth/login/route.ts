import { NextRequest, NextResponse } from 'next/server';
import { comparePassword, signToken, COOKIE_NAME } from '@/lib/auth';
import { findUsuarioByLogin, buildSessionPayload } from '@/lib/users';
import { logAudit } from '@/lib/audit';
import { checkRateLimit, registrarFallo, limpiarIntentos, ipDeRequest } from '@/lib/rate-limit';

function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60,
    path: '/',
  });
}

// Dos techos a la vez, porque tapan ataques distintos: el de la cuenta frena el
// que prueba mil contraseñas contra una cédula (aunque rote de IP), y el de la
// IP frena al que rota cédulas desde un mismo lugar.
const LIMITE_CUENTA = { maxFallos: 5, ventanaMs: 15 * 60_000, bloqueoMs: 15 * 60_000 };
const LIMITE_IP = { maxFallos: 25, ventanaMs: 15 * 60_000, bloqueoMs: 15 * 60_000 };

function respuesta429(reintentarEn: number) {
  return NextResponse.json(
    { error: 'Demasiados intentos. Probá de nuevo en unos minutos.' },
    { status: 429, headers: { 'Retry-After': String(reintentarEn) } },
  );
}

export async function POST(req: NextRequest) {
  const ip = ipDeRequest(req);
  const llaveIp = `login:ip:${ip}`;

  try {
    const body = await req.json().catch(() => null);
    const cedula = typeof body?.cedula === 'string' ? body.cedula : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!cedula || !password) {
      return NextResponse.json({ error: 'Cédula y contraseña requeridas' }, { status: 400 });
    }
    // La llave sale del input, así que se normaliza y se recorta: sin el tope,
    // mandar logins enormes distintos haría crecer el Map a voluntad.
    const llaveCuenta = `login:cuenta:${cedula.trim().toLowerCase().slice(0, 64)}`;

    // Se mira el techo antes de tocar la base: un ataque de fuerza bruta no
    // debería poder generar una consulta por intento.
    const porIp = checkRateLimit(llaveIp);
    if (porIp.limitado) return respuesta429(porIp.reintentarEn);
    const porCuenta = checkRateLimit(llaveCuenta);
    if (porCuenta.limitado) return respuesta429(porCuenta.reintentarEn);

    // Modelo nuevo (AdelanteSBX): login por cédula o username -> dbo.Usuario
    const user = await findUsuarioByLogin(cedula);
    if (!user) {
      registrarFallo(llaveIp, LIMITE_IP);
      const r = registrarFallo(llaveCuenta, LIMITE_CUENTA);
      // Sin colaborador que apuntar: se registra igual, porque una ráfaga
      // contra cédulas inexistentes es exactamente lo que hay que poder ver.
      await logAudit({
        idColAccion: null, permitirSinActor: true, accion: 'LOGIN_FALLIDO', ip,
        detalleNuevo: { login: cedula.slice(0, 64), motivo: 'usuario_no_encontrado', bloqueado: r.limitado },
      });
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });
    }
    if (!user.esActivo) {
      await logAudit({
        idColAccion: user.idColaborador, accion: 'LOGIN_FALLIDO', ip,
        detalleNuevo: { login: cedula.slice(0, 64), motivo: 'usuario_inactivo' },
      });
      return NextResponse.json({ error: 'Usuario inactivo. Contacta a RRHH.' }, { status: 403 });
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      registrarFallo(llaveIp, LIMITE_IP);
      const r = registrarFallo(llaveCuenta, LIMITE_CUENTA);
      await logAudit({
        idColAccion: user.idColaborador, accion: 'LOGIN_FALLIDO', ip,
        detalleNuevo: { login: cedula.slice(0, 64), motivo: 'password_incorrecta', bloqueado: r.limitado },
      });
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

    // Entró bien: los fallos previos de esa cuenta dejan de contar.
    limpiarIntentos(llaveCuenta);
    await logAudit({
      idColAccion: user.idColaborador, accion: 'LOGIN_OK', ip,
      detalleNuevo: { login: cedula.slice(0, 64), idUsuario: user.idUsuario },
    });
    return res;
  } catch (err) {
    console.error('/api/auth/login error:', err);
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
