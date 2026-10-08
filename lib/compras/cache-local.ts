'use client';

// ─── QUE ABRIR NUNCA SEA EN CERO (PASO 3) ────────────────────────────────────
//
// Se guarda en el navegador la última respuesta BUENA del bootstrap junto con su
// ETag. Al abrir Compras se pinta eso de una y se revalida por detrás con
// `If-None-Match` (ver lib/compras/api.ts y store.tsx): si nada cambió vuelve un
// 304 y la pantalla ya estaba al día; si cambió, un 200 la reemplaza.
//
// Atada al USUARIO y con vencimiento de 12 h. En una tableta de obra —compartida
// entre turnos— el que abra después no tiene por qué ver los datos del anterior:
//   · la clave se borra al salir y al entrar otra persona, por la misma vía que
//     ya limpia el borrador de solicitud (lib/sesion-local.ts);
//   · y aunque quedara, `cacheValido` exige que el usuario calce, así que la
//     caché de uno nunca se le pinta a otro.
//
// INTERRUPTOR, sin desplegar: el servidor manda en cada respuesta del bootstrap
// la cabecera `x-compras-cache-local` (del env runtime `COMPRAS_CACHE_LOCAL`).
// Con `0` el cliente borra lo guardado y deja de guardar. Un `NEXT_PUBLIC_*` no
// servía: se hornea en el build y apagarlo pediría desplegar.

import type { Bootstrap } from "./api";

const CLAVE = "adelante_oc_cache_v1";
const VENCE_MS = 12 * 60 * 60 * 1000;

export interface CacheLocal {
  usuario: string;
  etag: string;
  /** `Date.now()` de cuando se guardó. */
  creado: number;
  data: Bootstrap;
}

// Lo decide el servidor (ver arriba). Arranca permitido; una respuesta con "0"
// lo apaga y borra lo que hubiera.
let permitido = true;
export function aplicarPermisoServidor(valor: string | null | undefined): void {
  permitido = valor !== "0";
  if (!permitido) borrarCacheLocal();
}

/** ¿Esta entrada sirve para ESTE usuario AHORA? Pura: no mira el reloj ni el
 *  localStorage por su cuenta, para poder probarla. */
export function cacheValido(e: CacheLocal | null, usuario: string, ahora: number): boolean {
  if (!e || !usuario) return false;
  if (e.usuario !== usuario) return false;
  return ahora - e.creado < VENCE_MS;
}

export function leerCacheLocal(usuario: string | null | undefined): CacheLocal | null {
  if (!permitido || typeof window === "undefined" || !usuario) return null;
  try {
    const raw = window.localStorage.getItem(CLAVE);
    if (!raw) return null;
    const e = JSON.parse(raw) as CacheLocal;
    if (!cacheValido(e, usuario, Date.now())) {
      window.localStorage.removeItem(CLAVE);
      return null;
    }
    return e;
  } catch {
    return null;
  }
}

export function guardarCacheLocal(usuario: string | null | undefined, etag: string | null, data: Bootstrap): void {
  if (!permitido || typeof window === "undefined" || !usuario || !etag) return;
  try {
    const e: CacheLocal = { usuario, etag, creado: Date.now(), data };
    window.localStorage.setItem(CLAVE, JSON.stringify(e));
  } catch {
    // Cuota llena o modo privado: la caché es una mejora, no un requisito.
  }
}

export function borrarCacheLocal(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CLAVE);
  } catch {
    /* ignore */
  }
}

/** La clave que `lib/sesion-local.ts` borra al cerrar sesión / cambiar de persona. */
export const CLAVE_CACHE_LOCAL = CLAVE;
