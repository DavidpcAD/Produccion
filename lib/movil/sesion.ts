// Sesión de las apps móviles (hoy: la app de maquinaria).
//
// La web usa la cookie `adelante_session`; el teléfono no tiene cookies, así que
// manda el MISMO token firmado en `Authorization: Bearer <token>`. El proxy deja
// pasar /api/movil/* sin mirar nada (ver getRouteLevel en lib/permissions.ts) y
// cada handler llama a `sesionMovil`, que hace lo mismo que `getSession()`:
// verifica la firma, pregunta a la base si la sesión sigue valiendo (no la
// cerraron, RH no desactivó a la persona, no le cambiaron la contraseña) y
// recalcula roles y módulos. Encima exige el módulo que pida la ruta.
//
// Falla CERRADO: si la base no contesta, no hay sesión (la web en cambio sigue
// con lo que trae el token). En el teléfono es mejor un "probá de nuevo" que
// dejar pasar una sesión revocada.
import { NextResponse } from 'next/server';
import { sesionSigueValiendo, verifyToken, type JWTPayload } from '@/lib/auth';
import { cargarSesion } from '@/lib/sesiones';
import { computeAllowedModules, computeNivelAdmin, type Modulo } from '@/lib/permissions';

export type SesionMovil = JWTPayload & { modules: Modulo[] };

type Resultado = { sesion: SesionMovil; error?: undefined } | { sesion?: undefined; error: NextResponse };

export function tokenDeRequest(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

/** 401 marcado: la app lo lee como "la sesión se terminó" y manda al login. */
export function sesionVencida(mensaje = 'Tu sesión terminó. Entrá de nuevo.') {
  const res = NextResponse.json({ error: mensaje }, { status: 401 });
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('x-sesion', 'vencida');
  return res;
}

/** ¿Este conjunto de roles abre el módulo? El Super Admin NO hereda módulos
 *  exclusivos (maquinaria lo es): tiene que tener el rol. */
export function tieneModulo(modules: readonly string[] | null | undefined, modulo: Modulo): boolean {
  return !!modules?.includes(modulo);
}

export async function sesionMovil(req: Request, modulo: Modulo): Promise<Resultado> {
  const token = tokenDeRequest(req);
  if (!token) return { error: sesionVencida() };
  const payload = verifyToken(token);
  // Los usuarios de prueba (idUsuario 0) no existen en la base: no entran por acá.
  if (!payload || !payload.idUsuario || payload.idUsuario <= 0) return { error: sesionVencida() };

  try {
    const base = await cargarSesion(payload.idUsuario, payload.jti, payload.inicio ?? payload.iat);
    if (!sesionSigueValiendo(payload, base)) return { error: sesionVencida() };
    const modules = computeAllowedModules(base.roles) ?? [];
    if (!tieneModulo(modules, modulo)) {
      return {
        error: NextResponse.json(
          { error: 'Tu usuario no tiene el rol Operario Maquinaria. Pedilo a Recursos Humanos.' },
          { status: 403, headers: { 'Cache-Control': 'no-store' } },
        ),
      };
    }
    return {
      sesion: {
        ...payload,
        roles: base.roles.map((r) => r.idRol),
        roleNames: base.roles.map((r) => r.nombre ?? ''),
        modules,
        nivelAdmin: computeNivelAdmin(base.roles),
      },
    };
  } catch (err) {
    console.error('sesionMovil: no se pudo verificar la sesión contra la base:', err);
    return {
      error: NextResponse.json(
        { error: 'No se pudo verificar la sesión. Probá de nuevo en un momento.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      ),
    };
  }
}
