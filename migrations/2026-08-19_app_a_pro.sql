/* ============================================================================
   App Producción (pool DB_*) → AdelantePRO — ESTRUCTURA
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

-- dbo.Usuario: +1 columna(s)
IF COL_LENGTH('dbo.Usuario','telefono') IS NULL ALTER TABLE dbo.Usuario ADD [telefono] nvarchar(20) NULL;
GO

-- dbo.Rol: +1 columna(s)
IF COL_LENGTH('dbo.Rol','tipo') IS NULL ALTER TABLE dbo.Rol ADD [tipo] nvarchar(80) NULL;
GO

-- dbo.App: +1 columna(s)
IF COL_LENGTH('dbo.App','dominio') IS NULL ALTER TABLE dbo.App ADD [dominio] nvarchar(255) NULL;
GO

-- dbo.Colaborador: +10 columna(s)
IF COL_LENGTH('dbo.Colaborador','fotoBase64') IS NULL ALTER TABLE dbo.Colaborador ADD [fotoBase64] nvarchar(max) NULL;
IF COL_LENGTH('dbo.Colaborador','hashFoto') IS NULL ALTER TABLE dbo.Colaborador ADD [hashFoto] char(64) NULL;
IF COL_LENGTH('dbo.Colaborador','fotoActualizada') IS NULL ALTER TABLE dbo.Colaborador ADD [fotoActualizada] datetime2(7) NULL;
IF COL_LENGTH('dbo.Colaborador','salarioMensual') IS NULL ALTER TABLE dbo.Colaborador ADD [salarioMensual] decimal(18,2) NULL;
IF COL_LENGTH('dbo.Colaborador','horaEntrada') IS NULL ALTER TABLE dbo.Colaborador ADD [horaEntrada] time(0) NULL;
IF COL_LENGTH('dbo.Colaborador','horaSalida') IS NULL ALTER TABLE dbo.Colaborador ADD [horaSalida] time(0) NULL;
IF COL_LENGTH('dbo.Colaborador','marcajeEstado') IS NULL ALTER TABLE dbo.Colaborador ADD [marcajeEstado] nvarchar(20) NULL;
IF COL_LENGTH('dbo.Colaborador','numeroMarcaje') IS NULL ALTER TABLE dbo.Colaborador ADD [numeroMarcaje] nvarchar(40) NULL;
IF COL_LENGTH('dbo.Colaborador','marcajeFechaEnrol') IS NULL ALTER TABLE dbo.Colaborador ADD [marcajeFechaEnrol] datetime2(7) NULL;
IF COL_LENGTH('dbo.Colaborador','tipoNomina') IS NULL ALTER TABLE dbo.Colaborador ADD [tipoNomina] nvarchar(20) NULL;
GO

-- dbo.Proyecto: +4 columna(s)
IF COL_LENGTH('dbo.Proyecto','linkWaze') IS NULL ALTER TABLE dbo.Proyecto ADD [linkWaze] nvarchar(max) NULL;
IF COL_LENGTH('dbo.Proyecto','tipo') IS NULL ALTER TABLE dbo.Proyecto ADD [tipo] nvarchar(50) NULL;
IF COL_LENGTH('dbo.Proyecto','esProductivo') IS NULL ALTER TABLE dbo.Proyecto ADD [esProductivo] bit NULL;
IF COL_LENGTH('dbo.Proyecto','activo') IS NULL ALTER TABLE dbo.Proyecto ADD [activo] bit NULL;
GO

/* ============================ 2) TABLAS ============================ */

IF OBJECT_ID('dbo.Cuadrilla','U') IS NULL
CREATE TABLE dbo.[Cuadrilla] (
  [IDCuadrilla] int IDENTITY(1,1) NOT NULL,
  [Nombre] nvarchar(200) NOT NULL,
  [IDProyecto] int NULL,
  [TaskNoBC] nvarchar(40) NULL,
  [IDEncargado] int NOT NULL,
  [Capacidad] int NOT NULL CONSTRAINT [DF_Cuadrilla_Capacidad] DEFAULT ((25)),
  [Activo] bit NOT NULL CONSTRAINT [DF_Cuadrilla_Activo] DEFAULT ((1)),
  [FechaCreacion] datetime NOT NULL CONSTRAINT [DF_Cuadrilla_FechaCreacion] DEFAULT (getdate()),
  [CreadoPor] int NULL,
  [horaInicioJornada] time(0) NOT NULL CONSTRAINT [DF_Cuadrilla_horaInicioJornada] DEFAULT ('06:00:00'),
  [horaFinJornada] time(0) NOT NULL CONSTRAINT [DF_Cuadrilla_horaFinJornada] DEFAULT ('17:00:00'),
  [idSubPartida] int NULL,
  [trabajaLunes] bit NOT NULL CONSTRAINT [DF_Cuadrilla_trabajaLunes] DEFAULT ((1)),
  [trabajaMartes] bit NOT NULL CONSTRAINT [DF_Cuadrilla_trabajaMartes] DEFAULT ((1)),
  [trabajaMiercoles] bit NOT NULL CONSTRAINT [DF_Cuadrilla_trabajaMiercoles] DEFAULT ((1)),
  [trabajaJueves] bit NOT NULL CONSTRAINT [DF_Cuadrilla_trabajaJueves] DEFAULT ((1)),
  [trabajaViernes] bit NOT NULL CONSTRAINT [DF_Cuadrilla_trabajaViernes] DEFAULT ((1)),
  [trabajaSabado] bit NOT NULL CONSTRAINT [DF_Cuadrilla_trabajaSabado] DEFAULT ((1)),
  [trabajaDomingo] bit NOT NULL CONSTRAINT [DF_Cuadrilla_trabajaDomingo] DEFAULT ((0)),
  CONSTRAINT [pk_cuadrilla] PRIMARY KEY ([IDCuadrilla])
);
GO

