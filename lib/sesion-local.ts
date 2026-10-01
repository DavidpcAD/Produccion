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
const CLAVES = ['adelante_oc_usuario', 'adelante_oc_role', 'adelante_oc_pedido_borrador'];

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
