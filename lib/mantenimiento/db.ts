// Capa de DB del módulo Mantenimiento (app de Steven, portada a Produccion).
//
// En el repo original esto abría su propio pool contra AZURE_SQL_*. Acá, dentro
// de Produccion, reusa el pool compartido de `@/lib/db` (getDb) — la MISMA base
// (AdelanteSBX en dev, AdelantePRO en prod). Las tablas de este módulo viven en
// el esquema `mant` (mant.Equipos, mant.OrdenesTrabajo, …); las queries de las
// rutas se calificaron con ese esquema al portarlas.
//
// Firma idéntica a la del repo (ejecutar / iniciarTransaccion / sql / ErrorSql)
// para que las rutas portadas no cambien su forma de llamar.
import { getDb, sql } from "@/lib/db";

export { sql };

export interface ErrorSql extends Error {
  number?: number;
}

export async function ejecutar<T>(armarRequest: (request: sql.Request) => Promise<T>): Promise<T> {
  const pool = await getDb();
  return armarRequest(pool.request());
}

export async function iniciarTransaccion(): Promise<sql.Transaction> {
  const pool = await getDb();
  const transaccion = new sql.Transaction(pool);
  await transaccion.begin();
  return transaccion;
}

export async function obtenerPool(): Promise<sql.ConnectionPool> {
  return getDb();
}
