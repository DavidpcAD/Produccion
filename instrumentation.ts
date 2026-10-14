export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
    const { useAzureMonitor } = await import('@azure/monitor-opentelemetry');
    useAzureMonitor();
  }

  // Auto-aplicar migraciones pendientes SOLO en producción (en dev se aplican a
  // mano contra SBX). La app ya tiene acceso a la base, así que no hace falta
  // secret ni abrir el firewall a CI. Envuelto en try/catch: una migración que
  // falle NO debe tumbar el arranque de todo el app. Ver lib/migraciones.ts.
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NODE_ENV === 'production') {
    try {
      const { aplicarMigracionesPendientes } = await import('@/lib/migraciones');
      await aplicarMigracionesPendientes();
    } catch (err) {
      console.error('[migraciones] error al aplicar pendientes (se ignora para no tumbar el arranque):', err);
    }
  }
}
