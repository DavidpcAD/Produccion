// Matriz de permisos por rol -- capa de UX (deshabilita botones/campos para
// que nadie intente algo que de todas formas va a rechazar el servidor). La
// seguridad real vive en cada app/api/**/route.ts vía requerirRol() (ver
// lib/auth.ts); esto es solo para que la pantalla no invite a hacer algo que
// no va a funcionar.

import type { Rol } from "./types";

export type Accion =
  | "equipos.editar"
  | "equipos.registrarLectura"
  | "equipos.subirManual"
  | "ots.crear"
  | "ots.ejecutar"
  | "repuestos.editar"
  | "repuestos.movimiento"
  | "planes.editar"
  | "solicitudes.crear"
  | "usuarios.administrar";

const PERMISOS: Record<Rol, Accion[]> = {
  admin: [
    "equipos.editar",
    "equipos.registrarLectura",
    "equipos.subirManual",
    "ots.crear",
    "ots.ejecutar",
    "repuestos.editar",
    "repuestos.movimiento",
    "planes.editar",
    "solicitudes.crear",
    "usuarios.administrar"
  ],
  tecnico: [
    "equipos.editar",
    "equipos.registrarLectura",
    "equipos.subirManual",
    "ots.crear",
    "ots.ejecutar",
    "repuestos.editar",
    "repuestos.movimiento",
    "planes.editar",
    "solicitudes.crear"
  ],
  operador: ["equipos.registrarLectura", "ots.crear", "solicitudes.crear"]
};

export function puede(rol: Rol | undefined, accion: Accion): boolean {
  if (!rol) return false;
  return PERMISOS[rol].includes(accion);
}

// Dentro del formulario de Equipo, estos tres campos quedan solo para admin
// (dato "legal"/identidad del equipo) aunque el rol tenga equipos.editar.
export const CAMPOS_EQUIPO_SOLO_ADMIN = ["placa", "revisionTecnica", "numeroSerie"] as const;

export function puedeEditarCampoEquipo(rol: Rol | undefined, campo: string): boolean {
  if (!puede(rol, "equipos.editar")) return false;
  if ((CAMPOS_EQUIPO_SOLO_ADMIN as readonly string[]).includes(campo)) return rol === "admin";
  return true;
}

// Azúcar para FormField: `state={estadoCampo(puedeEditarCampoEquipo(rol, "placa"))}`.
export function estadoCampo(editable: boolean): "standard" | "disabled" {
  return editable ? "standard" : "disabled";
}
