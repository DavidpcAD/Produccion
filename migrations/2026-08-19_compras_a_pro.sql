/* ============================================================================
   Compras (Ingeniería + Aprobación de OC) → AdelantePRO
   Fecha: 2026-08-19
   Origen del esquema: AdelanteSBX (dbo), extraído de sys.* — 15 tablas + 1 vista.
   Idempotente: se puede correr varias veces.

   ALCANCE (solo lo que toca el módulo /compras):
     WBS/catálogos ...... Etapa, Partida, SubPartida, clasificacion
     Obras .............. Obra                       (catálogo que lee el pedido)
     Ingeniería ......... PedidoCompra, PedidoCompraDet, PlantillaSolicitud
     Aprobación/OC ...... OrdenCompra, OrdenCompraDet
     Recepción/factura .. RecepcionCompra, RecepcionCompraDet, NotaCreditoDet
                          (las carga /api/compras/bootstrap: si no existen, el
                           módulo entero da 500 aunque la UI esté oculta)
     Soporte ............ Movimiento (bitácora), TablaVista (vistas guardadas)
     Vista .............. vw_MatrizObraClasificacion
     Delta ............. dbo.Estado + columna [modulo] y los 13 estados de Compras

   NO incluye: usuarios/roles (compras referencia al usuario por TEXTO, no por FK,
   así que auth puede seguir en otra base), ni Proyecto, ni nada de Grupo B.

   Cómo correr:  node scripts/migrar-compras-a-pro.mjs --ddl --confirm
   ============================================================================ */

/* ---------- 0) dbo.Estado: columna [modulo] (la exige lib/compras/repo.ts) ---------- */
IF COL_LENGTH('dbo.Estado','modulo') IS NULL
  ALTER TABLE dbo.Estado ADD [modulo] nvarchar(30) NULL;
GO

/* ---------- 1) Estados del módulo Compras (ids EXACTOS de SBX) ----------
   Se preservan los ids porque PedidoCompra/OrdenCompra los referencian.
   Nota: en SBX hay nombres duplicados (Borrador 0 y 1, Lanzado 7 y 8,
   Completado 9 y 10); se copian tal cual para que el diccionario
   nombre→id de ensureEstados() resuelva igual que hoy. ------------------ */
SET IDENTITY_INSERT dbo.Estado ON;
IF NOT EXISTS (SELECT 1 FROM dbo.Estado WHERE idEstado=0)
  INSERT dbo.Estado (idEstado, estado, abreviatura, tipo, orden, colorHex, descripcion, modulo, fechaCreacion, creadoPor)
  VALUES (0, N'Borrador', NULL, NULL, NULL, NULL, NULL, N'Compras', SYSUTCDATETIME(), N'migracion');
IF NOT EXISTS (SELECT 1 FROM dbo.Estado WHERE idEstado=1)
  INSERT dbo.Estado (idEstado, estado, abreviatura, tipo, orden, colorHex, descripcion, modulo, fechaCreacion, creadoPor)
  VALUES (1, N'Borrador', NULL, NULL, NULL, NULL, NULL, N'Compras', SYSUTCDATETIME(), N'migracion');
IF NOT EXISTS (SELECT 1 FROM dbo.Estado WHERE idEstado=2)
  INSERT dbo.Estado (idEstado, estado, abreviatura, tipo, orden, colorHex, descripcion, modulo, fechaCreacion, creadoPor)
  VALUES (2, N'Aprobado', NULL, NULL, NULL, NULL, NULL, N'Compras', SYSUTCDATETIME(), N'migracion');
IF NOT EXISTS (SELECT 1 FROM dbo.Estado WHERE idEstado=3)
  INSERT dbo.Estado (idEstado, estado, abreviatura, tipo, orden, colorHex, descripcion, modulo, fechaCreacion, creadoPor)
  VALUES (3, N'En orden', NULL, NULL, NULL, NULL, NULL, N'Compras', SYSUTCDATETIME(), N'migracion');
IF NOT EXISTS (SELECT 1 FROM dbo.Estado WHERE idEstado=4)
  INSERT dbo.Estado (idEstado, estado, abreviatura, tipo, orden, colorHex, descripcion, modulo, fechaCreacion, creadoPor)
  VALUES (4, N'Cerrado', NULL, NULL, NULL, NULL, NULL, N'Compras', SYSUTCDATETIME(), N'migracion');
IF NOT EXISTS (SELECT 1 FROM dbo.Estado WHERE idEstado=5)
  INSERT dbo.Estado (idEstado, estado, abreviatura, tipo, orden, colorHex, descripcion, modulo, fechaCreacion, creadoPor)
  VALUES (5, N'Abierto', NULL, NULL, NULL, NULL, NULL, N'Compras', SYSUTCDATETIME(), N'migracion');
IF NOT EXISTS (SELECT 1 FROM dbo.Estado WHERE idEstado=6)
  INSERT dbo.Estado (idEstado, estado, abreviatura, tipo, orden, colorHex, descripcion, modulo, fechaCreacion, creadoPor)
  VALUES (6, N'Pendiente de aprobación', NULL, NULL, NULL, NULL, NULL, N'Compras', SYSUTCDATETIME(), N'migracion');
IF NOT EXISTS (SELECT 1 FROM dbo.Estado WHERE idEstado=7)
  INSERT dbo.Estado (idEstado, estado, abreviatura, tipo, orden, colorHex, descripcion, modulo, fechaCreacion, creadoPor)
  VALUES (7, N'Lanzado', NULL, NULL, NULL, NULL, NULL, N'Compras', SYSUTCDATETIME(), N'migracion');
