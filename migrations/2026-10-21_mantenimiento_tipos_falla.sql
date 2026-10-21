/* ============================================================================
   Mantenimiento — HISTORIAL DE FALLAS: tipos de falla y clasificación de OTs.

   Qué agrega
   ----------
   - mant.TiposFalla: lista editable desde la app (Motor, Hidráulico, ...).
     No se borran: se desactivan (activo = 0), así el historial no pierde el
     nombre del tipo.
   - mant.OrdenesTrabajo.tipoFallaId (NULL = sin clasificar): el tipo de falla
     que el encargado de Mantenimiento le asigna a cada OT.
   - La lista sugerida de tipos (solo los que falten, por nombre).

   Seguridad
   ---------
   - Solo AGREGA (tabla, columna, FK, índice y filas faltantes). No borra ni
     modifica datos existentes.
   - Idempotente: cada paso va con IF NOT EXISTS / COL_LENGTH, se puede correr
     más de una vez. Lotes separados con GO porque la FK y el índice necesitan
     que la columna ya exista.
   ============================================================================ */
SET NOCOUNT ON;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'TiposFalla' AND schema_id = SCHEMA_ID('mant'))
CREATE TABLE mant.TiposFalla (
    id        UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_TiposFalla_id DEFAULT NEWID() PRIMARY KEY,
    nombre    NVARCHAR(60)     NOT NULL,
    orden     INT              NOT NULL CONSTRAINT DF_TiposFalla_orden DEFAULT 0,
    activo    BIT              NOT NULL CONSTRAINT DF_TiposFalla_activo DEFAULT 1,
    creadoEn  DATETIME2        NOT NULL CONSTRAINT DF_TiposFalla_creadoEn DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_TiposFalla_nombre UNIQUE (nombre)
);
GO

IF COL_LENGTH('mant.OrdenesTrabajo', 'tipoFallaId') IS NULL
ALTER TABLE mant.OrdenesTrabajo ADD tipoFallaId UNIQUEIDENTIFIER NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_OrdenesTrabajo_TipoFalla' AND schema_id = SCHEMA_ID('mant'))
ALTER TABLE mant.OrdenesTrabajo ADD CONSTRAINT FK_OrdenesTrabajo_TipoFalla FOREIGN KEY (tipoFallaId) REFERENCES mant.TiposFalla(id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_OrdenesTrabajo_tipoFallaId' AND object_id = OBJECT_ID('mant.OrdenesTrabajo'))
CREATE INDEX IX_OrdenesTrabajo_tipoFallaId ON mant.OrdenesTrabajo(tipoFallaId);
GO

-- Lista sugerida (equipo pesado y vehículos). Solo inserta los que falten.
INSERT INTO mant.TiposFalla (nombre, orden)
SELECT s.nombre, s.orden
FROM (VALUES
    (N'Motor', 0),
    (N'Sistema hidráulico', 1),
    (N'Sistema eléctrico', 2),
    (N'Frenos', 3),
    (N'Transmisión', 4),
    (N'Llantas', 5),
    (N'Dirección y suspensión', 6),
    (N'Refrigeración', 7),
    (N'Combustible', 8),
    (N'Carrocería y cabina', 9),
    (N'Implemento (brazo, pluma, balde)', 10),
    (N'Otro', 11)
) AS s(nombre, orden)
WHERE NOT EXISTS (SELECT 1 FROM mant.TiposFalla t WHERE t.nombre = s.nombre);
GO
