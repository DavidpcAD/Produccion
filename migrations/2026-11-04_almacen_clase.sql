/* ============================================================================
   ALMACÉN REAL vs VIRTUAL: marca manual por almacén de BC

   POR QUÉ: en "Nuevo pedido" → Destino ALM, el filtro "Bodegas" sale de una regla
   por código (ALM-*, F-*, GEN-*, HER, MAQ) y mezcla almacenes físicos con
   virtuales. Business Central tiene el campo Location."GJW Tipo Almacen"
   (Real/Virtual) pero viene casi todo vacío, así que no sirve de fuente. Y la
   marca "Almacén físico" de la obra (dbo.Obra.esAlmacenFisico) no alcanza: hay
   almacenes que no son obra (ALM-GRAL, ALM-BAR…).

   QUÉ HACE: crea dbo.AlmacenClase, una fila por almacén MARCADO (código de la
   Location de BC). Sin fila = sin marcar = sigue mandando la regla por código, así
   que crear la tabla no cambia nada hasta que alguien marque. Se marca desde
   /bc/almacenes (Business Central → Almacenes, solo Super Admin) o con la casilla
   "Almacén físico (bodega)" del editor de obra: es UNA sola marca.

   Además pasa acá las obras que ya tenían dbo.Obra.esAlmacenFisico = 1 (la marca
   por obra de 2026-10-27, que queda sin uso: F-MADERAS en SBX y PRO) como "real".

   Idempotente. Se auto-aplica en producción al arrancar (lib/migraciones.ts, fecha
   >= 2026-10-15). En desarrollo:

     node scripts/aplicar-sql.mjs migrations/2026-11-04_almacen_clase.sql --confirm

   DESHACER:
     DROP TABLE dbo.AlmacenClase;
   ============================================================================ */

IF OBJECT_ID('dbo.AlmacenClase', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AlmacenClase (
        codigo          VARCHAR(20)   NOT NULL CONSTRAINT PK_AlmacenClase PRIMARY KEY,
        -- 1 = virtual (no es un lugar físico), 0 = real (bodega física).
        esVirtual       BIT           NOT NULL,
        actualizadoPor  NVARCHAR(100) NULL,
        actualizadoEn   DATETIME2     NOT NULL CONSTRAINT DF_AlmacenClase_actualizadoEn DEFAULT SYSUTCDATETIME()
    );
END
GO

-- La marca vieja por obra → la marca única. Con SQL dinámico porque la columna
-- puede no existir (si la migración 2026-10-27 nunca corrió en esa base) y una
-- referencia directa a una columna inexistente no compila.
IF COL_LENGTH('dbo.Obra', 'esAlmacenFisico') IS NOT NULL
    EXEC(N'
        INSERT INTO dbo.AlmacenClase (codigo, esVirtual, actualizadoPor)
        SELECT DISTINCT UPPER(LTRIM(RTRIM(o.numeroObra))), 0, N''migracion: Obra.esAlmacenFisico''
        FROM dbo.Obra o
        WHERE o.esAlmacenFisico = 1
          AND LEN(LTRIM(RTRIM(o.numeroObra))) BETWEEN 1 AND 20
          AND NOT EXISTS (SELECT 1 FROM dbo.AlmacenClase c
                          WHERE c.codigo = UPPER(LTRIM(RTRIM(o.numeroObra))));
    ');
GO

-- Verificación
SELECT codigo, CASE WHEN esVirtual = 1 THEN 'virtual' ELSE 'real' END AS clase, actualizadoPor
FROM dbo.AlmacenClase ORDER BY codigo;
GO
