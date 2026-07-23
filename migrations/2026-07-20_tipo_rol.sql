/* ============================================================================
   Catálogo de TIPOS por rol. Permite "ramificar" un rol en subtipos:
   ej. Encargado -> Casas, Infraestructura, Bodega.

   El tipo elegido para cada asignación se guarda en la columna EXISTENTE
   dbo.UsuarioRol.esTipo (nvarchar) — no se agrega columna nueva.
   dbo.TipoRol es solo el catálogo de opciones por rol.

   Correr UNA sola vez sobre la base AdelanteSBX (NO AdelantePRO).
   ============================================================================ */

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'TipoRol' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.TipoRol (
        idTipoRol     INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_TipoRol PRIMARY KEY,
        idRol         INT NOT NULL,
        nombre        NVARCHAR(80) NOT NULL,
        esActivo      BIT NOT NULL CONSTRAINT df_TipoRol_activo DEFAULT 1,
        fechaCreacion DATETIME2(0) NOT NULL CONSTRAINT df_TipoRol_fecha DEFAULT SYSUTCDATETIME(),
        creadoPor     NVARCHAR(100) NULL,
        CONSTRAINT fk_TipoRol_rol FOREIGN KEY (idRol) REFERENCES dbo.Rol (idRol)
    );
END
GO

-- No repetir el mismo nombre de tipo activo dentro de un rol.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_TipoRol_rol_nombre')
    CREATE UNIQUE INDEX ux_TipoRol_rol_nombre
        ON dbo.TipoRol (idRol, nombre)
        WHERE esActivo = 1;
GO
