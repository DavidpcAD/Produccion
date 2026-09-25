// ─── Qué error ve el cliente ─────────────────────────────────────────────────
// Casi todas las rutas terminan con un catch que devuelve el mensaje de la
// excepción tal cual: `{ error: String(e?.message ?? e) }`. Para los errores de
// negocio eso está bien —y hace falta—: cuando Business Central rechaza una
// orden ("Posting Date is not within your range of allowed posting dates"), ese
// texto es LA respuesta, y esconderlo obligaría a abrir los logs de Azure para
// cada pedido trabado.
//
// El problema son los de la base. Un error de mssql que se va al navegador
// cuenta cosas que no son de quien mira la pantalla:
//     Invalid object name 'pro_obc.sub_partidas'      → el esquema y la tabla
//     Login failed for user 'adelante_app'            → el usuario SQL
//     Cannot open server 'adelante-sql' requested...  → el servidor
// Nada de eso le sirve a nadie en la UI, y a quien esté buscando por dónde
// entrar le dibuja el mapa de la base.
//
// Entonces: los errores de mssql se cambian por un mensaje genérico y el detalle
// queda en el log del servidor; TODO lo demás pasa igual que antes. La librería
// marca los suyos con `name` (RequestError, ConnectionError, TransactionError,
// PreparedStatementError) y `code` (EREQUEST, ELOGIN, ETIMEOUT, ESOCKET…), así
// que se reconocen sin adivinar por el texto.

const NOMBRES_MSSQL = new Set([
  'RequestError',
  'ConnectionError',
  'TransactionError',
  'PreparedStatementError',
]);

const CODIGOS_MSSQL = new Set([
  'EREQUEST', 'ELOGIN', 'ETIMEOUT', 'ESOCKET', 'ECONNCLOSED',
  'ENOTOPEN', 'ENOCONN', 'EINSTLOOKUP', 'EALREADYCONNECTED', 'EABORT',
]);

const GENERICO = 'No se pudo consultar la base de datos. Probá de nuevo; si sigue, avisá a soporte.';

/** ¿La excepción viene de mssql? */
export function esErrorDeBase(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: unknown; code?: unknown; originalError?: unknown };
  if (typeof e.name === 'string' && NOMBRES_MSSQL.has(e.name)) return true;
  if (typeof e.code === 'string' && CODIGOS_MSSQL.has(e.code)) return true;
  // mssql envuelve el error del driver; a veces el nombre útil está adentro.
  if (e.originalError) return esErrorDeBase(e.originalError);
  return false;
}

/**
 * Mensaje que puede ir al navegador. Los errores de la base se reemplazan por
 * uno genérico (el detalle solo al log); el resto pasa como venía.
 */
export function mensajeParaCliente(err: unknown): string {
  if (esErrorDeBase(err)) {
    // Se registra acá y no en cada ruta: varias devuelven el error sin loguearlo,
    // y cambiar el mensaje sin dejar rastro habria sido cambiar una fuga por una
    // pista perdida. El detalle completo queda en el log del servidor.
    console.error('[base de datos]', err);
    return GENERICO;
  }
  if (err instanceof Error) return err.message;
  const e = err as { message?: unknown } | null;
  if (e && typeof e === 'object' && typeof e.message === 'string') return e.message;
  return String(err);
}
