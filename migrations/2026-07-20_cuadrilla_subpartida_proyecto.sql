/* ============================================================================
   Exclusividad de subpartida POR PROYECTO en las cuadrillas.

   Regla: dentro de un mismo proyecto, una subpartida (ej. 1.1.1) la puede tomar
   UNA sola cuadrilla. En OTRO proyecto, otra cuadrilla sí puede tomar la misma
   subpartida.

   Se denormaliza idProyecto en dbo.CuadrillaSubPartida (viene de Cuadrilla.IDProyecto)
   para poder poner un índice único (idProyecto, idSubPartida). La tabla está
   vacía hoy, así que no hay backfill.

   Correr UNA sola vez sobre AdelanteSBX (NO AdelantePRO).
   ============================================================================ */

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.CuadrillaSubPartida') AND name = 'idProyecto'
)
    ALTER TABLE dbo.CuadrillaSubPartida ADD idProyecto INT NULL;
GO

-- Una subpartida, dentro de un proyecto, pertenece a una sola cuadrilla.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_CuadrillaSubPartida_proyecto_sub')
    CREATE UNIQUE INDEX ux_CuadrillaSubPartida_proyecto_sub
        ON dbo.CuadrillaSubPartida (idProyecto, idSubPartida)
        WHERE idProyecto IS NOT NULL;
GO
