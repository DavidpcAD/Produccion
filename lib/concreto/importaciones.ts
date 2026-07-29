import type sqlModule from 'mssql';
import { sql } from '@/lib/db-adelantedb';
import type {
  EstadoImportacion,
  HistorialImportacionesResponse,
  ImportacionResumen,
} from './tipos-ingesta';

// Portado de `api/src/lib/consultar-importaciones.ts` de la app original.
// SQL contra `hor.importaciones_csv`.

export const LIMITE_MAXIMO = 50;
export const LIMITE_DEFAULT = 10;

export interface ListarImportacionesParams {
  limite?: number;
  offset?: number;
}

const ESTADOS_VALIDOS: ReadonlyArray<EstadoImportacion> = [
  'ok',
  'parcial',
  'duplicado_archivo',
  'procesando',
];

/**
 * Mapea valores legacy/inesperados del campo `estado` a uno conocido. Si la BD
 * trae algo desconocido, lo tratamos como `'procesando'` (estado inicial seguro)
 * en lugar de tirar el endpoint.
 */
function normalizarEstado(s: string): EstadoImportacion {
  return (ESTADOS_VALIDOS as ReadonlyArray<string>).includes(s)
    ? (s as EstadoImportacion)
    : 'procesando';
}

/**
 * Devuelve la página actual del historial de importaciones + el total absoluto
 * para que la UI pueda paginar. Ordenado por `fecha_archivo DESC`.
 *
 * Endpoint canónico: `GET /api/concreto/importaciones?limite=N&offset=N`.
 */
export async function listarImportaciones(
  pool: sqlModule.ConnectionPool,
  params: ListarImportacionesParams = {},
): Promise<HistorialImportacionesResponse> {
  // Clamp de límite/offset (mismo criterio que el schema Zod original).
  const limite = Math.min(LIMITE_MAXIMO, Math.max(1, params.limite ?? LIMITE_DEFAULT));
  const offset = Math.max(0, params.offset ?? 0);

  const rItems = await pool
    .request()
    .input('limite', sql.Int, limite)
    .input('offset', sql.Int, offset)
    .query<{
      id: number;
      archivo_nombre: string;
      estado: string;
      filas_totales: number;
      batches_nuevos: number;
      batches_duplicados: number;
      batches_con_error: number;
      usuario_email: string | null;
      fecha_archivo: Date | string;
      archivo_hash: string;
    }>(`
      SELECT
        id,
        archivo_nombre,
        estado,
        filas_totales,
        batches_nuevos,
        batches_duplicados,
        batches_con_error,
        usuario_email,
        fecha_archivo,
        archivo_hash
      FROM hor.importaciones_csv
      ORDER BY fecha_archivo DESC
      OFFSET @offset ROWS
      FETCH NEXT @limite ROWS ONLY
    `);

  const rTotal = await pool
    .request()
    .query<{ total: number }>('SELECT COUNT(*) AS total FROM hor.importaciones_csv');

  const items: ImportacionResumen[] = rItems.recordset.map((row) => ({
    id: row.id,
    archivo_nombre: row.archivo_nombre,
    estado: normalizarEstado(row.estado),
    filas_totales: row.filas_totales,
    batches_nuevos: row.batches_nuevos,
    batches_duplicados: row.batches_duplicados,
    batches_con_error: row.batches_con_error,
    usuario_email: row.usuario_email,
    fecha_archivo:
      row.fecha_archivo instanceof Date
        ? row.fecha_archivo.toISOString()
        : String(row.fecha_archivo),
    archivo_hash: row.archivo_hash,
  }));

  return {
    items,
    total: rTotal.recordset[0]?.total ?? 0,
  };
}
