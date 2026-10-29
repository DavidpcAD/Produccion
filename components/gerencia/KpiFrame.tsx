'use client';
import { useEffect, useRef } from 'react';
import { registrarActividad } from '@/hooks/useInactividad';

// ─────────────────────────────────────────────────────────────────────────
// Tablero de Gerencia = la app "KPI Adelante" de Marcos (github.com/onexmac/kpi)
// corriendo TAL CUAL en un iframe del mismo origen. Antes se había reescrito en
// React y se perdió todo el movimiento (resortes, la tarjeta que se expande a
// pantalla completa, volver deslizando desde el borde, el rebote, el conteo de
// los números): la regla ahora es no traducir nada. El iframe además aísla su
// CSS y sus oyentes globales del resto de Produccion.
//
// Sus archivos viven en public/gerencia-app/ y el proxy los gatea como módulo
// 'gerencia', igual que esta página (ver lib/permissions.ts). La CSP deja
// enmarcar SOLO ese documento y solo desde esta app (ver next.config.ts).
//
// Para actualizar cuando Marcos cambie algo: copiar su index.html, av/ y fotos/
// a public/gerencia-app/ y volver a poner las 3 líneas de íconos locales (ver
// el comentario en el <head> de public/gerencia-app/index.html).
// ─────────────────────────────────────────────────────────────────────────

/** Lo mismo que hooks/useInactividad escucha en esta ventana. */
const EVENTOS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

export function KpiFrame() {
  const ref = useRef<HTMLIFrameElement>(null);

  // Los toques dentro del iframe no le llegan a esta ventana: sin esto el bloqueo
  // por inactividad cerraría la sesión a los 30 min con el gerente usando el
  // tablero. Al ser del mismo origen se le ponen los oyentes directo a su ventana.
  // Repetir el mismo oyente no lo duplica, así que llamar dos veces no hace daño.
  const conectar = () => {
    const win = ref.current?.contentWindow;
    if (!win) return;
    for (const ev of EVENTOS) win.addEventListener(ev, registrarActividad, { passive: true });
    win.addEventListener('scroll', registrarActividad, { passive: true, capture: true });
  };

  // El iframe viene en el HTML del servidor y puede terminar de cargar antes de
  // que React hidrate: en ese caso su `load` ya pasó y onLoad nunca llega.
  useEffect(() => {
    const doc = ref.current?.contentDocument;
    if (doc?.readyState === 'complete' && doc.location.href !== 'about:blank') conectar();
  }, []);

  return (
    <iframe
      ref={ref}
      src="/gerencia-app/index.html"
      title="KPI Adelante"
      onLoad={conectar}
      className="block h-full w-full border-0"
    />
  );
}
