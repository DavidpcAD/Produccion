/* ============================================================================
   Mantenimiento — ajustes de CHECKLIST DIARIO pedidos por Steven (2026-10-22).

   1) La Autohormigonera Fiori Pequeña DB 180 (MEZC-02) usa el MISMO checklist
      que la Autohormigonera Fiori Grande DB 460 (MEZC-01): se quitan sus
      actividades actuales y se copian las de MEZC-01 (mismo orden, título y
      detalle). Solo si hoy los dos checklists son distintos (por título).
      ⚠ Este paso BORRA las actividades de checklist de MEZC-02 (no inspecciones:
      el historial guarda su propia copia de cada actividad revisada).

   2) "Revisión de rótulas" al final del checklist de TODOS los equipos que ya
      tienen checklist y todavía no la tienen. Los equipos sin checklist no se
      tocan.

   Seguridad
   ---------
   - Busca los equipos por CÓDIGO (MEZC-01 / MEZC-02), no por id.
   - Idempotente: una segunda corrida no cambia nada (el paso 1 se saltea si
     los checklists ya son iguales; el 2 si la actividad ya existe).
   - Un solo lote y una transacción: entra todo o nada.
   ============================================================================ */
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
BEGIN TRANSACTION;

DECLARE @origen  UNIQUEIDENTIFIER = (SELECT id FROM mant.Equipos WHERE codigo = N'MEZC-01');
DECLARE @destino UNIQUEIDENTIFIER = (SELECT id FROM mant.Equipos WHERE codigo = N'MEZC-02');

-- 1) MEZC-02 := checklist de MEZC-01 (solo si hoy difieren).
IF @origen IS NOT NULL AND @destino IS NOT NULL
   AND EXISTS (SELECT 1 FROM mant.ChecklistDiarioItems WHERE equipoId = @origen)
   AND (
        EXISTS (SELECT titulo FROM mant.ChecklistDiarioItems WHERE equipoId = @origen
                EXCEPT
                SELECT titulo FROM mant.ChecklistDiarioItems WHERE equipoId = @destino)
     OR EXISTS (SELECT titulo FROM mant.ChecklistDiarioItems WHERE equipoId = @destino
                EXCEPT
                SELECT titulo FROM mant.ChecklistDiarioItems WHERE equipoId = @origen)
   )
BEGIN
    DELETE FROM mant.ChecklistDiarioItems WHERE equipoId = @destino;

    INSERT INTO mant.ChecklistDiarioItems (equipoId, orden, titulo, detalle)
    SELECT @destino, orden, titulo, detalle
    FROM mant.ChecklistDiarioItems
    WHERE equipoId = @origen;
END

-- 2) "Revisión de rótulas" al final de cada checklist que no la tenga.
INSERT INTO mant.ChecklistDiarioItems (equipoId, orden, titulo, detalle)
SELECT e.id,
       (SELECT MAX(c.orden) + 1 FROM mant.ChecklistDiarioItems c WHERE c.equipoId = e.id),
       N'Revisión de rótulas',
       N'Rótulas de dirección y suspensión (y de brazos o cilindros si el equipo los tiene): sin juego ni holgura, guardapolvos sanos y engrasadas.'
FROM mant.Equipos e
WHERE EXISTS (SELECT 1 FROM mant.ChecklistDiarioItems c WHERE c.equipoId = e.id)
  AND NOT EXISTS (SELECT 1 FROM mant.ChecklistDiarioItems c WHERE c.equipoId = e.id AND c.titulo = N'Revisión de rótulas');

COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
