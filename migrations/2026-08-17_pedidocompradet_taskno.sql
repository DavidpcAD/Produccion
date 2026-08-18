/* ============================================================================
   Compras: guardar la TAREA (Job Task) en la línea de pedido — "Consumo inmediato".

   Al crear un pedido de Consumo inmediato, Ingeniería elige la obra (Job No.) y su
   TAREA (N.º tarea proyecto / Job Task No. de BC). Esa tarea debe viajar
   pedido -> orden -> BC. La orden ya tiene dbo.OrdenCompraDet.taskNo, pero
   dbo.PedidoCompraDet NO tenía columna para la tarea, así que repo la descartaba.

   Se agregan taskNo (código de la tarea) y taskDescr (descripción, para mostrar).
   Idempotente y aditiva (columnas NULL). Correr sobre AdelanteSBX (y PRO al desplegar).
   ============================================================================ */

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.PedidoCompraDet') AND name = 'taskNo'
)
    ALTER TABLE dbo.PedidoCompraDet ADD taskNo NVARCHAR(15) NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.PedidoCompraDet') AND name = 'taskDescr'
)
    ALTER TABLE dbo.PedidoCompraDet ADD taskDescr NVARCHAR(150) NULL;
GO
