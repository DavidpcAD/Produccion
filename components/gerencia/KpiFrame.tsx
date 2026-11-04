'use client';

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

export function KpiFrame() {
  return (
    <iframe
      src="/gerencia-app/index.html"
      title="KPI Adelante"
      className="block h-full w-full border-0"
    />
  );
}
