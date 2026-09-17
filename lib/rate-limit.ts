/**
 * Limitador de intentos en memoria, pensado para el login.
 *
 * OJO — alcance real: el contador vive en la memoria del proceso. Si el App
 * Service escala a más de una instancia, cada una lleva su propia cuenta y el
 * techo efectivo se multiplica por el número de instancias. Frena la fuerza
 * bruta desde un script, no a un atacante distribuido; para eso haría falta
 * Redis o el rate limiting del propio host (Front Door / App Gateway).
 */

type Intento = { fallos: number; expira: number; bloqueadoHasta: number };

// El módulo se recarga en cada hot reload de `next dev`: si el Map viviera en
// el módulo, los contadores se perderían en cada guardado. En globalThis no.
const store: Map<string, Intento> =
  (globalThis as { __rateLimit?: Map<string, Intento> }).__rateLimit ??
  ((globalThis as { __rateLimit?: Map<string, Intento> }).__rateLimit = new Map());

/** Barrido perezoso: sin esto el Map crece sin techo con IPs que ya no vuelven. */
function limpiar(ahora: number) {
  if (store.size < 5000) return;
  for (const [k, v] of store) {
    if (v.expira < ahora && v.bloqueadoHasta < ahora) store.delete(k);
  }
}

export interface LimiteOpciones {
  /** Fallos permitidos dentro de la ventana antes de bloquear. */
  maxFallos: number;
  /** Ventana en la que se acumulan los fallos (ms). */
  ventanaMs: number;
  /** Cuánto dura el bloqueo una vez superado el máximo (ms). */
  bloqueoMs: number;
}

export interface LimiteResultado {
  limitado: boolean;
  /** Segundos que faltan para poder reintentar (para el header Retry-After). */
  reintentarEn: number;
}

/** ¿Esta llave está bloqueada ahora mismo? No cuenta el intento. */
export function checkRateLimit(llave: string): LimiteResultado {
  const ahora = Date.now();
  const e = store.get(llave);
  if (e && e.bloqueadoHasta > ahora) {
    return { limitado: true, reintentarEn: Math.ceil((e.bloqueadoHasta - ahora) / 1000) };
  }
  return { limitado: false, reintentarEn: 0 };
}

/** Anota un intento fallido y devuelve si a partir de ahora queda bloqueada. */
export function registrarFallo(llave: string, op: LimiteOpciones): LimiteResultado {
  const ahora = Date.now();
  limpiar(ahora);

  const e = store.get(llave);
  // Entrada nueva, o ventana vencida: la cuenta arranca de cero.
  if (!e || e.expira < ahora) {
    store.set(llave, { fallos: 1, expira: ahora + op.ventanaMs, bloqueadoHasta: 0 });
    return { limitado: false, reintentarEn: 0 };
  }

  e.fallos += 1;
  if (e.fallos >= op.maxFallos) {
    e.bloqueadoHasta = ahora + op.bloqueoMs;
    e.fallos = 0; // al vencer el bloqueo se vuelve a empezar, no se queda pegado
    e.expira = ahora + op.bloqueoMs + op.ventanaMs;
    return { limitado: true, reintentarEn: Math.ceil(op.bloqueoMs / 1000) };
  }
  return { limitado: false, reintentarEn: 0 };
}

/** Un acierto borra la cuenta: quien entra bien no arrastra fallos viejos. */
export function limpiarIntentos(llave: string) {
  store.delete(llave);
}

/**
 * IP del cliente detrás del proxy de Azure. `NextRequest.ip` ya no existe
 * (removido en Next 15), así que sale del header. X-Forwarded-For puede venir
 * como lista ("cliente, proxy1") y App Service le agrega el puerto: se toma la
 * primera y se le quita el puerto para que la llave sea estable.
 */
export function ipDeRequest(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const primera = xff.split(',')[0]?.trim() ?? '';
  if (!primera) return 'desconocida';
  // IPv6 entre corchetes: [::1]:1234 → ::1
  const v6 = primera.match(/^\[([^\]]+)\]/);
  if (v6) return v6[1];
  // IPv4 con puerto: 1.2.3.4:5678 → 1.2.3.4 (un solo ':' = no es IPv6 pelado)
  const partes = primera.split(':');
  return partes.length === 2 ? partes[0] : primera;
}
