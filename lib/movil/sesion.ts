// Sesión de las apps móviles (hoy: la app de maquinaria, con dos perfiles:
// el operario —rol "Operario Maquinaria", módulo 'maquinaria'— y el mecánico
// —rol "Mecánico", módulo 'mecanico'—).
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
 *  exclusivos (maquinaria y mecanico lo son): tiene que tener el rol. */
export function tieneModulo(modules: readonly string[] | null | undefined, modulo: Modulo): boolean {
  return !!modules?.includes(modulo);
}

/** Cómo entra cada persona a la app: operario (checklist, material, averías)
 *  o mecánico (taller: todas las máquinas, OT y repuestos). Puede tener los dos. */
export type PerfilMovil = 'operario' | 'mecanico';
const MODULO_DE_PERFIL: Record<PerfilMovil, Modulo> = { operario: 'maquinaria', mecanico: 'mecanico' };
const ROL_DE_MODULO: Partial<Record<Modulo, string>> = { maquinaria: 'Operario Maquinaria', mecanico: 'Mecánico' };

export function perfilesMovil(modules: readonly string[] | null | undefined): PerfilMovil[] {
  return (Object.keys(MODULO_DE_PERFIL) as PerfilMovil[]).filter((p) => tieneModulo(modules, MODULO_DE_PERFIL[p]));
}

/** "Tu usuario no tiene el rol X (ni Y)": lo que se le dice a quien no puede entrar. */
export function mensajeSinRol(modulos: readonly Modulo[] = ['maquinaria', 'mecanico']): string {
  const roles = modulos.map((m) => ROL_DE_MODULO[m] ?? m);
  return `Tu usuario no tiene el rol ${roles.join(' ni ')}. Pedilo a Recursos Humanos.`;
}

/** Valida el token y exige UNO de los módulos (las rutas comunes, como fotos o
 *  el registro del teléfono, aceptan los dos perfiles). */
export async function sesionMovil(req: Request, modulo: Modulo | readonly Modulo[]): Promise<Resultado> {
  const pedidos: readonly Modulo[] = typeof modulo === 'string' ? [modulo] : modulo;
  const token = tokenDeRequest(req);
  if (!token) return { error: sesionVencida() };
  const payload = verifyToken(token);
  // Los usuarios de prueba (idUsuario 0) no existen en la base: no entran por acá.
  if (!payload || !payload.idUsuario || payload.idUsuario <= 0) return { error: sesionVencida() };

  try {
    const base = await cargarSesion(payload.idUsuario, payload.jti, payload.inicio ?? payload.iat);
    if (!sesionSigueValiendo(payload, base)) return { error: sesionVencida() };
    const modules = computeAllowedModules(base.roles) ?? [];
    if (!pedidos.some((m) => tieneModulo(modules, m))) {
      return {
        error: NextResponse.json(
          { error: mensajeSinRol(pedidos) },
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
