import { JWTPayload } from './auth';

// ─────────────────────────────────────────────────────────────────────────
// Modelo nuevo (AdelanteSBX): la tabla dbo.Rol NO tiene NivelAdmin, pero el
// control de acceso de la app se basa en niveles (1=empleado, 2=admin,
// 4=superadmin). Aquí se centraliza la correspondencia Rol→nivel.
// Para ajustar permisos, edita SOLO este mapa.
//   1 Administrador        -> 4 (superadmin: gestiona roles y apps)
//   2 Maestro de Obras     -> 1
//   3 Ingeniero Residente  -> 2 (admin: proyectos/cuadrillas/usuarios/auditoría)
//   4 Jefe de Cuadrillas   -> 2
//   5 Proveeduría          -> 1
//   6 Facturador Bodega    -> 1
// ─────────────────────────────────────────────────────────────────────────
export const ROLE_LEVEL_BY_ID: Record<number, number> = {
  1: 4,
  2: 1,
  3: 2,
  4: 2,
  5: 1,
  6: 1,
};

// Fallback por nombre (por si los IDs cambian en otra instancia). Se compara en
// minúsculas y sin espacios extra. Aquí se define qué rol da qué nivel.
const ROLE_LEVEL_BY_NAME: Record<string, number> = {
  'superadministrador': 4,
  'super administrador': 4,
  'super admin': 4,
  'administrador': 4,
  'ingeniero residente': 2,
  'jefe de cuadrillas': 2,
  'maestro de obras': 1,
  'proveeduría': 1,
  'proveeduria': 1,
  'facturador bodega': 1,
};

/** Calcula el nivelAdmin efectivo a partir de los roles del usuario. */
export function computeNivelAdmin(
  roles: Array<{ idRol: number; nombre?: string }>,
): number {
  let max = 0;
  for (const r of roles) {
    const byName = r.nombre ? ROLE_LEVEL_BY_NAME[r.nombre.trim().toLowerCase()] : undefined;
    const byId = ROLE_LEVEL_BY_ID[r.idRol];
    // El NOMBRE manda: con el nuevo set de roles los IDs 1–6 ya no coinciden con
    // el mapa viejo, así que el nombre del rol es la fuente confiable del nivel.
    const lvl = byName ?? byId ?? 1; // todo rol asignado da acceso básico (1)
    if (lvl > max) max = lvl;
  }
  return max;
}

export function requireMinLevel(session: JWTPayload | null, level: number): boolean {
  if (!session) return false;
  return session.nivelAdmin >= level;
}

export function getRouteLevel(pathname: string): number {
  if (pathname.startsWith('/login')) return 0;
  if (pathname.startsWith('/apps')) return 4;
  if (pathname.startsWith('/roles')) return 4;
  if (pathname.startsWith('/cuentas')) return 4;
  if (pathname.startsWith('/obras')) return 2;
  if (pathname.startsWith('/usuarios/nuevo') || pathname.startsWith('/usuarios/') && pathname.includes('/editar')) return 2;
  if (pathname.startsWith('/proyectos') || pathname.startsWith('/cuadrillas')) return 2;
  if (pathname.startsWith('/encargados')) return 2;
  if (pathname.startsWith('/auditoria')) return 2;
  if (pathname.startsWith('/usuarios')) return 1;
  return 1;
}

export function getInitials(nombre: string): string {
  return nombre
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase();
}
