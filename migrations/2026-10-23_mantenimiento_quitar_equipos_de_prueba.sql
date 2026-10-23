/* ============================================================================
   Mantenimiento — QUITAR los 5 equipos de PRUEBA y todo lo asociado.

   Pedido por Steven (2026-10-23): estos equipos vinieron de los datos de
   ejemplo de la app original (no existen en la flota) y se copiaron a PRO con
   la migración 2026-10-20_mantenimiento_equipos_y_checklists_a_pro:
     EXC-01 Excavadora CAT 320          RET-02 Retroexcavadora JCB 3CX
     COM-05 Compactadora Bomag BW 213   GRU-04 Grúa Torre Liebherr
     VOL-03 Volquete Volvo FMX
   Se identifican por CÓDIGO y NOMBRE exactos, así nunca se borra un equipo
   real que en el futuro reutilice uno de esos códigos.

   ⚠ BORRA DATOS. Además del equipo, todo lo que depende de él (sin esto la
   base no deja borrarlo): sus órdenes de trabajo, planes preventivos,
   repuestos asignados y sus movimientos, lecturas de horómetro, inspecciones
   diarias, solicitudes de material, asignaciones y checklist.
   No borra archivos de mant.Archivos (fotos/firmas quedan huérfanas, sin uso).

   Idempotente: si ya no existen, no hace nada. Un lote, una transacción.
   ============================================================================ */
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
BEGIN TRANSACTION;

DECLARE @Equipos TABLE (id UNIQUEIDENTIFIER PRIMARY KEY);
INSERT INTO @Equipos (id)
SELECT e.id
FROM mant.Equipos e
JOIN (VALUES
    (N'EXC-01', N'Excavadora CAT 320'),
    (N'RET-02', N'Retroexcavadora JCB 3CX'),
    (N'COM-05', N'Compactadora Bomag BW 213'),
    (N'GRU-04', N'Grúa Torre Liebherr'),
    (N'VOL-03', N'Volquete Volvo FMX')
) AS prueba(codigo, nombre) ON prueba.codigo = e.codigo AND prueba.nombre = e.nombre;

DECLARE @OTs TABLE (id UNIQUEIDENTIFIER PRIMARY KEY);
INSERT INTO @OTs (id) SELECT id FROM mant.OrdenesTrabajo WHERE equipoId IN (SELECT id FROM @Equipos);

DECLARE @Planes TABLE (id UNIQUEIDENTIFIER PRIMARY KEY);
INSERT INTO @Planes (id) SELECT id FROM mant.PlanesMantenimiento WHERE equipoId IN (SELECT id FROM @Equipos);

DECLARE @Repuestos TABLE (id UNIQUEIDENTIFIER PRIMARY KEY);
INSERT INTO @Repuestos (id) SELECT id FROM mant.Repuestos WHERE equipoId IN (SELECT id FROM @Equipos);

-- Hijos primero (respeta todas las FK de mant).
DELETE FROM mant.MovimientosRepuestos
WHERE otId IN (SELECT id FROM @OTs) OR repuestoId IN (SELECT id FROM @Repuestos);

DELETE FROM mant.LecturasHorometro
WHERE equipoId IN (SELECT id FROM @Equipos) OR otId IN (SELECT id FROM @OTs);

-- Una OT de OTRO equipo no debería usar estos planes; si pasara, solo se desvincula.
UPDATE mant.OrdenesTrabajo SET planId = NULL
WHERE planId IN (SELECT id FROM @Planes) AND id NOT IN (SELECT id FROM @OTs);

DELETE FROM mant.OrdenesTrabajo        WHERE id IN (SELECT id FROM @OTs);
DELETE FROM mant.PlanesMantenimiento   WHERE id IN (SELECT id FROM @Planes);
DELETE FROM mant.Repuestos             WHERE id IN (SELECT id FROM @Repuestos);
DELETE FROM mant.InspeccionesDiarias   WHERE equipoId IN (SELECT id FROM @Equipos);
DELETE FROM mant.SolicitudesMateriales WHERE equipoId IN (SELECT id FROM @Equipos);
DELETE FROM mant.AsignacionesEquipo    WHERE equipoId IN (SELECT id FROM @Equipos);
DELETE FROM mant.ChecklistDiarioItems  WHERE equipoId IN (SELECT id FROM @Equipos);
DELETE FROM mant.Equipos               WHERE id IN (SELECT id FROM @Equipos);

COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
