import { NextResponse } from 'next/server';
import { sesionSigueValiendo, signToken, verifyToken } from '@/lib/auth';
import { cargarSesion } from '@/lib/sesiones';
import { buildSessionPayload } from '@/lib/users';
import { RENOVAR_DESPUES_DE_S, SEGUNDOS_TOPE } from '@/lib/sesion-duracion';
import { sesionVencida, tieneModulo, tokenDeRequest } from '@/lib/movil/sesion';

// Renovación del token del teléfono. Igual que /api/auth/renovar (la de la web),
// pero el token viaja en `Authorization` y el nuevo vuelve en el cuerpo:
//   · 200 { token, venceEn } → guardar el nuevo
//   · 204                    → no hace falta todavía (o ya llegó al tope)
//   · 401 x-sesion: vencida  → al login
// Falla CERRADO: si la base no contesta, no se renueva (503).
export async function POST(req: Request) {
  const token = tokenDeRequest(req);
  const actual = token ? verifyToken(token) : null;
  if (!actual || !actual.idUsuario || actual.idUsuario <= 0) return sesionVencida();
  const sinCambios = () => new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  if (!actual.jti) return sinCambios();

  const ahora = Math.floor(Date.now() / 1000);
  const inicio = actual.inicio ?? actual.iat ?? ahora;
  if (actual.iat && ahora - actual.iat < RENOVAR_DESPUES_DE_S) return sinCambios();
  if (inicio + SEGUNDOS_TOPE - ahora <= RENOVAR_DESPUES_DE_S) return sinCambios();

  try {
    const base = await cargarSesion(actual.idUsuario, actual.jti, inicio);
    if (!sesionSigueValiendo(actual, base)) return sesionVencida();
    const payload = await buildSessionPayload(actual.idUsuario);
    if (!payload) return sesionVencida();
    if (!tieneModulo(payload.modules, 'maquinaria')) {
      return sesionVencida('Tu usuario ya no tiene el rol Operario Maquinaria.');
    }
    if (actual.huella) payload.huella = actual.huella;
    const { token: nuevo, segundos } = signToken(payload, { jti: actual.jti, inicio });
    return NextResponse.json({ token: nuevo, venceEn: segundos }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('/api/movil/auth/renovar: no se pudo verificar la sesión; no se renueva:', err);
    return NextResponse.json({ error: 'No se pudo renovar la sesión ahora.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
