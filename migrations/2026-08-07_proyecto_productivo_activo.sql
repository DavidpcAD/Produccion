/* ============================================================================
   Proyecto: bandera de "proyecto productivo" + inactivación.

   - dbo.Proyecto.esProductivo BIT NOT NULL DEFAULT 0
       Marca los proyectos que pertenecen a Producción, para poder filtrar sus
       obras (Obras → "Solo Producción").
   - dbo.Proyecto.activo BIT NOT NULL DEFAULT 1
       Permite inactivar un proyecto sin borrarlo (no aparece en selectores por
       defecto; sus obras siguen existiendo).

   Backfill: se marca esProductivo = 1 en los proyectos que ya tienen al menos
   una obra con origenPrincipal = 'PRODUCTION' (señal fuerte de que son de
   Producción). El resto queda en 0 y se cura a mano desde la app.

   Idempotente. Correr sobre AdelanteSBX (y luego sobre PRO al desplegar).
   ============================================================================ */

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Proyecto') AND name = 'esProductivo')
    ALTER TABLE dbo.Proyecto ADD esProductivo BIT NOT NULL CONSTRAINT DF_Proyecto_esProductivo DEFAULT 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Proyecto') AND name = 'activo')
    ALTER TABLE dbo.Proyecto ADD activo BIT NOT NULL CONSTRAINT DF_Proyecto_activo DEFAULT 1;
GO

-- Backfill de esProductivo por señal de obras de Producción (solo la primera vez:
-- no piso proyectos que ya tengan la bandera puesta a mano).
UPDATE p
SET p.esProductivo = 1
FROM dbo.Proyecto p
WHERE p.esProductivo = 0
  AND EXISTS (
    SELECT 1 FROM dbo.Obra o
    WHERE o.idProyecto = p.idProyecto
      AND o.origenPrincipal = 'PRODUCTION'
  );
GO
