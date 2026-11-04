/* ============================================================================
   LOS 3 ALMACENES FÍSICOS

   POR QUÉ: en el Nuevo pedido (ALM y Stock) solo tienen que salir los almacenes
   FÍSICOS, y desde 2026-11-04 eso es exactamente "marcado Real" en
   dbo.AlmacenClase (esBodegaReal, sin regla por código). David definió los tres:
     ALM-GRAL   Almacén General
     ALM-BAR    Almacén Barani
     F-MADERAS  Fábrica Maderas
   Uno nuevo se marca después desde Business Central → Almacenes; no hace falta
   tocar esto.

   Va después de 2026-11-04_almacen_clase.sql (orden alfabético = el que usa
   lib/migraciones.ts), que crea la tabla. Idempotente; solo toca estos tres.
   Se auto-aplica en producción al arrancar. En desarrollo:

     node scripts/aplicar-sql.mjs migrations/2026-11-04_almacen_fisicos.sql --confirm
   ============================================================================ */

IF OBJECT_ID('dbo.AlmacenClase', 'U') IS NOT NULL
BEGIN
    MERGE dbo.AlmacenClase AS t
    USING (VALUES ('ALM-GRAL'), ('ALM-BAR'), ('F-MADERAS')) AS s (codigo)
       ON t.codigo = s.codigo
    WHEN MATCHED AND t.esVirtual <> 0 THEN
        UPDATE SET esVirtual = 0, actualizadoPor = N'migracion: almacenes fisicos', actualizadoEn = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN
        INSERT (codigo, esVirtual, actualizadoPor) VALUES (s.codigo, 0, N'migracion: almacenes fisicos');
END
GO

-- Verificación: los que hoy salen en el pedido.
SELECT codigo, actualizadoPor FROM dbo.AlmacenClase WHERE esVirtual = 0 ORDER BY codigo;
GO
