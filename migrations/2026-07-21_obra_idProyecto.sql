/* ============================================================================
   Amarra cada Obra a un Proyecto (dbo.Proyecto). El vínculo vive SOLO en SQL
   (a Business Central se sigue enviando lo mismo que hoy; el proyecto no viaja).

   - Agrega dbo.Obra.idProyecto (FK a dbo.Proyecto), nullable.
   - Backfill por prefijo del N° de obra = abreviatura del proyecto
     (VN-… → Valle Novarum, VI-…, VB-…, VC-…). Las obras cuyo prefijo no calza
     con ninguna abreviatura quedan en NULL (se asignan a mano en "Editar obra").

   Idempotente. Correr sobre AdelanteSBX.
   ============================================================================ */

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Obra') AND name = 'idProyecto')
    ALTER TABLE dbo.Obra ADD idProyecto INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_Obra_Proyecto')
    ALTER TABLE dbo.Obra WITH CHECK
        ADD CONSTRAINT fk_Obra_Proyecto FOREIGN KEY (idProyecto) REFERENCES dbo.Proyecto(idProyecto);
GO

-- Backfill por prefijo (texto antes del primer '-') = Proyecto.abreviatura.
UPDATE o
SET o.idProyecto = p.idProyecto
FROM dbo.Obra o
JOIN dbo.Proyecto p
  ON p.abreviatura = CASE WHEN CHARINDEX('-', o.numeroObra) > 0
                          THEN LEFT(o.numeroObra, CHARINDEX('-', o.numeroObra) - 1)
                          ELSE o.numeroObra END
WHERE o.idProyecto IS NULL;
GO
