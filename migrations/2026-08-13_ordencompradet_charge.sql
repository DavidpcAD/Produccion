/* ============================================================================
   Compras: guardar el TIPO de cargo de producto (Item Charge de BC) en la orden.

   Bug: al crear la orden en Proveeduría se elige el tipo de cargo (p.ej.
   "01 · Transporte") y el método de asignación, pero esos datos nunca se
   persistían: la tabla dbo.OrdenCompraDet no tenía columnas para ellos, así que
   repo.createOrden los descartaba en el INSERT y mapOrden los leía como
   undefined. Al aprobar y lanzar a BC, el cargo viajaba SIN tipo y BC lo
   rechazaba: "El cargo no tiene tipo (Item Charge)" (cargosCreados: 0). Las
   líneas de artículo entraban bien; solo el cargo se caía.

   El código ya se corrigió (store.tsx + repo.ts propagan chargeNo/chargeMethod).
   Esta migración agrega las columnas de respaldo. Idempotente.
   Correr sobre AdelanteSBX (y PRO al desplegar).
   ============================================================================ */

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.OrdenCompraDet') AND name = 'chargeNo'
)
    ALTER TABLE dbo.OrdenCompraDet ADD chargeNo NVARCHAR(20) NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.OrdenCompraDet') AND name = 'chargeMethod'
)
    ALTER TABLE dbo.OrdenCompraDet ADD chargeMethod NVARCHAR(20) NULL;
GO
