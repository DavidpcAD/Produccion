'use client';

// ─── Lo que esta persona dejó en ESTE navegador ──────────────────────────────
//
// Al cerrar sesión se borra la cookie en el servidor, pero lo que el app guardó
// en `localStorage` se queda. En una tableta de obra —que es como se usan estas
// pantallas, compartidas entre varias personas— eso significa que la siguiente
// persona que entra se encuentra:
//
//   · el borrador de la solicitud que la anterior dejó a medias (materiales,
//     obras, cantidades, notas y hasta el proveedor del subcontrato), cargado
//     en SU formulario de "Nueva solicitud" como si fuera propio;
//   · el borrador del editor de plantillas, igual;
//   · su nombre y su rol, que el store usa para marcar "creado por".
//
// Así que al salir se borra. Lo que NO se borra es lo que es del APARATO y no
// de la persona: el tema claro/oscuro y si el menú quedaba fijo. Esos los
// eligió quien usa la tableta y perderlos en cada cambio de turno molesta sin
// proteger nada.

/** Claves exactas que se van al cerrar sesión. */
const CLAVES = [
  'adelante_oc_usuario',
  'adelante_oc_role',
  'adelante_oc_pedido_borrador',
  // La caché local del bootstrap (precios, proveedores, obras): es de la persona,
  // no del aparato, así que se va con ella (ver lib/compras/cache-local.ts).
  'adelante_oc_cache_v1',
];

/** Prefijos que se van (los borradores de plantilla llevan el id pegado). */
const PREFIJOS = ['adelante_oc_plantilla_borrador:'];

/** Se quedan: son del aparato, no de la persona. */
const SE_QUEDAN = ['adelante_oc_theme', 'adelante_oc_navpin'];

export function limpiarDatosLocales(): void {
  if (typeof window === 'undefined') return;
  try {
    const aBorrar: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || SE_QUEDAN.includes(k)) continue;
      if (CLAVES.includes(k) || PREFIJOS.some((p) => k.startsWith(p))) aBorrar.push(k);
    }
    for (const k of aBorrar) window.localStorage.removeItem(k);
  } catch {
    // Modo privado o almacenamiento bloqueado: no hay nada guardado que limpiar.
  }
}

/** Borra lo de la persona anterior SOLO si quien acaba de entrar es otra.
 *
 *  Hace falta por el camino que no pasa por "Cerrar sesión": en una tableta
 *  compartida lo normal es que la sesión se venza sola (dura 8 h) y que la
 *  siguiente persona entre encima. Ahí nadie limpió nada.
 *
 *  Se compara contra el nombre que dejó guardado el store. Si es la MISMA
 *  persona volviendo —sesión vencida, vuelve a entrar— no se toca nada: su
 *  borrador la estaba esperando, que es justo lo que el aviso de sesión
 *  vencida trata de proteger (ver components/layout/AvisoSesion.tsx).
 *
 *  Si no se sabe quién entró, no se borra: equivocarse hacia "no borrar" solo
 *  deja un borrador de más; hacia "borrar" tira el trabajo de alguien. */
export function limpiarSiEsOtraPersona(nombreQueEntra: string | null | undefined): void {
  if (typeof window === 'undefined' || !nombreQueEntra) return;
  let anterior: string | null = null;
  try { anterior = window.localStorage.getItem('adelante_oc_usuario'); } catch { return; }
  if (!anterior) return;
  if (anterior.trim() === nombreQueEntra.trim()) return;
  limpiarDatosLocales();
}
