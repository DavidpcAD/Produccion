-- Migración ControlUsuarios → modelo nuevo AdelanteSBX (dbo)
-- Aditivo y reversible. Crea: vista V_Colaborador + tablas OTPCodes y UsuarioAuditLog.

-- 1) Vista de lectura de colaboradores: resuelve los catálogos a partir de los
--    FK más granulares (codigoDistrito -> Distrito/Canton/Provincia ; idPuesto ->
--    Puesto/Departamento ; idPais -> Pais) y une el login (Usuario.username).
CREATE OR ALTER VIEW dbo.V_Colaborador AS
SELECT
  c.idColaborador,
  c.cedula,
  c.nombre,
  c.primerApellido,
  c.segundoApellido,
  c.calcNombreCompleto,
  c.correo,
  c.telefono,
  c.telefonoSecundario,
  c.genero,
  c.fechaIngreso,
  c.fechaSalida,
  c.fechaNacimiento,
  c.direccion,
  c.tallaCamisa,
  c.tallaPantalon,
  c.esActivo,
  c.idPuesto,
  pu.nombre         AS puesto,
  pu.idDepartamento,
  dep.nombre        AS departamento,
  c.idPais,
  pa.nombre         AS pais,
  c.codigoDistrito,
  di.nombre         AS distrito,
  ca.codigoINEC     AS codigoCanton,
  ca.nombre         AS canton,
  pr.codigoINEC     AS codigoProvincia,
  pr.nombre         AS provincia,
  u.idUsuario,
  u.username
FROM dbo.Colaborador c
LEFT JOIN dbo.Puesto pu        ON pu.idPuesto = c.idPuesto
LEFT JOIN dbo.Departamento dep ON dep.idDepartamento = pu.idDepartamento
LEFT JOIN dbo.Pais pa          ON pa.idPais = c.idPais
LEFT JOIN dbo.Distrito di      ON di.codigoINEC = c.codigoDistrito
LEFT JOIN dbo.Canton ca        ON ca.codigoINEC = di.codigoCanton
LEFT JOIN dbo.Provincia pr     ON pr.codigoINEC = ca.codigoProvincia
LEFT JOIN dbo.Usuario u        ON u.idColaborador = c.idColaborador;

-- 2) OTP de login (almacena idUsuario en la columna idUsuario).
IF OBJECT_ID('dbo.OTPCodes', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.OTPCodes (
    IDOtp         INT IDENTITY(1,1) PRIMARY KEY,
    idUsuario     INT           NOT NULL,
    CodeHash      NVARCHAR(128) NOT NULL,
    ExpiresAt     DATETIME2     NOT NULL,
    Usado         BIT           NOT NULL CONSTRAINT DF_OTPCodes_Usado DEFAULT 0,
    FechaCreacion DATETIME2     NOT NULL CONSTRAINT DF_OTPCodes_Fecha DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_OTPCodes_idUsuario ON dbo.OTPCodes (idUsuario, ExpiresAt);
END;

-- 3) Auditoría de acciones (IDColAccion = idColaborador del actor).
IF OBJECT_ID('dbo.UsuarioAuditLog', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.UsuarioAuditLog (
    IDAudit       INT IDENTITY(1,1) PRIMARY KEY,
    IDColAccion   INT            NULL,
    Accion        NVARCHAR(100)  NOT NULL,
    Entidad       NVARCHAR(100)  NULL,
    IDEntidad     INT            NULL,
    DetallePrevio NVARCHAR(MAX)  NULL,
    DetalleNuevo  NVARCHAR(MAX)  NULL,
    IP            NVARCHAR(64)   NULL,
    FechaAccion   DATETIME2      NOT NULL CONSTRAINT DF_Audit_Fecha DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_Audit_Fecha ON dbo.UsuarioAuditLog (FechaAccion DESC);
END;
