'use client';
import { useState, useEffect, useSyncExternalStore } from 'react';
import { JWTPayload } from '@/lib/auth';

// Cache en memoria — persiste entre navegaciones del mismo proceso
let sessionCache: JWTPayload | null | 'pending' = 'pending';
const listeners = new Set<(s: JWTPayload | null) => void>();

// ¿La sesión ya no vale? Lo prende el primer 401 marcado y lo escucha el aviso
// de arriba de la pantalla (components/layout/AvisoSesion.tsx).
let vencida = false;
const oyentesVencida = new Set<() => void>();

/**
 * El servidor dijo que esta sesión ya no vale (venció o se revocó desde otro
 * lado). Antes esto solo dejaba la sesión en null y la pantalla se quedaba en
 * "Cargando…" para siempre, sin decir nada: el usuario hacía clics que no
 * pasaban nada.
 *
 * Tampoco se lo lleva al login de una: si estaba llenando un formulario —el
 * modal de subpartidas, un pedido a medio escribir—, sacarle la pantalla de
 * abajo le borra lo escrito. Se prende un aviso arriba de todo con el botón
 * para salir, y él decide cuándo irse y qué copiar antes.
 *
 * Solo ante un 401 del servidor, nunca ante un error de red: una caída de wifi
 * de dos segundos no debe echar a nadie de la pantalla en la que está.
 */
function sesionVencida() {
  if (typeof window === 'undefined' || vencida) return;
  if (window.location.pathname.startsWith('/login')) return; // ya está ahí
  vencida = true;
  oyentesVencida.forEach((avisar) => avisar());
}

/** Se va al login recordando a dónde volver. Lo llama el botón del aviso.
 *  `replace` y no `assign`: la pantalla muerta no tiene por qué quedar en el
 *  historial esperando a que alguien le dé "atrás" después de entrar. */
export function irAlLogin() {
  const { pathname, search } = window.location;
  const destino = encodeURIComponent(`${pathname}${search}`);
  window.location.replace(`/login?sesion=vencida&volver=${destino}`);
}

/** ¿Mostrar el aviso de sesión terminada? `useSyncExternalStore` y no un
 *  `useState` + efecto: si la sesión se cae entre el render y el efecto, la
 *  suscripción a mano se pierde ese aviso justo. */
export function useSesionVencida(): boolean {
  return useSyncExternalStore(
    (avisar) => { oyentesVencida.add(avisar); return () => { oyentesVencida.delete(avisar); }; },
    () => vencida,
    () => false, // en el servidor no hay sesión que se caiga
  );
}

/**
 * La sesión también se vence con la pestaña ABIERTA, y ahí el chequeo de arriba
 * —que corre una sola vez, al cargar— ya pasó hace horas. A partir de ese
 * momento toda llamada al servidor vuelve 401 mientras la pantalla sigue
 * pintando los datos de la última carga buena: el usuario le pega a botones
 * muertos y lo único que ve es un "no se pudo" genérico (subpartida de Luis
 * Roberto, 25/09/2026).
 *
 * Se envuelve `fetch` UNA vez, acá y no en cada pantalla, porque el app llama a
 * las APIs desde decenas de páginas y ninguna tiene por qué saber de esto. Solo
 * reacciona al 401 que `proxy.ts` marca con `x-sesion: vencida`: los demás 401
 * —los que cada ruta devuelve por su cuenta— los sigue manejando quien llamó.
 */
function vigilarSesionEnFetch() {
  // Una sola capa: con HMR este módulo se vuelve a evaluar y si no, cada
  // recarga en caliente apilaría otra envoltura sobre la anterior.
  if ((window as { __vigilaSesion?: boolean }).__vigilaSesion) return;
  (window as { __vigilaSesion?: boolean }).__vigilaSesion = true;
  // `bind`: al sacar `fetch` de window y llamarlo suelto, el navegador lo
  // rechaza por invocación ilegal.
  const original = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const res = await original(...args);
    if (res.status === 401 && res.headers.get('x-sesion') === 'vencida') sesionVencida();
    return res;
  };
}

function fetchSession() {
  fetch('/api/auth/me', { credentials: 'include' })
    .then(r => {
      if (r.status === 401) { sesionVencida(); return null; }
      return r.ok ? r.json() : null;
    })
    .then((data: JWTPayload | null) => {
      sessionCache = data;
      listeners.forEach(fn => fn(data));
    })
    .catch(() => {
      sessionCache = null;
      listeners.forEach(fn => fn(null));
    });
}

// Inicia la carga inmediatamente cuando el módulo se importa
if (typeof window !== 'undefined') {
  vigilarSesionEnFetch();
  fetchSession();
}

export function useSession(): JWTPayload | null {
  const [session, setSession] = useState<JWTPayload | null>(
    sessionCache !== 'pending' ? sessionCache : null
  );

  useEffect(() => {
    // Si ya tenemos datos en cache, usarlos inmediatamente
    if (sessionCache !== 'pending') {
      setSession(sessionCache);
      return;
    }
    // Suscribirse a cuando llegue la respuesta
    const handler = (s: JWTPayload | null) => setSession(s);
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  return session;
}
