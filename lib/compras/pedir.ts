import sql from "mssql";
import { esEscritura, invalidarBootstrap } from "./cache-bootstrap";

/* ============================================================================
   `pedir(fuente)` — el request() del driver, pero que avisa cuando escribe.

   Reemplaza en repo.ts a `pool.request()` y a `new sql.Request(tx)`. Mira la
   SENTENCIA de cada `.query()` / `.batch()`: si es INSERT/UPDATE/DELETE/MERGE,
   bota la foto compartida del bootstrap (lib/compras/cache-bootstrap.ts). Así la
   invalidación cuelga de la CREACIÓN DE LA CONSULTA y no de que cada escritura se
   acuerde de avisar — una que se olvide es justo el bug que nadie nota hasta que
   un pedido sale duplicado.

   Por qué un helper por sitio de llamada y NO un Proxy sobre el pool: el driver
   le pasa el pool a sus propias transacciones por dentro, y envolverlo entero
   rompe eso y no se puede probar. Esto, en cambio, es una función que devuelve un
   `sql.Request` de verdad.

   Se invalida ANTES y DESPUÉS de la query de escritura: antes, para que ninguna
   foto previa al cambio sobreviva; después (cuando el INSERT ya está firme), para
   cerrar la ventana en la que una lectura concurrente pudo rearmar la foto con
   datos de mitad de camino. Botar de más cuesta una consulta.
   ============================================================================ */

type Fuente = sql.ConnectionPool | sql.Transaction;

function envolver(req: sql.Request, metodo: "query" | "batch"): void {
  const original = (req[metodo] as (...a: unknown[]) => unknown).bind(req);
  (req as unknown as Record<string, unknown>)[metodo] = (comando: unknown, ...resto: unknown[]) => {
    const escribe = esEscritura(comando);
    if (escribe) invalidarBootstrap();
    const r = original(comando, ...resto);
    if (escribe) Promise.resolve(r).then(() => invalidarBootstrap(), () => { /* el error lo maneja quien llama */ });
    return r;
  };
}

export function pedir(fuente: Fuente): sql.Request {
  const req = fuente instanceof sql.Transaction ? new sql.Request(fuente) : fuente.request();
  envolver(req, "query");
  envolver(req, "batch");
  return req;
}
