/* ============================================================================
   Mantenimiento — ESPECIFICACIONES técnicas por equipo.

   Agrega mant.Equipos.especificaciones (NVARCHAR(MAX), JSON): lista de pares
   { "nombre": "Potencia", "valor": "173 hp" } que se cargan desde las fichas
   técnicas (potencia, peso, capacidades de aceite e hidráulico, dimensiones,
   etc.). La app la muestra y la edita en la Ficha técnica del equipo.

   Solo agrega una columna NULL; idempotente.
   ============================================================================ */
SET NOCOUNT ON;
GO

IF COL_LENGTH('mant.Equipos', 'especificaciones') IS NULL
ALTER TABLE mant.Equipos ADD especificaciones NVARCHAR(MAX) NULL;
GO
