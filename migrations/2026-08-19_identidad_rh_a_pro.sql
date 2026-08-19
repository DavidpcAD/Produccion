/* ============================================================================
   Identidad de RH (rh.adelante.cr) → AdelantePRO — ESTRUCTURA
   Fecha: 2026-08-19
   Crea en AdelantePRO lo que le falta para que corran los módulos de la app:
   obras/proyectos/presupuesto (presupuestista), cuadrillas, marcaje h4 y auth.
   Extraído de AdelanteSBX (sys.*). Idempotente.

   OJO: AdelantePRO es la base de PRODUCCIÓN del app de Digitación
   (app-adelante-prod). Todo acá es ADITIVO: crea objetos nuevos y agrega
   columnas NULLABLE a tablas existentes. No borra ni cambia nada suyo.
   ============================================================================ */

IF SCHEMA_ID('h4') IS NULL EXEC('CREATE SCHEMA h4');
GO

/* ===================== 1) COLUMNAS QUE LE FALTAN A PRO ===================== */

/* ============================ 2) TABLAS ============================ */

IF OBJECT_ID('dbo.ContratoColaborador','U') IS NULL
CREATE TABLE dbo.[ContratoColaborador] (
  [idContrato] int IDENTITY(1,1) NOT NULL,
  [idColaborador] int NOT NULL,
  [modalidad] nvarchar(20) NOT NULL,
  [datosJson] nvarchar(max) NOT NULL,
  [firma] nvarchar(max) NULL,
  [estado] nvarchar(20) NOT NULL CONSTRAINT [DF_ContratoColaborador_estado] DEFAULT ('FIRMADO'),
  [creadoPor] nvarchar(100) NULL,
  [fechaCreacion] datetime2(0) NOT NULL CONSTRAINT [DF_ContratoColaborador_fechaCreacion] DEFAULT (sysutcdatetime()),
  CONSTRAINT [pk_ContratoColaborador] PRIMARY KEY ([idContrato])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_ContratoCol_colaborador' AND object_id=OBJECT_ID('dbo.ContratoColaborador')) CREATE INDEX [ix_ContratoCol_colaborador] ON dbo.[ContratoColaborador] ([idColaborador], [fechaCreacion]);
GO

IF OBJECT_ID('dbo.solicitudes','U') IS NULL
CREATE TABLE dbo.[solicitudes] (
  [id] nvarchar(30) NOT NULL,
  [tipo] nvarchar(20) NOT NULL,
  [nombre] nvarchar(200) NOT NULL,
  [cuadrilla] nvarchar(200) NOT NULL,
  [fechaReferencia] datetime2(7) NOT NULL,
  [anio] int NOT NULL,
  [mes] int NOT NULL,
  [modalidad] nvarchar(20) NULL,
  [fechaInicio] datetime2(7) NULL,
  [fechaFin] datetime2(7) NULL,
  [diasEspecificos] nvarchar(max) NULL,
  [totalDias] decimal(6,2) NULL,
  [fechaPermiso] datetime2(7) NULL,
  [horaEntrada] nvarchar(10) NULL,
  [horaSalida] nvarchar(10) NULL,
  [encargado] nvarchar(200) NULL,
  [motivo] nvarchar(max) NULL,
  [firma] nvarchar(max) NOT NULL,
  [correoDestino] nvarchar(200) NULL,
  [telefonoDestino] nvarchar(30) NULL,
  [enviadoCorreo] bit NOT NULL CONSTRAINT [DF_solicitudes_enviadoCorreo] DEFAULT ((0)),
  [enviadoWhatsapp] bit NOT NULL CONSTRAINT [DF_solicitudes_enviadoWhatsapp] DEFAULT ((0)),
  [enviadoAt] datetime2(7) NULL,
  [createdAt] datetime2(7) NOT NULL CONSTRAINT [DF_solicitudes_createdAt] DEFAULT (sysutcdatetime()),
  [estado] nvarchar(20) NOT NULL CONSTRAINT [DF_solicitudes_estado] DEFAULT ('ACTIVA'),
  [anuladaAt] datetime2(7) NULL,
  [anuladaPor] nvarchar(200) NULL,
  [envioCorreoError] nvarchar(max) NULL,
  [subtipo] nvarchar(30) NULL,
  [fechaDocumento] datetime2(7) NULL,
  [tardanzas] nvarchar(max) NULL,
  [firmaEmisor] nvarchar(max) NULL,
  [creadaPor] nvarchar(200) NULL,
  [diasDisponibles] decimal(6,2) NULL,
  [idColaborador] int NULL,
  [datosTomados] bit NOT NULL CONSTRAINT [DF_solicitudes_datosTomados] DEFAULT ((0)),
  [datosTomadosPor] nvarchar(200) NULL,
  [datosTomadosEn] datetime2(7) NULL,
  CONSTRAINT [PK_solicitudes] PRIMARY KEY ([id])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_solicitudes_anio_mes' AND object_id=OBJECT_ID('dbo.solicitudes')) CREATE INDEX [IX_solicitudes_anio_mes] ON dbo.[solicitudes] ([anio], [mes]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_solicitudes_cuadrilla' AND object_id=OBJECT_ID('dbo.solicitudes')) CREATE INDEX [IX_solicitudes_cuadrilla] ON dbo.[solicitudes] ([cuadrilla]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_solicitudes_nombre' AND object_id=OBJECT_ID('dbo.solicitudes')) CREATE INDEX [IX_solicitudes_nombre] ON dbo.[solicitudes] ([nombre]);
GO

IF OBJECT_ID('h4.ColaboradorDiasMarca','U') IS NULL
CREATE TABLE h4.[ColaboradorDiasMarca] (
  [idColaborador] int NOT NULL,
  [lunes] bit NOT NULL,
  [martes] bit NOT NULL,
  [miercoles] bit NOT NULL,
  [jueves] bit NOT NULL,
  [viernes] bit NOT NULL,
  [sabado] bit NOT NULL,
  [domingo] bit NOT NULL,
  [fechaCreacion] datetime2(7) NOT NULL CONSTRAINT [DF_ColaboradorDiasMarca_fechaCreacion] DEFAULT (sysutcdatetime()),
  [creadoPor] nvarchar(100) NULL,
  [fechaModificacion] datetime2(7) NULL,
  [modificadoPor] nvarchar(100) NULL,
  CONSTRAINT [pk_colaboradorDiasMarca] PRIMARY KEY ([idColaborador])
);
GO

IF OBJECT_ID('h4.AsistenciaDia','U') IS NULL
CREATE TABLE h4.[AsistenciaDia] (
  [idAsistenciaDia] bigint IDENTITY(1,1) NOT NULL,
  [idColaborador] int NOT NULL,
  [fecha] date NOT NULL,
  [idCuadrilla] int NULL,
  [estado] nvarchar(24) NOT NULL,
  [minutosTardia] int NULL,
  [minutosRebajo] int NOT NULL CONSTRAINT [DF_AsistenciaDia_minutosRebajo] DEFAULT ((0)),
  [justificacion] nvarchar(40) NULL,
  [idJornada] bigint NULL,
  [fechaConsolidacion] datetime2(7) NOT NULL CONSTRAINT [DF_AsistenciaDia_fechaConsolidacion] DEFAULT (sysutcdatetime()),
  [consolidadoPor] nvarchar(100) NULL,
  CONSTRAINT [pk_asistenciaDia] PRIMARY KEY ([idAsistenciaDia]),
  CONSTRAINT [ck_asistenciaDia_estado] CHECK ([estado]=N'AusenteInjustificada' OR [estado]=N'AusenteJustificada' OR [estado]=N'Tardia' OR [estado]=N'Presente')
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='uq_asistenciaDia' AND object_id=OBJECT_ID('h4.AsistenciaDia')) CREATE UNIQUE INDEX [uq_asistenciaDia] ON h4.[AsistenciaDia] ([idColaborador], [fecha]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_asistenciaDia_fecha' AND object_id=OBJECT_ID('h4.AsistenciaDia')) CREATE INDEX [ix_asistenciaDia_fecha] ON h4.[AsistenciaDia] ([fecha], [estado]);
GO

/* ======================= 3) FOREIGN KEYS ========================== */
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_ContratoCol_colaborador')
  ALTER TABLE dbo.[ContratoColaborador] ADD CONSTRAINT [fk_ContratoCol_colaborador] FOREIGN KEY ([idColaborador]) REFERENCES dbo.[Colaborador] ([idColaborador]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_colaboradorDiasMarca_col')
  ALTER TABLE h4.[ColaboradorDiasMarca] ADD CONSTRAINT [fk_colaboradorDiasMarca_col] FOREIGN KEY ([idColaborador]) REFERENCES dbo.[Colaborador] ([idColaborador]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_asistenciaDia_col')
  ALTER TABLE h4.[AsistenciaDia] ADD CONSTRAINT [fk_asistenciaDia_col] FOREIGN KEY ([idColaborador]) REFERENCES dbo.[Colaborador] ([idColaborador]);
GO

/* ============================ 4) VISTAS ============================ */

CREATE OR ALTER VIEW h4.vColaboradorAsistencia AS SELECT c.idColaborador, c.calcNombreCompleto AS nombre, c.cedula, COALESCE(cu.horaInicioJornada,c.horaEntrada) AS horaEntrada, COALESCE(cu.horaFinJornada,c.horaSalida) AS horaSalida, cm.IDCuadrilla AS idCuadrilla, cu.Nombre AS cuadrilla, COALESCE(cdm.lunes,cu.trabajaLunes,1) AS trabajaLunes, COALESCE(cdm.martes,cu.trabajaMartes,1) AS trabajaMartes, COALESCE(cdm.miercoles,cu.trabajaMiercoles,1) AS trabajaMiercoles, COALESCE(cdm.jueves,cu.trabajaJueves,1) AS trabajaJueves, COALESCE(cdm.viernes,cu.trabajaViernes,1) AS trabajaViernes, COALESCE(cdm.sabado,cu.trabajaSabado,1) AS trabajaSabado, COALESCE(cdm.domingo,cu.trabajaDomingo,0) AS trabajaDomingo FROM dbo.Colaborador c OUTER APPLY (SELECT TOP 1 m.IDCuadrilla FROM dbo.CuadrillaMiembro m WHERE m.IDCol=c.idColaborador AND m.Activo=1 AND m.FechaSalida IS NULL ORDER BY m.FechaIngreso ASC, m.IDCuadMiembro ASC) cm LEFT JOIN dbo.Cuadrilla cu ON cu.IDCuadrilla=cm.IDCuadrilla LEFT JOIN h4.ColaboradorDiasMarca cdm ON cdm.idColaborador=c.idColaborador WHERE c.esActivo=1 AND COALESCE(cu.horaInicioJornada,c.horaEntrada) IS NOT NULL AND EXISTS (SELECT 1 FROM h4.ZonaColaborador zc JOIN h4.DispositivoBiometria db ON db.pin=zc.pin AND db.tipo=N'9' WHERE zc.idColaborador=c.idColaborador AND zc.activo=1);
GO
