/* ============================================================================
   Cuadrillas: quitar el índice único LEGACY que rompe el modelo multi-proyecto.

   dbo.CuadrillaSubPartida tenía DOS uniques:
     - UQ_CuadrillaSubPartida            (IDCuadrilla, idSubPartida)   ← LEGACY
     - ux_CuadrillaSubPartida_proyecto_sub (idProyecto,  idSubPartida)  ← correcto

   El modelo actual (migración 2026-07-20) es POR PROYECTO: una subpartida
   pertenece a UNA cuadrilla dentro de un proyecto, pero una misma cuadrilla SÍ
   puede trabajar la misma subpartida en proyectos distintos (ej. "Acabados"
   con 1.1.1 en Valle Ilios y en Valle Novarum).

   El unique legacy (IDCuadrilla, idSubPartida) lo prohíbe: al guardar la 2ª
   ocurrencia lanza 2627 y la UI mostraba el mensaje engañoso "ya está asignada
   a otra cuadrilla" (era la MISMA cuadrilla, otro proyecto). Prueba: 0 cuadrillas
   tenían una subpartida en >1 proyecto → el índice lo venía bloqueando siempre.

   La unicidad correcta la garantiza ux_CuadrillaSubPartida_proyecto_sub. El
   legacy es redundante y erróneo → se elimina.

   Idempotente. Correr sobre AdelanteSBX (y luego sobre PRO al desplegar).
   ============================================================================ */

IF EXISTS (SELECT 1 FROM sys.key_constraints
           WHERE name = 'UQ_CuadrillaSubPartida'
             AND parent_object_id = OBJECT_ID('dbo.CuadrillaSubPartida'))
    ALTER TABLE dbo.CuadrillaSubPartida DROP CONSTRAINT UQ_CuadrillaSubPartida;
GO

-- Por si en algún entorno quedó como índice único (no constraint):
IF EXISTS (SELECT 1 FROM sys.indexes
           WHERE name = 'UQ_CuadrillaSubPartida'
             AND object_id = OBJECT_ID('dbo.CuadrillaSubPartida'))
    DROP INDEX UQ_CuadrillaSubPartida ON dbo.CuadrillaSubPartida;
GO
