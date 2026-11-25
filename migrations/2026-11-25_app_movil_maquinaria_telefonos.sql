/* ============================================================================
   App móvil de maquinaria — teléfonos y ubicaciones.

   mant.DispositivoApp   un registro por teléfono (ID de Android). La app lo
                         actualiza cada vez que se abre: quién la usa, qué APK y
                         qué publicación corre, los permisos que dio, su token de
                         notificaciones y la última ubicación. Lo lee la pantalla
                         Mantenimiento → App móvil, y el reparto de versiones
                         usa `runtimeVersion` para no mandarle a un teléfono una
                         publicación de otro APK.

   mant.UbicacionApp     dónde estaba el operario cuando mandó un checklist, una
                         avería o una solicitud de material. Va aparte y no como
                         columnas en las tablas de Mantenimiento para no tocarlas.

   Aditiva: no cambia ninguna tabla existente. Idempotente.
   DESHACER:
     DROP TABLE mant.UbicacionApp;
     DROP TABLE mant.DispositivoApp;
   ============================================================================ */
IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id
               WHERE s.name = 'mant' AND t.name = 'DispositivoApp')
CREATE TABLE mant.DispositivoApp (
  idDispositivoApp      BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_mant_DispositivoApp PRIMARY KEY,
  -- ID de Android: estable por teléfono, sobrevive a reinstalar la app.
  identificador         NVARCHAR(100) NOT NULL,
  -- Quién la abrió por última vez (dbo.Usuario). Sin FK: la tabla vive en `mant`.
  idUsuario             INT NULL,
  usuario               NVARCHAR(100) NULL,
  plataforma            NVARCHAR(20)  NOT NULL CONSTRAINT DF_mant_DispositivoApp_plataforma DEFAULT ('android'),
  marca                 NVARCHAR(60)  NULL,
  modelo                NVARCHAR(100) NULL,
  nombreEquipo          NVARCHAR(100) NULL,
  versionSO             NVARCHAR(30)  NULL,
  versionApp            NVARCHAR(30)  NULL,
  compilacion           NVARCHAR(20)  NULL,
  publicacion           NVARCHAR(20)  NULL,
  runtimeVersion        NVARCHAR(100) NULL,
  -- ExpoPushToken, para el aviso de versión nueva.
  pushToken             NVARCHAR(200) NULL,
  -- 'concedido' | 'negado' | 'sin-preguntar'
  permisoUbicacion      NVARCHAR(20)  NULL,
  permisoCamara         NVARCHAR(20)  NULL,
  permisoNotificaciones NVARCHAR(20)  NULL,
  latitud               DECIMAL(9,6)  NULL,
  longitud              DECIMAL(9,6)  NULL,
  precisionM            INT           NULL,
  ubicacionUtc          DATETIME2     NULL,
  -- Teléfono de prueba (el del desarrollador): va aparte y no cuenta en la flota.
  esPrueba              BIT           NOT NULL CONSTRAINT DF_mant_DispositivoApp_esPrueba DEFAULT (0),
  primeraVezUtc         DATETIME2     NOT NULL CONSTRAINT DF_mant_DispositivoApp_primera DEFAULT (SYSUTCDATETIME()),
  ultimaVezUtc          DATETIME2     NOT NULL CONSTRAINT DF_mant_DispositivoApp_ultima DEFAULT (SYSUTCDATETIME()),
  CONSTRAINT UQ_mant_DispositivoApp_identificador UNIQUE (identificador)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id
               WHERE s.name = 'mant' AND t.name = 'UbicacionApp')
CREATE TABLE mant.UbicacionApp (
  idUbicacionApp  BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_mant_UbicacionApp PRIMARY KEY,
  -- 'checklist' | 'averia' | 'material'
  tipo            NVARCHAR(20)  NOT NULL,
  -- Id de la inspección, la OT o la solicitud que se mandó.
  referenciaId    NVARCHAR(50)  NULL,
  equipoId        UNIQUEIDENTIFIER NULL,
  usuario         NVARCHAR(100) NOT NULL,
  identificador   NVARCHAR(100) NULL,
  latitud         DECIMAL(9,6)  NOT NULL,
  longitud        DECIMAL(9,6)  NOT NULL,
  precisionM      INT           NULL,
  -- Cuándo la tomó el teléfono (puede ser unos minutos antes de mandar).
  capturadaUtc    DATETIME2     NOT NULL,
  creadaUtc       DATETIME2     NOT NULL CONSTRAINT DF_mant_UbicacionApp_creada DEFAULT (SYSUTCDATETIME())
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_mant_UbicacionApp_referencia' AND object_id = OBJECT_ID('mant.UbicacionApp'))
  CREATE INDEX IX_mant_UbicacionApp_referencia ON mant.UbicacionApp (tipo, referenciaId);
GO
