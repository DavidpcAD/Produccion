/* ============================================================================
   Snapshot de INVENTARIO POR ALMACÉN para la app de Reportes (que consulta SQL,
   no BC). Lo llena el job `refrescarInventarioAlmacen` (lib/inventario/snapshot.ts)
   desde Business Central:

     · dbo.InventarioAlmacen      → 1 fila por MOVIMIENTO de inventario SIN LIQUIDAR,
       es decir cada Item Ledger Entry ABIERTA (Remaining Quantity ≠ 0). Fuente BC:
       page 50114 "GJW Item Ledger Entry API" (itemLedgerEntriesWithTasks). Trae ya
       cruzada la CATEGORÍA del artículo (ItemCategoryCode, para los filtros de
       Reportes) y la marca `esVirtual` del almacén (Location."GJW Tipo Almacen",
       enum Real/Virtual que expone la page 50234 "Adelante Location API").

       De esta tabla salen las tres vistas:
         - inventario por almacén  → agrupar por `almacen`
         - sin liquidar en virtuales → filtrar `esVirtual = 1`
         - por categoría           → filtrar `categoria`

     · dbo.InventarioAlmacenSync  → 1 fila (id=1) con la frescura de la última corrida.

   El refresco es NOCTURNO (ver app/api/bc/inventario/sync-almacen). Esta migración
   tiene prefijo de fecha ≥ CUTOFF (2026-10-15), así que se auto-aplica en prod al
   arrancar la app (lib/migraciones.ts). Todo con IF NOT EXISTS → idempotente.
============================================================================ */

IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id
               WHERE s.name = 'dbo' AND t.name = 'InventarioAlmacen')
CREATE TABLE dbo.InventarioAlmacen (
    entryNo          INT            NOT NULL CONSTRAINT PK_InventarioAlmacen PRIMARY KEY,  -- Item Ledger Entry No. (único)
    itemNo           NVARCHAR(20)   NOT NULL,
    descripcion      NVARCHAR(150)  NULL,
    categoria        NVARCHAR(20)   NULL,   -- ItemCategoryCode (filtro de Reportes)
    obra             NVARCHAR(20)   NULL,   -- Global Dimension 1 Code
    jobTaskNo        NVARCHAR(250)  NULL,   -- tarea(s) de la obra (lista separada por coma)
    almacen          NVARCHAR(20)   NULL,   -- Location Code
    esVirtual        BIT            NOT NULL CONSTRAINT DF_InvAlm_esVirtual   DEFAULT (0),
    tipoAlmacen      NVARCHAR(20)   NULL,   -- 'Real' | 'Virtual' | NULL (sin clasificar)
    variante         NVARCHAR(20)   NULL,
    unidad           NVARCHAR(20)   NULL,
    cantidad         DECIMAL(18,4)  NOT NULL CONSTRAINT DF_InvAlm_cantidad    DEFAULT (0), -- Remaining Quantity
    costoActual      DECIMAL(18,4)  NULL,
    tipoMovimiento   NVARCHAR(40)   NULL,   -- Entry Type
    documentoNo      NVARCHAR(40)   NULL,
    procedenciaNo    NVARCHAR(40)   NULL,   -- Source No.
    proveedor        NVARCHAR(120)  NULL,
    idBoletaEntrega  NVARCHAR(30)   NULL,
    fechaMovimiento  DATE           NULL,   -- Posting Date
    actualizado      DATETIME2      NOT NULL CONSTRAINT DF_InvAlm_actualizado DEFAULT (SYSUTCDATETIME())
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InventarioAlmacen_filtros'
               AND object_id = OBJECT_ID('dbo.InventarioAlmacen'))
CREATE INDEX IX_InventarioAlmacen_filtros
    ON dbo.InventarioAlmacen (esVirtual, categoria, almacen)
    INCLUDE (itemNo, obra, cantidad);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id
               WHERE s.name = 'dbo' AND t.name = 'InventarioAlmacenSync')
CREATE TABLE dbo.InventarioAlmacenSync (
    id             INT            NOT NULL CONSTRAINT PK_InventarioAlmacenSync PRIMARY KEY,
    ultimaCorrida  DATETIME2      NULL,
    filas          INT            NULL,
    ok             BIT            NULL,
    ms             INT            NULL,
    mensaje        NVARCHAR(400)  NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.InventarioAlmacenSync WHERE id = 1)
INSERT INTO dbo.InventarioAlmacenSync (id) VALUES (1);
GO