IF NOT EXISTS (SELECT 1 FROM dbo.Estado WHERE idEstado=8)
  INSERT dbo.Estado (idEstado, estado, abreviatura, tipo, orden, colorHex, descripcion, modulo, fechaCreacion, creadoPor)
  VALUES (8, N'Lanzado', NULL, NULL, NULL, NULL, NULL, N'Compras', SYSUTCDATETIME(), N'migracion');
IF NOT EXISTS (SELECT 1 FROM dbo.Estado WHERE idEstado=9)
  INSERT dbo.Estado (idEstado, estado, abreviatura, tipo, orden, colorHex, descripcion, modulo, fechaCreacion, creadoPor)
  VALUES (9, N'Completado', NULL, NULL, NULL, NULL, NULL, N'Compras', SYSUTCDATETIME(), N'migracion');
IF NOT EXISTS (SELECT 1 FROM dbo.Estado WHERE idEstado=10)
  INSERT dbo.Estado (idEstado, estado, abreviatura, tipo, orden, colorHex, descripcion, modulo, fechaCreacion, creadoPor)
  VALUES (10, N'Completado', NULL, NULL, NULL, NULL, NULL, N'Compras', SYSUTCDATETIME(), N'migracion');
IF NOT EXISTS (SELECT 1 FROM dbo.Estado WHERE idEstado=49)
  INSERT dbo.Estado (idEstado, estado, abreviatura, tipo, orden, colorHex, descripcion, modulo, fechaCreacion, creadoPor)
  VALUES (49, N'Rechazado', NULL, NULL, NULL, NULL, NULL, N'Compras', SYSUTCDATETIME(), N'migracion');
IF NOT EXISTS (SELECT 1 FROM dbo.Estado WHERE idEstado=50)
  INSERT dbo.Estado (idEstado, estado, abreviatura, tipo, orden, colorHex, descripcion, modulo, fechaCreacion, creadoPor)
  VALUES (50, N'Devuelto', NULL, NULL, NULL, NULL, NULL, N'Compras', SYSUTCDATETIME(), N'migracion');
SET IDENTITY_INSERT dbo.Estado OFF;
GO

/* ============================ 2) TABLAS ============================ */

/* ---------- dbo.Etapa ---------- */
IF OBJECT_ID('dbo.Etapa','U') IS NULL
CREATE TABLE dbo.[Etapa] (
  [id] int IDENTITY(1,1) NOT NULL,
  [codigo] varchar(10) NOT NULL,
  [nombre] nvarchar(120) NOT NULL,
  [activo] bit NOT NULL CONSTRAINT [DF_Etapa_activo] DEFAULT ((1)),
  [creado_en] datetime2(0) NOT NULL CONSTRAINT [DF_Etapa_creado_en] DEFAULT (sysutcdatetime()),
  CONSTRAINT [pk_etapa] PRIMARY KEY ([id])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='uq_etapa_codigo' AND object_id=OBJECT_ID('dbo.Etapa'))
  CREATE UNIQUE NONCLUSTERED INDEX [uq_etapa_codigo] ON dbo.[Etapa] ([codigo]);
GO

/* ---------- dbo.Partida ---------- */
IF OBJECT_ID('dbo.Partida','U') IS NULL
CREATE TABLE dbo.[Partida] (
  [idPartida] int IDENTITY(1,1) NOT NULL,
  [codigo] varchar(15) NOT NULL,
  [nombre] nvarchar(160) NOT NULL,
  [idEtapa] int NULL,
  [esActivo] bit NOT NULL CONSTRAINT [DF_Partida_esActivo] DEFAULT ((1)),
  [fechaCreacion] datetime2(0) NOT NULL CONSTRAINT [DF_Partida_fechaCreacion] DEFAULT (sysutcdatetime()),
  [orden] int NULL,
  [esPosting] bit NOT NULL CONSTRAINT [DF_Partida_esPosting] DEFAULT ((0)),
  CONSTRAINT [pk_partida] PRIMARY KEY ([idPartida])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='uq_partida_codigo' AND object_id=OBJECT_ID('dbo.Partida'))
  CREATE UNIQUE NONCLUSTERED INDEX [uq_partida_codigo] ON dbo.[Partida] ([codigo]);
GO

/* ---------- dbo.SubPartida ---------- */
IF OBJECT_ID('dbo.SubPartida','U') IS NULL
CREATE TABLE dbo.[SubPartida] (
  [idSubPartida] int IDENTITY(1,1) NOT NULL,
  [codigo] varchar(50) NOT NULL,
  [nombre] nvarchar(50) NOT NULL,
  [idPartida] int NOT NULL,
  [numSprint] smallint NOT NULL,
  [esCritica] bit NOT NULL,
  [descripcion] nvarchar(50) NULL,
  [esActivo] bit NOT NULL,
  [fechaCreacion] datetime2(7) NOT NULL,
  CONSTRAINT [PK_sub_partidas] PRIMARY KEY ([idSubPartida])
);
GO

