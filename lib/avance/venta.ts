import type { ConnectionPool } from 'mssql';
import type { EstadoVenta } from './types';

/**
 * Refresca `obc.obra_estado.estado_venta` desde `dbo.V_CasosActivos` (fuente
 * real del sistema de ventas, caso más reciente por IDBD). Best-effort e
 * idempotente: solo escribe filas que cambiaron y nunca tumba al endpoint que
 * lo llama. Se invoca al inicio de los endpoints que muestran estado de venta.
 */
export async function refrescarEstadoVenta(db: ConnectionPool): Promise<void> {
  try {
    await db.request().query(`
      UPDATE e
      SET e.estado_venta = m.nuevo, e.actualizado_en = SYSUTCDATETIME()
      FROM obc.obra_estado e
      JOIN (
        SELECT IDBD,
          CASE Estado
            WHEN 'Entregado'   THEN 'entregada'
            WHEN 'Formalizado' THEN 'formalizada'
            WHEN 'Reservado'   THEN 'reservada'
            WHEN 'Disponible'  THEN 'disponible'
            ELSE NULL
          END AS nuevo
        FROM (
          SELECT IDBD, Estado,
                 ROW_NUMBER() OVER (PARTITION BY IDBD ORDER BY IDCaso DESC) AS rn
          FROM dbo.V_CasosActivos WHERE IDBD IS NOT NULL
        ) x WHERE rn = 1
      ) m ON m.IDBD COLLATE DATABASE_DEFAULT = e.obra_codigo COLLATE DATABASE_DEFAULT
      WHERE m.nuevo IS NOT NULL
        AND (e.estado_venta IS NULL OR e.estado_venta <> m.nuevo)
    `);
  } catch {
    // best-effort: el refresco de venta nunca debe romper el endpoint lector.
  }
}

/** Metadatos de cada estado de venta (letra + etiqueta) para los badges. */
export const VENTA_META: Record<EstadoVenta, { letra: string; label: string }> = {
  formalizada: { letra: 'F', label: 'Formalizada' },
  reservada: { letra: 'R', label: 'Reservada' },
  entregada: { letra: 'E', label: 'Entregada' },
  disponible: { letra: 'D', label: 'Disponible' },
};