IF OBJECT_ID('dbo.CuadrillaMiembro','U') IS NULL
CREATE TABLE dbo.[CuadrillaMiembro] (
  [IDCuadMiembro] int IDENTITY(1,1) NOT NULL,
  [IDCuadrilla] int NOT NULL,
  [IDCol] int NOT NULL,
  [FechaIngreso] datetime NOT NULL CONSTRAINT [DF_CuadrillaMiembro_FechaIngreso] DEFAULT (getdate()),
  [FechaSalida] datetime NULL,
  [AsignadoPor] int NULL,
  [Activo] bit NOT NULL CONSTRAINT [DF_CuadrillaMiembro_Activo] DEFAULT ((1)),
  CONSTRAINT [pk_cuadrillaMiembro] PRIMARY KEY ([IDCuadMiembro])
);
GO

IF OBJECT_ID('dbo.CuadrillaObra','U') IS NULL
CREATE TABLE dbo.[CuadrillaObra] (
  [idCuadrillaObra] int IDENTITY(1,1) NOT NULL,
  [IDCuadrilla] int NOT NULL,
  [idObra] bigint NOT NULL,
  CONSTRAINT [PK__Cuadrill__9C5E489561D7D7B0] PRIMARY KEY ([idCuadrillaObra])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UQ_CuadrillaObra' AND object_id=OBJECT_ID('dbo.CuadrillaObra')) CREATE UNIQUE INDEX [UQ_CuadrillaObra] ON dbo.[CuadrillaObra] ([IDCuadrilla], [idObra]);
GO

IF OBJECT_ID('dbo.CuadrillaSubPartida','U') IS NULL
CREATE TABLE dbo.[CuadrillaSubPartida] (
  [idCuadrillaSubPartida] int IDENTITY(1,1) NOT NULL,
  [IDCuadrilla] int NOT NULL,
  [idSubPartida] int NOT NULL,
  [idProyecto] int NULL,
  CONSTRAINT [PK__Cuadrill__37D76ED11B58138A] PRIMARY KEY ([idCuadrillaSubPartida])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ux_CuadrillaSubPartida_proyecto_sub' AND object_id=OBJECT_ID('dbo.CuadrillaSubPartida')) CREATE UNIQUE INDEX [ux_CuadrillaSubPartida_proyecto_sub] ON dbo.[CuadrillaSubPartida] ([idProyecto], [idSubPartida]) WHERE ([idProyecto] IS NOT NULL);
GO

IF OBJECT_ID('dbo.EncargadoPartida','U') IS NULL
CREATE TABLE dbo.[EncargadoPartida] (
  [idEncargadoPartida] int IDENTITY(1,1) NOT NULL,
  [idColaborador] int NOT NULL,
  [idSubPartida] int NOT NULL,
  [creadoPor] int NULL,
  [fechaCreacion] datetime2(0) NOT NULL CONSTRAINT [DF_EncargadoPartida_fechaCreacion] DEFAULT (sysutcdatetime()),
  CONSTRAINT [pk_EncargadoPartida] PRIMARY KEY ([idEncargadoPartida])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ux_EncargadoPartida_subpartida' AND object_id=OBJECT_ID('dbo.EncargadoPartida')) CREATE UNIQUE INDEX [ux_EncargadoPartida_subpartida] ON dbo.[EncargadoPartida] ([idSubPartida]);
GO

IF OBJECT_ID('dbo.OTPCodes','U') IS NULL
CREATE TABLE dbo.[OTPCodes] (
  [IDOtp] int IDENTITY(1,1) NOT NULL,
  [idUsuario] int NOT NULL,
  [CodeHash] nvarchar(128) NOT NULL,
  [ExpiresAt] datetime2(7) NOT NULL,
  [Usado] bit NOT NULL CONSTRAINT [DF_OTPCodes_Usado] DEFAULT ((0)),
  [FechaCreacion] datetime2(7) NOT NULL CONSTRAINT [DF_OTPCodes_FechaCreacion] DEFAULT (sysutcdatetime()),
  CONSTRAINT [PK__OTPCodes__A6C3439338BE4B54] PRIMARY KEY ([IDOtp])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_OTPCodes_idUsuario' AND object_id=OBJECT_ID('dbo.OTPCodes')) CREATE INDEX [IX_OTPCodes_idUsuario] ON dbo.[OTPCodes] ([idUsuario], [ExpiresAt]);
GO

IF OBJECT_ID('dbo.PresupuestoBorrador','U') IS NULL
CREATE TABLE dbo.[PresupuestoBorrador] (
  [idBorrador] int IDENTITY(1,1) NOT NULL,
  [idObra] int NOT NULL,
  [worksNo] varchar(50) NULL,
  [tipo] varchar(20) NOT NULL,
  [archivo] nvarchar(255) NULL,
  [datosJSON] nvarchar(max) NOT NULL,
  [esActivo] bit NOT NULL CONSTRAINT [DF_PresupuestoBorrador_esActivo] DEFAULT ((1)),
  [creadoPor] int NULL,
  [fechaCreacion] datetime2(7) NOT NULL CONSTRAINT [DF_PresupuestoBorrador_fechaCreacion] DEFAULT (sysutcdatetime()),
  [fechaActualizacion] datetime2(7) NOT NULL CONSTRAINT [DF_PresupuestoBorrador_fechaActualizacion] DEFAULT (sysutcdatetime()),
  CONSTRAINT [PK__Presupue__2BA29D3B1DA12C26] PRIMARY KEY ([idBorrador])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_PresupuestoBorrador_obra_tipo' AND object_id=OBJECT_ID('dbo.PresupuestoBorrador')) CREATE UNIQUE INDEX [UX_PresupuestoBorrador_obra_tipo] ON dbo.[PresupuestoBorrador] ([idObra], [tipo]) WHERE ([esActivo]=(1));
GO

IF OBJECT_ID('dbo.PresupuestoPlantilla','U') IS NULL
CREATE TABLE dbo.[PresupuestoPlantilla] (
  [idPlantilla] int IDENTITY(1,1) NOT NULL,
  [nombre] nvarchar(150) NOT NULL,
  [tipo] varchar(20) NOT NULL,
  [archivo] nvarchar(255) NULL,
  [datosJSON] nvarchar(max) NOT NULL,
  [esActivo] bit NOT NULL CONSTRAINT [DF_PresupuestoPlantilla_esActivo] DEFAULT ((1)),
  [creadoPor] int NULL,
  [fechaCreacion] datetime2(7) NOT NULL CONSTRAINT [DF_PresupuestoPlantilla_fechaCreacion] DEFAULT (sysutcdatetime()),
  [fechaActualizacion] datetime2(7) NOT NULL CONSTRAINT [DF_PresupuestoPlantilla_fechaActualizacion] DEFAULT (sysutcdatetime()),
  CONSTRAINT [PK__Presupue__F2E097D79C998217] PRIMARY KEY ([idPlantilla])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_PresupuestoPlantilla_nombre_tipo' AND object_id=OBJECT_ID('dbo.PresupuestoPlantilla')) CREATE UNIQUE INDEX [UX_PresupuestoPlantilla_nombre_tipo] ON dbo.[PresupuestoPlantilla] ([nombre], [tipo]) WHERE ([esActivo]=(1));
GO

IF OBJECT_ID('dbo.UsuarioAuditLog','U') IS NULL
CREATE TABLE dbo.[UsuarioAuditLog] (
  [IDAudit] int IDENTITY(1,1) NOT NULL,
  [IDColAccion] int NULL,
  [Accion] nvarchar(100) NOT NULL,
  [Entidad] nvarchar(100) NULL,
  [IDEntidad] int NULL,
  [DetallePrevio] nvarchar(max) NULL,
  [DetalleNuevo] nvarchar(max) NULL,
  [IP] nvarchar(64) NULL,
  [FechaAccion] datetime2(7) NOT NULL CONSTRAINT [DF_UsuarioAuditLog_FechaAccion] DEFAULT (sysutcdatetime()),
  CONSTRAINT [PK__UsuarioA__59DA2EDDF612CF30] PRIMARY KEY ([IDAudit])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Audit_Fecha' AND object_id=OBJECT_ID('dbo.UsuarioAuditLog')) CREATE INDEX [IX_Audit_Fecha] ON dbo.[UsuarioAuditLog] ([FechaAccion]);
GO

IF OBJECT_ID('h4.Dispositivo','U') IS NULL
CREATE TABLE h4.[Dispositivo] (
  [idDispositivo] int IDENTITY(1,1) NOT NULL,
  [sn] nvarchar(50) NOT NULL,
  [nombre] nvarchar(100) NULL,
  [ubicacion] nvarchar(100) NULL,
  [ipUltima] nvarchar(45) NULL,
  [firmware] nvarchar(50) NULL,
  [ultimoContactoUtc] datetime2(7) NULL,
  [estado] nvarchar(20) NOT NULL CONSTRAINT [DF_Dispositivo_estado] DEFAULT (N'activo'),
  [fechaCreacion] datetime2(7) NOT NULL CONSTRAINT [DF_Dispositivo_fechaCreacion] DEFAULT (getdate()),
  [creadoPor] nvarchar(100) NOT NULL,
  [fechaModificacion] datetime2(7) NULL,
  [modificadoPor] nvarchar(100) NULL,
  [modelo] nvarchar(60) NULL,
  [latitud] decimal(9,6) NULL,
  [longitud] decimal(9,6) NULL,
  [idZona] int NULL,
  [aceptaTemplateBiometrico] bit NOT NULL CONSTRAINT [DF_Dispositivo_aceptaTemplateBiometrico] DEFAULT ((1)),
  CONSTRAINT [pk_dispositivo] PRIMARY KEY ([idDispositivo])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ux_dispositivo_sn' AND object_id=OBJECT_ID('h4.Dispositivo')) CREATE UNIQUE INDEX [ux_dispositivo_sn] ON h4.[Dispositivo] ([sn]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_dispositivo_zona' AND object_id=OBJECT_ID('h4.Dispositivo')) CREATE INDEX [ix_dispositivo_zona] ON h4.[Dispositivo] ([idZona]);
GO

IF OBJECT_ID('h4.DispositivoBiometria','U') IS NULL
CREATE TABLE h4.[DispositivoBiometria] (
  [idBiometria] bigint IDENTITY(1,1) NOT NULL,
  [idDispositivo] int NOT NULL,
  [pin] nvarchar(50) NOT NULL,
  [tipo] nvarchar(10) NOT NULL,
  [tabla] nvarchar(20) NOT NULL,
  [majorVer] int NULL,
  [minorVer] int NULL,
  [payload] nvarchar(max) NOT NULL,
  [size] int NULL,
  [hash] nvarchar(64) NULL,
  [fechaCaptura] datetime2(7) NOT NULL CONSTRAINT [DF_DispositivoBiometria_fechaCaptura] DEFAULT (sysutcdatetime()),
  CONSTRAINT [pk_dispositivoBiometria] PRIMARY KEY ([idBiometria])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ux_dispBio_disp_pin_tipo' AND object_id=OBJECT_ID('h4.DispositivoBiometria')) CREATE UNIQUE INDEX [ux_dispBio_disp_pin_tipo] ON h4.[DispositivoBiometria] ([idDispositivo], [pin], [tipo]);
GO

IF OBJECT_ID('h4.EventoActividadTipo','U') IS NULL
CREATE TABLE h4.[EventoActividadTipo] (
  [codigo] nvarchar(40) NOT NULL,
  [etiqueta] nvarchar(80) NOT NULL,
  [severidad] nvarchar(12) NOT NULL CONSTRAINT [DF_EventoActividadTipo_severidad] DEFAULT (N'info'),
  [icono] nvarchar(40) NULL,
  CONSTRAINT [pk_eventoActividadTipo] PRIMARY KEY ([codigo]),
  CONSTRAINT [ck_eventoActividadTipo_sev] CHECK ([severidad]=N'critical' OR [severidad]=N'warning' OR [severidad]=N'info')
);
GO

IF OBJECT_ID('h4.Zona','U') IS NULL
CREATE TABLE h4.[Zona] (
  [idZona] int IDENTITY(1,1) NOT NULL,
  [nombre] nvarchar(150) NOT NULL,
  [idObra] bigint NULL,
  [idProyecto] int NULL,
  [ubicacion] nvarchar(200) NULL,
  [latitud] decimal(9,6) NULL,
  [longitud] decimal(9,6) NULL,
  [activo] bit NOT NULL CONSTRAINT [DF_Zona_activo] DEFAULT ((1)),
  [fechaCreacion] datetime2(7) NOT NULL CONSTRAINT [DF_Zona_fechaCreacion] DEFAULT (sysutcdatetime()),
  [creadoPor] nvarchar(200) NOT NULL,
  [fechaModificacion] datetime2(7) NULL,
  [modificadoPor] nvarchar(200) NULL,
  CONSTRAINT [pk_zona] PRIMARY KEY ([idZona])
);
GO

IF OBJECT_ID('h4.ObraSubpartida','U') IS NULL
CREATE TABLE h4.[ObraSubpartida] (
  [idObraSubpartida] bigint IDENTITY(1,1) NOT NULL,
  [idObra] bigint NOT NULL,
  [idSubpartida] int NOT NULL,
  [unidad] nvarchar(20) NULL,
  [estado] nvarchar(20) NOT NULL CONSTRAINT [DF_ObraSubpartida_estado] DEFAULT (N'Abierta'),
  [fechaAperturaUtc] datetime2(7) NOT NULL CONSTRAINT [DF_ObraSubpartida_fechaAperturaUtc] DEFAULT (sysutcdatetime()),
  [fechaCierreUtc] datetime2(7) NULL,
  [fechaCreacion] datetime2(7) NOT NULL CONSTRAINT [DF_ObraSubpartida_fechaCreacion] DEFAULT (sysutcdatetime()),
  [creadoPor] nvarchar(100) NOT NULL,
  [fechaModificacion] datetime2(7) NULL,
  [modificadoPor] nvarchar(100) NULL,
  CONSTRAINT [PK_h4_ObraSubpartida] PRIMARY KEY ([idObraSubpartida])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UQ_h4_ObraSubpartida' AND object_id=OBJECT_ID('h4.ObraSubpartida')) CREATE UNIQUE INDEX [UQ_h4_ObraSubpartida] ON h4.[ObraSubpartida] ([idObra], [idSubpartida]);
GO

IF OBJECT_ID('h4.ObraSubpartidaPresupuesto','U') IS NULL
CREATE TABLE h4.[ObraSubpartidaPresupuesto] (
  [idPresupuesto] bigint IDENTITY(1,1) NOT NULL,
  [idObraSubpartida] bigint NOT NULL,
  [version] int NOT NULL,
  [hhPresupuestadas] decimal(18,2) NULL,
  [cantidadPresupuestada] decimal(18,2) NULL,
  [esVigente] bit NOT NULL CONSTRAINT [DF_ObraSubpartidaPresupuesto_esVigente] DEFAULT ((0)),
  [fechaCreacion] datetime2(7) NOT NULL CONSTRAINT [DF_ObraSubpartidaPresupuesto_fechaCreacion] DEFAULT (sysutcdatetime()),
  [creadoPor] nvarchar(100) NOT NULL,
  [fechaModificacion] datetime2(7) NULL,
  [modificadoPor] nvarchar(100) NULL,
  CONSTRAINT [PK_h4_ObraSubpartidaPresupuesto] PRIMARY KEY ([idPresupuesto])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UQ_h4Pre_version' AND object_id=OBJECT_ID('h4.ObraSubpartidaPresupuesto')) CREATE UNIQUE INDEX [UQ_h4Pre_version] ON h4.[ObraSubpartidaPresupuesto] ([idObraSubpartida], [version]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_h4Pre_unaVigente' AND object_id=OBJECT_ID('h4.ObraSubpartidaPresupuesto')) CREATE UNIQUE INDEX [UX_h4Pre_unaVigente] ON h4.[ObraSubpartidaPresupuesto] ([idObraSubpartida]) WHERE ([esVigente]=(1));
GO

IF OBJECT_ID('h4.EventoActividad','U') IS NULL
CREATE TABLE h4.[EventoActividad] (
  [idEventoActividad] bigint IDENTITY(1,1) NOT NULL,
  [tipo] nvarchar(40) NOT NULL,
  [severidad] nvarchar(12) NOT NULL CONSTRAINT [DF_EventoActividad_severidad] DEFAULT (N'info'),
  [titulo] nvarchar(200) NOT NULL,
  [idProyecto] int NULL,
  [idObra] bigint NULL,
  [idObraSubpartida] bigint NULL,
  [idCuadrilla] int NULL,
  [idColaborador] int NULL,
  [idUsuarioActor] int NULL,
  [refTabla] nvarchar(40) NULL,
  [refId] bigint NULL,
  [metadata] nvarchar(max) NULL,
  [ocurridoUtc] datetime2(7) NOT NULL CONSTRAINT [DF_EventoActividad_ocurridoUtc] DEFAULT (sysutcdatetime()),
  [fechaCreacion] datetime2(7) NOT NULL CONSTRAINT [DF_EventoActividad_fechaCreacion] DEFAULT (getdate()),
  [creadoPor] nvarchar(100) NOT NULL,
  [resueltoUtc] datetime2(7) NULL,
  [resueltoPor] nvarchar(100) NULL,
  CONSTRAINT [pk_eventoActividad] PRIMARY KEY ([idEventoActividad]),
  CONSTRAINT [ck_eventoActividad_sev] CHECK ([severidad]=N'critical' OR [severidad]=N'warning' OR [severidad]=N'info')
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_eventoActividad_feed' AND object_id=OBJECT_ID('h4.EventoActividad')) CREATE INDEX [ix_eventoActividad_feed] ON h4.[EventoActividad] ([ocurridoUtc]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_eventoActividad_proyecto' AND object_id=OBJECT_ID('h4.EventoActividad')) CREATE INDEX [ix_eventoActividad_proyecto] ON h4.[EventoActividad] ([idProyecto], [ocurridoUtc]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_eventoActividad_severidad' AND object_id=OBJECT_ID('h4.EventoActividad')) CREATE INDEX [ix_eventoActividad_severidad] ON h4.[EventoActividad] ([severidad], [ocurridoUtc]) WHERE ([severidad]<>N'info');
GO

IF OBJECT_ID('h4.Jornada','U') IS NULL
CREATE TABLE h4.[Jornada] (
  [idJornada] bigint IDENTITY(1,1) NOT NULL,
  [idColaborador] int NOT NULL,
  [fechaHoraEntradaUtc] datetime2(7) NOT NULL,
  [fechaHoraSalidaUtc] datetime2(7) NULL,
  [estado] nvarchar(20) NOT NULL CONSTRAINT [DF_Jornada_estado] DEFAULT (N'Abierta'),
  [fechaCreacion] datetime2(7) NOT NULL CONSTRAINT [DF_Jornada_fechaCreacion] DEFAULT (getdate()),
  [creadoPor] nvarchar(100) NOT NULL,
  [fechaModificacion] datetime2(7) NULL,
  [modificadoPor] nvarchar(100) NULL,
  [cierreOrigen] nvarchar(20) NULL,
  [confirmadoUtc] datetime2(7) NULL,
  [confirmadoPor] nvarchar(100) NULL,
  CONSTRAINT [pk_jornada] PRIMARY KEY ([idJornada]),
  CONSTRAINT [ck_jornada_estado] CHECK ([estado]=N'Anomalia' OR [estado]=N'Cerrada' OR [estado]=N'Abierta'),
  CONSTRAINT [ck_jornada_salida] CHECK ([fechaHoraSalidaUtc] IS NULL OR [fechaHoraSalidaUtc]>=[fechaHoraEntradaUtc]),
  CONSTRAINT [ck_jornada_cierreOrigen] CHECK ([cierreOrigen] IS NULL OR ([cierreOrigen]=N'manual' OR [cierreOrigen]=N'automatico' OR [cierreOrigen]=N'marca'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ux_jornada_abierta' AND object_id=OBJECT_ID('h4.Jornada')) CREATE UNIQUE INDEX [ux_jornada_abierta] ON h4.[Jornada] ([idColaborador]) WHERE ([fechaHoraSalidaUtc] IS NULL);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_jornada_idColaborador' AND object_id=OBJECT_ID('h4.Jornada')) CREATE INDEX [ix_jornada_idColaborador] ON h4.[Jornada] ([idColaborador], [fechaHoraEntradaUtc]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_jornada_sinConfirmar' AND object_id=OBJECT_ID('h4.Jornada')) CREATE INDEX [ix_jornada_sinConfirmar] ON h4.[Jornada] ([fechaHoraEntradaUtc]) WHERE ([confirmadoUtc] IS NULL);
GO

IF OBJECT_ID('h4.MarcajeEvento','U') IS NULL
CREATE TABLE h4.[MarcajeEvento] (
  [idMarcajeEvento] bigint IDENTITY(1,1) NOT NULL,
  [cedula] nvarchar(100) NOT NULL,
  [idColaborador] int NULL,
  [tipoEvento] nvarchar(10) NOT NULL,
  [fechaHoraUtc] datetime2(7) NOT NULL,
  [idExterno] nvarchar(100) NULL,
  [dispositivo] nvarchar(100) NULL,
  [esProcesado] bit NOT NULL CONSTRAINT [DF_MarcajeEvento_esProcesado] DEFAULT ((0)),
  [fechaCreacion] datetime2(7) NOT NULL CONSTRAINT [DF_MarcajeEvento_fechaCreacion] DEFAULT (getdate()),
  [creadoPor] nvarchar(100) NOT NULL,
  [fechaModificacion] datetime2(7) NULL,
  [modificadoPor] nvarchar(100) NULL,
  [dispositivoSn] nvarchar(50) NULL,
  [pinDispositivo] nvarchar(50) NULL,
  [tipoVerificacion] int NULL,
  [calidadFacial] decimal(5,2) NULL,
  [livenessScore] decimal(5,2) NULL,
  [temperatura] decimal(5,2) NULL,
  [mascarilla] bit NULL,
  [origen] nvarchar(20) NOT NULL CONSTRAINT [DF_MarcajeEvento_origen] DEFAULT (N'dispositivo'),
  [motivo] nvarchar(200) NULL,
  [esDuplicado] bit NOT NULL CONSTRAINT [DF_MarcajeEvento_esDuplicado] DEFAULT ((0)),
  CONSTRAINT [pk_marcajeEvento] PRIMARY KEY ([idMarcajeEvento]),
  CONSTRAINT [ck_marcajeEvento_tipoEvento] CHECK ([tipoEvento]=N'SALIDA' OR [tipoEvento]=N'ENTRADA')
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ux_marcajeEvento_idExterno' AND object_id=OBJECT_ID('h4.MarcajeEvento')) CREATE UNIQUE INDEX [ux_marcajeEvento_idExterno] ON h4.[MarcajeEvento] ([idExterno]) WHERE ([idExterno] IS NOT NULL);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_marcajeEvento_cedula' AND object_id=OBJECT_ID('h4.MarcajeEvento')) CREATE INDEX [ix_marcajeEvento_cedula] ON h4.[MarcajeEvento] ([cedula]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_marcajeEvento_idColaborador' AND object_id=OBJECT_ID('h4.MarcajeEvento')) CREATE INDEX [ix_marcajeEvento_idColaborador] ON h4.[MarcajeEvento] ([idColaborador]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_marcajeEvento_fechaHoraUtc' AND object_id=OBJECT_ID('h4.MarcajeEvento')) CREATE INDEX [ix_marcajeEvento_fechaHoraUtc] ON h4.[MarcajeEvento] ([fechaHoraUtc]);
GO

IF OBJECT_ID('h4.ZonaColaborador','U') IS NULL
CREATE TABLE h4.[ZonaColaborador] (
  [idZonaColaborador] bigint IDENTITY(1,1) NOT NULL,
  [idZona] int NOT NULL,
  [idColaborador] int NOT NULL,
  [pin] nvarchar(50) NOT NULL,
  [activo] bit NOT NULL CONSTRAINT [DF_ZonaColaborador_activo] DEFAULT ((1)),
  [fechaAlta] datetime2(7) NOT NULL CONSTRAINT [DF_ZonaColaborador_fechaAlta] DEFAULT (sysutcdatetime()),
  [fechaBaja] datetime2(7) NULL,
  [fechaCreacion] datetime2(7) NOT NULL CONSTRAINT [DF_ZonaColaborador_fechaCreacion] DEFAULT (sysutcdatetime()),
  [creadoPor] nvarchar(200) NOT NULL,
  [fechaModificacion] datetime2(7) NULL,
  [modificadoPor] nvarchar(200) NULL,
  CONSTRAINT [pk_zonaColaborador] PRIMARY KEY ([idZonaColaborador])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ux_zonaColab_zona_colab_activo' AND object_id=OBJECT_ID('h4.ZonaColaborador')) CREATE UNIQUE INDEX [ux_zonaColab_zona_colab_activo] ON h4.[ZonaColaborador] ([idZona], [idColaborador]) WHERE ([activo]=(1));
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_zonaColab_zona_pin' AND object_id=OBJECT_ID('h4.ZonaColaborador')) CREATE INDEX [ix_zonaColab_zona_pin] ON h4.[ZonaColaborador] ([idZona], [pin]) WHERE ([activo]=(1));
GO

/* ======================= 3) FOREIGN KEYS ========================== */
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_cuadrilla_subpartida')
  ALTER TABLE dbo.[Cuadrilla] ADD CONSTRAINT [fk_cuadrilla_subpartida] FOREIGN KEY ([idSubPartida]) REFERENCES dbo.[SubPartida] ([idSubPartida]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK__Cuadrilla__IDCua__2BFF54FD')
  ALTER TABLE dbo.[CuadrillaObra] ADD CONSTRAINT [FK__Cuadrilla__IDCua__2BFF54FD] FOREIGN KEY ([IDCuadrilla]) REFERENCES dbo.[Cuadrilla] ([IDCuadrilla]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK__Cuadrilla__idObr__2CF37936')
  ALTER TABLE dbo.[CuadrillaObra] ADD CONSTRAINT [FK__Cuadrilla__idObr__2CF37936] FOREIGN KEY ([idObra]) REFERENCES dbo.[Obra] ([idObra]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK__Cuadrilla__IDCua__30C40A1A')
  ALTER TABLE dbo.[CuadrillaSubPartida] ADD CONSTRAINT [FK__Cuadrilla__IDCua__30C40A1A] FOREIGN KEY ([IDCuadrilla]) REFERENCES dbo.[Cuadrilla] ([IDCuadrilla]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK__Cuadrilla__idSub__31B82E53')
  ALTER TABLE dbo.[CuadrillaSubPartida] ADD CONSTRAINT [FK__Cuadrilla__idSub__31B82E53] FOREIGN KEY ([idSubPartida]) REFERENCES dbo.[SubPartida] ([idSubPartida]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_EncargadoPartida_colaborador')
  ALTER TABLE dbo.[EncargadoPartida] ADD CONSTRAINT [fk_EncargadoPartida_colaborador] FOREIGN KEY ([idColaborador]) REFERENCES dbo.[Colaborador] ([idColaborador]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_EncargadoPartida_subpartida')
  ALTER TABLE dbo.[EncargadoPartida] ADD CONSTRAINT [fk_EncargadoPartida_subpartida] FOREIGN KEY ([idSubPartida]) REFERENCES dbo.[SubPartida] ([idSubPartida]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_dispositivo_zona')
  ALTER TABLE h4.[Dispositivo] ADD CONSTRAINT [fk_dispositivo_zona] FOREIGN KEY ([idZona]) REFERENCES h4.[Zona] ([idZona]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_dispBio_dispositivo')
  ALTER TABLE h4.[DispositivoBiometria] ADD CONSTRAINT [fk_dispBio_dispositivo] FOREIGN KEY ([idDispositivo]) REFERENCES h4.[Dispositivo] ([idDispositivo]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_zona_obra')
  ALTER TABLE h4.[Zona] ADD CONSTRAINT [fk_zona_obra] FOREIGN KEY ([idObra]) REFERENCES dbo.[Obra] ([idObra]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_zona_proyecto')
  ALTER TABLE h4.[Zona] ADD CONSTRAINT [fk_zona_proyecto] FOREIGN KEY ([idProyecto]) REFERENCES dbo.[Proyecto] ([idProyecto]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK_h4OS_Obra')
  ALTER TABLE h4.[ObraSubpartida] ADD CONSTRAINT [FK_h4OS_Obra] FOREIGN KEY ([idObra]) REFERENCES dbo.[Obra] ([idObra]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK_h4OS_SubPartida')
  ALTER TABLE h4.[ObraSubpartida] ADD CONSTRAINT [FK_h4OS_SubPartida] FOREIGN KEY ([idSubpartida]) REFERENCES dbo.[SubPartida] ([idSubPartida]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK_h4Pre_Cabecera')
  ALTER TABLE h4.[ObraSubpartidaPresupuesto] ADD CONSTRAINT [FK_h4Pre_Cabecera] FOREIGN KEY ([idObraSubpartida]) REFERENCES h4.[ObraSubpartida] ([idObraSubpartida]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_eventoActividad_tipo')
  ALTER TABLE h4.[EventoActividad] ADD CONSTRAINT [fk_eventoActividad_tipo] FOREIGN KEY ([tipo]) REFERENCES h4.[EventoActividadTipo] ([codigo]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_eventoActividad_idProyecto')
  ALTER TABLE h4.[EventoActividad] ADD CONSTRAINT [fk_eventoActividad_idProyecto] FOREIGN KEY ([idProyecto]) REFERENCES dbo.[Proyecto] ([idProyecto]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_eventoActividad_idObra')
  ALTER TABLE h4.[EventoActividad] ADD CONSTRAINT [fk_eventoActividad_idObra] FOREIGN KEY ([idObra]) REFERENCES dbo.[Obra] ([idObra]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_eventoActividad_idCuadrilla')
  ALTER TABLE h4.[EventoActividad] ADD CONSTRAINT [fk_eventoActividad_idCuadrilla] FOREIGN KEY ([idCuadrilla]) REFERENCES dbo.[Cuadrilla] ([IDCuadrilla]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_eventoActividad_idColaborador')
  ALTER TABLE h4.[EventoActividad] ADD CONSTRAINT [fk_eventoActividad_idColaborador] FOREIGN KEY ([idColaborador]) REFERENCES dbo.[Colaborador] ([idColaborador]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_eventoActividad_idUsuarioActor')
  ALTER TABLE h4.[EventoActividad] ADD CONSTRAINT [fk_eventoActividad_idUsuarioActor] FOREIGN KEY ([idUsuarioActor]) REFERENCES dbo.[Usuario] ([idUsuario]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_eventoActividad_h4ObraSubpartida')
  ALTER TABLE h4.[EventoActividad] ADD CONSTRAINT [fk_eventoActividad_h4ObraSubpartida] FOREIGN KEY ([idObraSubpartida]) REFERENCES h4.[ObraSubpartida] ([idObraSubpartida]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_jornada_idColaborador')
  ALTER TABLE h4.[Jornada] ADD CONSTRAINT [fk_jornada_idColaborador] FOREIGN KEY ([idColaborador]) REFERENCES dbo.[Colaborador] ([idColaborador]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_marcajeEvento_idColaborador')
  ALTER TABLE h4.[MarcajeEvento] ADD CONSTRAINT [fk_marcajeEvento_idColaborador] FOREIGN KEY ([idColaborador]) REFERENCES dbo.[Colaborador] ([idColaborador]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_zonaColab_zona')
  ALTER TABLE h4.[ZonaColaborador] ADD CONSTRAINT [fk_zonaColab_zona] FOREIGN KEY ([idZona]) REFERENCES h4.[Zona] ([idZona]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_zonaColab_colaborador')
  ALTER TABLE h4.[ZonaColaborador] ADD CONSTRAINT [fk_zonaColab_colaborador] FOREIGN KEY ([idColaborador]) REFERENCES dbo.[Colaborador] ([idColaborador]);
GO

/* ============================ 4) VISTAS ============================ */

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
GO

CREATE OR ALTER VIEW h4.vZonaColaboradorEstado
AS
    SELECT
        zc.idZonaColaborador,
        zc.idZona,
        zc.idColaborador,
        zc.pin,
        cnt.equiposCompatibles,
        cnt.equiposConCara,
        cnt.equiposConHuella,
        cnt.equiposConFoto,
        DATEDIFF(MINUTE, zc.fechaAlta, SYSUTCDATETIME()) AS minutosDesdeAlta,
        CASE
            WHEN cnt.equiposCompatibles = 0 THEN N'sin_dispositivos'
            WHEN cnt.equiposConCara >= cnt.equiposCompatibles THEN N'lista'
            WHEN cnt.equiposConCara = 0 THEN N'esperando_biometria'
            ELSE N'redistribuyendo'
        END AS estado
    FROM h4.ZonaColaborador zc
    CROSS APPLY (
        -- COUNT(DISTINCT CASE ...) en vez de SUM(CASE WHEN EXISTS(subquery)): SQL
        -- Server no permite agregar sobre una subconsulta.
        SELECT
            COUNT(DISTINCT d.idDispositivo) AS equiposCompatibles,
            COUNT(DISTINCT CASE WHEN db.tipo = N'9' THEN d.idDispositivo END) AS equiposConCara,
            COUNT(DISTINCT CASE WHEN db.tipo = N'1' THEN d.idDispositivo END) AS equiposConHuella,
            COUNT(DISTINCT CASE WHEN db.tipo = N'foto' THEN d.idDispositivo END) AS equiposConFoto
        FROM h4.Dispositivo d
        LEFT JOIN h4.DispositivoBiometria db
            ON db.idDispositivo = d.idDispositivo AND db.pin = zc.pin
        WHERE d.idZona = zc.idZona AND d.aceptaTemplateBiometrico = 1
    ) cnt
    WHERE zc.activo = 1;
GO