/* ---------- dbo.clasificacion ---------- */
IF OBJECT_ID('dbo.clasificacion','U') IS NULL
CREATE TABLE dbo.[clasificacion] (
  [id] int IDENTITY(1,1) NOT NULL,
  [nombre] nvarchar(160) NOT NULL,
  [partida_id] int NULL,
  [sub_partida_id] int NULL,
  [activo] bit NOT NULL CONSTRAINT [DF_clasificacion_activo] DEFAULT ((1)),
  [creado_en] datetime2(0) NOT NULL CONSTRAINT [DF_clasificacion_creado_en] DEFAULT (sysutcdatetime()),
  CONSTRAINT [pk_clasificacion] PRIMARY KEY ([id]),
  CONSTRAINT [ck_clasificacion_padre] CHECK ([partida_id] IS NOT NULL AND [sub_partida_id] IS NULL OR [partida_id] IS NULL AND [sub_partida_id] IS NOT NULL)
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_clasificacion_partida' AND object_id=OBJECT_ID('dbo.clasificacion'))
  CREATE NONCLUSTERED INDEX [ix_clasificacion_partida] ON dbo.[clasificacion] ([partida_id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_clasificacion_subpartida' AND object_id=OBJECT_ID('dbo.clasificacion'))
  CREATE NONCLUSTERED INDEX [ix_clasificacion_subpartida] ON dbo.[clasificacion] ([sub_partida_id]);
GO

/* ---------- dbo.Obra ---------- */
IF OBJECT_ID('dbo.Obra','U') IS NULL
CREATE TABLE dbo.[Obra] (
  [idObra] bigint IDENTITY(1,1) NOT NULL,
  [numeroObra] nvarchar(20) NOT NULL,
  [nombreMostrado] nvarchar(250) NULL,
  [descripcion] nvarchar(250) NULL,
  [centroCosto] nvarchar(20) NULL,
  [areaCosteo] nvarchar(20) NULL,
  [proyectoPadre] nvarchar(10) NULL,
  [areaProrrateadaM2] decimal(20,5) NULL,
  [gerenteProyecto] nvarchar(100) NULL,
  [idEncargado] nvarchar(100) NULL,
  [ubicacion] nvarchar(100) NULL,
  [estado] nvarchar(50) NULL,
  [fechaInicio] date NULL,
  [fechaFin] date NULL,
  [fechaCreacionObra] date NULL,
  [precioNormalMaquinaria] decimal(20,5) NULL,
  [precioConcretoMaquinaria] decimal(20,5) NULL,
  [origenPrincipal] nvarchar(20) NULL,
  [fechaCreacion] datetime2(7) NOT NULL CONSTRAINT [DF_Obra_fechaCreacion] DEFAULT (getdate()),
  [creadoPor] nvarchar(100) NOT NULL,
  [fechaModificacion] datetime2(7) NULL,
  [modificadoPor] nvarchar(100) NULL,
  [esBC] bit NULL,
  [esProcore] bit NULL,
  [idProyecto] int NULL,
  CONSTRAINT [pk_obra] PRIMARY KEY ([idObra])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ux_obra_numeroObra' AND object_id=OBJECT_ID('dbo.Obra'))
  CREATE UNIQUE NONCLUSTERED INDEX [ux_obra_numeroObra] ON dbo.[Obra] ([numeroObra]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_obra_areaCosteo' AND object_id=OBJECT_ID('dbo.Obra'))
  CREATE NONCLUSTERED INDEX [ix_obra_areaCosteo] ON dbo.[Obra] ([areaCosteo]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_obra_centroCosto' AND object_id=OBJECT_ID('dbo.Obra'))
  CREATE NONCLUSTERED INDEX [ix_obra_centroCosto] ON dbo.[Obra] ([centroCosto]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_obra_proyectoPadre' AND object_id=OBJECT_ID('dbo.Obra'))
  CREATE NONCLUSTERED INDEX [ix_obra_proyectoPadre] ON dbo.[Obra] ([proyectoPadre]);
GO

/* ---------- dbo.PlantillaSolicitud ---------- */
IF OBJECT_ID('dbo.PlantillaSolicitud','U') IS NULL
CREATE TABLE dbo.[PlantillaSolicitud] (
  [idPlantillaSolicitud] int IDENTITY(1,1) NOT NULL,
  [nombre] nvarchar(100) NOT NULL,
  [creadoPor] nvarchar(100) NOT NULL,
  [lineasJson] nvarchar(max) NOT NULL,
  [esEliminada] bit NOT NULL CONSTRAINT [DF_PlantillaSolicitud_esEliminada] DEFAULT ((0)),
  [fechaCreacion] datetime2(3) NOT NULL CONSTRAINT [DF_PlantillaSolicitud_fechaCreacion] DEFAULT (sysutcdatetime()),
  [fechaModificacion] datetime2(3) NULL,
  [modificadoPor] nvarchar(100) NULL,
  [idSubPartida] int NULL,
  [idClasificacion] int NULL,
  [tipo] nvarchar(15) NOT NULL CONSTRAINT [DF_PlantillaSolicitud_tipo] DEFAULT ('general'),
  CONSTRAINT [PK_PlantillaSolicitud] PRIMARY KEY ([idPlantillaSolicitud])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_PlantillaSolicitud_nombre_creadoPor' AND object_id=OBJECT_ID('dbo.PlantillaSolicitud'))
  CREATE UNIQUE NONCLUSTERED INDEX [UX_PlantillaSolicitud_nombre_creadoPor] ON dbo.[PlantillaSolicitud] ([nombre], [creadoPor]) WHERE ([esEliminada]=(0));
GO

/* ---------- dbo.TablaVista ---------- */
IF OBJECT_ID('dbo.TablaVista','U') IS NULL
CREATE TABLE dbo.[TablaVista] (
  [id] int IDENTITY(1,1) NOT NULL,
  [usuario] nvarchar(100) NOT NULL,
  [tablaKey] nvarchar(60) NOT NULL,
  [nombre] nvarchar(100) NOT NULL,
  [configJson] nvarchar(max) NOT NULL,
  [esPredeterminada] bit NOT NULL CONSTRAINT [DF_TablaVista_esPredeterminada] DEFAULT ((0)),
  [esEliminada] bit NOT NULL CONSTRAINT [DF_TablaVista_esEliminada] DEFAULT ((0)),
  [fechaCreacion] datetime2(0) NOT NULL CONSTRAINT [DF_TablaVista_fechaCreacion] DEFAULT (sysutcdatetime()),
  [fechaModificacion] datetime2(0) NULL,
  CONSTRAINT [pk_TablaVista] PRIMARY KEY ([id])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='uq_TablaVista' AND object_id=OBJECT_ID('dbo.TablaVista'))
  CREATE UNIQUE NONCLUSTERED INDEX [uq_TablaVista] ON dbo.[TablaVista] ([usuario], [tablaKey], [nombre]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_TablaVista_usuario_tabla' AND object_id=OBJECT_ID('dbo.TablaVista'))
  CREATE NONCLUSTERED INDEX [ix_TablaVista_usuario_tabla] ON dbo.[TablaVista] ([usuario], [tablaKey]);
GO

/* ---------- dbo.Movimiento ---------- */
IF OBJECT_ID('dbo.Movimiento','U') IS NULL
CREATE TABLE dbo.[Movimiento] (
  [idMovimiento] int IDENTITY(1,1) NOT NULL,
  [entidad] nvarchar(20) NOT NULL,
  [idEntidad] int NOT NULL,
  [documentoNo] nvarchar(50) NULL,
  [tipoMovimiento] nvarchar(50) NOT NULL,
  [idEstadoAnterior] int NULL,
  [idEstadoNuevo] int NULL,
  [detalle] nvarchar(max) NULL,
  [usuario] nvarchar(100) NOT NULL,
  [rol] nvarchar(20) NULL,
  [fecha] datetime2(7) NOT NULL CONSTRAINT [DF_Movimiento_fecha] DEFAULT (getdate()),
  CONSTRAINT [pk_Movimiento] PRIMARY KEY ([idMovimiento]),
  CONSTRAINT [ck_Movimiento_entidad] CHECK ([entidad]='recepcion' OR [entidad]='orden' OR [entidad]='pedido')
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_Movimiento_entidad' AND object_id=OBJECT_ID('dbo.Movimiento'))
  CREATE NONCLUSTERED INDEX [ix_Movimiento_entidad] ON dbo.[Movimiento] ([entidad], [idEntidad]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_Movimiento_fecha' AND object_id=OBJECT_ID('dbo.Movimiento'))
  CREATE NONCLUSTERED INDEX [ix_Movimiento_fecha] ON dbo.[Movimiento] ([fecha] DESC);
GO

/* ---------- dbo.PedidoCompra ---------- */
IF OBJECT_ID('dbo.PedidoCompra','U') IS NULL
CREATE TABLE dbo.[PedidoCompra] (
  [idPedidoCompra] int IDENTITY(1,1) NOT NULL,
  [idCaso] int NULL,
  [idEstado] int NULL,
  [pedidoNo] nvarchar(50) NULL,
  [tipoSolicitud] nvarchar(15) NULL,
  [obra] nvarchar(50) NULL,
  [maquinaNo] nvarchar(20) NULL,
  [proyecto] nvarchar(150) NULL,
  [solicitante] nvarchar(100) NULL,
  [prioridad] nvarchar(20) NULL,
  [taskNo] nvarchar(15) NULL,
  [notaCreador] nvarchar(500) NULL,
  [notaAprobador] nvarchar(250) NULL,
  [fechaAprobado] datetime2(7) NULL,
  [aprobadoPor] nvarchar(100) NULL,
  [esAprobado] bit NULL,
  [fechaCompletado] datetime2(7) NULL,
  [bcSystemId] uniqueidentifier NULL,
  [bcDocumentType] nvarchar(20) NULL,
  [bcNo] nvarchar(20) NULL,
  [noSeries] nvarchar(20) NULL,
  [bcStatus] nvarchar(25) NULL,
  [syncedToBc] bit NULL,
  [esEliminada] bit NOT NULL CONSTRAINT [DF_PedidoCompra_esEliminada] DEFAULT ((0)),
  [fechaCreacion] datetime2(7) NOT NULL CONSTRAINT [DF_PedidoCompra_fechaCreacion] DEFAULT (getdate()),
  [creadoPor] nvarchar(100) NOT NULL,
  [fechaModificacion] datetime2(7) NULL,
  [modificadoPor] nvarchar(100) NULL,
  [idSubPartida] int NULL,
  [idClasificacion] int NULL,
  CONSTRAINT [pk_PedidoCompra] PRIMARY KEY ([idPedidoCompra])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_PedidoCompra_idEstado' AND object_id=OBJECT_ID('dbo.PedidoCompra'))
  CREATE NONCLUSTERED INDEX [ix_PedidoCompra_idEstado] ON dbo.[PedidoCompra] ([idEstado]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ux_PedidoCompra_bcSystemId' AND object_id=OBJECT_ID('dbo.PedidoCompra'))
  CREATE UNIQUE NONCLUSTERED INDEX [ux_PedidoCompra_bcSystemId] ON dbo.[PedidoCompra] ([bcSystemId]) WHERE ([bcSystemId] IS NOT NULL);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ux_PedidoCompra_pedidoNo' AND object_id=OBJECT_ID('dbo.PedidoCompra'))
  CREATE UNIQUE NONCLUSTERED INDEX [ux_PedidoCompra_pedidoNo] ON dbo.[PedidoCompra] ([pedidoNo]) WHERE ([pedidoNo] IS NOT NULL AND [esEliminada]=(0));
GO

/* ---------- dbo.PedidoCompraDet ---------- */
IF OBJECT_ID('dbo.PedidoCompraDet','U') IS NULL
CREATE TABLE dbo.[PedidoCompraDet] (
  [idPedidoCompraDet] int IDENTITY(1,1) NOT NULL,
  [idPedidoCompra] int NOT NULL,
  [idEstado] int NULL,
  [lineNum] int NULL,
  [descripcion] nvarchar(250) NULL,
  [notaCreador] nvarchar(255) NULL,
  [taskNo] nvarchar(15) NULL,
  [obra] nvarchar(50) NULL,
  [maquinaNo] nvarchar(20) NULL,
  [quantitySolicitado] decimal(18,4) NULL,
  [quantityOrdenado] decimal(18,4) NULL,
  [itemNo] nvarchar(50) NULL,
  [variantCode] nvarchar(20) NULL,
  [unitOfMeasureCode] nvarchar(20) NULL,
  [locationCode] nvarchar(20) NULL,
  [shortcutDimension1Code] nvarchar(50) NULL,
  [shortcutDimension2Code] nvarchar(50) NULL,
  [esEditado] bit NULL,
  [fechaCreacion] datetime2(7) NOT NULL CONSTRAINT [DF_PedidoCompraDet_fechaCreacion] DEFAULT (getdate()),
  [creadoPor] nvarchar(100) NOT NULL,
  [fechaModificacion] datetime2(7) NULL,
  [modificadoPor] nvarchar(100) NULL,
  [taskDescr] nvarchar(150) NULL,
  CONSTRAINT [pk_PedidoCompraDet] PRIMARY KEY ([idPedidoCompraDet])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_PedidoCompraDet_idPedido' AND object_id=OBJECT_ID('dbo.PedidoCompraDet'))
  CREATE NONCLUSTERED INDEX [ix_PedidoCompraDet_idPedido] ON dbo.[PedidoCompraDet] ([idPedidoCompra]);
GO

/* ---------- dbo.OrdenCompra ---------- */
IF OBJECT_ID('dbo.OrdenCompra','U') IS NULL
CREATE TABLE dbo.[OrdenCompra] (
  [idOrdenCompra] int IDENTITY(1,1) NOT NULL,
  [idEstado] int NULL,
  [ordenNo] nvarchar(50) NULL,
  [proveedorNo] nvarchar(20) NULL,
  [proveedorNombre] nvarchar(150) NULL,
  [obra] nvarchar(50) NULL,
  [fechaEmision] date NULL,
  [fechaPedido] date NULL,
  [fechaVencimiento] date NULL,
  [fechaRecepEsperada] date NULL,
  [currencyCode] nvarchar(10) NULL,
  [currencyFactor] decimal(18,12) NULL,
  [paymentTermsCode] nvarchar(10) NULL,
  [paymentMethodCode] nvarchar(10) NULL,
  [vendorInvoiceNo] nvarchar(40) NULL,
  [montoSinIva] decimal(18,2) NULL,
  [montoConIva] decimal(18,2) NULL,
  [notaCreador] nvarchar(500) NULL,
  [notaAprobador] nvarchar(250) NULL,
  [fechaAprobado] datetime2(7) NULL,
  [aprobadoPor] nvarchar(100) NULL,
  [esAprobado] bit NULL,
  [versionesArchivadas] int NULL,
  [completelyReceived] bit NULL,
  [partiallyInvoiced] bit NULL,
  [receivedNotInvoiced] bit NULL,
  [bcSystemId] uniqueidentifier NULL,
  [bcDocumentType] nvarchar(20) NULL,
  [bcNo] nvarchar(20) NULL,
  [noSeries] nvarchar(20) NULL,
  [postingNoSeries] nvarchar(20) NULL,
  [receivingNoSeries] nvarchar(20) NULL,
  [quoteNo] nvarchar(20) NULL,
  [shortcutDimension1Code] nvarchar(50) NULL,
  [shortcutDimension2Code] nvarchar(50) NULL,
  [dimensionSetId] int NULL,
  [taxRegime] nvarchar(40) NULL,
  [syncedToBc] bit NULL,
  [esEliminada] bit NULL,
  [fechaCreacion] datetime2(7) NOT NULL CONSTRAINT [DF_OrdenCompra_fechaCreacion] DEFAULT (getdate()),
  [creadoPor] nvarchar(100) NOT NULL,
  [fechaModificacion] datetime2(7) NULL,
  [modificadoPor] nvarchar(100) NULL,
  CONSTRAINT [pk_OrdenCompra] PRIMARY KEY ([idOrdenCompra])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_OrdenCompra_idEstado' AND object_id=OBJECT_ID('dbo.OrdenCompra'))
  CREATE NONCLUSTERED INDEX [ix_OrdenCompra_idEstado] ON dbo.[OrdenCompra] ([idEstado]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ux_OrdenCompra_bcSystemId' AND object_id=OBJECT_ID('dbo.OrdenCompra'))
  CREATE UNIQUE NONCLUSTERED INDEX [ux_OrdenCompra_bcSystemId] ON dbo.[OrdenCompra] ([bcSystemId]) WHERE ([bcSystemId] IS NOT NULL);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ux_OrdenCompra_ordenNo' AND object_id=OBJECT_ID('dbo.OrdenCompra'))
  CREATE UNIQUE NONCLUSTERED INDEX [ux_OrdenCompra_ordenNo] ON dbo.[OrdenCompra] ([ordenNo]) WHERE ([ordenNo] IS NOT NULL AND [esEliminada]=(0));
GO

/* ---------- dbo.OrdenCompraDet ---------- */
IF OBJECT_ID('dbo.OrdenCompraDet','U') IS NULL
CREATE TABLE dbo.[OrdenCompraDet] (
  [idOrdenCompraDet] int IDENTITY(1,1) NOT NULL,
  [idOrdenCompra] int NOT NULL,
  [idPedidoCompraDet] int NULL,
  [idEstado] int NULL,
  [lineNum] int NULL,
  [tipoLinea] nvarchar(30) NULL,
  [descripcion] nvarchar(250) NULL,
  [referenciaAnulacion] nvarchar(100) NULL,
  [itemNo] nvarchar(50) NULL,
  [variantCode] nvarchar(20) NULL,
  [unitOfMeasureCode] nvarchar(20) NULL,
  [locationCode] nvarchar(20) NULL,
  [taskNo] nvarchar(15) NULL,
  [quantity] decimal(18,4) NULL,
  [quantityRecibida] decimal(18,4) NULL,
  [quantityFacturada] decimal(18,4) NULL,
  [qtyToReceive] decimal(18,4) NULL,
  [qtyToInvoice] decimal(18,4) NULL,
  [directUnitCost] decimal(18,4) NULL,
  [unitCostLcy] decimal(18,4) NULL,
  [lineAmount] decimal(18,2) NULL,
  [amountLcy] decimal(18,2) NULL,
  [vatPct] decimal(9,4) NULL,
  [lineDiscountPct] decimal(9,4) NULL,
  [jobNo] nvarchar(20) NULL,
  [postingGroup] nvarchar(20) NULL,
  [genProdPostingGroup] nvarchar(20) NULL,
  [vatProdPostingGroup] nvarchar(20) NULL,
  [itemCategoryCode] nvarchar(20) NULL,
  [shortcutDimension1Code] nvarchar(50) NULL,
  [shortcutDimension2Code] nvarchar(50) NULL,
  [permiteAsignacionCargo] bit NULL,
  [qtyToAssign] decimal(18,4) NULL,
  [qtyAssigned] decimal(18,4) NULL,
  [entryNoALM] int NULL,
  [entryNoMOV] int NULL,
  [esEditado] bit NULL,
  [fechaCreacion] datetime2(7) NOT NULL CONSTRAINT [DF_OrdenCompraDet_fechaCreacion] DEFAULT (getdate()),
  [creadoPor] nvarchar(100) NOT NULL,
  [fechaModificacion] datetime2(7) NULL,
  [modificadoPor] nvarchar(100) NULL,
  [chargeNo] nvarchar(20) NULL,
  [chargeMethod] nvarchar(20) NULL,
  CONSTRAINT [pk_OrdenCompraDet] PRIMARY KEY ([idOrdenCompraDet])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_OrdenCompraDet_idOrden' AND object_id=OBJECT_ID('dbo.OrdenCompraDet'))
  CREATE NONCLUSTERED INDEX [ix_OrdenCompraDet_idOrden] ON dbo.[OrdenCompraDet] ([idOrdenCompra]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_OrdenCompraDet_idPedidoDet' AND object_id=OBJECT_ID('dbo.OrdenCompraDet'))
  CREATE NONCLUSTERED INDEX [ix_OrdenCompraDet_idPedidoDet] ON dbo.[OrdenCompraDet] ([idPedidoCompraDet]);
GO

/* ---------- dbo.RecepcionCompra ---------- */
IF OBJECT_ID('dbo.RecepcionCompra','U') IS NULL
CREATE TABLE dbo.[RecepcionCompra] (
  [idRecepcionCompra] int IDENTITY(1,1) NOT NULL,
  [idOrdenCompra] int NOT NULL,
  [idEstado] int NULL,
  [recepcionNo] nvarchar(50) NULL,
  [numeroFactura] nvarchar(40) NULL,
  [fechaFactura] date NULL,
  [fechaRecepcion] date NULL,
  [fechaRegistro] date NULL,
  [total] decimal(18,2) NULL,
  [esParcial] bit NULL,
  [despachadoPor] nvarchar(100) NULL,
  [recibidoPor] nvarchar(100) NULL,
  [notaCreador] nvarchar(500) NULL,
  [bcSystemId] uniqueidentifier NULL,
  [bcPurchInvoiceNo] nvarchar(20) NULL,
  [postingNoSeries] nvarchar(20) NULL,
  [syncedToBc] bit NULL,
  [esEliminada] bit NULL,
  [fechaCreacion] datetime2(7) NOT NULL CONSTRAINT [DF_RecepcionCompra_fechaCreacion] DEFAULT (getdate()),
  [creadoPor] nvarchar(100) NOT NULL,
  [fechaModificacion] datetime2(7) NULL,
  [modificadoPor] nvarchar(100) NULL,
  CONSTRAINT [pk_RecepcionCompra] PRIMARY KEY ([idRecepcionCompra])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_RecepcionCompra_idOrden' AND object_id=OBJECT_ID('dbo.RecepcionCompra'))
  CREATE NONCLUSTERED INDEX [ix_RecepcionCompra_idOrden] ON dbo.[RecepcionCompra] ([idOrdenCompra]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ux_RecepcionCompra_bcSystemId' AND object_id=OBJECT_ID('dbo.RecepcionCompra'))
  CREATE UNIQUE NONCLUSTERED INDEX [ux_RecepcionCompra_bcSystemId] ON dbo.[RecepcionCompra] ([bcSystemId]) WHERE ([bcSystemId] IS NOT NULL);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ux_RecepcionCompra_recepcionNo' AND object_id=OBJECT_ID('dbo.RecepcionCompra'))
  CREATE UNIQUE NONCLUSTERED INDEX [ux_RecepcionCompra_recepcionNo] ON dbo.[RecepcionCompra] ([recepcionNo]) WHERE ([recepcionNo] IS NOT NULL AND [esEliminada]=(0));
GO

/* ---------- dbo.RecepcionCompraDet ---------- */
IF OBJECT_ID('dbo.RecepcionCompraDet','U') IS NULL
CREATE TABLE dbo.[RecepcionCompraDet] (
  [idRecepcionCompraDet] int IDENTITY(1,1) NOT NULL,
  [idRecepcionCompra] int NOT NULL,
  [idOrdenCompraDet] int NULL,
  [lineNum] int NULL,
  [descripcion] nvarchar(250) NULL,
  [referenciaAnulacion] nvarchar(100) NULL,
  [itemNo] nvarchar(50) NULL,
  [variantCode] nvarchar(20) NULL,
  [unitOfMeasureCode] nvarchar(20) NULL,
  [locationCode] nvarchar(20) NULL,
  [taskNo] nvarchar(15) NULL,
  [quantityRecibida] decimal(18,4) NULL,
  [precioFactura] decimal(18,4) NULL,
  [importeAsignadoFlete] decimal(18,2) NULL,
  [postingDate] date NULL,
  [documentNo] varchar(50) NULL,
  [entryNoALM] int NULL,
  [entryNoMOV] int NULL,
  [entryNoItemLedger] int NULL,
  [esEditado] bit NULL,
  [fechaCreacion] datetime2(7) NOT NULL CONSTRAINT [DF_RecepcionCompraDet_fechaCreacion] DEFAULT (getdate()),
  [creadoPor] nvarchar(100) NOT NULL,
  [fechaModificacion] datetime2(7) NULL,
  [modificadoPor] nvarchar(100) NULL,
  CONSTRAINT [pk_RecepcionCompraDet] PRIMARY KEY ([idRecepcionCompraDet])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_RecepcionCompraDet_idRecep' AND object_id=OBJECT_ID('dbo.RecepcionCompraDet'))
  CREATE NONCLUSTERED INDEX [ix_RecepcionCompraDet_idRecep] ON dbo.[RecepcionCompraDet] ([idRecepcionCompra]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_RecepcionCompraDet_idOrdenDet' AND object_id=OBJECT_ID('dbo.RecepcionCompraDet'))
  CREATE NONCLUSTERED INDEX [ix_RecepcionCompraDet_idOrdenDet] ON dbo.[RecepcionCompraDet] ([idOrdenCompraDet]);
GO

/* ---------- dbo.NotaCreditoDet ---------- */
IF OBJECT_ID('dbo.NotaCreditoDet','U') IS NULL
CREATE TABLE dbo.[NotaCreditoDet] (
  [idNotaCreditoDet] int IDENTITY(1,1) NOT NULL,
  [idOrdenCompra] int NOT NULL,
  [idOrdenCompraDet] int NULL,
  [articuloNo] nvarchar(40) NULL,
  [descripcion] nvarchar(200) NULL,
  [motivo] nvarchar(30) NOT NULL,
  [cantidad] decimal(18,4) NOT NULL,
  [precioUnitario] decimal(18,4) NULL,
  [nota] nvarchar(300) NULL,
  [estado] nvarchar(20) NOT NULL CONSTRAINT [DF_NotaCreditoDet_estado] DEFAULT ('pendiente'),
  [esEliminada] bit NOT NULL CONSTRAINT [DF_NotaCreditoDet_esEliminada] DEFAULT ((0)),
  [fechaCreacion] datetime NOT NULL CONSTRAINT [DF_NotaCreditoDet_fechaCreacion] DEFAULT (getdate()),
  [creadoPor] nvarchar(100) NULL,
  CONSTRAINT [PK__NotaCred__6378655FF3E10AE9] PRIMARY KEY ([idNotaCreditoDet])
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_NotaCreditoDet_orden' AND object_id=OBJECT_ID('dbo.NotaCreditoDet'))
  CREATE NONCLUSTERED INDEX [IX_NotaCreditoDet_orden] ON dbo.[NotaCreditoDet] ([idOrdenCompra]);
GO

/* ======================= 3) FOREIGN KEYS ========================== */
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_partida_etapa')
  ALTER TABLE dbo.[Partida] ADD CONSTRAINT [fk_partida_etapa] FOREIGN KEY ([idEtapa]) REFERENCES dbo.[Etapa] ([id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_sub_partidas_partida')
  ALTER TABLE dbo.[SubPartida] ADD CONSTRAINT [fk_sub_partidas_partida] FOREIGN KEY ([idPartida]) REFERENCES dbo.[Partida] ([idPartida]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_clasificacion_partida')
  ALTER TABLE dbo.[clasificacion] ADD CONSTRAINT [fk_clasificacion_partida] FOREIGN KEY ([partida_id]) REFERENCES dbo.[Partida] ([idPartida]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_clasificacion_subpartida')
  ALTER TABLE dbo.[clasificacion] ADD CONSTRAINT [fk_clasificacion_subpartida] FOREIGN KEY ([sub_partida_id]) REFERENCES dbo.[SubPartida] ([idSubPartida]);
GO
-- OMITIDA a propósito (dbo.Proyecto en PRO tiene otra forma y 0 filas; compras no la lee):
-- ALTER TABLE dbo.[Obra] ADD CONSTRAINT [fk_Obra_Proyecto] FOREIGN KEY ([idProyecto]) REFERENCES dbo.[Proyecto] ([idProyecto]);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_PlantillaSolicitud_clasificacion')
  ALTER TABLE dbo.[PlantillaSolicitud] ADD CONSTRAINT [fk_PlantillaSolicitud_clasificacion] FOREIGN KEY ([idClasificacion]) REFERENCES dbo.[clasificacion] ([id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_PlantillaSolicitud_subPartida')
  ALTER TABLE dbo.[PlantillaSolicitud] ADD CONSTRAINT [fk_PlantillaSolicitud_subPartida] FOREIGN KEY ([idSubPartida]) REFERENCES dbo.[SubPartida] ([idSubPartida]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_Movimiento_idEstadoAnterior')
  ALTER TABLE dbo.[Movimiento] ADD CONSTRAINT [fk_Movimiento_idEstadoAnterior] FOREIGN KEY ([idEstadoAnterior]) REFERENCES dbo.[Estado] ([idEstado]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_Movimiento_idEstadoNuevo')
  ALTER TABLE dbo.[Movimiento] ADD CONSTRAINT [fk_Movimiento_idEstadoNuevo] FOREIGN KEY ([idEstadoNuevo]) REFERENCES dbo.[Estado] ([idEstado]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_PedidoCompra_clasificacion')
  ALTER TABLE dbo.[PedidoCompra] ADD CONSTRAINT [fk_PedidoCompra_clasificacion] FOREIGN KEY ([idClasificacion]) REFERENCES dbo.[clasificacion] ([id]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_PedidoCompra_idEstado')
  ALTER TABLE dbo.[PedidoCompra] ADD CONSTRAINT [fk_PedidoCompra_idEstado] FOREIGN KEY ([idEstado]) REFERENCES dbo.[Estado] ([idEstado]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_PedidoCompra_subPartida')
  ALTER TABLE dbo.[PedidoCompra] ADD CONSTRAINT [fk_PedidoCompra_subPartida] FOREIGN KEY ([idSubPartida]) REFERENCES dbo.[SubPartida] ([idSubPartida]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_PedidoCompraDet_idPedidoCompra')
  ALTER TABLE dbo.[PedidoCompraDet] ADD CONSTRAINT [fk_PedidoCompraDet_idPedidoCompra] FOREIGN KEY ([idPedidoCompra]) REFERENCES dbo.[PedidoCompra] ([idPedidoCompra]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_PedidoCompraDet_idEstado')
  ALTER TABLE dbo.[PedidoCompraDet] ADD CONSTRAINT [fk_PedidoCompraDet_idEstado] FOREIGN KEY ([idEstado]) REFERENCES dbo.[Estado] ([idEstado]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_OrdenCompra_idEstado')
  ALTER TABLE dbo.[OrdenCompra] ADD CONSTRAINT [fk_OrdenCompra_idEstado] FOREIGN KEY ([idEstado]) REFERENCES dbo.[Estado] ([idEstado]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_OrdenCompraDet_idOrdenCompra')
  ALTER TABLE dbo.[OrdenCompraDet] ADD CONSTRAINT [fk_OrdenCompraDet_idOrdenCompra] FOREIGN KEY ([idOrdenCompra]) REFERENCES dbo.[OrdenCompra] ([idOrdenCompra]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_OrdenCompraDet_idPedidoCompraDet')
  ALTER TABLE dbo.[OrdenCompraDet] ADD CONSTRAINT [fk_OrdenCompraDet_idPedidoCompraDet] FOREIGN KEY ([idPedidoCompraDet]) REFERENCES dbo.[PedidoCompraDet] ([idPedidoCompraDet]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_OrdenCompraDet_idEstado')
  ALTER TABLE dbo.[OrdenCompraDet] ADD CONSTRAINT [fk_OrdenCompraDet_idEstado] FOREIGN KEY ([idEstado]) REFERENCES dbo.[Estado] ([idEstado]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_RecepcionCompra_idOrdenCompra')
  ALTER TABLE dbo.[RecepcionCompra] ADD CONSTRAINT [fk_RecepcionCompra_idOrdenCompra] FOREIGN KEY ([idOrdenCompra]) REFERENCES dbo.[OrdenCompra] ([idOrdenCompra]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_RecepcionCompra_idEstado')
  ALTER TABLE dbo.[RecepcionCompra] ADD CONSTRAINT [fk_RecepcionCompra_idEstado] FOREIGN KEY ([idEstado]) REFERENCES dbo.[Estado] ([idEstado]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_RecepcionCompraDet_idRecepcionCompra')
  ALTER TABLE dbo.[RecepcionCompraDet] ADD CONSTRAINT [fk_RecepcionCompraDet_idRecepcionCompra] FOREIGN KEY ([idRecepcionCompra]) REFERENCES dbo.[RecepcionCompra] ([idRecepcionCompra]);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='fk_RecepcionCompraDet_idOrdenCompraDet')
  ALTER TABLE dbo.[RecepcionCompraDet] ADD CONSTRAINT [fk_RecepcionCompraDet_idOrdenCompraDet] FOREIGN KEY ([idOrdenCompraDet]) REFERENCES dbo.[OrdenCompraDet] ([idOrdenCompraDet]);
GO

/* ============================ 4) VISTA ============================ */
/* ---- Matriz por obra × CLASIFICACIÓN, estado derivado del pedido ------------
   dbo.Estado.estado guarda "Borrador"/"Aprobado"/"En orden"/"Cerrado". --------- */
CREATE OR ALTER VIEW dbo.vw_MatrizObraClasificacion AS
WITH p AS (
    SELECT o.idObra, pc.idClasificacion,
        CASE e.estado WHEN 'Cerrado' THEN 4 WHEN 'En orden' THEN 3 WHEN 'Aprobado' THEN 2 WHEN 'Borrador' THEN 1 ELSE 0 END AS rk
    FROM dbo.PedidoCompra pc
    JOIN dbo.Estado e ON e.idEstado = pc.idEstado
    JOIN dbo.Obra o   ON o.numeroObra = pc.obra
    WHERE pc.esEliminada = 0 AND pc.idClasificacion IS NOT NULL
)
SELECT idObra, idClasificacion,
    CASE MAX(rk) WHEN 4 THEN 'ENTREGADO' WHEN 3 THEN 'COMPRADO' WHEN 2 THEN 'PEDIDO' WHEN 1 THEN 'BORRADOR' ELSE NULL END AS estado
FROM p
GROUP BY idObra, idClasificacion;
GO
