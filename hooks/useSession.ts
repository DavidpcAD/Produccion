'use client';
import { useState, useEffect } from 'react';
import { JWTPayload } from '@/lib/auth';

// Cache en memoria — persiste entre navegaciones del mismo proceso
let sessionCache: JWTPayload | null | 'pending' = 'pending';
const listeners = new Set<(s: JWTPayload | null) => void>();

function fetchSession() {
  fetch('/api/auth/me', { credentials: 'include' })
    .then(r => r.ok ? r.json() : null)
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
