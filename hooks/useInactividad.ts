'use client';
import { useSyncExternalStore } from 'react';

// ─── Bloqueo por inactividad ─────────────────────────────────────────────────
//
// Estas pantallas viven en tabletas de obra compartidas entre varias personas
// por turno (ver lib/sesion-local.ts). La sesión dura 8 h, o sea que una tableta
// que alguien deja sobre la mesa queda abierta con su nombre, sus obras y sus
// precios a la vista —y a un toque de aprobar una orden— durante el resto del
// turno.
//
// A los 30 min sin que nadie la toque se cierra la sesión DE VERDAD: se llama a
// /api/auth/logout, que borra la cookie y revoca el token (jti). Un modal que
// solo tapara la pantalla no protegería nada: se quita con F5.
//
// Un minuto antes avisa con una cuenta regresiva y un botón: quien esté ahí
// leyendo una orden larga sigue con un toque y no pierde lo que estaba
// escribiendo.
//
// Esto es distinto del aviso amarillo de components/layout/AvisoSesion.tsx: ese
// reacciona a un 401 del servidor (la sesión se venció sola o la revocaron desde
// otro lado) y deja la pantalla usable para copiar lo escrito. Este cierra a
// propósito, por seguridad del aparato, y por eso sí tapa lo que hay detrás.

/** Minutos sin tocar la pantalla antes de cerrar la sesión. */
export const MINUTOS_INACTIVIDAD = 30;
/** Segundos de cuenta regresiva antes del cierre. */
export const SEGUNDOS_AVISO = 60;

const LIMITE_MS = MINUTOS_INACTIVIDAD * 60_000;
const AVISO_MS = SEGUNDOS_AVISO * 1000;

/** Última actividad, compartida entre pestañas del mismo navegador. */
const CLAVE_ACTIVIDAD = 'adelante_oc_actividad';
/** Marca del cierre, para que las demás pestañas se bloqueen sin repetir el logout. */
const CLAVE_BLOQUEO = 'adelante_oc_bloqueo';

export type FaseInactividad = 'activo' | 'avisando' | 'cerrada';
export interface EstadoInactividad {
  fase: FaseInactividad;
  /** Segundos que faltan para el cierre. Solo significa algo en 'avisando'. */
  restante: number;
}

const ACTIVO: EstadoInactividad = { fase: 'activo', restante: SEGUNDOS_AVISO };
const CERRADA: EstadoInactividad = { fase: 'cerrada', restante: 0 };

let estado: EstadoInactividad = ACTIVO;
const oyentes = new Set<() => void>();

function publicar(nuevo: EstadoInactividad) {
  estado = nuevo;
  oyentes.forEach((avisar) => avisar());
}

// ── Última actividad ────────────────────────────────────────────────────────
// Se guarda en localStorage además de en memoria porque el app se abre en varias
// pestañas: sin esto, una pestaña de fondo llega al límite mientras la persona
// trabaja en la de al lado y le cierra la sesión a las dos.

let ultimo = Date.now();
let ultimoEscrito = 0;

function escribirActividad(cuando: number) {
  // Una escritura cada 5 s alcanza: el tick compara contra el máximo de los dos
  // relojes, y escribir en cada toque hace trabajo de disco por nada.
  if (cuando - ultimoEscrito < 5_000) return;
  ultimoEscrito = cuando;
  try { window.localStorage.setItem(CLAVE_ACTIVIDAD, String(cuando)); } catch { /* almacenamiento bloqueado */ }
}

function leerActividad(): number {
  try { return Number(window.localStorage.getItem(CLAVE_ACTIVIDAD)) || 0; } catch { return 0; }
}

/**
 * Hubo alguien. Se cuentan toques, teclas, rueda y scroll —gestos deliberados—
 * y NO el movimiento del puntero: media hora sin un solo clic ni una tecla es
 * inactividad de verdad, y en una tableta con el cursor rozando la mesa el
 * `mousemove` mantendría la sesión viva toda la noche.
 */
function marcarActividad() {
  if (estado.fase === 'cerrada') return; // cerrada ya no se revive moviendo el dedo
  ultimo = Date.now();
  escribirActividad(ultimo);
  if (estado.fase !== 'activo') publicar(ACTIVO);
}

