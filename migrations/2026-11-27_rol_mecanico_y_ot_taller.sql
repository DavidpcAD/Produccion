/* ============================================================================
   App móvil de maquinaria — perfil MECÁNICO.

   1. Rol de Producción "Mecánico" (idApp 10). Da SOLO el módulo 'mecanico'
      (lib/permissions.ts → modulosDeRol): la app móvil en su vista de taller,
      sin pantallas de la web ni nivel. Se matchea por NOMBRE.
   2. Dos columnas en mant.OrdenesTrabajo, las dos opcionales (no cambian nada
      de lo que ya hace la web de Mantenimiento):
        · tecnicoId       → quién la empezó desde la app (mant.Usuarios). Todas
                            las OT abiertas las ven todos los mecánicos; al
                            empezarla queda de quien la empezó y solo esa
                            persona la termina.
        · duracionMinutos → cuánto duró el trabajo, lo que dice el mecánico al
                            terminarla.

   Después de esto, al mecánico hay que darle usuario de Producción y asignarle
   el rol (dbo.UsuarioRol). Ve todas las máquinas: no hace falta asignarle nada
   en mant.AsignacionesEquipo.

   Idempotente y aditiva. En PRO se aplica sola al arrancar (lib/migraciones.ts);
   en SBX: node scripts/aplicar-sql.mjs migrations/2026-11-27_rol_mecanico_y_ot_taller.sql --confirm
   DESHACER:
     ALTER TABLE mant.OrdenesTrabajo DROP CONSTRAINT FK_OrdenesTrabajo_tecnico;
     ALTER TABLE mant.OrdenesTrabajo DROP COLUMN tecnicoId, duracionMinutos;
     DELETE ur FROM dbo.UsuarioRol ur JOIN dbo.Rol r ON r.idRol = ur.idRol
       WHERE r.idApp = 10 AND r.nombre = N'Mecánico';
     DELETE FROM dbo.Rol WHERE idApp = 10 AND nombre = N'Mecánico';
   ============================================================================ */
IF NOT EXISTS (SELECT 1 FROM dbo.Rol WHERE idApp = 10 AND nombre IN (N'Mecánico', N'Mecanico'))
  INSERT INTO dbo.Rol (idApp, nombre, descripcion, tipo, fechaCreacion, creadoPor)
  VALUES (10, N'Mecánico',
          N'App móvil de maquinaria: ve todas las máquinas, empieza y termina OT y consulta repuestos',
          'General', SYSUTCDATETIME(), 'migracion-app-maquinaria');
GO

IF COL_LENGTH('mant.OrdenesTrabajo', 'tecnicoId') IS NULL
  ALTER TABLE mant.OrdenesTrabajo ADD tecnicoId UNIQUEIDENTIFIER NULL;
GO
IF COL_LENGTH('mant.OrdenesTrabajo', 'duracionMinutos') IS NULL
  ALTER TABLE mant.OrdenesTrabajo ADD duracionMinutos INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_OrdenesTrabajo_tecnico')
  ALTER TABLE mant.OrdenesTrabajo ADD CONSTRAINT FK_OrdenesTrabajo_tecnico
    FOREIGN KEY (tecnicoId) REFERENCES mant.Usuarios (id);
GO

SELECT idRol, nombre FROM dbo.Rol WHERE idApp = 10 AND nombre = N'Mecánico';
SELECT COL_LENGTH('mant.OrdenesTrabajo', 'tecnicoId') AS tecnicoId, COL_LENGTH('mant.OrdenesTrabajo', 'duracionMinutos') AS duracionMinutos;
