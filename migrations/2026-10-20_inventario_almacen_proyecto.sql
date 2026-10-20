/* ============================================================================
   CORRECCIÓN de la definición de "sin liquidar".

   El "almacén virtual" NO es una clasificación Real/Virtual del almacén: es el
   ALMACÉN DE PROYECTO — material que se apartó a una obra y todavía NO se liquidó.
   En Business Central eso es `gomJobWarehouseQuantity > 0` sobre el Item Ledger
   Entry (exactamente lo que muestra la página "Almacén de proyecto" 70720602).

   Se agrega la columna `cantidadProyecto` (la cantidad apartada sin liquidar). La
   bandera `esVirtual` pasa a significar "tiene material sin liquidar en el almacén
   de proyecto" (la llena el ETL con cantidadProyecto > 0), no la clasificación de
   la ubicación.

   dbo.InventarioAlmacen es un SNAPSHOT que el job reconstruye entero en cada corrida,
   así que se recrea sin pérdida de datos reales (hay que volver a correr el sync /
   "Refrescar desde BC"). Idempotente: solo recrea si falta la columna nueva.
============================================================================ */

IF COL_LENGTH('dbo.InventarioAlmacen', 'cantidadProyecto') IS NULL
BEGIN
    DROP TABLE IF EXISTS dbo.InventarioAlmacen;

    CREATE TABLE dbo.InventarioAlmacen (
        entryNo          INT            NOT NULL CONSTRAINT PK_InventarioAlmacen PRIMARY KEY,
        itemNo           NVARCHAR(20)   NOT NULL,
        descripcion      NVARCHAR(150)  NULL,
        categoria        NVARCHAR(20)   NULL,
        obra             NVARCHAR(20)   NULL,
        jobTaskNo        NVARCHAR(250)  NULL,
        almacen          NVARCHAR(20)   NULL,
        esVirtual        BIT            NOT NULL CONSTRAINT DF_InvAlm_esVirtual   DEFAULT (0), -- sin liquidar (apartado) = cantidadProyecto > 0
        tipoAlmacen      NVARCHAR(20)   NULL,
        variante         NVARCHAR(20)   NULL,
        unidad           NVARCHAR(20)   NULL,
        cantidad         DECIMAL(18,4)  NOT NULL CONSTRAINT DF_InvAlm_cantidad    DEFAULT (0), -- Remaining Quantity (existencia del movimiento)
        cantidadProyecto DECIMAL(18,4)  NULL,   -- GomJob Warehouse Quantity: apartado en el almacén de proyecto SIN LIQUIDAR
        costoActual      DECIMAL(18,4)  NULL,
        tipoMovimiento   NVARCHAR(40)   NULL,
        documentoNo      NVARCHAR(40)   NULL,
        procedenciaNo    NVARCHAR(40)   NULL,
        proveedor        NVARCHAR(120)  NULL,
        idBoletaEntrega  NVARCHAR(30)   NULL,
        fechaMovimiento  DATE           NULL,
        actualizado      DATETIME2      NOT NULL CONSTRAINT DF_InvAlm_actualizado DEFAULT (SYSUTCDATETIME())
    );

    CREATE INDEX IX_InventarioAlmacen_filtros
        ON dbo.InventarioAlmacen (esVirtual, categoria, almacen)
        INCLUDE (itemNo, obra, cantidad, cantidadProyecto);
END
GO