/** El botón «Sigo aquí» del aviso. Fuerza la escritura compartida: si la cuenta
 *  llegó hasta acá, los 5 s de espera del throttle son justo los que faltan. */
export function seguirAqui() {
  ultimoEscrito = 0;
  marcarActividad();
}

// ── Cierre ──────────────────────────────────────────────────────────────────

let cerrando = false;

async function cerrarPorInactividad() {
  if (cerrando) return;
  cerrando = true;
  // Primero la pantalla: que lo que había detrás quede tapado aunque el servidor
  // tarde en contestar.
  publicar(CERRADA);
  try { window.localStorage.setItem(CLAVE_BLOQUEO, String(Date.now())); } catch { /* ignore */ }
  try {
    // `redirect: 'manual'`: la ruta contesta 303 hacia /login y seguir ese salto
    // solo serviría para bajarse el HTML del login que nadie va a mirar. La
    // cookie borrada y el token revocado viajan en esta misma respuesta.
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', redirect: 'manual' });
  } catch {
    // Sin red (la tableta durmió, el wifi de obra se cayó): la sesión del
    // servidor sigue viva hasta las 8 h, pero la pantalla ya quedó tapada y de
    // acá solo se sale entrando de nuevo.
  }
}

// ── Reloj ───────────────────────────────────────────────────────────────────

let reloj: ReturnType<typeof setInterval> | null = null;

function tick() {
  if (estado.fase === 'cerrada') return;
  const transcurrido = Date.now() - Math.max(ultimo, leerActividad());
  if (transcurrido >= LIMITE_MS) { void cerrarPorInactividad(); return; }
  if (transcurrido >= LIMITE_MS - AVISO_MS) {
    const restante = Math.max(1, Math.ceil((LIMITE_MS - transcurrido) / 1000));
    if (estado.fase !== 'avisando' || estado.restante !== restante) publicar({ fase: 'avisando', restante });
  } else if (estado.fase !== 'activo') {
    publicar(ACTIVO);
  }
}

const EVENTOS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

function alCambiarVisibilidad() {
  // Los intervalos de una pestaña de fondo se estiran o se congelan (y la
  // tableta suspendida los para del todo): al volver a la vista se mide contra
  // el reloj de verdad, que es lo único que no miente.
  if (document.visibilityState === 'visible') tick();
}

function alCambiarAlmacenamiento(e: StorageEvent) {
  if (e.key === CLAVE_BLOQUEO && e.newValue) {
    // Otra pestaña ya cerró la sesión: esta se bloquea sin repetir el logout.
    cerrando = true;
    if (estado.fase !== 'cerrada') publicar(CERRADA);
  }
}

function arrancar() {
  // Entrar a la pantalla ES actividad: el contador no arranca con lo que dejó
  // la persona del turno anterior.
  ultimo = Date.now();
  ultimoEscrito = 0;
  escribirActividad(ultimo);
  for (const ev of EVENTOS) window.addEventListener(ev, marcarActividad, { passive: true });
  // En captura: el scroll de una lista interna no burbujea hasta window.
  window.addEventListener('scroll', marcarActividad, { passive: true, capture: true });
  document.addEventListener('visibilitychange', alCambiarVisibilidad);
  window.addEventListener('storage', alCambiarAlmacenamiento);
  reloj = setInterval(tick, 1000);
}

function parar() {
  for (const ev of EVENTOS) window.removeEventListener(ev, marcarActividad);
  window.removeEventListener('scroll', marcarActividad, { capture: true });
  document.removeEventListener('visibilitychange', alCambiarVisibilidad);
  window.removeEventListener('storage', alCambiarAlmacenamiento);
  if (reloj) { clearInterval(reloj); reloj = null; }
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  if (oyentes.size === 1) arrancar();
  return () => {
    oyentes.delete(avisar);
    if (oyentes.size === 0) parar();
  };
}

/** Estado del bloqueo por inactividad. El reloj corre mientras alguien lo
 *  escuche: en /login no hay nada que vigilar y nada corre. */
export function useInactividad(): EstadoInactividad {
  return useSyncExternalStore(suscribir, () => estado, () => ACTIVO);
}
