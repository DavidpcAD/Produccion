'use client';
import { useState, useEffect } from 'react';
import { JWTPayload } from '@/lib/auth';

// Cache en memoria — persiste entre navegaciones del mismo proceso
let sessionCache: JWTPayload | null | 'pending' = 'pending';
const listeners = new Set<(s: JWTPayload | null) => void>();

/**
 * El servidor dijo que esta sesión ya no vale (venció o se revocó desde otro
 * lado). Antes esto solo dejaba la sesión en null y la pantalla se quedaba en
 * "Cargando…" para siempre, sin decir nada: el usuario hacía clics que no
 * pasaban nada. Se manda al login, que es lo único que puede hacer.
 *
 * Solo ante un 401 del servidor, nunca ante un error de red: una caída de wifi
 * de dos segundos no debe echar a nadie de la pantalla en la que está.
 */
function sesionVencida() {
  if (typeof window === 'undefined') return;
  const { pathname, search } = window.location;
  if (pathname.startsWith('/login')) return; // ya está ahí: no hay a dónde ir
  // Se recuerda a dónde iba para volver después de entrar de nuevo.
  const destino = encodeURIComponent(`${pathname}${search}`);
  window.location.replace(`/login?sesion=vencida&volver=${destino}`);
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
