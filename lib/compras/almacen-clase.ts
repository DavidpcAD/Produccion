import 'server-only';
import { getDb, sql } from '@/lib/db';
import { esBodegaReal, type ClaseAlmacen } from '@/lib/compras/helpers';

// Marca manual Real/Virtual por almacén de BC (dbo.AlmacenClase, migración
// 2026-11-04_almacen_clase.sql). Una fila = un almacén marcado; sin fila = sin
// marcar (manda la regla por código de esAlmacenDeBodega). Es UNA sola marca para
// toda la app: se edita desde /bc/almacenes o con la casilla "Almacén físico" del
// editor de obra (el almacén de BC de una obra tiene su mismo código), la lee el
// "Nuevo pedido" para armar la lista de Bodegas y la columna "Clase" de Obras.

export interface MarcaAlmacen {
  clase: ClaseAlmacen;
  actualizadoPor: string | null;
  actualizadoEn: string | null;
}

/** Marcas por código de almacén (en mayúscula). Si la tabla todavía no existe
 *  (la migración corre al arrancar en prod), devuelve vacío: todo queda "sin
 *  marcar" y el pedido sigue con la regla por código, como antes. */
export async function leerClasesAlmacen(): Promise<Map<string, MarcaAlmacen>> {
  const out = new Map<string, MarcaAlmacen>();
  try {
    const db = await getDb();
    const r = await db.request().query<{
      codigo: string; esVirtual: boolean; actualizadoPor: string | null; actualizadoEn: Date | null;
    }>('SELECT codigo, esVirtual, actualizadoPor, actualizadoEn FROM dbo.AlmacenClase');
    for (const f of r.recordset) {
      out.set(String(f.codigo).trim().toUpperCase(), {
        clase: f.esVirtual ? 'virtual' : 'real',
        actualizadoPor: f.actualizadoPor ?? null,
        actualizadoEn: f.actualizadoEn ? new Date(f.actualizadoEn).toISOString() : null,
      });
    }
  } catch (e) {
    console.error('leerClasesAlmacen:', e);
  }
  return out;
}

/** Cómo cuenta HOY un código: la marca si la hay; si no, la regla por código.
 *  Es lo mismo que decide la lista "Bodegas" del pedido. */
export function almacenFisicoDe(clases: Map<string, MarcaAlmacen>, codigo: string): {
  esAlmacenFisico: boolean; claseAlmacen: ClaseAlmacen | null;
} {
  const clase = clases.get(String(codigo ?? '').trim().toUpperCase())?.clase ?? null;
  return { esAlmacenFisico: esBodegaReal({ codigo: String(codigo ?? ''), clase }), claseAlmacen: clase };
}

/** Pone (o quita, con clase null) la marca de un almacén. */
export async function guardarClaseAlmacen(codigo: string, clase: ClaseAlmacen | null, usuario: string): Promise<void> {
  const cod = codigo.trim().toUpperCase();
  const db = await getDb();
  if (clase === null) {
    await db.request()
      .input('cod', sql.VarChar(20), cod)
      .query('DELETE FROM dbo.AlmacenClase WHERE codigo = @cod');
    return;
  }
  await db.request()
    .input('cod', sql.VarChar(20), cod)
    .input('virt', sql.Bit, clase === 'virtual')
    .input('por', sql.NVarChar(100), usuario.slice(0, 100))
    .query(`
      MERGE dbo.AlmacenClase AS t
      USING (SELECT @cod AS codigo) AS s ON t.codigo = s.codigo
      WHEN MATCHED THEN
        UPDATE SET esVirtual = @virt, actualizadoPor = @por, actualizadoEn = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (codigo, esVirtual, actualizadoPor) VALUES (@cod, @virt, @por);
    `);
}
