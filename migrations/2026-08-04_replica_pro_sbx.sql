-- Réplica de esquema AdelanteDB -> AdelanteSBX bajo schemas pro_* (2026-08-04)
-- Solo ESTRUCTURA (tablas/vistas/funciones/procs). Datos se cargan aparte (bulk).
-- Generado desde el catálogo sys de AdelanteDB. Ejecutar con GO batch separator (sqlcmd).

IF SCHEMA_ID('pro_obc') IS NULL EXEC('CREATE SCHEMA pro_obc');
GO
IF SCHEMA_ID('pro_hor') IS NULL EXEC('CREATE SCHEMA pro_hor');
GO
IF SCHEMA_ID('pro_lab') IS NULL EXEC('CREATE SCHEMA pro_lab');
GO
IF SCHEMA_ID('pro_uti') IS NULL EXEC('CREATE SCHEMA pro_uti');
GO
IF SCHEMA_ID('pro_app') IS NULL EXEC('CREATE SCHEMA pro_app');
GO
IF SCHEMA_ID('pro_bi') IS NULL EXEC('CREATE SCHEMA pro_bi');
GO
IF SCHEMA_ID('pro_ventas') IS NULL EXEC('CREATE SCHEMA pro_ventas');
GO

-- ===== TABLES =====
CREATE TABLE [pro_app].[audit_log] (
  [IDAudit] bigint IDENTITY(1,1) NOT NULL,
  [Tabla] varchar(60) NOT NULL,
  [IDRegistro] bigint NOT NULL,
  [Accion] varchar(20) NOT NULL,
  [UsuarioEmail] nvarchar(200) NOT NULL,
  [Timestamp] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [ValorAnteriorJSON] nvarchar(max) NULL,
  [ValorNuevoJSON] nvarchar(max) NULL,
  [Contexto] nvarchar(500) NULL,
  PRIMARY KEY ([IDAudit])
);
GO
CREATE TABLE [pro_app].[avance_obra_snapshot] (
  [IDSnapshot] bigint IDENTITY(1,1) NOT NULL,
  [IDCaso] int NOT NULL,
  [IDLote] int NULL,
  [PorcentajeAvance] decimal(5,2) NOT NULL,
  [FechaCorte] date NOT NULL,
  [Fuente] varchar(30) NOT NULL DEFAULT ('OBRAS_CONTROL'),
  [DetalleHitosJSON] nvarchar(max) NULL,
  [FechaSincronizacion] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [EsUltimo] bit NOT NULL DEFAULT ((1)),
  PRIMARY KEY ([IDSnapshot])
);
GO
CREATE TABLE [pro_app].[banco_esquema_desembolso] (
  [IDEsquema] int IDENTITY(1,1) NOT NULL,
  [IDBan] int NOT NULL,
  [IDHito] int NOT NULL,
  [OrdenEnEsquema] int NOT NULL,
  [PorcentajeDesembolso] decimal(5,2) NOT NULL,
  [DiasSolicitudVisita] int NOT NULL DEFAULT ((2)),
  [DiasDesembolsoPostVisita] int NOT NULL DEFAULT ((3)),
  [DiaSemanaPeritoFijo] tinyint NULL,
  [Notas] nvarchar(500) NULL,
  [VigenteDesde] date NOT NULL,
  [VigenteHasta] date NULL,
  [FechaCreacion] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [EsMontoFijo] bit NOT NULL DEFAULT ((0)),
  PRIMARY KEY ([IDEsquema])
);
GO
CREATE TABLE [pro_app].[banco_valoracion_lote] (
  [IDValoracion] int IDENTITY(1,1) NOT NULL,
  [IDBan] int NOT NULL,
  [ValorM2Lote] decimal(10,2) NOT NULL,
  [Moneda] char(3) NOT NULL DEFAULT ('USD'),
  [PorcentajeFinanciamiento] decimal(5,2) NOT NULL,
  [Notas] nvarchar(500) NULL,
  [VigenteDesde] date NOT NULL,
  [VigenteHasta] date NULL,
  [FechaCreacion] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [IDProyecto] int NOT NULL,
  PRIMARY KEY ([IDValoracion])
);
GO
CREATE TABLE [pro_app].[caso_extra] (
  [IDExtra] int IDENTITY(1,1) NOT NULL,
  [IDCaso] int NOT NULL,
  [Tipo] varchar(20) NOT NULL,
  [Descripcion] nvarchar(500) NOT NULL,
  [MontoAjuste_CRC] money NOT NULL,
  [Estado] varchar(20) NOT NULL DEFAULT ('COTIZADA'),
  [FechaCotizacion] date NOT NULL,
  [FechaAprobacion] date NULL,
  [ArchivoCotizacion] varchar(500) NULL,
  [ArchivoAprobacion] varchar(500) NULL,
  [Notas] nvarchar(1000) NULL,
  [CreadoPor] nvarchar(200) NOT NULL,
  [AprobadoPor] nvarchar(200) NULL,
  [FechaCreacion] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [ModificadoPor] nvarchar(200) NULL,
  [FechaModificacion] datetime2(7) NULL,
  PRIMARY KEY ([IDExtra])
);
GO
CREATE TABLE [pro_app].[caso_hito_proyeccion] (
  [IDCasoHito] int IDENTITY(1,1) NOT NULL,
  [IDCaso] int NOT NULL,
  [IDHito] int NOT NULL,
  [IDEsquema] int NOT NULL,
  [OrdenEnCaso] int NOT NULL,
  [FechaPlaneadaHito] date NULL,
  [FechaPlaneadaVisitaPerito] date NULL,
  [FechaProyectadaDesembolso] date NULL,
  [FechaRealHito] date NULL,
  [FechaRealVisitaPerito] date NULL,
  [FechaRealDesembolso] date NULL,
  [MontoProyectado] money NULL,
  [MontoReal] money NULL,
  [Moneda] char(3) NOT NULL DEFAULT ('CRC'),
  [EstadoTramite] varchar(30) NOT NULL DEFAULT ('PLANEADO'),
  [IDMovimiento] int NULL,
  [Notas] nvarchar(1000) NULL,
  [FechaCreacion] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [IDCreadopor] int NULL,
  [FechaModificacion] datetime2(7) NULL,
  [IDModificadopor] int NULL,
  PRIMARY KEY ([IDCasoHito])
);
GO
CREATE TABLE [pro_app].[caso_lote_banco] (
  [IDCasoLoteBanco] int IDENTITY(1,1) NOT NULL,
  [IDCaso] int NOT NULL,
  [MontoPagaBancoPorLote_CRC] money NOT NULL,
  [ValorM2BancoUSD] decimal(10,2) NULL,
  [PorcentajeFinanciamiento] decimal(5,2) NULL,
  [TipoCambioAplicado] decimal(10,4) NULL,
  [Notas] nvarchar(500) NULL,
  [FechaRegistro] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [IDCreadopor] int NULL,
  [FechaModificacion] datetime2(7) NULL,
  [IDModificadopor] int NULL,
  [MontoFinanciaBanco_CRC] money NULL,
  [MontoLoteFinanciado_CRC] money NULL,
  [PagoCliente_CRC] money NULL,
  [FechaPagoCliente] date NULL,
  [PrecioVentaActual_CRC] money NULL,
  [LoteHistoricoCobrado_CRC] money NULL,
  PRIMARY KEY ([IDCasoLoteBanco])
);
GO
CREATE TABLE [pro_app].[catalogo_entidad_distribucion] (
  [IDEntidad] int IDENTITY(1,1) NOT NULL,
  [Codigo] varchar(20) NOT NULL,
  [Nombre] nvarchar(100) NOT NULL,
  [Descripcion] nvarchar(500) NULL,
  [Activo] bit NOT NULL DEFAULT ((1)),
  [FechaCreacion] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([IDEntidad])
);
GO
CREATE TABLE [pro_app].[catalogo_hito] (
  [IDHito] int IDENTITY(1,1) NOT NULL,
  [Codigo] varchar(20) NOT NULL,
  [Nombre] nvarchar(60) NOT NULL,
  [OrdenEstandar] int NOT NULL,
  [Descripcion] nvarchar(300) NULL,
  [ColorHEX] varchar(7) NULL,
  [Activo] bit NOT NULL DEFAULT ((1)),
  [FechaCreacion] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([IDHito])
);
GO
CREATE TABLE [pro_app].[credito_puente] (
  [IDCreditoPuente] int IDENTITY(1,1) NOT NULL,
  [IDBan] int NOT NULL,
  [Codigo] nvarchar(30) NULL,
  [MontoTotal_CRC] money NOT NULL,
  [GastosFormalizacion_CRC] money NULL,
  [TasaAnual] decimal(5,2) NULL,
  [FechaAprobacion] date NULL,
  [FechaVencimiento] date NULL,
  [Estado] varchar(20) NOT NULL DEFAULT ('ACTIVO'),
  [Notas] nvarchar(max) NULL,
  [CreadoPor] nvarchar(200) NOT NULL,
  [FechaCreacion] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [ModificadoPor] nvarchar(200) NULL,
  [FechaModificacion] datetime2(7) NULL,
  PRIMARY KEY ([IDCreditoPuente])
);
GO
CREATE TABLE [pro_app].[credito_puente_esquema_hito] (
  [IDCpEsquemaHito] int IDENTITY(1,1) NOT NULL,
  [IDCreditoPuente] int NOT NULL,
  [IDHito] int NOT NULL,
  [OrdenEnEsquema] int NOT NULL,
  [Porcentaje] decimal(5,2) NOT NULL,
  [DiasSolicitudVisita] int NOT NULL DEFAULT ((0)),
  [DiasDesembolsoPostVisita] int NOT NULL DEFAULT ((0)),
  [DiaSemanaPeritoFijo] tinyint NULL,
  [Notas] nvarchar(500) NULL,
  [CreadoPor] nvarchar(200) NOT NULL,
  [FechaCreacion] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [ModificadoPor] nvarchar(200) NULL,
  [FechaModificacion] datetime2(7) NULL,
  PRIMARY KEY ([IDCpEsquemaHito])
);
GO
CREATE TABLE [pro_app].[credito_puente_link] (
  [IDLinkCP] int IDENTITY(1,1) NOT NULL,
  [IDMovCP] int NOT NULL,
  [IDCreditoPuenteLoteHito] int NOT NULL,
  [MontoAplicado_CRC] money NOT NULL,
  [Notas] nvarchar(500) NULL,
  [UsuarioVinculo] nvarchar(200) NOT NULL,
  [FechaVinculacion] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([IDLinkCP])
);
GO
CREATE TABLE [pro_app].[credito_puente_lote] (
  [IDCreditoPuenteLote] int IDENTITY(1,1) NOT NULL,
  [IDCreditoPuente] int NOT NULL,
  [IDLote] int NOT NULL,
  [MontoResponsabilidadTeorica_CRC] money NOT NULL,
  [GastosFormalizacionLote_CRC] money NULL,
  [GastosFormalizacionOverride] bit NOT NULL DEFAULT ((0)),
  [Estado] varchar(30) NOT NULL DEFAULT ('PENDIENTE'),
  [FechaCancelacionAlBanco] date NULL,
  [MontoCanceladoAlBanco_CRC] money NULL,
  [Notas] nvarchar(500) NULL,
  [CreadoPor] nvarchar(200) NOT NULL,
  [FechaCreacion] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [ModificadoPor] nvarchar(200) NULL,
  [FechaModificacion] datetime2(7) NULL,
  [FechaConfirmacionCancelacion] date NULL,
  [MontoConfirmadoAlBanco_CRC] money NULL,
  [ComprobanteCancelacion] nvarchar(200) NULL,
  PRIMARY KEY ([IDCreditoPuenteLote])
);
GO
CREATE TABLE [pro_app].[credito_puente_lote_hito] (
  [IDCreditoPuenteLoteHito] int IDENTITY(1,1) NOT NULL,
  [IDCreditoPuenteLote] int NOT NULL,
  [IDHito] int NOT NULL,
  [FechaPlaneadaHito] date NULL,
  [FechaPlaneadaVisitaPerito] date NULL,
  [FechaProyectadaDesembolso] date NULL,
  [FechaRealHito] date NULL,
  [FechaRealVisitaPerito] date NULL,
  [FechaRealDesembolso] date NULL,
  [EstadoTramite] varchar(30) NOT NULL DEFAULT ('PLANEADO'),
  [Notas] nvarchar(500) NULL,
  [CreadoPor] nvarchar(200) NOT NULL,
  [FechaCreacion] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [ModificadoPor] nvarchar(200) NULL,
  [FechaModificacion] datetime2(7) NULL,
  PRIMARY KEY ([IDCreditoPuenteLoteHito])
);
GO
CREATE TABLE [pro_app].[credito_puente_movimiento] (
  [IDMovCP] int IDENTITY(1,1) NOT NULL,
  [IDCreditoPuente] int NOT NULL,
  [FechaMovimiento] date NOT NULL,
  [MontoColones] money NOT NULL,
  [Concepto] nvarchar(200) NULL,
  [NumeroComprobante] nvarchar(50) NULL,
  [Estado] varchar(20) NOT NULL DEFAULT ('REGISTRADO'),
  [Notas] nvarchar(500) NULL,
  [CreadoPor] nvarchar(200) NOT NULL,
  [FechaCreacion] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [ModificadoPor] nvarchar(200) NULL,
  [FechaModificacion] datetime2(7) NULL,
  PRIMARY KEY ([IDMovCP])
);
GO
CREATE TABLE [pro_app].[distribucion_config] (
  [IDConfig] int IDENTITY(1,1) NOT NULL,
  [PrecioInternoM2] decimal(10,2) NOT NULL,
  [Moneda] char(3) NOT NULL DEFAULT ('USD'),
  [Notas] nvarchar(500) NULL,
  [VigenteDesde] date NOT NULL,
  [VigenteHasta] date NULL,
  [FechaCreacion] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [IDProyecto] int NOT NULL,
  [ExclusividadEntidadCodigo] varchar(20) NULL,
  [ExclusividadUSDm2] decimal(10,2) NULL,
  PRIMARY KEY ([IDConfig])
);
GO
CREATE TABLE [pro_app].[distribucion_config_entidad] (
  [IDConfig] int NOT NULL,
  [IDEntidad] int NOT NULL,
  [Porcentaje] decimal(5,2) NOT NULL,
  [Notas] nvarchar(500) NULL,
  PRIMARY KEY ([IDConfig],[IDEntidad])
);
GO
CREATE TABLE [pro_app].[liquidacion_lote_override] (
  [IDMovimiento] int NOT NULL,
  [LoteInternoOverride_CRC] money NULL,
  [ExclusividadOverride_CRC] money NULL,
  [CreadoPor] nvarchar(200) NOT NULL,
  [FechaCreacion] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [ModificadoPor] nvarchar(200) NULL,
  [FechaModificacion] datetime2(7) NULL,
  PRIMARY KEY ([IDMovimiento])
);
GO
CREATE TABLE [pro_app].[movimiento_hito_link] (
  [IDLink] int IDENTITY(1,1) NOT NULL,
  [IDMovimiento] int NOT NULL,
  [IDCasoHito] int NOT NULL,
  [MontoAplicado_CRC] money NOT NULL,
  [Notas] nvarchar(500) NULL,
  [FechaVinculacion] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [UsuarioVinculo] nvarchar(200) NOT NULL,
  PRIMARY KEY ([IDLink])
);
GO
CREATE TABLE [pro_app].[pago_cliente] (
  [IDPago] int IDENTITY(1,1) NOT NULL,
  [IDCaso] int NOT NULL,
  [Concepto] varchar(20) NOT NULL,
  [IDExtra] int NULL,
  [MontoPlaneado_CRC] money NOT NULL,
  [FechaPlaneada] date NOT NULL,
  [FechaReal] date NULL,
  [IDMovimientoVinculado] int NULL,
  [Notas] nvarchar(500) NULL,
  [CreadoPor] nvarchar(200) NOT NULL,
  [FechaCreacion] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [ModificadoPor] nvarchar(200) NULL,
  [FechaModificacion] datetime2(7) NULL,
  PRIMARY KEY ([IDPago])
);
GO
CREATE TABLE [pro_app].[pago_cliente_mov_link] (
  [IDLink] int IDENTITY(1,1) NOT NULL,
  [IDPago] int NOT NULL,
  [IDMovimiento] int NOT NULL,
  [MontoAplicado_CRC] money NOT NULL,
  [Notas] nvarchar(500) NULL,
  [FechaVinculacion] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [UsuarioVinculo] nvarchar(200) NOT NULL,
  PRIMARY KEY ([IDLink])
);
GO
CREATE TABLE [pro_app].[proyeccion_formalizacion] (
  [IDProyeccion] int IDENTITY(1,1) NOT NULL,
  [IDCaso] int NOT NULL,
  [FechaProyectada] date NOT NULL,
  [NivelConfianza] char(1) NOT NULL,
  [Notas] nvarchar(1000) NULL,
  [Activa] bit NOT NULL DEFAULT ((1)),
  [FechaCreacion] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [IDCreadopor] int NULL,
  [FechaModificacion] datetime2(7) NULL,
  [IDModificadopor] int NULL,
  PRIMARY KEY ([IDProyeccion])
);
GO
CREATE TABLE [pro_bi].[dim_obra] (
  [sk_obra] bigint IDENTITY(1,1) NOT NULL,
  [works_no] nvarchar(20) NOT NULL,
  [display_name] nvarchar(250) NULL,
  [description] nvarchar(250) NULL,
  [centro_costo] nvarchar(20) NULL,
  [area_costeo] nvarchar(20) NULL,
  [proyecto_padre] nvarchar(10) NULL,
  [area_prorrateada_m2] decimal(20,5) NULL,
  [project_manager] nvarchar(100) NULL,
  [id_encargado] nvarchar(100) NULL,
  [ubicacion] nvarchar(100) NULL,
  [status] nvarchar(50) NULL,
  [starting_date] date NULL,
  [ending_date] date NULL,
  [creation_date] date NULL,
  [precio_normal_maquinaria] decimal(20,5) NULL,
  [precio_concreto_maquinaria] decimal(20,5) NULL,
  [origen_principal] nvarchar(20) NULL,
  [etl_updated_at] datetime2(7) NOT NULL DEFAULT (getutcdate()),
  PRIMARY KEY ([sk_obra])
);
GO
CREATE TABLE [pro_bi].[fact_presupuesto] (
  [sk_presupuesto] bigint IDENTITY(1,1) NOT NULL,
  [etl_loaded_at] datetime2(7) NOT NULL DEFAULT (getutcdate()),
  [sk_obra] bigint NULL,
  [sk_tarea] bigint NULL,
  [works_no] nvarchar(20) NOT NULL,
  [task_no] nvarchar(20) NOT NULL,
  [version_code] nvarchar(50) NULL,
  [task_key_modelo] nvarchar(100) NULL,
  [key_obra_tarea_modelo] nvarchar(100) NULL,
  [task_type] nvarchar(50) NULL,
  [tipo_costo] nvarchar(50) NULL,
  [description] nvarchar(250) NULL,
  [re_study] bit NULL,
  [id_visibles] nvarchar(100) NULL,
  [quantity] decimal(20,5) NULL,
  [unit_of_measure] nvarchar(20) NULL,
  [unit_amount] decimal(20,5) NULL,
  [line_amount] decimal(20,5) NULL,
  [es_ultima_version] bit NULL DEFAULT ((1)),
  PRIMARY KEY ([sk_presupuesto])
);
GO
CREATE TABLE [pro_bi].[stg_job_budgets] (
  [sk_budget] bigint IDENTITY(1,1) NOT NULL,
  [etl_loaded_at] datetime2(7) NOT NULL DEFAULT (getutcdate()),
  [works_no] nvarchar(20) NOT NULL,
  [version_code] nvarchar(50) NOT NULL,
  [version_num] int NULL,
  [max_version] int NULL,
  [es_ultima_version] bit NULL,
  [task_no] nvarchar(20) NOT NULL,
  [task_type] nvarchar(50) NULL,
  [tipo_costo] nvarchar(50) NULL,
  [description] nvarchar(250) NULL,
  [code_order] nvarchar(50) NULL,
  [re_study] bit NULL,
  [quantity] decimal(20,5) NULL,
  [unit_of_measure] nvarchar(20) NULL,
  [unit_amount] decimal(20,5) NULL,
  [line_amount] decimal(20,5) NULL,
  [id_visibles] nvarchar(100) NULL,
  PRIMARY KEY ([sk_budget])
);
GO
CREATE TABLE [pro_ventas].[ActividadObra] (
  [IDActividad] int IDENTITY(1,1) NOT NULL,
  [Actividad] nvarchar(50) NULL,
  [Etapa] nvarchar(50) NULL,
  [Orden] int NULL,
  [Dependencia] int NULL,
  [Descripcion] nvarchar(250) NULL,
  [Responsable] int NULL,
  [Categoria] nvarchar(50) NULL,
  [TgDesBN] bit NULL,
  [PDes] decimal(3,2) NULL,
  [TgDesBCR] bit NULL,
  [TgDesMucap] bit NULL,
  [Tg1N] bit NULL,
  [Tg2N] bit NULL,
  [IDAConstru] int NULL,
  [ActGrupo] nvarchar(100) NULL,
  [IDEtapaConstru] int NULL,
  [TgModelo] bit NULL,
  [TgAmenidad] bit NULL,
  [TgInfraestructura] bit NULL,
  [IDTipoObra] int NULL,
  [TgDesarrollos] bit NULL,
  [TgHomes] bit NULL,
  PRIMARY KEY ([IDActividad])
);
GO
CREATE TABLE [pro_ventas].[Bancos] (
  [IDBan] int IDENTITY(1,1) NOT NULL,
  [Abreviatura] nvarchar(10) NULL,
  [NombreEntidad] nvarchar(50) NULL,
  [Imagen] nvarchar(max) NULL,
  [OrdenGal] int NULL,
  [ColorHEXBan] nvarchar(100) NULL,
  [Activo] bit NOT NULL DEFAULT ((1)),
  PRIMARY KEY ([IDBan])
);
GO
CREATE TABLE [pro_ventas].[BitacoraVentas] (
  [IDBitacoraV] int IDENTITY(1,1) NOT NULL,
  [IDCaso] int NULL,
  [IDLead] int NULL,
  [IDRequisito] int NULL,
  [IDCreador] int NULL,
  [FechaCreacion] datetime NULL,
  [Comentario] nvarchar(max) NULL,
  [AzureBlobURL] varchar(max) NULL,
  [AzureBlobID] varchar(max) NULL,
  [Titulo] nvarchar(50) NULL,
  [Categoria] nvarchar(50) NULL,
  [TipoComentario] nvarchar(50) NULL,
  [FechaModificacion] datetime NULL,
  [IDCreadopor] int NULL,
  [Aprobado] bit NULL,
  [IDFaseAD] int NULL,
  [IDEtapaAD] int NULL,
  [IDChecklistAD] int NULL,
  [TgCompletado] bit NULL,
  [FechaCompletado] datetime NULL,
  [TgLead] bit NULL,
  [TgVentas] bit NULL,
  [TgFormalizacion] bit NULL,
  [TgProduccion] bit NULL,
  [FechaEvento] datetime NULL,
  [FechaLimite] datetime NULL,
  [TgVisita] bit NULL,
  [TipoEvento] nvarchar(50) NULL,
  [IDProyecto] int NULL,
  [IDReunion] varchar(max) NULL,
  PRIMARY KEY ([IDBitacoraV])
);
GO
CREATE TABLE [pro_ventas].[Bloques] (
  [IDBloq] int IDENTITY(1,1) NOT NULL,
  [Bloque] nvarchar(10) NULL,
  [CuotaCondominal] smallmoney NULL,
  [Orden] int NULL,
  [Proyecto] nchar(10) NULL,
  [IDProyecto] int NULL,
  PRIMARY KEY ([IDBloq])
);
GO
CREATE TABLE [pro_ventas].[Casos] (
  [IDCaso] int IDENTITY(1,1) NOT NULL,
  [DetCaso] varchar(50) NULL,
  [IDEstado] int NULL,
  [IDLote] int NULL,
  [IDBloque] int NULL,
  [IDModelo] int NULL,
  [TgExtra] bit NULL,
  [IDCliente] int NULL,
  [IDCodeudor] int NULL,
  [IDVendedor] int NULL,
  [IDFormalizador] int NULL,
  [IDBanco] int NULL,
  [TgBono] bit NULL,
  [PrecioVenta] money NULL,
  [Moneda] varchar(3) NULL,
  [MontoAvaluo] money NULL,
  [PrecioLista] money NULL,
  [PrecioFinanciar] money NULL,
  [PrecioCasa] money NULL,
  [PrecioLote] money NULL,
  [FechaReserva] datetime NULL,
  [FechaFormalizacion] date NULL,
  [FechaEntrega] date NULL,
  [FechaRetiro] date NULL,
  [FechaCongelado] date NULL,
  [TgRetirado] bit NULL,
  [Observaciones] varchar(max) NULL,
  [TgCodeudor] bit NULL,
  [UsuarioCarga] varchar(50) NULL,
  [FechaCreacion] datetime NULL,
  [AzureBlobId] varchar(120) NULL,
  [FechaModificado] datetime NULL,
  [UsuarioModificado] varchar(50) NULL,
  [Prima] money NULL,
  [MontoExtra] money NULL,
  [MontoDescuento] money NULL,
  [TgDescuento] bit NULL,
  [DetExtra] varchar(max) NULL,
  [AreaExtraCasa] decimal(5,2) NULL,
  [Aprobado] bit NULL,
  [Regalia] varchar(max) NULL,
  [MontoPrima] money NULL,
  [MontoBono] money NULL,
  [FechaPF] date NULL,
  [SemanaPF] varchar(20) NULL,
  [FechaInicio] date NULL,
  [EnConstruccion] bit NULL,
  [MotivoRetiro] nvarchar(max) NULL,
  [FechaConstruccion] date NULL,
  [Obsformalizacion] varchar(max) NULL,
  [TgReferido] bit NULL,
  [IDReferido] int NULL,
  [TGPagadoExtra] bit NULL,
  [TipoCambio] money NULL,
  [TgComisionC] bit NULL,
  [EstadoForma] varchar(50) NULL,
  [FechaContrato] AS (dateadd(month,(6),[FechaFormalizacion])) PERSISTED,
  [DiasContrato] AS (datediff(day,dateadd(month,(6),[FechaFormalizacion]),getdate())),
  [IDExtraCaso] int NULL,
  [IDActividadActual] int NULL,
  [IDControlObraActial] int NULL,
  [SEMPF] AS (ceiling((datepart(day,[fechaPF])+(2.5))/(7))),
  [DiasE] AS (datediff(day,[FechaEntrega],[FechaFormalizacion])),
  [MontoTributario] money NULL,
  [TipoCambioMontoTributario] money NULL,
  [PresupuestoDirecto] money NULL,
  [PresupuestoIndirecto] money NULL,
  [UtilidadProyectada] AS ([PrecioCasa]-([PresupuestoDirecto]+[PresupuestoIndirecto])),
  [PorcentajeUtilidadP] AS (case when [PrecioCasa]<>(0) then round((([PrecioCasa]-([PresupuestoDirecto]+[PresupuestoIndirecto]))*(100.0))/[PrecioCasa],(2))  end) PERSISTED,
  [MesPF] AS (datepart(month,[FechaPF])) PERSISTED,
  [AnioPF] AS (datepart(year,[FechaPF])) PERSISTED,
  [IDFaseFormalizacion] int NULL,
  [DetDescuento] varchar(max) NULL,
  [IDCreadopor] int NULL,
  [IDModificadopor] int NULL,
  [MontoPunta] money NULL,
  [TgPunta] bit NULL,
  [ComprobantePT] varchar(120) NULL,
  [ReciboPT] varchar(120) NULL,
  [MesF] AS (datepart(month,[FechaFormalizacion])) PERSISTED,
  [AnioF] AS (datepart(year,[FechaFormalizacion])) PERSISTED,
  [MesE] AS (datepart(month,[FechaEntrega])) PERSISTED,
  [AnioE] AS (datepart(year,[FechaEntrega])) PERSISTED,
  [MesRT] AS (case when [IDEstado]=(7) then datepart(month,[FechaRetiro])  end),
  [AnioRT] AS (case when [IDEstado]=(7) then datepart(year,[FechaRetiro])  end),
  [MesT] AS (case when [IDEstado]=(8) then datepart(month,[FechaRetiro])  end),
  [AnioT] AS (case when [IDEstado]=(8) then datepart(year,[FechaRetiro])  end),
  [IDComenForma] int NULL,
  [IDEstAprobacion] int NULL,
  [TgModeloEspecial] bit NULL,
  [FechaAprobado] datetime NULL,
  [ObsAprobado] varchar(max) NULL,
  [IDAprobadopor] int NULL,
  [IDLoteTraslado] int NULL,
  [SEMPFAnual] AS (datepart(week,[fechaPF])),
  [TipoExtra] varchar(120) NULL,
  [DiasR] AS (datediff(day,getdate(),[FechaReserva])),
  [DiasPF] AS (datediff(day,[FechaPF],[FechaReserva])) PERSISTED,
  [DiasF] AS (datediff(day,[FechaFormalizacion],[FechaReserva])) PERSISTED,
  [MesR] AS (datepart(month,[FechaReserva])) PERSISTED,
  [AnioR] AS (datepart(year,[FechaReserva])) PERSISTED,
  [DiasRT] AS (datediff(day,[FechaReserva],[FechaRetiro])) PERSISTED,
  [DiasCON] AS (datediff(day,[FechaReserva],[FechaCongelado])) PERSISTED,
  [IDLead] int NULL,
  [MontoExtraProd] money NULL,
  [TgExtraProd] bit NULL,
  [CostoBaseExtraLotem2] money NULL,
  [AreaCCerrada1Nivel] decimal(5,2) NULL,
  [AreaPilaTerraza] decimal(5,2) NULL,
  [AreaCochera] decimal(5,2) NULL,
  [AreaCPilaTerrazaCochera] decimal(5,2) NULL,
  [AreaHuella1Nivel] decimal(5,2) NULL,
  [AreaCCerrada2Nivel] decimal(5,2) NULL,
  [AreaCAzotea] decimal(5,2) NULL,
  [AreaCCerradaTotal] decimal(5,2) NULL,
  [MontoExtraLote] money NULL,
  [CostoSocioLote] money NULL,
  [AreaExtraLote] decimal(5,2) NULL,
  [TipoCambioCompra] money NULL,
  [TgMontoProyecto] bit NULL,
  [MontoProyecto] money NULL,
  [firmaCliente] nvarchar(max) NULL,
  [fechaFirmaCliente] datetime2(7) NULL,
  [firmaVendedor] nvarchar(max) NULL,
  [fechaFirmaVendedor] datetime2(7) NULL,
  [firmaFormalizador] nvarchar(max) NULL,
  [fechaFirmaFormalizador] datetime2(7) NULL,
  [firmaGerente] nvarchar(max) NULL,
  [fechaFirmaGerente] datetime2(7) NULL,
  [firmaCroquisCliente] nvarchar(max) NULL,
  [fechaCroquisFirmaCliente] datetime2(7) NULL,
  [firmaCroquisGerente] nvarchar(max) NULL,
  [fechaCroquisFirmaGerente] datetime2(7) NULL,
  [EsRevisionComite] bit NOT NULL DEFAULT ((0)),
  [firmaClienteSnapshot] nvarchar(max) NULL,
  [firmaCroquisClienteSnapshot] nvarchar(max) NULL,
  [IDCasoOrigen] int NULL,
  [PrecioSinDefinir] bit NULL,
  PRIMARY KEY ([IDCaso])
);
GO
CREATE TABLE [pro_ventas].[Clientes] (
  [IDCliente] int IDENTITY(1,1) NOT NULL,
  [NombreCompleto] nvarchar(255) NULL,
  [Nombre] nvarchar(50) NULL,
  [PrimerApellido] nvarchar(50) NULL,
  [SegundoApellido] nvarchar(50) NULL,
  [Cédula] nvarchar(50) NULL,
  [Teléfono] nvarchar(50) NULL,
  [Correo] nvarchar(100) NULL,
  [Ocupación] nvarchar(50) NULL,
  [Dirección] nvarchar(255) NULL,
  [Provincia] nvarchar(50) NULL,
  [Canton] nvarchar(50) NULL,
  [FechaNacimiento] date NULL,
  [EstadoCivil] nvarchar(50) NULL,
  [TipoCliente] nchar(10) NULL,
  [Sexo] nchar(10) NULL,
  [TipoIngresos] nchar(50) NULL,
  [Distrito] nchar(50) NULL,
  [LugarTrabajo] nchar(50) NULL,
  [TiempoLaborar] nchar(10) NULL,
  [PuntoContacto] nchar(50) NULL,
  [Activo] bit NULL,
  [Edad] int NULL,
  [Hijos] int NULL,
  [FechaIngreso] date NULL,
  [Salario] money NULL,
  [Deudas] money NULL,
  [IBAN] nvarchar(255) NULL,
  [TgRefererido] bit NULL,
  [NotaReferido] nvarchar(255) NULL,
  [IDLead] int NULL,
  PRIMARY KEY ([IDCliente])
);
GO
CREATE TABLE [pro_ventas].[Colaboradores] (
  [IDCol] int IDENTITY(1,1) NOT NULL,
  [Nombre] nvarchar(50) NULL,
  [PrimerApellido] nvarchar(50) NULL,
  [SegundoApellido] nvarchar(50) NULL,
  [NombreCompleto] nvarchar(100) NULL,
  [Activo] bit NULL,
  [Correo] nvarchar(50) NULL,
  [Telefono] nvarchar(20) NULL,
  [Contrasena] varchar(100) NULL,
  [PINapp] char(4) NULL,
  [PINapp2] char(4) NULL,
  [Departamento] nvarchar(50) NULL,
  [Puesto] nvarchar(50) NULL,
  [Aprobador] bit NULL,
  [TgEncargado] bit NULL,
  [IDActEncargado] int NULL,
  [FechaIngreso] date NULL,
  [FechaSalida] date NULL,
  [FechaNacimiento] date NULL,
  [Sexo] nchar(10) NULL,
  [IngResponsable] int NULL,
  [Direccion] nvarchar(250) NULL,
  [Provincia] nvarchar(100) NULL,
  [Canton] nvarchar(100) NULL,
  [Distrito] nvarchar(100) NULL,
  [Pais] nvarchar(100) NULL,
  [Cedula] nvarchar(50) NULL,
  [TallaCamisa] nchar(10) NULL,
  [TallaPantalon] nchar(10) NULL,
  [AzureBlobCurriURL] nvarchar(250) NULL,
  [AzureBlobCurriID] nvarchar(250) NULL,
  [AzureBlobFotoURL] nvarchar(250) NULL,
  [AzureBlobFotoID] nvarchar(250) NULL,
  [Cuadrilla] nvarchar(100) NULL,
  [IDProcore] nvarchar(50) NULL,
  [Salario] money NULL,
  [SalarioXHora] money NULL,
  [Bonificacion] money NULL,
  [TgBonificacion] bit NULL,
  [IDSal] int NULL,
  [TgGerencia] bit NULL,
  [TgHome] bit NULL,
  [TgDesarrollos] bit NULL,
  [Orden] int NULL,
  [ProfilePic] nvarchar(max) NULL,
  [TgEditor] bit NULL,
  [Iniciales] AS (concat(upper(left([Nombre],(1))),upper(left([PrimerApellido],(1))),upper(left([SegundoApellido],(1))))),
  [TgMO] bit NULL,
  [TgTransporte] bit NULL,
  [TgBodeguero] bit NULL,
  [FirmaCol] nvarchar(max) NULL,
  PRIMARY KEY ([IDCol])
);
GO
CREATE TABLE [pro_ventas].[Estados] (
  [IDEst] int IDENTITY(1,1) NOT NULL,
  [Abreviatura] nvarchar(10) NULL,
  [Estado] nvarchar(50) NULL,
  [ColorHEX] nvarchar(50) NULL,
  [Descripcion] nvarchar(max) NULL,
  [Orden] int NULL,
  [AzureBlobURL] nvarchar(255) NULL,
  [Tipo] nchar(10) NULL,
  [TgVenta] bit NULL,
  [TgAprobadorING] bit NULL,
  [TgBodega] bit NULL,
  [TgEncargado] bit NULL,
  [Icono] nvarchar(max) NULL,
  [Icono2] nvarchar(max) NULL,
  [Emoji] nvarchar(max) NULL,
  PRIMARY KEY ([IDEst])
);
GO
CREATE TABLE [pro_ventas].[FaseAD] (
  [IDFaseAD] int IDENTITY(1,1) NOT NULL,
  [Abreviatura] nvarchar(10) NULL,
  [Fase] nvarchar(200) NULL,
  [IDEtapa] int NULL,
  [ColorHEX] nvarchar(50) NULL,
  [Orden] int NULL,
  [AzureBlobURL] nvarchar(255) NULL,
  [Tipo] nchar(50) NULL,
  [TgLead] bit NULL,
  [TgVenta] bit NULL,
  [TgFormalizacion] bit NULL,
  [TgProduccion] bit NULL,
  [TgPostVenta] bit NULL,
  [TgEncargado] bit NULL,
  [Icono] nvarchar(255) NULL,
  [PorPeso] decimal(6,3) NULL,
  PRIMARY KEY ([IDFaseAD])
);
GO
CREATE TABLE [pro_ventas].[Lotes] (
  [IDLote] int IDENTITY(1,1) NOT NULL,
  [Lote] nvarchar(10) NULL,
  [IDBloque] int NULL,
  [Area] decimal(5,2) NULL,
  [Folio] nvarchar(100) NULL,
  [PrecioLote] money NULL,
  [Proyecto] nvarchar(10) NULL,
  [Tramitado] bit NULL,
  [IDCasoVigente] int NULL,
  [IDModDefecto] int NULL,
  [Etapa] int NULL,
  [Frente] decimal(5,2) NULL,
  [Fondo] decimal(5,2) NULL,
  [TgParqueoV] bit NULL DEFAULT ((0)),
  [FrentePV] decimal(5,2) NULL,
  [FrenteLotePV] decimal(5,2) NULL,
  [NumCatastro] nvarchar(100) NULL,
  [LinkCatastro] nvarchar(max) NULL,
  [AzureBlobCatastroURL] nvarchar(max) NULL,
  [d_Path] nvarchar(max) NULL,
  [points] nvarchar(max) NULL,
  [IDBD] AS (concat([Proyecto],'-',[Lote])),
  [Area1NivelTramitado] decimal(5,2) NULL,
  [Area2NivelTramitado] decimal(5,2) NULL,
  [Tg1Nivel] bit NULL,
  [Tg2Nivel] bit NULL,
  [IDProyecto] int NULL,
  [PresupuestoDirecto] money NULL,
  [PresupuestoIndirecto] money NULL,
  [IDModConstruido] int NULL,
  [AzureCroquisConstruido] nvarchar(max) NULL,
  [AzureCroquisTramitado] nvarchar(max) NULL,
  [IDActividadC] int NULL,
  [TgModTramitado] AS (case when [IDModDefecto] IS NOT NULL then (1) else (0) end),
  [TgDisponible] AS (case when [IDCasoVigente] IS NOT NULL then (0) else (1) end),
  [TgModConstruido] AS (case when [IDModConstruido] IS NOT NULL then (1) else (0) end),
  [TgEnConstruccion] bit NULL,
  [TgCondominioCon] bit NULL,
  [TgConPermiso] bit NULL,
  [IDModificadopor] int NULL,
  [FechaModificado] datetime NULL,
  [IDCreadopor] int NULL,
  [FechaCreado] datetime NULL,
  [IDEstadoLote] int NULL,
  [FechaEstado] date NULL,
  [TgPermisoCon] AS (case when [IDEstadoLote]=(48) then CONVERT([bit],(1)) else CONVERT([bit],(0)) end),
  [Propietario] nvarchar(10) NULL,
  [TgPagare] bit NULL,
  [IDFaseLote] int NULL,
  [IDCreadorAPC] int NULL,
  [CodigoAPC] nvarchar(50) NULL,
  [PermisoConstruccion] nvarchar(50) NULL,
  [linkProcoreArq] varchar(500) NULL,
  [fechaProcoreSync] datetime2(0) NULL,
  [procoreRevisionId] bigint NULL,
  [CodigoCFIA] nvarchar(100) NULL,
  [IDTramiteVigente] int NULL,
  PRIMARY KEY ([IDLote])
);
GO
CREATE TABLE [pro_ventas].[Modelos] (
  [IDMod] int IDENTITY(1,1) NOT NULL,
  [Modelo] nvarchar(50) NULL,
  [Categoria] nvarchar(50) NULL,
  [TipoCubierta] nvarchar(10) NULL,
  [WC] nvarchar(10) NULL,
  [Niveles] nvarchar(20) NULL,
  [Dormitorios] int NULL,
  [Banio] decimal(5,1) NULL,
  [AreaTotal] decimal(5,2) NULL,
  [PrecioReal] money NULL,
  [PrecioOferta] money NULL,
  [Historico] nvarchar(max) NULL,
  [AzureBlobRedes] nvarchar(250) NULL,
  [AzureBlobCroquisBN] nvarchar(250) NULL,
  [AzureBlobName] nvarchar(250) NULL,
  [AzureBlobCroquisBCR] nvarchar(250) NULL,
  [AzureBlobCroquisMUCAP] nvarchar(250) NULL,
  [AvaluoBN] money NULL,
  [AvaluoBCR] money NULL,
  [AvaluoMUCAP] money NULL,
  [LoteMIN] decimal(5,2) NULL,
  [LoteFrente] decimal(5,2) NULL DEFAULT ((0)),
  [LoteFondo] decimal(5,2) NULL,
  [Activo] bit NULL,
  [ActivoVI] bit NULL,
  [ActivoVN] bit NULL,
  [ActivoVB] bit NULL,
  [AvaluoBP] money NULL,
  [AreaCCerrada1Nivel] decimal(5,2) NULL,
  [AreaPilaTerraza] decimal(5,2) NULL,
  [AreaCochera] decimal(5,2) NULL,
  [AreaCPilaTerrazaCochera] decimal(5,2) NULL,
  [AreaHuella1Nivel] decimal(5,2) NULL,
  [AreaCCerrada2Nivel] decimal(5,2) NULL,
  [AreaCAzotea] decimal(5,2) NULL,
  [AreaCCerradaTotal] decimal(5,2) NULL,
  [AreaAzotea] decimal(5,2) NULL,
  [AreaCCerrada3Nivel] decimal(5,2) NULL,
  [AreaHuellaAzotea] decimal(5,2) NULL,
  [Costom2Casa] money NULL,
  [Costom2PilaTerraza] money NULL,
  [Costom2Cochera] money NULL,
  [Costom2Azotea] money NULL,
  [Costom2Tercerpiso] money NULL,
  [PorMO] decimal(5,4) NULL,
  [PorIncrementoMO] decimal(5,4) NULL,
  [PorIncrementoMAT] decimal(5,4) NULL,
  [CDOLastre] money NULL,
  [CDOMaquinariaFormaleta] money NULL,
  [PorAdminCampoBodega] decimal(5,4) NULL,
  [PorOtrosImp] decimal(5,4) NULL,
  [PorPermisoConsultoria] decimal(5,4) NULL,
  [PorImprevisto] decimal(5,4) NULL,
  [PorReparacion] decimal(5,4) NULL,
  [PorComisionSocioLote] decimal(5,4) NULL,
  [PorComisionVentas] decimal(5,4) NULL,
  [PorFormalizacion] decimal(5,4) NULL,
  [PorMercadeo] decimal(5,4) NULL,
  [PorPublicidad] decimal(5,4) NULL,
  [RegaliaGerencia] money NULL,
  [TotalPresupuestadoAjusteUtilidad] money NULL,
  [PrecioCalculado] money NULL,
  [PrecioAnterior] money NULL,
  [FechaPrecioAnterior] date NULL,
  [FechaCreacion] datetime NULL,
  [FechaModificacion] datetime NULL,
  [Etapa] int NULL,
  [TipoMaterial] nvarchar(50) NULL,
  [TgDesarrollos] bit NULL,
  [TgHomes] bit NULL,
  [ActivoHomes] bit NULL,
  [FrenteModelo] decimal(5,2) NULL,
  [FondoModelo] decimal(5,2) NULL,
  [AlturaModelo] decimal(5,2) NULL,
  [BanioMedio] decimal(5,1) NULL,
  [TgOficina] bit NULL,
  [TgBodega] bit NULL,
  [TgCrece] bit NULL,
  [PrecioEsencial] money NULL,
  [PrecioFull] money NULL,
  [PMetroEsencial] AS ([PrecioEsencial]/[AreaTotal]) PERSISTED,
  [PMetroFull] AS ([PrecioFull]/[AreaTotal]) PERSISTED,
  [MlinealPared] decimal(5,2) NULL,
  [AzureBlobEsencial] nvarchar(250) NULL,
  [AzureBlobFull] nvarchar(250) NULL,
  [AzureBlobBoxEsencial] nvarchar(250) NULL,
  [AzureBlobBoxFull] nvarchar(250) NULL,
  [AzureBlobRender2D] nvarchar(250) NULL,
  [AzureBlobRenderISO] nvarchar(250) NULL,
  [CapacidadPersonas] int NULL,
  [AlquilerMensualAirbnb] money NULL,
  [TgTiny] bit NULL,
  [MontoIVA] money NULL,
  [IVA] decimal(5,2) NULL,
  [Volumen] decimal(5,2) NULL,
  [AzureBlobRender2DBox] nvarchar(250) NULL,
  [AzureBlobRenderISOBox] nvarchar(250) NULL,
  [AreaModeloFeet] AS (round([AreaTotal]*(10.7639),(2))) PERSISTED,
  [FrenteModeloFeet] AS (round([FrenteModelo]*(3.28084),(2))) PERSISTED,
  [FondoModeloFeet] AS (round([FondoModelo]*(3.28084),(2))) PERSISTED,
  [AlturaModeloFeet] AS (round([AlturaModelo]*(3.28084),(2))) PERSISTED,
  [AlturaInterna] decimal(5,2) NULL,
  [AlturaInternaFeet] AS (round([AlturaInterna]*(3.28084),(2))),
  [TgLavanderia] bit NULL,
  [CategoriaModelo] varchar(50) NULL,
  [TgADUs] bit NULL,
  [IDBaseAcabadoEsencial] int NULL,
  [IDBaseAcabadoFull] int NULL,
  [PrecioCerradaM2Esencial] money NULL,
  [PrecioAbiertaM2Esencial] money NULL,
  [PrecioCerradaM2Full] money NULL,
  [PrecioAbiertaM2Full] money NULL,
  [SalarioRequerido] money NULL,
  [CuotaMensual] money NULL,
  [IDCreadopor] int NULL,
  [IDModificadopor] int NULL,
  [TgModEspecial] bit NULL,
  [Costom2LoteBase] money NULL,
  [TipoCambioBase] money NULL,
  [PorCoberturaVerdeBase] decimal(5,4) NULL,
  [MontoExtraBarani] money NULL,
  [TgWC] bit NULL,
  [ActivoVC] bit NULL DEFAULT ((0)),
  [IDModBase] int NULL,
  [IDLoteOrigen] int NULL,
  [DatosPendientes] bit NULL,
  PRIMARY KEY ([IDMod])
);
GO
CREATE TABLE [pro_ventas].[Movimientos] (
  [IDMovimiento] int IDENTITY(1,1) NOT NULL,
  [IDCaso] int NULL,
  [IDTipmov] int NULL,
  [FechaMovimiento] date NULL,
  [MontoColones] money NULL,
  [Depositante] nvarchar(20) NULL,
  [DetalleTransferencia] nvarchar(250) NULL,
  [DetalleInterno] nvarchar(250) NULL,
  [Observaciones] nvarchar(max) NULL,
  [ComprobanteMov] binary(50) NULL,
  [UsuarioCarga] varchar(50) NULL,
  [FechaCreacion] date NULL,
  [IDCreadopor] int NULL,
  [AzureBlobId] varchar(120) NULL,
  [AzureBlobURL] varchar(250) NULL,
  [Moneda] nchar(10) NULL,
  [Completado] bit NULL,
  [AñoMov] AS (datename(year,[FechaMovimiento])),
  [MesMov] AS (datename(month,[FechaMovimiento])),
  [FechaSolicitudMovimiento] date NULL,
  [MontoDolares] money NULL,
  [TipoCambio] money NULL,
  [TgSumaResta] bit NULL,
  [TgSolicitado] bit NULL,
  [NumMesMov] AS (datepart(month,[FechaMovimiento])),
  [TgHomes] bit NULL,
  [IDCasoADHomes] int NULL,
  [UtilidadGenerada] money NULL,
  [UtilidadReservada] money NULL,
  [FechaModificacion] datetime NULL,
  [IDModificadopor] int NULL,
  [EsCapturaBruta] bit NOT NULL DEFAULT ((1)),
  PRIMARY KEY ([IDMovimiento])
);
GO
CREATE TABLE [pro_ventas].[Proyecto] (
  [IDProyecto] int IDENTITY(1,1) NOT NULL,
  [Nombre] nvarchar(100) NULL,
  [AbreviaturaProyecto] nvarchar(10) NULL,
  [Categoria] nvarchar(100) NULL,
  [Creadopor] int NULL,
  [FechaCreacion] datetime NULL,
  [LinkUbicacion] nvarchar(max) NULL,
  [TgDesarrollos] bit NULL,
  [TgHomes] bit NULL,
  [ColorHEX_P] nvarchar(100) NULL,
  [TgVentas] bit NULL,
  [ColorHEX_PDOC] nvarchar(100) NULL,
  [linkWaze] nvarchar(max) NULL,
  PRIMARY KEY ([IDProyecto])
);
GO
CREATE TABLE [pro_ventas].[TipMovi] (
  [IDTmov] int IDENTITY(1,1) NOT NULL,
  [Abreviatura] nvarchar(50) NULL,
  [TipoMovimiento] nvarchar(50) NULL,
  [Categoria] nchar(20) NULL,
  [Orden] int NULL,
  [TgDesembolso] bit NULL,
  [TgSumaRestaMov] bit NULL,
  PRIMARY KEY ([IDTmov])
);
GO
CREATE TABLE [pro_ventas].[TipoCambio] (
  [ID] int IDENTITY(1,1) NOT NULL,
  [TipoCambioVenta] decimal(10,2) NULL,
  [TipoCambioCompra] decimal(10,2) NULL,
  [FechaTipoCambio] date NOT NULL,
  [TBP] float NULL,
  [PrimeRate] float NULL,
  [TasaLibor] float NULL,
  [SOFR] float NULL,
  [TRIColones3m] decimal(10,2) NULL,
  [TRIColones6m] decimal(10,2) NULL,
  [TRIColones12m] decimal(10,2) NULL,
  [TRIDolares3m] decimal(10,2) NULL,
  [TRIDolares6m] decimal(10,2) NULL,
  [TRIDolares12m] decimal(10,2) NULL,
  [BNCompra] decimal(10,2) NULL,
  [BNVenta] decimal(10,2) NULL,
  [BACCompra] decimal(10,2) NULL,
  [BACVenta] decimal(10,2) NULL,
  PRIMARY KEY ([ID])
);
GO
CREATE TABLE [pro_ventas].[UtilidadMovimiento] (
  [IDUtilidadMov] int IDENTITY(1,1) NOT NULL,
  [IDMovimiento] int NULL,
  [IDCaso] int NULL,
  [IDLote] int NULL,
  [IDTipmov] int NULL,
  [FechaMovimiento] date NULL,
  [Moneda] nchar(10) NULL,
  [MontoBase] money NULL,
  [MontoColones] money NULL,
  [MontoDolares] money NULL,
  [TipoCambio] money NULL,
  [TgSumaResta] bit NULL,
  [TipoMovimiento] nvarchar(250) NULL,
  [DetalleTransferencia] nvarchar(250) NULL,
  [ComprobanteMov] binary(50) NULL,
  [DetalleInterno] nvarchar(250) NULL,
  [Observaciones] nvarchar(max) NULL,
  [IDCreadoPor] int NULL,
  [IDModificadoPor] int NULL,
  [FechaCreacion] datetime NULL,
  [AzureBlobId] varchar(250) NULL,
  [AzureBlobURL] varchar(250) NULL,
  [TgCompletado] bit NULL,
  [FechaSolicitudUM] datetime NULL,
  [TgSolicitado] bit NULL,
  [AñoMov] AS (datename(year,[FechaMovimiento])),
  [MesMov] AS (datename(month,[FechaMovimiento])),
  [NumMesMov] AS (datepart(month,[FechaMovimiento])),
  [TgDesarrollos] bit NULL,
  [TgHomes] bit NULL,
  [FechaModificado] datetime NULL,
  PRIMARY KEY ([IDUtilidadMov])
);
GO
CREATE TABLE [pro_hor].[batches] (
  [id] bigint IDENTITY(1,1) NOT NULL,
  [id_planta] int NOT NULL,
  [record_no] int NOT NULL,
  [fecha_inicio] datetime2(7) NOT NULL,
  [fecha_fin] datetime2(7) NOT NULL,
  [cliente_raw] nvarchar(200) NULL,
  [recipe_name_raw] nvarchar(50) NULL,
  [id_receta_blend] int NULL,
  [gps_lat] decimal(10,6) NULL,
  [gps_lon] decimal(10,6) NULL,
  [m3_producidos] decimal(8,3) NOT NULL,
  [arido_a_kg] decimal(10,2) NOT NULL DEFAULT ((0)),
  [arido_b_kg] decimal(10,2) NOT NULL DEFAULT ((0)),
  [cemento_kg] decimal(10,2) NOT NULL DEFAULT ((0)),
  [agua_l] decimal(10,2) NOT NULL DEFAULT ((0)),
  [aditivo1_l] decimal(10,3) NOT NULL DEFAULT ((0)),
  [aditivo2_l] decimal(10,3) NOT NULL DEFAULT ((0)),
  [aditivo3_l] decimal(10,3) NOT NULL DEFAULT ((0)),
  [arido_a_kg_teor] decimal(10,2) NULL,
  [arido_b_kg_teor] decimal(10,2) NULL,
  [cemento_kg_teor] decimal(10,2) NULL,
  [agua_l_teor] decimal(10,2) NULL,
  [aditivo1_l_teor] decimal(10,3) NULL,
  [aditivo2_l_teor] decimal(10,3) NULL,
  [aditivo3_l_teor] decimal(10,3) NULL,
  [relacion_agua_cemento] decimal(8,4) NULL,
  [temp_ambiente_inicio] decimal(4,1) NULL,
  [temp_ambiente_fin] decimal(4,1) NULL,
  [cemento_silo_stop_kg] decimal(10,2) NULL,
  [archivo_origen] nvarchar(200) NULL,
  [ingestado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [sw_version] nvarchar(20) NULL,
  [operador] nvarchar(100) NULL,
  [company_raw] nvarchar(200) NULL,
  [timezone_bias] nvarchar(20) NULL,
  [gps_valido] bit NULL,
  [receta_modificada] bit NOT NULL DEFAULT ((0)),
  [production_rate] decimal(8,2) NULL,
  [production_rate_adj] bit NULL,
  [water_dosage_adj] bit NULL,
  [water_total_adj_l] decimal(10,2) NULL,
  [arido_a_nombre] nvarchar(50) NULL,
  [arido_a_dosis_kg_m3] decimal(8,2) NULL,
  [arido_b_nombre] nvarchar(50) NULL,
  [arido_b_dosis_kg_m3] decimal(8,2) NULL,
  [cemento_dosis_kg_m3] decimal(8,2) NULL,
  [agua_dosis_l_m3] decimal(8,2) NULL,
  [aditivo1_dosis_l_m3] decimal(8,3) NULL,
  [aditivo2_dosis_l_m3] decimal(8,3) NULL,
  [aditivo3_dosis_l_m3] decimal(8,3) NULL,
  [arido_a_lordo_kg] decimal(10,2) NULL,
  [arido_b_lordo_kg] decimal(10,2) NULL,
  [arido_a_delta_kg] decimal(10,2) NULL,
  [arido_a_delta_pct] decimal(8,2) NULL,
  [arido_b_delta_kg] decimal(10,2) NULL,
  [arido_b_delta_pct] decimal(8,2) NULL,
  [cemento_delta_kg] decimal(10,2) NULL,
  [cemento_delta_pct] decimal(8,2) NULL,
  [agua_delta_l] decimal(10,2) NULL,
  [agua_delta_pct] decimal(8,2) NULL,
  [aditivo1_delta_l] decimal(10,3) NULL,
  [aditivo1_delta_pct] decimal(8,2) NULL,
  [aditivo2_delta_l] decimal(10,3) NULL,
  [aditivo2_delta_pct] decimal(8,2) NULL,
  [aditivo3_delta_l] decimal(10,3) NULL,
  [aditivo3_delta_pct] decimal(8,2) NULL,
  [arido_a_moisture_pct] decimal(8,4) NULL,
  [arido_b_moisture_pct] decimal(8,4) NULL,
  [tuvo_alarma] bit NOT NULL DEFAULT ((0)),
  [cantidad_alarmas] int NOT NULL DEFAULT ((0)),
  [id_importacion] bigint NULL,
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_hor].[batches_alarmas] (
  [id] bigint IDENTITY(1,1) NOT NULL,
  [id_batch] bigint NOT NULL,
  [codigo] nvarchar(20) NOT NULL,
  [descripcion] nvarchar(200) NOT NULL,
  [posicion] tinyint NULL,
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_hor].[cilindros] (
  [id_cilindro] int IDENTITY(1,1) NOT NULL,
  [id_colada] int NOT NULL,
  [numero_serie] nvarchar(50) NOT NULL,
  [fecha_toma] date NOT NULL,
  [slump_cm] decimal(5,2) NULL,
  [fecha_ensayo_7d] date NULL,
  [resistencia_7d_kg_cm2] decimal(7,2) NULL,
  [fecha_ensayo_28d] date NULL,
  [resistencia_28d_kg_cm2] decimal(7,2) NULL,
  [observaciones] nvarchar(max) NULL,
  [registrado_por_oid] nvarchar(100) NOT NULL,
  [creado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [actualizado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id_cilindro])
);
GO
CREATE TABLE [pro_hor].[colada_batches] (
  [id_colada] int NOT NULL,
  [id_batch] bigint NOT NULL,
  [excluido] bit NOT NULL DEFAULT ((0)),
  [excluido_motivo] nvarchar(500) NULL,
  [excluido_por_oid] nvarchar(100) NULL,
  [excluido_en] datetime2(7) NULL,
  [agregado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id_colada],[id_batch])
);
GO
CREATE TABLE [pro_hor].[coladas] (
  [id_colada] int IDENTITY(1,1) NOT NULL,
  [codigo_interno] int NOT NULL,
  [id_planta] int NOT NULL,
  [id_receta_blend] int NOT NULL,
  [id_receta_bc] int NULL,
  [id_destino_canonico] int NULL,
  [destino_raw] nvarchar(255) NOT NULL,
  [fecha_inicio] datetime2(7) NOT NULL,
  [fecha_fin] datetime2(7) NOT NULL,
  [m3_producidos] decimal(12,4) NOT NULL DEFAULT ((0)),
  [cantidad_batches] int NOT NULL DEFAULT ((0)),
  [cantidad_alarmas_total] int NOT NULL DEFAULT ((0)),
  [tuvo_alarma] bit NOT NULL DEFAULT ((0)),
  [relacion_agua_cemento_promedio] decimal(8,4) NULL,
  [estado] nvarchar(20) NOT NULL DEFAULT ('sugerida'),
  [numero_pedido_ensamblado_bc] nvarchar(50) NULL,
  [fecha_digitada] datetime2(7) NULL,
  [fecha_cerrada] datetime2(7) NULL,
  [digitada_por_oid] nvarchar(100) NULL,
  [cerrada_por_oid] nvarchar(100) NULL,
  [creada_por_oid] nvarchar(100) NULL,
  [motivo_anulacion] nvarchar(max) NULL,
  [creada_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [actualizada_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [fecha_confirmada] datetime2(7) NULL,
  [confirmada_por_oid] nvarchar(100) NULL,
  [fecha_anulada] datetime2(7) NULL,
  [anulada_por_oid] nvarchar(100) NULL,
  [obra_works_no] nvarchar(20) NULL,
  PRIMARY KEY ([id_colada])
);
GO
CREATE TABLE [pro_hor].[densidades_materiales] (
  [clave] nvarchar(60) NOT NULL,
  [nombre] nvarchar(100) NOT NULL,
  [codigo_bc] nvarchar(20) NULL,
  [densidad] decimal(10,3) NOT NULL,
  [unidad] nvarchar(20) NOT NULL DEFAULT (N'kg/m³'),
  [notas] nvarchar(500) NULL,
  [activo] bit NOT NULL DEFAULT ((1)),
  [actualizado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [actualizado_por_oid] nvarchar(100) NULL,
  [actualizado_por_email] nvarchar(200) NULL,
  PRIMARY KEY ([clave])
);
GO
CREATE TABLE [pro_hor].[destino_alias] (
  [id_alias] int IDENTITY(1,1) NOT NULL,
  [id_destino_canonico] int NOT NULL,
  [texto_raw] nvarchar(255) NOT NULL,
  [creado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id_alias])
);
GO
CREATE TABLE [pro_hor].[destinos_canonicos] (
  [id_destino_canonico] int IDENTITY(1,1) NOT NULL,
  [nombre_canonico] nvarchar(255) NOT NULL,
  [notas] nvarchar(max) NULL,
  [creado_por_oid] nvarchar(100) NOT NULL,
  [creado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [actualizado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id_destino_canonico])
);
GO
CREATE TABLE [pro_hor].[importaciones_csv] (
  [id] bigint IDENTITY(1,1) NOT NULL,
  [id_planta] int NOT NULL,
  [archivo_nombre] nvarchar(200) NOT NULL,
  [archivo_hash] nvarchar(64) NOT NULL,
  [fecha_archivo] datetime2(7) NULL,
  [filas_totales] int NOT NULL,
  [batches_nuevos] int NOT NULL,
  [batches_duplicados] int NOT NULL,
  [batches_con_error] int NOT NULL,
  [errores_json] nvarchar(max) NULL,
  [usuario] nvarchar(100) NULL,
  [fecha_importacion] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [estado] nvarchar(20) NOT NULL DEFAULT ('ok'),
  [usuario_oid] nvarchar(50) NULL,
  [usuario_email] nvarchar(200) NULL,
  [blob_url] nvarchar(500) NULL,
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_hor].[mapeo_recetas] (
  [id_mapeo] int IDENTITY(1,1) NOT NULL,
  [id_receta_blend] int NOT NULL,
  [id_receta_bc] int NOT NULL,
  [fc_teorica_kg_cm2] decimal(7,2) NULL,
  [vigente_desde] date NOT NULL,
  [vigente_hasta] date NULL,
  [creado_por_oid] nvarchar(100) NOT NULL,
  [creado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id_mapeo])
);
GO
CREATE TABLE [pro_hor].[materiales] (
  [id] int IDENTITY(1,1) NOT NULL,
  [codigo_bc] nvarchar(20) NOT NULL,
  [nombre] nvarchar(100) NOT NULL,
  [tipo] nvarchar(30) NOT NULL,
  [unidad_bc] nvarchar(5) NOT NULL,
  [unidad_blend] nvarchar(5) NOT NULL,
  [densidad_kg_m3] decimal(8,2) NULL,
  [notas] nvarchar(500) NULL,
  [activo] bit NOT NULL DEFAULT ((1)),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_hor].[migraciones_aplicadas] (
  [nombre] nvarchar(200) NOT NULL,
  [hash_sha256] nvarchar(64) NOT NULL,
  [aplicada_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [aplicada_por] nvarchar(200) NOT NULL DEFAULT (suser_sname()),
  PRIMARY KEY ([nombre])
);
GO
CREATE TABLE [pro_hor].[plantas] (
  [id] int IDENTITY(1,1) NOT NULL,
  [codigo] nvarchar(20) NOT NULL,
  [marca] nvarchar(20) NOT NULL,
  [serial] nvarchar(20) NOT NULL,
  [recurso_bc] nvarchar(20) NULL,
  [activo] bit NOT NULL DEFAULT ((1)),
  [creado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [recurso_bc_descripcion] nvarchar(250) NULL,
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_hor].[recetas_bc] (
  [id] int IDENTITY(1,1) NOT NULL,
  [codigo_bc] nvarchar(20) NOT NULL,
  [descripcion] nvarchar(100) NOT NULL,
  [resistencia_fc] int NULL,
  [activa] bit NOT NULL DEFAULT ((1)),
  [codigo_recurso_bc] nvarchar(20) NULL,
  [recurso_bc_descripcion] nvarchar(250) NULL,
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_hor].[recetas_blend] (
  [id] int IDENTITY(1,1) NOT NULL,
  [id_planta] int NOT NULL,
  [nombre_texto] nvarchar(50) NOT NULL,
  [dos_arido_a_kg_m3] decimal(8,2) NULL,
  [dos_arido_b_kg_m3] decimal(8,2) NULL,
  [dos_cemento_kg_m3] decimal(8,2) NULL,
  [dos_agua_l_m3] decimal(8,2) NULL,
  [dos_aditivo1_l_m3] decimal(8,2) NULL,
  [dos_aditivo2_l_m3] decimal(8,2) NULL,
  [dos_aditivo3_l_m3] decimal(8,2) NULL,
  [id_receta_bc] int NULL,
  [creada_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_hor].[umbrales_alerta] (
  [clave] nvarchar(80) NOT NULL,
  [descripcion] nvarchar(200) NULL,
  [umbral] decimal(12,4) NOT NULL,
  [comparador] nvarchar(20) NOT NULL,
  [activo] bit NOT NULL DEFAULT ((1)),
  [actualizado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [actualizado_por_oid] nvarchar(100) NULL,
  [actualizado_por_email] nvarchar(200) NULL,
  [unidad] nvarchar(20) NULL,
  PRIMARY KEY ([clave])
);
GO
CREATE TABLE [pro_lab].[actividades] (
  [id] int IDENTITY(1,1) NOT NULL,
  [nombre] nvarchar(100) NOT NULL,
  [activo] bit NOT NULL DEFAULT ((1)),
  [orden] int NOT NULL DEFAULT ((0)),
  [creado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_lab].[curva_teorica] (
  [edad_dias] int NOT NULL,
  [pct_resistencia] decimal(5,4) NOT NULL,
  [descripcion] nvarchar(200) NULL,
  PRIMARY KEY ([edad_dias])
);
GO
CREATE TABLE [pro_lab].[ensayos] (
  [id] bigint IDENTITY(1,1) NOT NULL,
  [id_muestra] bigint NOT NULL,
  [edad_dias] int NOT NULL,
  [fecha_prueba] date NULL,
  [notas] nvarchar(max) NULL,
  [creado_por_oid] nvarchar(100) NULL,
  [creado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [actualizado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [fecha_prueba_programada] date NULL,
  [fecha_ajustada_por_oid] nvarchar(100) NULL,
  [fecha_ajustada_por_email] nvarchar(200) NULL,
  [fecha_ajustada_en] datetime2(7) NULL,
  [fecha_ajustada_motivo] nvarchar(500) NULL,
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_lab].[esclerometro_ensayos] (
  [id] bigint IDENTITY(1,1) NOT NULL,
  [numero] int NOT NULL,
  [fecha] date NOT NULL,
  [obra_works_no] nvarchar(20) NULL,
  [id_casa] nvarchar(50) NULL,
  [elemento_estructural] nvarchar(100) NOT NULL,
  [edad_dias] int NULL,
  [angulo_impacto] int NOT NULL DEFAULT ((0)),
  [equipo_serial] nvarchar(50) NULL,
  [notas] nvarchar(max) NULL,
  [creado_por_oid] nvarchar(100) NOT NULL,
  [creado_por_email] nvarchar(200) NULL,
  [creado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [actualizado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_lab].[esclerometro_rebotes] (
  [id] bigint IDENTITY(1,1) NOT NULL,
  [id_ensayo] bigint NOT NULL,
  [numero_golpe] int NOT NULL,
  [valor_rebote] decimal(5,1) NOT NULL,
  [notas] nvarchar(300) NULL,
  [creado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_lab].[fotos_muestra] (
  [id] bigint IDENTITY(1,1) NOT NULL,
  [id_muestra] bigint NOT NULL,
  [blob_nombre] nvarchar(300) NOT NULL,
  [content_type] nvarchar(100) NOT NULL DEFAULT ('image/jpeg'),
  [tamano_bytes] int NULL,
  [nombre_original] nvarchar(200) NULL,
  [creado_por_oid] nvarchar(100) NULL,
  [creado_por_email] nvarchar(200) NULL,
  [creado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [id_ensayo] bigint NULL,
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_lab].[mediciones] (
  [id] bigint IDENTITY(1,1) NOT NULL,
  [id_ensayo] bigint NOT NULL,
  [resistencia_mpa] decimal(7,2) NOT NULL,
  [orden] int NOT NULL DEFAULT ((1)),
  [notas] nvarchar(500) NULL,
  [creado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_lab].[muestras] (
  [id] bigint IDENTITY(1,1) NOT NULL,
  [numero_muestra] int NOT NULL,
  [obra_works_no] nvarchar(20) NULL,
  [id_casa] nvarchar(50) NULL,
  [id_actividad] int NOT NULL,
  [fecha_colado] date NOT NULL,
  [proveedor] nvarchar(100) NOT NULL DEFAULT ('ADELANTE DESARROLLOS'),
  [id_colada] int NULL,
  [id_receta_bc] int NULL,
  [fc_objetivo] int NOT NULL,
  [tipo_concreto_libre] nvarchar(100) NULL,
  [notas] nvarchar(max) NULL,
  [creado_por_oid] nvarchar(100) NOT NULL,
  [creado_por_email] nvarchar(200) NULL,
  [creado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [actualizado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [categoria_concreto] nvarchar(20) NULL,
  [planta_nombre] nvarchar(50) NULL,
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_lab].[pin_acceso] (
  [id] int IDENTITY(1,1) NOT NULL,
  [etiqueta] nvarchar(100) NOT NULL DEFAULT ('Laboratorio'),
  [pin_hash] nvarchar(500) NOT NULL,
  [activo] bit NOT NULL DEFAULT ((1)),
  [creado_por_oid] nvarchar(100) NOT NULL,
  [creado_por_email] nvarchar(200) NULL,
  [creado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  [ultimo_uso_en] datetime2(7) NULL,
  [intentos_fallidos] int NOT NULL DEFAULT ((0)),
  [bloqueado_hasta] datetime2(7) NULL,
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_obc].[avance_base_semanal] (
  [semana_operativa_id] bigint NOT NULL,
  [obra_codigo] nvarchar(20) NOT NULL,
  [sub_partida_id] int NOT NULL,
  [pct_completado] decimal(5,2) NOT NULL DEFAULT ((0)),
  [capturado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([semana_operativa_id],[obra_codigo],[sub_partida_id])
);
GO
CREATE TABLE [pro_obc].[avance_semanal_obra] (
  [id] bigint IDENTITY(1,1) NOT NULL,
  [semana_operativa_id] bigint NOT NULL,
  [obra_codigo] nvarchar(20) NOT NULL,
  [avance_porcentaje] decimal(5,2) NULL DEFAULT ((0)),
  [m2_totales] decimal(10,2) NULL,
  [m2_avanzados_acumulado] decimal(10,2) NULL,
  [m2_avanzados_semana] decimal(10,2) NULL,
  [m2_esperados] decimal(10,2) NULL,
  [sprint_actual] smallint NULL,
  [tipo_cierre] char(1) NOT NULL DEFAULT ('B'),
  [pct_costo_esp] decimal(5,2) NULL,
  [pct_costo_real] decimal(5,2) NULL,
  [estado_obra] varchar(30) NULL,
  [fecha_registro] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  [creado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_obc].[avance_sub_partidas] (
  [id] bigint IDENTITY(1,1) NOT NULL,
  [obra_codigo] nvarchar(20) NOT NULL,
  [sub_partida_id] int NOT NULL,
  [pct_completado] decimal(5,2) NOT NULL DEFAULT ((0)),
  [completada] bit NOT NULL DEFAULT ((0)),
  [nc_causa] nvarchar(200) NULL,
  [nc_nota] nvarchar(max) NULL,
  [usuario_id] int NULL,
  [registrado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  [actualizado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_obc].[causas_catalogo] (
  [id] int IDENTITY(1,1) NOT NULL,
  [codigo] varchar(50) NOT NULL,
  [descripcion] nvarchar(200) NOT NULL,
  [icono] varchar(50) NULL,
  [aplica_nc] bit NOT NULL DEFAULT ((0)),
  [aplica_inactividad] bit NOT NULL DEFAULT ((0)),
  [activo] bit NOT NULL DEFAULT ((1)),
  [orden] int NOT NULL DEFAULT ((0)),
  [creado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_obc].[cierre_produccion_snapshots] (
  [id] bigint IDENTITY(1,1) NOT NULL,
  [cierre_produccion_id] bigint NOT NULL,
  [obra_codigo] nvarchar(20) NOT NULL,
  [sub_partida_id] int NOT NULL,
  [pct_completado] decimal(5,2) NOT NULL DEFAULT ((0)),
  [completada] bit NOT NULL DEFAULT ((0)),
  [pct_costo_obra] decimal(5,2) NULL,
  [creado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  [nc_causa] nvarchar(200) NULL,
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_obc].[cierres_produccion] (
  [id] bigint IDENTITY(1,1) NOT NULL,
  [semana_operativa_id] bigint NOT NULL,
  [fecha_cierre] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  [creado_por] nvarchar(100) NULL,
  [notas] nvarchar(max) NULL,
  [tipo] varchar(2) NOT NULL DEFAULT ('A'),
  [fecha_corte] date NULL,
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_obc].[config_costo_mo] (
  [id] bigint IDENTITY(1,1) NOT NULL,
  [costo_por_m2] decimal(18,2) NOT NULL,
  [vigente_desde] date NOT NULL,
  [vigente_hasta] date NULL,
  [es_vigente] bit NOT NULL DEFAULT ((1)),
  [notas] nvarchar(max) NULL,
  [creado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  [actualizado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_obc].[control_nomina_semanal] (
  [id] uniqueidentifier NOT NULL DEFAULT (newid()),
  [semana_operativa_id] bigint NOT NULL,
  [monto_nomina_directa] decimal(18,2) NOT NULL,
  [costo_teorico_m2] decimal(18,2) NOT NULL,
  [m2_avanzados_semana] decimal(10,2) NULL DEFAULT ((0)),
  [costo_real_mo_m2] decimal(18,4) NULL,
  [desviacion_mo_colones] decimal(18,2) NULL,
  [desviacion_mo_porcentaje] decimal(7,4) NULL,
  [monto_subcontratos_total] decimal(18,2) NULL DEFAULT ((0)),
  [monto_total_mo] decimal(18,2) NULL,
  [costo_total_mo_m2] decimal(18,4) NULL,
  [desviacion_total_colones] decimal(18,2) NULL,
  [desviacion_total_porcentaje] decimal(7,4) NULL,
  [notas] nvarchar(max) NULL,
  [creado_por] int NULL,
  [creado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  [actualizado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_obc].[cortes_nomina] (
  [id] bigint IDENTITY(1,1) NOT NULL,
  [numero] int NOT NULL,
  [anio] smallint NOT NULL,
  [fecha_inicio] date NOT NULL,
  [fecha_fin] date NOT NULL,
  [estado] varchar(20) NOT NULL DEFAULT ('abierto'),
  [semana_op_inicio_id] bigint NULL,
  [semana_op_fin_id] bigint NULL,
  [notas] nvarchar(max) NULL,
  [creado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_obc].[grupos_partida] (
  [id] int IDENTITY(1,1) NOT NULL,
  [codigo] varchar(20) NOT NULL,
  [nombre] nvarchar(100) NOT NULL,
  [orden] smallint NOT NULL DEFAULT ((0)),
  [activo] bit NOT NULL DEFAULT ((1)),
  [creado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_obc].[historial_estado_venta] (
  [id] bigint IDENTITY(1,1) NOT NULL,
  [obra_codigo] nvarchar(20) NOT NULL,
  [estado_anterior] varchar(50) NULL,
  [estado_nuevo] varchar(50) NOT NULL,
  [fecha_cambio] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  [semana_operativa_id] bigint NULL,
  [notas] nvarchar(max) NULL,
  [registrado_por] nvarchar(100) NULL,
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_obc].[horas_obra_semanal] (
  [id] uniqueidentifier NOT NULL DEFAULT (newid()),
  [semana_operativa_id] bigint NOT NULL,
  [obra_codigo] nvarchar(20) NOT NULL,
  [horas_mo_directa] decimal(10,2) NOT NULL,
  [porcentaje_horas] decimal(7,4) NULL,
  [monto_nomina_asignado] decimal(18,2) NULL,
  [costo_nomina_m2] decimal(18,4) NULL,
  [importado_desde] nvarchar(200) NULL,
  [creado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  [actualizado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_obc].[mo_horas_obra] (
  [semana_operativa_id] bigint NOT NULL,
  [obra_codigo] nvarchar(20) NOT NULL,
  [horas] decimal(10,2) NOT NULL DEFAULT ((0)),
  [actualizado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([semana_operativa_id],[obra_codigo])
);
GO
CREATE TABLE [pro_obc].[mo_nomina_semanal] (
  [semana_operativa_id] bigint NOT NULL,
  [monto_nomina_directa] decimal(18,2) NOT NULL DEFAULT ((0)),
  [costo_teorico_m2] decimal(18,2) NOT NULL DEFAULT ((122000)),
  [notas] nvarchar(500) NULL,
  [actualizado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([semana_operativa_id])
);
GO
CREATE TABLE [pro_obc].[mo_subcontratos] (
  [id] bigint IDENTITY(1,1) NOT NULL,
  [semana_operativa_id] bigint NOT NULL,
  [obra_codigo] nvarchar(20) NOT NULL,
  [tipo] nvarchar(100) NULL,
  [monto] decimal(18,2) NOT NULL DEFAULT ((0)),
  [descripcion] nvarchar(500) NULL,
  [creado_en] datetime2(7) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_obc].[obra_estado] (
  [obra_codigo] nvarchar(20) NOT NULL,
  [estado] varchar(20) NOT NULL DEFAULT ('pendiente'),
  [sprint_actual] smallint NOT NULL DEFAULT ((0)),
  [motivo_inactiva] nvarchar(200) NULL,
  [actualizado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  [actualizado_por] int NULL,
  [tipo_casa] varchar(20) NULL,
  [estado_venta] varchar(20) NULL,
  [avanzo_semana_id] bigint NULL,
  [orden] int NULL,
  PRIMARY KEY ([obra_codigo])
);
GO
CREATE TABLE [pro_obc].[obra_pesos] (
  [obra_codigo] nvarchar(20) NOT NULL,
  [ambito] varchar(10) NOT NULL,
  [scope_id] int NOT NULL,
  [sub_partida_id] int NOT NULL,
  [tipo_casa] varchar(20) NOT NULL,
  [peso] decimal(5,2) NOT NULL,
  [congelado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([obra_codigo],[ambito],[scope_id],[sub_partida_id])
);
GO
CREATE TABLE [pro_obc].[obra_sub_partidas_excluidas] (
  [obra_codigo] nvarchar(20) NOT NULL,
  [sub_partida_id] int NOT NULL,
  [motivo] nvarchar(max) NULL,
  [creado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([obra_codigo],[sub_partida_id])
);
GO
CREATE TABLE [pro_obc].[otp_codigos] (
  [id] bigint IDENTITY(1,1) NOT NULL,
  [usuario_id] int NOT NULL,
  [codigo_hash] varbinary(256) NOT NULL,
  [canal] varchar(10) NOT NULL,
  [enviado_a] varchar(120) NOT NULL,
  [expira_en] datetime2(3) NOT NULL,
  [consumido_en] datetime2(3) NULL,
  [intentos] tinyint NOT NULL DEFAULT ((0)),
  [creado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_obc].[partidas] (
  [id] int IDENTITY(1,1) NOT NULL,
  [codigo] varchar(20) NOT NULL,
  [nombre] nvarchar(100) NOT NULL,
  [grupo_id] int NOT NULL,
  [orden] smallint NOT NULL DEFAULT ((0)),
  [activo] bit NOT NULL DEFAULT ((1)),
  [creado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_obc].[plan_semanal] (
  [id] bigint IDENTITY(1,1) NOT NULL,
  [semana_operativa_id] bigint NOT NULL,
  [obra_codigo] nvarchar(20) NOT NULL,
  [sprint_objetivo] smallint NOT NULL,
  [notas] nvarchar(max) NULL,
  [creado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  [actualizado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_obc].[semanas_operativas] (
  [id] bigint IDENTITY(1,1) NOT NULL,
  [anio] smallint NOT NULL,
  [numero_semana] smallint NOT NULL,
  [fecha_inicio] date NOT NULL,
  [fecha_fin] date NOT NULL,
  [estado] varchar(20) NOT NULL DEFAULT ('abierta'),
  [descripcion] nvarchar(max) NULL,
  [dias_efectivos] smallint NOT NULL DEFAULT ((5)),
  [creado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_obc].[sprints_catalogo] (
  [id] bigint IDENTITY(1,1) NOT NULL,
  [codigo] varchar(20) NOT NULL,
  [numero_global] smallint NOT NULL,
  [nombre] nvarchar(100) NOT NULL,
  [descripcion] nvarchar(max) NULL,
  [categoria] varchar(20) NOT NULL DEFAULT ('CASA'),
  [es_espera] bit NOT NULL DEFAULT ((0)),
  [activo] bit NOT NULL DEFAULT ((1)),
  [creado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_obc].[sprints_cerrados] (
  [id] int IDENTITY(1,1) NOT NULL,
  [obra_codigo] nvarchar(20) NOT NULL,
  [sprint_numero] smallint NOT NULL,
  [semana_operativa_id] bigint NULL,
  [fecha_cierre] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  [tipo_cierre] char(1) NOT NULL DEFAULT ('B'),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_obc].[sub_partida_pesos_partida] (
  [sub_partida_id] int NOT NULL,
  [partida_id] int NOT NULL,
  [tipo_casa] varchar(20) NOT NULL,
  [peso] decimal(5,2) NOT NULL,
  PRIMARY KEY ([sub_partida_id],[partida_id],[tipo_casa])
);
GO
CREATE TABLE [pro_obc].[sub_partida_pesos_sprint] (
  [sub_partida_id] int NOT NULL,
  [sprint_numero] smallint NOT NULL,
  [tipo_casa] varchar(20) NOT NULL,
  [peso] decimal(5,2) NOT NULL,
  PRIMARY KEY ([sub_partida_id],[sprint_numero],[tipo_casa])
);
GO
CREATE TABLE [pro_obc].[sub_partida_tipos] (
  [sub_partida_id] int NOT NULL,
  [tipo_casa] varchar(20) NOT NULL,
  PRIMARY KEY ([sub_partida_id],[tipo_casa])
);
GO
CREATE TABLE [pro_obc].[sub_partidas] (
  [id] int IDENTITY(1,1) NOT NULL,
  [codigo] varchar(50) NOT NULL,
  [nombre] nvarchar(150) NOT NULL,
  [partida_id] int NOT NULL,
  [sprint_numero] smallint NOT NULL,
  [es_critica] bit NOT NULL DEFAULT ((0)),
  [descripcion] nvarchar(max) NULL,
  [activo] bit NOT NULL DEFAULT ((1)),
  [creado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_obc].[subcontratos_obra_semanal] (
  [id] uniqueidentifier NOT NULL DEFAULT (newid()),
  [semana_operativa_id] bigint NOT NULL,
  [obra_codigo] nvarchar(20) NOT NULL,
  [nombre_subcontrato] nvarchar(200) NOT NULL,
  [monto_pagado] decimal(18,2) NOT NULL,
  [descripcion] nvarchar(max) NULL,
  [importado_desde] nvarchar(200) NULL,
  [creado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  [actualizado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_obc].[tipo_casa_config] (
  [tipo_casa] varchar(20) NOT NULL,
  [total_sprints] smallint NOT NULL,
  [descripcion] nvarchar(max) NULL,
  PRIMARY KEY ([tipo_casa])
);
GO
CREATE TABLE [pro_obc].[tipo_casa_sprints] (
  [tipo_casa] varchar(20) NOT NULL,
  [sprint_global] smallint NOT NULL,
  [orden] smallint NOT NULL,
  PRIMARY KEY ([tipo_casa],[sprint_global])
);
GO
CREATE TABLE [pro_obc].[tipo_construccion_sprints] (
  [id] bigint IDENTITY(1,1) NOT NULL,
  [tipo_casa] varchar(20) NOT NULL,
  [sprint_id] bigint NOT NULL,
  [orden_en_tipo] smallint NOT NULL,
  [activo] bit NOT NULL DEFAULT ((1)),
  [creado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_obc].[tipos_casa] (
  [codigo] varchar(20) NOT NULL,
  [descripcion] nvarchar(100) NOT NULL,
  [niveles] tinyint NOT NULL,
  [activo] bit NOT NULL DEFAULT ((1)),
  [creado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([codigo])
);
GO
CREATE TABLE [pro_obc].[usuarios_app] (
  [id] int IDENTITY(1,1) NOT NULL,
  [nombre] nvarchar(100) NOT NULL,
  [usuario] varchar(50) NOT NULL,
  [telefono] varchar(20) NULL,
  [pin_hash] varbinary(256) NULL,
  [rol] varchar(30) NOT NULL DEFAULT ('campo'),
  [activo] bit NOT NULL DEFAULT ((1)),
  [intentos_fallidos] tinyint NOT NULL DEFAULT ((0)),
  [bloqueado_hasta] datetime2(3) NULL,
  [ultimo_login] datetime2(3) NULL,
  [creado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([id])
);
GO
CREATE TABLE [pro_uti].[comentarios_reporte] (
  [id_comentario] bigint IDENTITY(1,1) NOT NULL,
  [anio] smallint NOT NULL,
  [mes] tinyint NOT NULL,
  [scope] nvarchar(20) NOT NULL,
  [seccion_id] nvarchar(100) NULL,
  [celda_id] nvarchar(200) NULL,
  [contenido_markdown] nvarchar(max) NOT NULL,
  [autor_oid] nvarchar(50) NOT NULL,
  [autor_email] nvarchar(255) NOT NULL,
  [autor_nombre] nvarchar(255) NOT NULL,
  [autor_rol] nvarchar(50) NOT NULL DEFAULT ('Contabilidad'),
  [estado] nvarchar(20) NOT NULL DEFAULT ('borrador'),
  [creado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  [editado_en] datetime2(3) NULL,
  [enviado_en] datetime2(3) NULL,
  [eliminado_en] datetime2(3) NULL,
  [eliminado_por_oid] nvarchar(50) NULL,
  PRIMARY KEY ([id_comentario])
);
GO
CREATE TABLE [pro_uti].[envios_reporte] (
  [id_envio] bigint IDENTITY(1,1) NOT NULL,
  [anio] smallint NOT NULL,
  [mes] tinyint NOT NULL,
  [canal] nvarchar(20) NOT NULL,
  [enviado_por_oid] nvarchar(50) NOT NULL,
  [enviado_por_nombre] nvarchar(255) NOT NULL,
  [enviado_a_emails] nvarchar(1000) NULL,
  [enviado_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  [pdf_blob_url] nvarchar(500) NULL,
  [excel_blob_url] nvarchar(500) NULL,
  [comentarios_cantidad] int NOT NULL DEFAULT ((0)),
  PRIMARY KEY ([id_envio])
);
GO
CREATE TABLE [pro_uti].[migraciones_aplicadas] (
  [nombre] nvarchar(255) NOT NULL,
  [hash_sha256] nvarchar(64) NOT NULL,
  [aplicada_en] datetime2(3) NOT NULL DEFAULT (sysutcdatetime()),
  [aplicada_por] nvarchar(100) NOT NULL DEFAULT (suser_sname()),
  PRIMARY KEY ([nombre])
);
GO
CREATE TABLE [pro_uti].[t_lote_presupuesto_bc] (
  [IDLote] int NOT NULL,
  [works_no] varchar(50) NOT NULL,
  [pres_directo] money NOT NULL,
  [pres_indirecto] money NOT NULL,
  [util_proyectada] money NOT NULL,
  [refreshed_at] datetime2(0) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([IDLote])
);
GO
CREATE TABLE [pro_uti].[t_mejor_caso_lote] (
  [IDLote] int NOT NULL,
  [IDCaso] int NOT NULL,
  [PresupuestoDirecto] money NOT NULL,
  [PresupuestoIndirecto] money NOT NULL,
  [UtilidadProyectada] money NOT NULL,
  [refreshed_at] datetime2(0) NOT NULL DEFAULT (sysutcdatetime()),
  PRIMARY KEY ([IDLote])
);
GO
CREATE TABLE [pro_uti].[tipo_movimiento] (
  [codigo] nvarchar(50) NOT NULL,
  [nombre_display] nvarchar(100) NOT NULL,
  [categoria] nvarchar(20) NOT NULL,
  [tg_suma_resta] bit NOT NULL,
  [activo] bit NOT NULL DEFAULT ((1)),
  [orden_ui] int NOT NULL DEFAULT ((999)),
  PRIMARY KEY ([codigo])
);
GO

-- ===== MODULES (views/functions/procs) =====
CREATE FUNCTION [pro_app].[fn_clasificar_depositante](@Depositante NVARCHAR(200))
RETURNS VARCHAR(20)
AS
BEGIN
    DECLARE @d NVARCHAR(200) = LTRIM(RTRIM(LOWER(ISNULL(@Depositante, ''))));

    IF @d = '' RETURN 'OTRO';
    IF @d LIKE '%cliente%' RETURN 'CLIENTE';

    -- Patrones reconocidos como BANCO. 'green' incluido por flujo histórico
    -- via GM (ver header del archivo).
    IF @d LIKE '%banco%' OR @d LIKE '%bn%' OR @d LIKE '%bcr%' OR @d LIKE '%bac%'
       OR @d LIKE '%mucap%' OR @d LIKE '%popular%' OR @d LIKE '%coopen%'
       OR @d LIKE '%lafise%' OR @d LIKE '%davivienda%' OR @d LIKE '%coopeande%'
       OR @d LIKE '%coopeservidores%' OR @d LIKE '%mutual%' OR @d LIKE '%coopealianza%'
       OR @d LIKE '%nacional%' OR @d LIKE '%costa rica%'
       OR @d LIKE '%green%'
        RETURN 'BANCO';

    RETURN 'OTRO';
END;
GO
-- -----------------------------------------------------------------------------
-- 2. SP sp_actualizar_catalogo_hito (upsert)
--
-- Si @IDHito es NULL → INSERT (nuevo hito).
-- Si @IDHito tiene valor → UPDATE (modifica el existente).
--
-- Valida unicidad del Codigo (case-insensitive).
-- Audit log en cada operación.
-- -----------------------------------------------------------------------------
CREATE PROCEDURE [pro_app].[sp_actualizar_catalogo_hito]
    @IDHito         INT = NULL,
    @Codigo         VARCHAR(20),
    @Nombre         NVARCHAR(100),
    @OrdenEstandar  INT,
    @Descripcion    NVARCHAR(500) = NULL,
    @ColorHEX       NVARCHAR(10) = NULL,
    @Activo         BIT = 1,
    @UsuarioEmail   NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @Codigo IS NULL OR LTRIM(RTRIM(@Codigo)) = ''
        THROW 51400, 'Codigo es obligatorio.', 1;

    IF @Nombre IS NULL OR LTRIM(RTRIM(@Nombre)) = ''
        THROW 51401, 'Nombre es obligatorio.', 1;

    IF @OrdenEstandar IS NULL OR @OrdenEstandar <= 0
        THROW 51402, 'OrdenEstandar debe ser entero positivo.', 1;

    -- Si va a actualizar, verificar que el ID exista.
    IF @IDHito IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [pro_app].[catalogo_hito] WHERE IDHito = @IDHito)
        THROW 51403, 'IDHito no existe.', 1;

    -- Codigo único (case-insensitive), excluyendo la fila actual en updates.
    IF EXISTS (
        SELECT 1 FROM [pro_app].[catalogo_hito]
        WHERE UPPER(Codigo) = UPPER(@Codigo)
          AND (@IDHito IS NULL OR IDHito <> @IDHito)
    )
        THROW 51404, 'Ya existe otro hito con ese Codigo.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF @IDHito IS NULL
        BEGIN
            -- INSERT nuevo
            INSERT INTO [pro_app].[catalogo_hito]
                (Codigo, Nombre, OrdenEstandar, Descripcion, ColorHEX, Activo)
            VALUES
                (@Codigo, @Nombre, @OrdenEstandar, @Descripcion, @ColorHEX, @Activo);
            SET @IDHito = SCOPE_IDENTITY();

            INSERT INTO [pro_app].[audit_log]
                (Tabla, IDRegistro, Accion, UsuarioEmail, ValorNuevoJSON, Contexto)
            VALUES
                ('pro_app.catalogo_hito', @IDHito, 'INSERT', @UsuarioEmail,
                 (SELECT Codigo = @Codigo, Nombre = @Nombre, OrdenEstandar = @OrdenEstandar,
                         Descripcion = @Descripcion, ColorHEX = @ColorHEX, Activo = @Activo
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                 'Nuevo hito en el catálogo');
        END
        ELSE
        BEGIN
            -- UPDATE existente — guardar el valor anterior para audit
            DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
                SELECT Codigo, Nombre, OrdenEstandar, Descripcion, ColorHEX, Activo
                FROM [pro_app].[catalogo_hito] WHERE IDHito = @IDHito
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            );

            UPDATE [pro_app].[catalogo_hito]
            SET Codigo = @Codigo,
                Nombre = @Nombre,
                OrdenEstandar = @OrdenEstandar,
                Descripcion = @Descripcion,
                ColorHEX = @ColorHEX,
                Activo = @Activo
            WHERE IDHito = @IDHito;

            INSERT INTO [pro_app].[audit_log]
                (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON, ValorNuevoJSON, Contexto)
            VALUES
                ('pro_app.catalogo_hito', @IDHito, 'UPDATE', @UsuarioEmail,
                 @ValorAnteriorJSON,
                 (SELECT Codigo = @Codigo, Nombre = @Nombre, OrdenEstandar = @OrdenEstandar,
                         Descripcion = @Descripcion, ColorHEX = @ColorHEX, Activo = @Activo
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                 'Actualización de hito en el catálogo');
        END;

        COMMIT TRANSACTION;

        SELECT @IDHito AS IDHito;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_actualizar_credito_puente]
    @IDCreditoPuente            INT = NULL,           -- NULL = INSERT, valor = UPDATE
    @IDBan                      INT,
    @Codigo                     NVARCHAR(30) = NULL,
    @MontoTotal_CRC             MONEY,
    @GastosFormalizacion_CRC    MONEY = NULL,
    @TasaAnual                  DECIMAL(5,2) = NULL,
    @FechaAprobacion            DATE = NULL,
    @FechaVencimiento           DATE = NULL,
    @Estado                     VARCHAR(20) = 'ACTIVO',
    @Notas                      NVARCHAR(MAX) = NULL,
    @UsuarioEmail               NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM pro_ventas.Bancos WHERE IDBan = @IDBan)
        THROW 52000, 'IDBan no existe en pro_ventas.Bancos.', 1;
    IF @MontoTotal_CRC IS NULL OR @MontoTotal_CRC <= 0
        THROW 52001, 'MontoTotal_CRC debe ser mayor a cero.', 1;
    IF @Estado NOT IN ('ACTIVO','CANCELADO')
        THROW 52002, 'Estado invalido (ACTIVO o CANCELADO).', 1;
    IF @GastosFormalizacion_CRC IS NOT NULL AND @GastosFormalizacion_CRC < 0
        THROW 52003, 'GastosFormalizacion_CRC no puede ser negativo.', 1;
    IF @TasaAnual IS NOT NULL AND (@TasaAnual < 0 OR @TasaAnual > 100)
        THROW 52004, 'TasaAnual debe estar entre 0 y 100.', 1;
    IF @FechaVencimiento IS NOT NULL AND @FechaAprobacion IS NOT NULL
       AND @FechaVencimiento < @FechaAprobacion
        THROW 52005, 'FechaVencimiento no puede ser anterior a FechaAprobacion.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF @IDCreditoPuente IS NULL
        BEGIN
            -- INSERT
            INSERT INTO [pro_app].[credito_puente]
                (IDBan, Codigo, MontoTotal_CRC, GastosFormalizacion_CRC, TasaAnual,
                 FechaAprobacion, FechaVencimiento, Estado, Notas, CreadoPor)
            VALUES
                (@IDBan, @Codigo, @MontoTotal_CRC, @GastosFormalizacion_CRC, @TasaAnual,
                 @FechaAprobacion, @FechaVencimiento, @Estado, @Notas, @UsuarioEmail);

            SET @IDCreditoPuente = SCOPE_IDENTITY();

            DECLARE @ValorNuevoIns NVARCHAR(MAX) = (
                SELECT IDCreditoPuente = @IDCreditoPuente, IDBan = @IDBan, Codigo = @Codigo,
                       MontoTotal_CRC = @MontoTotal_CRC,
                       GastosFormalizacion_CRC = @GastosFormalizacion_CRC,
                       TasaAnual = @TasaAnual, FechaAprobacion = @FechaAprobacion,
                       FechaVencimiento = @FechaVencimiento, Estado = @Estado,
                       Notas = @Notas
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            );

            INSERT INTO [pro_app].[audit_log]
                (Tabla, IDRegistro, Accion, UsuarioEmail,
                 ValorAnteriorJSON, ValorNuevoJSON, Contexto)
            VALUES
                ('pro_app.credito_puente', @IDCreditoPuente, 'INSERT', @UsuarioEmail,
                 NULL, @ValorNuevoIns,
                 CONCAT('Credito puente creado (banco ', @IDBan, ')'));
        END
        ELSE
        BEGIN
            -- UPDATE
            IF NOT EXISTS (SELECT 1 FROM [pro_app].[credito_puente] WHERE IDCreditoPuente = @IDCreditoPuente)
                THROW 52006, 'IDCreditoPuente no existe.', 1;

            DECLARE @ValorAnteriorUpd NVARCHAR(MAX) = (
                SELECT IDCreditoPuente, IDBan, Codigo, MontoTotal_CRC,
                       GastosFormalizacion_CRC, TasaAnual, FechaAprobacion,
                       FechaVencimiento, Estado, Notas
                FROM [pro_app].[credito_puente]
                WHERE IDCreditoPuente = @IDCreditoPuente
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            );

            UPDATE [pro_app].[credito_puente]
            SET    IDBan                   = @IDBan,
                   Codigo                  = @Codigo,
                   MontoTotal_CRC          = @MontoTotal_CRC,
                   GastosFormalizacion_CRC = @GastosFormalizacion_CRC,
                   TasaAnual               = @TasaAnual,
                   FechaAprobacion         = @FechaAprobacion,
                   FechaVencimiento        = @FechaVencimiento,
                   Estado                  = @Estado,
                   Notas                   = @Notas,
                   ModificadoPor           = @UsuarioEmail,
                   FechaModificacion       = SYSUTCDATETIME()
            WHERE  IDCreditoPuente = @IDCreditoPuente;

            DECLARE @ValorNuevoUpd NVARCHAR(MAX) = (
                SELECT IDCreditoPuente, IDBan, Codigo, MontoTotal_CRC,
                       GastosFormalizacion_CRC, TasaAnual, FechaAprobacion,
                       FechaVencimiento, Estado, Notas
                FROM [pro_app].[credito_puente]
                WHERE IDCreditoPuente = @IDCreditoPuente
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            );

            INSERT INTO [pro_app].[audit_log]
                (Tabla, IDRegistro, Accion, UsuarioEmail,
                 ValorAnteriorJSON, ValorNuevoJSON, Contexto)
            VALUES
                ('pro_app.credito_puente', @IDCreditoPuente, 'UPDATE', @UsuarioEmail,
                 @ValorAnteriorUpd, @ValorNuevoUpd,
                 CONCAT('Credito puente ', @IDCreditoPuente, ' actualizado'));
        END;

        COMMIT TRANSACTION;

        SELECT @IDCreditoPuente AS IDCreditoPuente;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_actualizar_credito_puente_lote]
    @IDCreditoPuenteLote              INT = NULL,
    @IDCreditoPuente                  INT,
    @IDLote                           INT,
    @MontoResponsabilidadTeorica_CRC  MONEY,
    @GastosFormalizacionLote_CRC      MONEY = NULL,
    @GastosFormalizacionOverride      BIT = 0,
    @Estado                           VARCHAR(30) = 'PENDIENTE',
    @FechaCancelacionAlBanco          DATE = NULL,
    @MontoCanceladoAlBanco_CRC        MONEY = NULL,
    @Notas                            NVARCHAR(500) = NULL,
    @UsuarioEmail                     NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM [pro_app].[credito_puente] WHERE IDCreditoPuente = @IDCreditoPuente)
        THROW 52006, 'IDCreditoPuente no existe.', 1;
    IF NOT EXISTS (SELECT 1 FROM pro_ventas.Lotes WHERE IDLote = @IDLote)
        THROW 52008, 'IDLote no existe en pro_ventas.Lotes.', 1;
    IF @MontoResponsabilidadTeorica_CRC IS NULL OR @MontoResponsabilidadTeorica_CRC <= 0
        THROW 52009, 'MontoResponsabilidadTeorica_CRC debe ser mayor a cero.', 1;
    IF @Estado NOT IN ('PENDIENTE','CANCELACION_PROGRAMADA','CANCELACION_CONFIRMADA')
        THROW 52010, 'Estado invalido. Use PENDIENTE o CANCELACION_PROGRAMADA. Para CANCELACION_CONFIRMADA usa sp_confirmar_cancelacion_lote_cp.', 1;
    -- Este SP no acepta CONFIRMADA directamente; se debe pasar por sp_confirmar.
    IF @Estado = 'CANCELACION_CONFIRMADA'
        THROW 52017, 'Para confirmar la cancelacion usa sp_confirmar_cancelacion_lote_cp.', 1;
    IF @Estado = 'CANCELACION_PROGRAMADA' AND @FechaCancelacionAlBanco IS NULL
        THROW 52011, 'FechaCancelacionAlBanco es obligatoria si Estado=CANCELACION_PROGRAMADA.', 1;
    IF @Estado = 'CANCELACION_PROGRAMADA' AND (@MontoCanceladoAlBanco_CRC IS NULL OR @MontoCanceladoAlBanco_CRC < 0)
        THROW 52015, 'MontoCanceladoAlBanco_CRC es obligatorio y >= 0 si Estado=CANCELACION_PROGRAMADA.', 1;
    IF @GastosFormalizacionOverride = 1 AND (@GastosFormalizacionLote_CRC IS NULL OR @GastosFormalizacionLote_CRC < 0)
        THROW 52012, 'Si GastosFormalizacionOverride=1, GastosFormalizacionLote_CRC debe ser >= 0.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @EstadoAnterior VARCHAR(30) = NULL;

        IF @IDCreditoPuenteLote IS NULL
        BEGIN
            -- INSERT
            INSERT INTO [pro_app].[credito_puente_lote]
                (IDCreditoPuente, IDLote, MontoResponsabilidadTeorica_CRC,
                 GastosFormalizacionLote_CRC, GastosFormalizacionOverride,
                 Estado, FechaCancelacionAlBanco, MontoCanceladoAlBanco_CRC,
                 Notas, CreadoPor)
            VALUES
                (@IDCreditoPuente, @IDLote, @MontoResponsabilidadTeorica_CRC,
                 @GastosFormalizacionLote_CRC, @GastosFormalizacionOverride,
                 @Estado, @FechaCancelacionAlBanco, @MontoCanceladoAlBanco_CRC,
                 @Notas, @UsuarioEmail);

            SET @IDCreditoPuenteLote = SCOPE_IDENTITY();

            DECLARE @ValorNuevoIns NVARCHAR(MAX) = (
                SELECT IDCreditoPuenteLote = @IDCreditoPuenteLote,
                       IDCreditoPuente = @IDCreditoPuente, IDLote = @IDLote,
                       MontoResponsabilidadTeorica_CRC = @MontoResponsabilidadTeorica_CRC,
                       GastosFormalizacionLote_CRC = @GastosFormalizacionLote_CRC,
                       GastosFormalizacionOverride = @GastosFormalizacionOverride,
                       Estado = @Estado, Notas = @Notas
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            );

            INSERT INTO [pro_app].[audit_log]
                (Tabla, IDRegistro, Accion, UsuarioEmail,
                 ValorAnteriorJSON, ValorNuevoJSON, Contexto)
            VALUES
                ('pro_app.credito_puente_lote', @IDCreditoPuenteLote, 'INSERT', @UsuarioEmail,
                 NULL, @ValorNuevoIns,
                 CONCAT('Lote ', @IDLote, ' agregado al credito puente ', @IDCreditoPuente));
        END
        ELSE
        BEGIN
            -- UPDATE
            IF NOT EXISTS (SELECT 1 FROM [pro_app].[credito_puente_lote] WHERE IDCreditoPuenteLote = @IDCreditoPuenteLote)
                THROW 52013, 'IDCreditoPuenteLote no existe.', 1;

            SELECT @EstadoAnterior = Estado
            FROM [pro_app].[credito_puente_lote]
            WHERE IDCreditoPuenteLote = @IDCreditoPuenteLote;

            -- Si esta en CONFIRMADA, este SP no permite tocar (debe revertirse primero).
            IF @EstadoAnterior = 'CANCELACION_CONFIRMADA'
                THROW 52018, 'No se puede modificar un lote con cancelacion confirmada. Usa sp_revertir_confirmacion_lote_cp primero.', 1;

            DECLARE @ValorAnteriorUpd NVARCHAR(MAX) = (
                SELECT IDCreditoPuenteLote, IDCreditoPuente, IDLote,
                       MontoResponsabilidadTeorica_CRC,
                       GastosFormalizacionLote_CRC, GastosFormalizacionOverride,
                       Estado, FechaCancelacionAlBanco, MontoCanceladoAlBanco_CRC,
                       Notas
                FROM [pro_app].[credito_puente_lote]
                WHERE IDCreditoPuenteLote = @IDCreditoPuenteLote
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            );

            UPDATE [pro_app].[credito_puente_lote]
            SET    IDCreditoPuente                 = @IDCreditoPuente,
                   IDLote                          = @IDLote,
                   MontoResponsabilidadTeorica_CRC = @MontoResponsabilidadTeorica_CRC,
                   GastosFormalizacionLote_CRC     = @GastosFormalizacionLote_CRC,
                   GastosFormalizacionOverride     = @GastosFormalizacionOverride,
                   Estado                          = @Estado,
                   FechaCancelacionAlBanco         = @FechaCancelacionAlBanco,
                   MontoCanceladoAlBanco_CRC       = @MontoCanceladoAlBanco_CRC,
                   Notas                           = @Notas,
                   ModificadoPor                   = @UsuarioEmail,
                   FechaModificacion               = SYSUTCDATETIME()
            WHERE  IDCreditoPuenteLote = @IDCreditoPuenteLote;

            DECLARE @ValorNuevoUpd NVARCHAR(MAX) = (
                SELECT IDCreditoPuenteLote, IDCreditoPuente, IDLote,
                       MontoResponsabilidadTeorica_CRC,
                       GastosFormalizacionLote_CRC, GastosFormalizacionOverride,
                       Estado, FechaCancelacionAlBanco, MontoCanceladoAlBanco_CRC,
                       Notas
                FROM [pro_app].[credito_puente_lote]
                WHERE IDCreditoPuenteLote = @IDCreditoPuenteLote
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            );

            INSERT INTO [pro_app].[audit_log]
                (Tabla, IDRegistro, Accion, UsuarioEmail,
                 ValorAnteriorJSON, ValorNuevoJSON, Contexto)
            VALUES
                ('pro_app.credito_puente_lote', @IDCreditoPuenteLote, 'UPDATE', @UsuarioEmail,
                 @ValorAnteriorUpd, @ValorNuevoUpd,
                 CONCAT('Lote credito puente ', @IDCreditoPuenteLote, ' actualizado'));

            -- Auto-cancelacion / reactivacion de hitos del lote.
            -- Si Estado paso de PENDIENTE a CANCELACION_PROGRAMADA: cancelar
            -- hitos PLANEADOS. Si paso de PROGRAMADA a PENDIENTE: reactivar
            -- hitos CANCELADO sin actividad real.
            IF @EstadoAnterior = 'PENDIENTE' AND @Estado = 'CANCELACION_PROGRAMADA'
            BEGIN
                UPDATE cplh
                SET    EstadoTramite = 'CANCELADO',
                       ModificadoPor = @UsuarioEmail,
                       FechaModificacion = SYSUTCDATETIME()
                FROM   [pro_app].[credito_puente_lote_hito] cplh
                WHERE  cplh.IDCreditoPuenteLote = @IDCreditoPuenteLote
                   AND cplh.EstadoTramite = 'PLANEADO';

                IF @@ROWCOUNT > 0
                BEGIN
                    INSERT INTO [pro_app].[audit_log]
                        (Tabla, IDRegistro, Accion, UsuarioEmail, ValorNuevoJSON, Contexto)
                    VALUES
                        ('pro_app.credito_puente_lote_hito', @IDCreditoPuenteLote, 'UPDATE', @UsuarioEmail,
                         (SELECT EstadoTramite = 'CANCELADO' FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                         CONCAT('Auto-cancelacion de hitos PLANEADO al programar cancelacion del lote CP ',
                                @IDCreditoPuenteLote, ' (Fase 6.3)'));
                END
            END

            IF @EstadoAnterior = 'CANCELACION_PROGRAMADA' AND @Estado = 'PENDIENTE'
            BEGIN
                UPDATE cplh
                SET    EstadoTramite = 'PLANEADO',
                       ModificadoPor = @UsuarioEmail,
                       FechaModificacion = SYSUTCDATETIME()
                FROM   [pro_app].[credito_puente_lote_hito] cplh
                WHERE  cplh.IDCreditoPuenteLote = @IDCreditoPuenteLote
                   AND cplh.EstadoTramite = 'CANCELADO'
                   AND cplh.FechaRealDesembolso IS NULL
                   AND NOT EXISTS (
                       SELECT 1 FROM [pro_app].[credito_puente_link] lk
                       WHERE lk.IDCreditoPuenteLoteHito = cplh.IDCreditoPuenteLoteHito
                   );

                IF @@ROWCOUNT > 0
                BEGIN
                    INSERT INTO [pro_app].[audit_log]
                        (Tabla, IDRegistro, Accion, UsuarioEmail, ValorNuevoJSON, Contexto)
                    VALUES
                        ('pro_app.credito_puente_lote_hito', @IDCreditoPuenteLote, 'UPDATE', @UsuarioEmail,
                         (SELECT EstadoTramite = 'PLANEADO' FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                         CONCAT('Reactivacion de hitos al revertir programacion del lote CP ',
                                @IDCreditoPuenteLote, ' (Fase 6.3)'));
                END
            END
        END;

        COMMIT TRANSACTION;

        SELECT @IDCreditoPuenteLote AS IDCreditoPuenteLote;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_actualizar_credito_puente_movimiento]
    @IDMovCP             INT = NULL,           -- NULL = INSERT
    @IDCreditoPuente     INT,
    @FechaMovimiento     DATE,
    @MontoColones        MONEY,
    @Concepto            NVARCHAR(200) = NULL,
    @NumeroComprobante   NVARCHAR(50)  = NULL,
    @Estado              VARCHAR(20)   = 'REGISTRADO',
    @Notas               NVARCHAR(500) = NULL,
    @UsuarioEmail        NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM [pro_app].[credito_puente] WHERE IDCreditoPuente = @IDCreditoPuente)
        THROW 52100, 'IDCreditoPuente no existe.', 1;

    IF @MontoColones IS NULL OR @MontoColones <= 0
        THROW 52101, 'MontoColones debe ser mayor a cero.', 1;

    IF @Estado NOT IN ('REGISTRADO', 'ANULADO')
        THROW 52102, 'Estado invalido. Debe ser REGISTRADO o ANULADO.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = NULL;
        DECLARE @Accion VARCHAR(20);

        IF @IDMovCP IS NULL
        BEGIN
            -- INSERT
            INSERT INTO [pro_app].[credito_puente_movimiento]
                (IDCreditoPuente, FechaMovimiento, MontoColones, Concepto,
                 NumeroComprobante, Estado, Notas, CreadoPor)
            VALUES
                (@IDCreditoPuente, @FechaMovimiento, @MontoColones, @Concepto,
                 @NumeroComprobante, @Estado, @Notas, @UsuarioEmail);

            SET @IDMovCP = SCOPE_IDENTITY();
            SET @Accion  = 'INSERT';
        END
        ELSE
        BEGIN
            -- UPDATE
            IF NOT EXISTS (SELECT 1 FROM [pro_app].[credito_puente_movimiento] WHERE IDMovCP = @IDMovCP)
                THROW 52103, 'IDMovCP no existe.', 1;

            -- Bloquear cambio a ANULADO si tiene links activos
            DECLARE @EstadoActual VARCHAR(20) = (
                SELECT Estado FROM [pro_app].[credito_puente_movimiento] WHERE IDMovCP = @IDMovCP
            );

            IF @EstadoActual <> 'ANULADO' AND @Estado = 'ANULADO'
            BEGIN
                DECLARE @CantLinks INT = (
                    SELECT COUNT(*) FROM [pro_app].[credito_puente_link] WHERE IDMovCP = @IDMovCP
                );
                IF @CantLinks > 0
                    THROW 52104,
                          'No se puede anular el movimiento porque tiene links activos. Desvincula primero.',
                          1;
            END

            SET @ValorAnteriorJSON = (
                SELECT IDMovCP, IDCreditoPuente, FechaMovimiento, MontoColones,
                       Concepto, NumeroComprobante, Estado, Notas
                FROM [pro_app].[credito_puente_movimiento]
                WHERE IDMovCP = @IDMovCP
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            );

            UPDATE [pro_app].[credito_puente_movimiento]
            SET    IDCreditoPuente     = @IDCreditoPuente,
                   FechaMovimiento     = @FechaMovimiento,
                   MontoColones        = @MontoColones,
                   Concepto            = @Concepto,
                   NumeroComprobante   = @NumeroComprobante,
                   Estado              = @Estado,
                   Notas               = @Notas,
                   ModificadoPor       = @UsuarioEmail,
                   FechaModificacion   = SYSUTCDATETIME()
            WHERE  IDMovCP = @IDMovCP;

            SET @Accion = 'UPDATE';
        END

        DECLARE @ValorNuevoJSON NVARCHAR(MAX) = (
            SELECT IDMovCP, IDCreditoPuente, FechaMovimiento, MontoColones,
                   Concepto, NumeroComprobante, Estado, Notas
            FROM [pro_app].[credito_puente_movimiento]
            WHERE IDMovCP = @IDMovCP
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.credito_puente_movimiento', @IDMovCP, @Accion, @UsuarioEmail,
             @ValorAnteriorJSON, @ValorNuevoJSON,
             CONCAT('Mov CP ', @IDMovCP, ' (', @Accion, ') CP=', @IDCreditoPuente,
                    ' Monto=', CAST(@MontoColones AS NVARCHAR(40))));

        COMMIT TRANSACTION;

        SELECT @IDMovCP AS IDMovCP, @Accion AS Accion;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
-- -----------------------------------------------------------------------------
-- 8. SP sp_actualizar_distribucion_config (recreado con N entidades)
--
-- Acepta entidades como JSON: [{"IDEntidad":1,"Porcentaje":5,"Notas":"..."}, ...]
-- Cierra la vigencia anterior del proyecto y crea una nueva config + sus
-- filas de entidad. Valida que los % sumen 100.
-- -----------------------------------------------------------------------------
CREATE PROCEDURE [pro_app].[sp_actualizar_distribucion_config]
    @IDProyecto       INT,
    @PrecioInternoM2  DECIMAL(10,2),
    @Moneda           CHAR(3) = 'USD',
    @VigenteDesde     DATE,
    @Notas            NVARCHAR(500) = NULL,
    @EntidadesJSON    NVARCHAR(MAX),
    @UsuarioEmail     NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @IDProyecto IS NULL OR NOT EXISTS (SELECT 1 FROM pro_ventas.Proyecto WHERE IDProyecto = @IDProyecto)
        THROW 51100, 'IDProyecto inválido o no existe.', 1;

    IF @PrecioInternoM2 <= 0
        THROW 51000, 'PrecioInternoM2 debe ser mayor a 0.', 1;

    IF @VigenteDesde IS NULL
        THROW 51003, 'VigenteDesde es obligatorio.', 1;

    IF @EntidadesJSON IS NULL OR ISJSON(@EntidadesJSON) = 0
        THROW 51101, 'EntidadesJSON debe ser un JSON válido.', 1;

    -- Materializar el JSON a una tabla temporal para validar y reusar.
    DECLARE @entidades TABLE (
        IDEntidad   INT NOT NULL,
        Porcentaje  DECIMAL(5,2) NOT NULL,
        Notas       NVARCHAR(500) NULL
    );
    INSERT INTO @entidades (IDEntidad, Porcentaje, Notas)
    SELECT IDEntidad, Porcentaje, Notas
    FROM OPENJSON(@EntidadesJSON)
    WITH (
        IDEntidad  INT          '$.IDEntidad',
        Porcentaje DECIMAL(5,2) '$.Porcentaje',
        Notas      NVARCHAR(500) '$.Notas'
    );

    IF NOT EXISTS (SELECT 1 FROM @entidades)
        THROW 51102, 'Debe especificar al menos una entidad.', 1;

    IF EXISTS (SELECT 1 FROM @entidades WHERE Porcentaje < 0 OR Porcentaje > 100)
        THROW 51103, 'Cada Porcentaje debe estar entre 0 y 100.', 1;

    DECLARE @suma DECIMAL(7,2) = (SELECT SUM(Porcentaje) FROM @entidades);
    IF @suma <> 100
        THROW 51104, 'La suma de los porcentajes debe ser 100.', 1;

    IF EXISTS (
        SELECT 1 FROM @entidades e
        LEFT JOIN [pro_app].[catalogo_entidad_distribucion] ce ON ce.IDEntidad = e.IDEntidad
        WHERE ce.IDEntidad IS NULL OR ce.Activo = 0
    )
        THROW 51105, 'Hay IDEntidad inválido o entidad inactiva.', 1;

    IF EXISTS (SELECT 1 FROM [pro_app].[distribucion_config] WHERE IDProyecto = @IDProyecto AND VigenteDesde = @VigenteDesde)
        THROW 51004, 'Ya existe una configuración del proyecto con esa fecha de vigencia.', 1;

    DECLARE @UltimaVigenteDesde DATE = (
        SELECT MAX(VigenteDesde) FROM [pro_app].[distribucion_config]
        WHERE IDProyecto = @IDProyecto AND VigenteHasta IS NULL
    );
    IF @UltimaVigenteDesde IS NOT NULL AND @VigenteDesde <= @UltimaVigenteDesde
        THROW 51005, 'La nueva vigencia debe ser posterior a la configuración actual del proyecto.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @IDConfigCerrada INT;
        DECLARE @VigenteHastaCerrada DATE = DATEADD(DAY, -1, @VigenteDesde);

        UPDATE [pro_app].[distribucion_config]
        SET    VigenteHasta = @VigenteHastaCerrada,
               @IDConfigCerrada = IDConfig
        WHERE  IDProyecto = @IDProyecto AND VigenteHasta IS NULL;

        IF @IDConfigCerrada IS NOT NULL
        BEGIN
            INSERT INTO [pro_app].[audit_log]
                (Tabla, IDRegistro, Accion, UsuarioEmail, ValorNuevoJSON, Contexto)
            VALUES
                ('pro_app.distribucion_config', @IDConfigCerrada, 'UPDATE', @UsuarioEmail,
                 (SELECT VigenteHasta = @VigenteHastaCerrada FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                 CONCAT('Cierre de vigencia por nueva configuración del proyecto ', @IDProyecto));
        END;

        DECLARE @NuevoID INT;
        INSERT INTO [pro_app].[distribucion_config]
            (IDProyecto, PrecioInternoM2, Moneda, VigenteDesde, VigenteHasta, Notas)
        VALUES
            (@IDProyecto, @PrecioInternoM2, @Moneda, @VigenteDesde, NULL, @Notas);
        SET @NuevoID = SCOPE_IDENTITY();

        INSERT INTO [pro_app].[distribucion_config_entidad] (IDConfig, IDEntidad, Porcentaje, Notas)
        SELECT @NuevoID, IDEntidad, Porcentaje, Notas FROM @entidades;

        DECLARE @ValorJSON NVARCHAR(MAX) = (
            SELECT IDProyecto = @IDProyecto,
                   PrecioInternoM2 = @PrecioInternoM2,
                   Moneda = @Moneda,
                   VigenteDesde = @VigenteDesde,
                   Notas = @Notas,
                   Entidades = JSON_QUERY(@EntidadesJSON)
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.distribucion_config', @NuevoID, 'INSERT', @UsuarioEmail,
             @ValorJSON, CONCAT('Nueva configuración de distribución para proyecto ', @IDProyecto));

        COMMIT TRANSACTION;

        SELECT @NuevoID AS IDConfigCreado, @IDConfigCerrada AS IDConfigCerrado;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_actualizar_esquema_banco]
    @IDBan                INT,
    @VigenteDesde         DATE,
    @DiaSemanaPeritoFijo  TINYINT = NULL,
    @Notas                NVARCHAR(500) = NULL,
    @HitosJSON            NVARCHAR(MAX),
    @UsuarioEmail         NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @IDBan IS NULL OR NOT EXISTS (SELECT 1 FROM pro_ventas.Bancos WHERE IDBan = @IDBan)
        THROW 51300, 'IDBan invalido o no existe.', 1;

    IF @VigenteDesde IS NULL
        THROW 51301, 'VigenteDesde es obligatorio.', 1;

    IF @DiaSemanaPeritoFijo IS NOT NULL AND (@DiaSemanaPeritoFijo < 1 OR @DiaSemanaPeritoFijo > 7)
        THROW 51302, 'DiaSemanaPeritoFijo debe estar entre 1 y 7.', 1;

    IF @HitosJSON IS NULL OR ISJSON(@HitosJSON) = 0
        THROW 51303, 'HitosJSON debe ser un JSON valido.', 1;

    DECLARE @hitos TABLE (
        IDHito                    INT NOT NULL,
        OrdenEnEsquema            INT NOT NULL,
        Porcentaje                DECIMAL(5,2) NOT NULL,
        DiasSolicitudVisita       INT NOT NULL,
        DiasDesembolsoPostVisita  INT NOT NULL,
        Notas                     NVARCHAR(500) NULL
    );
    INSERT INTO @hitos (IDHito, OrdenEnEsquema, Porcentaje, DiasSolicitudVisita, DiasDesembolsoPostVisita, Notas)
    SELECT IDHito, OrdenEnEsquema, Porcentaje, DiasSolicitudVisita, DiasDesembolsoPostVisita, Notas
    FROM OPENJSON(@HitosJSON)
    WITH (
        IDHito                   INT          '$.IDHito',
        OrdenEnEsquema           INT          '$.OrdenEnEsquema',
        Porcentaje               DECIMAL(5,2) '$.Porcentaje',
        DiasSolicitudVisita      INT          '$.DiasSolicitudVisita',
        DiasDesembolsoPostVisita INT          '$.DiasDesembolsoPostVisita',
        Notas                    NVARCHAR(500) '$.Notas'
    );

    IF NOT EXISTS (SELECT 1 FROM @hitos)
        THROW 51304, 'Debe especificar al menos un hito.', 1;

    IF EXISTS (SELECT 1 FROM @hitos WHERE Porcentaje <= 0 OR Porcentaje > 100)
        THROW 51305, 'Cada Porcentaje debe ser > 0 y <= 100.', 1;

    DECLARE @suma DECIMAL(7,2) = (SELECT SUM(Porcentaje) FROM @hitos);
    IF @suma <> 100
        THROW 51306, 'La suma de los porcentajes debe ser 100 (los hitos fijos no se incluyen en este calculo).', 1;

    IF EXISTS (
        SELECT 1 FROM @hitos h
        LEFT JOIN [pro_app].[catalogo_hito] ch ON ch.IDHito = h.IDHito
        WHERE ch.IDHito IS NULL OR ch.Activo = 0
    )
        THROW 51307, 'Hay IDHito invalido o hito inactivo.', 1;

    IF EXISTS (
        SELECT 1 FROM @hitos h
        WHERE EXISTS (
            SELECT 1 FROM [pro_app].[banco_esquema_desembolso] e
            WHERE e.IDBan = @IDBan AND e.IDHito = h.IDHito AND e.EsMontoFijo = 1
        )
    )
        THROW 51310,
              'No se pueden enviar hitos con EsMontoFijo en el JSON; se preservan automaticamente.',
              1;

    -- Tampoco permitir enviar el hito LOTE en el JSON (es siempre fijo).
    DECLARE @IDHitoLote INT = (SELECT IDHito FROM [pro_app].[catalogo_hito] WHERE Codigo = 'LOTE');
    IF @IDHitoLote IS NOT NULL AND EXISTS (SELECT 1 FROM @hitos WHERE IDHito = @IDHitoLote)
        THROW 51311,
              'No se puede enviar el hito LOTE en el JSON; es siempre fijo y se auto-inserta.',
              1;

    IF EXISTS (SELECT 1 FROM [pro_app].[banco_esquema_desembolso] WHERE IDBan = @IDBan AND VigenteDesde = @VigenteDesde)
        THROW 51308, 'Ya existe un esquema del banco con esa fecha de vigencia.', 1;

    DECLARE @UltimaVigenteDesde DATE = (
        SELECT MAX(VigenteDesde) FROM [pro_app].[banco_esquema_desembolso]
        WHERE IDBan = @IDBan AND VigenteHasta IS NULL
    );
    IF @UltimaVigenteDesde IS NOT NULL AND @VigenteDesde <= @UltimaVigenteDesde
        THROW 51309, 'La nueva vigencia debe ser posterior a la del esquema actual del banco.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Capturar fijos vigentes
        DECLARE @HitosFijos TABLE (
            IDHito                    INT NOT NULL,
            OrdenEnEsquema            INT NOT NULL,
            PorcentajeDesembolso      DECIMAL(5,2) NOT NULL,
            DiasSolicitudVisita       INT NOT NULL,
            DiasDesembolsoPostVisita  INT NOT NULL,
            DiaSemanaPeritoFijo       TINYINT NULL,
            Notas                     NVARCHAR(500) NULL
        );
        INSERT INTO @HitosFijos
        SELECT IDHito, OrdenEnEsquema, PorcentajeDesembolso,
               DiasSolicitudVisita, DiasDesembolsoPostVisita,
               DiaSemanaPeritoFijo, Notas
        FROM [pro_app].[banco_esquema_desembolso]
        WHERE IDBan = @IDBan AND VigenteHasta IS NULL AND EsMontoFijo = 1;

        -- Auto-asegurar LOTE como fijo (si no esta ya). Esto cubre bancos
        -- nuevos o bancos que perdieron LOTE.
        IF @IDHitoLote IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM @HitosFijos WHERE IDHito = @IDHitoLote)
        BEGIN
            INSERT INTO @HitosFijos
                (IDHito, OrdenEnEsquema, PorcentajeDesembolso,
                 DiasSolicitudVisita, DiasDesembolsoPostVisita,
                 DiaSemanaPeritoFijo, Notas)
            VALUES
                (@IDHitoLote, 0, 0, 0, 0, NULL,
                 N'Hito virtual: lote bancario (monto fijo). Auto-creado por SP.');
        END

        DECLARE @VigenteHastaCerrada DATE = DATEADD(DAY, -1, @VigenteDesde);
        DECLARE @CantCerradas INT = 0;

        UPDATE [pro_app].[banco_esquema_desembolso]
        SET    VigenteHasta = @VigenteHastaCerrada
        WHERE  IDBan = @IDBan AND VigenteHasta IS NULL;
        SET @CantCerradas = @@ROWCOUNT;

        IF @CantCerradas > 0
        BEGIN
            INSERT INTO [pro_app].[audit_log]
                (Tabla, IDRegistro, Accion, UsuarioEmail, ValorNuevoJSON, Contexto)
            VALUES
                ('pro_app.banco_esquema_desembolso', @IDBan, 'UPDATE', @UsuarioEmail,
                 (SELECT VigenteHasta = @VigenteHastaCerrada, FilasCerradas = @CantCerradas FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                 CONCAT('Cierre de esquema vigente del banco ', @IDBan));
        END;

        INSERT INTO [pro_app].[banco_esquema_desembolso]
            (IDBan, IDHito, OrdenEnEsquema, PorcentajeDesembolso,
             DiasSolicitudVisita, DiasDesembolsoPostVisita, DiaSemanaPeritoFijo,
             EsMontoFijo, Notas, VigenteDesde, VigenteHasta)
        SELECT
            @IDBan, h.IDHito, h.OrdenEnEsquema, h.Porcentaje,
            h.DiasSolicitudVisita, h.DiasDesembolsoPostVisita, @DiaSemanaPeritoFijo,
            0,
            ISNULL(h.Notas, @Notas), @VigenteDesde, NULL
        FROM @hitos h;

        INSERT INTO [pro_app].[banco_esquema_desembolso]
            (IDBan, IDHito, OrdenEnEsquema, PorcentajeDesembolso,
             DiasSolicitudVisita, DiasDesembolsoPostVisita, DiaSemanaPeritoFijo,
             EsMontoFijo, Notas, VigenteDesde, VigenteHasta)
        SELECT
            @IDBan, IDHito, OrdenEnEsquema, PorcentajeDesembolso,
            DiasSolicitudVisita, DiasDesembolsoPostVisita, @DiaSemanaPeritoFijo,
            1,
            Notas, @VigenteDesde, NULL
        FROM @HitosFijos;

        DECLARE @ValorNuevoJSON NVARCHAR(MAX) = (
            SELECT IDBan = @IDBan,
                   VigenteDesde = @VigenteDesde,
                   DiaSemanaPeritoFijo = @DiaSemanaPeritoFijo,
                   Notas = @Notas,
                   Hitos = JSON_QUERY(@HitosJSON),
                   HitosFijosPreservadosOAutoInsertados = (SELECT COUNT(*) FROM @HitosFijos)
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.banco_esquema_desembolso', @IDBan, 'INSERT', @UsuarioEmail,
             @ValorNuevoJSON,
             CONCAT('Nueva version de esquema banco ', @IDBan,
                    ' vigente desde ', CONVERT(VARCHAR(10), @VigenteDesde, 23)));

        COMMIT TRANSACTION;

        SELECT @IDBan AS IDBanCreado, @VigenteDesde AS VigenteDesde,
               @CantCerradas AS FilasCerradas;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_actualizar_esquema_credito_puente]
    @IDCreditoPuente  INT,
    @HitosJSON        NVARCHAR(MAX),  -- [{IDHito, OrdenEnEsquema, Porcentaje, DiasSolicitudVisita, DiasDesembolsoPostVisita, DiaSemanaPeritoFijo, Notas}, ...]
    @UsuarioEmail     NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM [pro_app].[credito_puente] WHERE IDCreditoPuente = @IDCreditoPuente)
        THROW 52050, 'IDCreditoPuente no existe.', 1;
    IF @HitosJSON IS NULL OR LEN(@HitosJSON) = 0
        THROW 52051, 'HitosJSON es obligatorio (array, puede ser vacio para borrar todo).', 1;

    -- Parsear JSON a tabla temporal
    DECLARE @Hitos TABLE (
        IDHito INT,
        OrdenEnEsquema INT,
        Porcentaje DECIMAL(5,2),
        DiasSolicitudVisita INT,
        DiasDesembolsoPostVisita INT,
        DiaSemanaPeritoFijo TINYINT NULL,
        Notas NVARCHAR(500) NULL
    );

    INSERT INTO @Hitos (IDHito, OrdenEnEsquema, Porcentaje, DiasSolicitudVisita,
                        DiasDesembolsoPostVisita, DiaSemanaPeritoFijo, Notas)
    SELECT
        IDHito, OrdenEnEsquema, Porcentaje,
        ISNULL(DiasSolicitudVisita, 0),
        ISNULL(DiasDesembolsoPostVisita, 0),
        DiaSemanaPeritoFijo,
        Notas
    FROM OPENJSON(@HitosJSON)
    WITH (
        IDHito INT,
        OrdenEnEsquema INT,
        Porcentaje DECIMAL(5,2),
        DiasSolicitudVisita INT,
        DiasDesembolsoPostVisita INT,
        DiaSemanaPeritoFijo TINYINT,
        Notas NVARCHAR(500)
    );

    -- Validar: si hay hitos, suma debe ser 100
    DECLARE @CantHitos INT = (SELECT COUNT(*) FROM @Hitos);
    IF @CantHitos > 0
    BEGIN
        DECLARE @Suma DECIMAL(7,2) = (SELECT SUM(Porcentaje) FROM @Hitos);
        IF ABS(@Suma - 100) > 0.01
            THROW 52052, 'La suma de los porcentajes debe ser 100.', 1;
    END

    -- Validar: hitos referenciados existen y estan activos
    IF EXISTS (
        SELECT 1 FROM @Hitos h
        LEFT JOIN [pro_app].[catalogo_hito] ch ON ch.IDHito = h.IDHito
        WHERE ch.IDHito IS NULL OR ch.Activo = 0
    )
        THROW 52053, 'Algun IDHito no existe o esta inactivo.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Snapshot anterior para audit
        DECLARE @Anterior NVARCHAR(MAX) = (
            SELECT IDHito, OrdenEnEsquema, Porcentaje, DiasSolicitudVisita,
                   DiasDesembolsoPostVisita, DiaSemanaPeritoFijo
            FROM [pro_app].[credito_puente_esquema_hito]
            WHERE IDCreditoPuente = @IDCreditoPuente
            ORDER BY OrdenEnEsquema
            FOR JSON PATH
        );

        -- DELETE + INSERT (es mas simple que UPSERT con N filas)
        DELETE FROM [pro_app].[credito_puente_esquema_hito]
        WHERE IDCreditoPuente = @IDCreditoPuente;

        INSERT INTO [pro_app].[credito_puente_esquema_hito]
            (IDCreditoPuente, IDHito, OrdenEnEsquema, Porcentaje,
             DiasSolicitudVisita, DiasDesembolsoPostVisita, DiaSemanaPeritoFijo,
             Notas, CreadoPor)
        SELECT
            @IDCreditoPuente, IDHito, OrdenEnEsquema, Porcentaje,
            DiasSolicitudVisita, DiasDesembolsoPostVisita, DiaSemanaPeritoFijo,
            Notas, @UsuarioEmail
        FROM @Hitos;

        -- Materializar/sincronizar credito_puente_lote_hito para todos los lotes
        -- existentes del credito.
        --   - Si hay un hito en el esquema y no en lote_hito → INSERT con fechas NULL.
        --   - Si hay un hito en lote_hito que ya no esta en el esquema → DELETE
        --     SOLO si EstadoTramite='PLANEADO' y todas las fechas son NULL (no
        --     queremos perder data capturada).
        DECLARE @lotes TABLE (IDCreditoPuenteLote INT);
        INSERT INTO @lotes (IDCreditoPuenteLote)
        SELECT IDCreditoPuenteLote FROM [pro_app].[credito_puente_lote]
        WHERE IDCreditoPuente = @IDCreditoPuente;

        -- INSERT hitos faltantes
        INSERT INTO [pro_app].[credito_puente_lote_hito]
            (IDCreditoPuenteLote, IDHito, EstadoTramite, CreadoPor)
        SELECT
            l.IDCreditoPuenteLote, h.IDHito, 'PLANEADO', @UsuarioEmail
        FROM @lotes l
        CROSS JOIN @Hitos h
        WHERE NOT EXISTS (
            SELECT 1 FROM [pro_app].[credito_puente_lote_hito] cplh
            WHERE cplh.IDCreditoPuenteLote = l.IDCreditoPuenteLote
              AND cplh.IDHito = h.IDHito
        );

        -- DELETE huerfanos (hito sacado del esquema, sin actividad capturada)
        DELETE cplh
        FROM [pro_app].[credito_puente_lote_hito] cplh
        INNER JOIN @lotes l ON l.IDCreditoPuenteLote = cplh.IDCreditoPuenteLote
        WHERE cplh.IDHito NOT IN (SELECT IDHito FROM @Hitos)
          AND cplh.EstadoTramite = 'PLANEADO'
          AND cplh.FechaPlaneadaHito IS NULL
          AND cplh.FechaPlaneadaVisitaPerito IS NULL
          AND cplh.FechaProyectadaDesembolso IS NULL
          AND cplh.FechaRealHito IS NULL
          AND cplh.FechaRealVisitaPerito IS NULL
          AND cplh.FechaRealDesembolso IS NULL;

        -- Audit
        DECLARE @Nuevo NVARCHAR(MAX) = (
            SELECT IDHito, OrdenEnEsquema, Porcentaje, DiasSolicitudVisita,
                   DiasDesembolsoPostVisita, DiaSemanaPeritoFijo
            FROM @Hitos
            ORDER BY OrdenEnEsquema
            FOR JSON PATH
        );

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.credito_puente_esquema_hito', @IDCreditoPuente, 'UPDATE', @UsuarioEmail,
             @Anterior, @Nuevo,
             CONCAT('Esquema CP ', @IDCreditoPuente, ' actualizado (', @CantHitos, ' hitos)'));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_actualizar_extra]
    @IDExtra          INT,
    @Descripcion      NVARCHAR(500) = NULL,
    @MontoAjuste_CRC  MONEY         = NULL,
    @FechaCotizacion  DATE          = NULL,
    @Notas            NVARCHAR(1000) = NULL,
    @UsuarioEmail     NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Estado VARCHAR(20), @IDCaso INT;
    SELECT @Estado = Estado, @IDCaso = IDCaso
    FROM [pro_app].[caso_extra] WHERE IDExtra = @IDExtra;

    IF @Estado IS NULL
        THROW 52004, 'IDExtra no existe.', 1;
    IF @Estado <> 'COTIZADA'
        THROW 52005, 'Solo se puede editar una extra en estado COTIZADA. Para cambios sobre aprobadas, rechazá y volvé a crear.', 1;
    IF @MontoAjuste_CRC IS NOT NULL AND @MontoAjuste_CRC <= 0
        THROW 52002, 'MontoAjuste_CRC debe ser mayor a cero.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
            SELECT IDExtra, IDCaso, Tipo, Descripcion, MontoAjuste_CRC,
                   FechaCotizacion, Estado, Notas
            FROM [pro_app].[caso_extra]
            WHERE IDExtra = @IDExtra
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        UPDATE [pro_app].[caso_extra]
        SET    Descripcion       = COALESCE(@Descripcion, Descripcion),
               MontoAjuste_CRC   = COALESCE(@MontoAjuste_CRC, MontoAjuste_CRC),
               FechaCotizacion   = COALESCE(@FechaCotizacion, FechaCotizacion),
               Notas             = COALESCE(@Notas, Notas),
               ModificadoPor     = @UsuarioEmail,
               FechaModificacion = SYSUTCDATETIME()
        WHERE  IDExtra = @IDExtra;

        DECLARE @ValorNuevoJSON NVARCHAR(MAX) = (
            SELECT IDExtra, IDCaso, Tipo, Descripcion, MontoAjuste_CRC,
                   FechaCotizacion, Estado, Notas
            FROM [pro_app].[caso_extra]
            WHERE IDExtra = @IDExtra
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.caso_extra', @IDExtra, 'UPDATE', @UsuarioEmail,
             @ValorAnteriorJSON, @ValorNuevoJSON,
             CONCAT('Edición extra ', @IDExtra));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_actualizar_lote_hito_credito_puente]
    @IDCreditoPuenteLoteHito    INT,
    @FechaPlaneadaHito          DATE = NULL,
    @FechaPlaneadaVisitaPerito  DATE = NULL,
    @FechaProyectadaDesembolso  DATE = NULL,
    @FechaRealHito              DATE = NULL,
    @FechaRealVisitaPerito      DATE = NULL,
    @FechaRealDesembolso        DATE = NULL,
    @EstadoTramite              VARCHAR(30) = NULL,
    @Notas                      NVARCHAR(500) = NULL,
    @UsuarioEmail               NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM [pro_app].[credito_puente_lote_hito] WHERE IDCreditoPuenteLoteHito = @IDCreditoPuenteLoteHito)
        THROW 52054, 'IDCreditoPuenteLoteHito no existe.', 1;

    IF @EstadoTramite IS NOT NULL
       AND @EstadoTramite NOT IN ('PLANEADO','VISITA_SOLICITADA','VISITA_REALIZADA','DESEMBOLSADO','CANCELADO')
        THROW 52055, 'EstadoTramite invalido.', 1;

    -- Bloqueo: si hay links activos, no permitir cambio a estado != DESEMBOLSADO
    IF @EstadoTramite IS NOT NULL AND @EstadoTramite <> 'DESEMBOLSADO'
    BEGIN
        DECLARE @CantLinksActivos INT = (
            SELECT COUNT(*) FROM [pro_app].[credito_puente_link]
            WHERE IDCreditoPuenteLoteHito = @IDCreditoPuenteLoteHito
        );
        IF @CantLinksActivos > 0
            THROW 52121,
                  'No se puede cambiar el estado del hito porque tiene movimientos vinculados. Desvincula primero.',
                  1;
    END

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @Anterior NVARCHAR(MAX) = (
            SELECT IDCreditoPuenteLoteHito, IDCreditoPuenteLote, IDHito,
                   FechaPlaneadaHito, FechaPlaneadaVisitaPerito, FechaProyectadaDesembolso,
                   FechaRealHito, FechaRealVisitaPerito, FechaRealDesembolso,
                   EstadoTramite, Notas
            FROM [pro_app].[credito_puente_lote_hito]
            WHERE IDCreditoPuenteLoteHito = @IDCreditoPuenteLoteHito
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        UPDATE [pro_app].[credito_puente_lote_hito]
        SET    FechaPlaneadaHito         = @FechaPlaneadaHito,
               FechaPlaneadaVisitaPerito = @FechaPlaneadaVisitaPerito,
               FechaProyectadaDesembolso = @FechaProyectadaDesembolso,
               FechaRealHito             = @FechaRealHito,
               FechaRealVisitaPerito     = @FechaRealVisitaPerito,
               FechaRealDesembolso       = @FechaRealDesembolso,
               EstadoTramite             = COALESCE(@EstadoTramite, EstadoTramite),
               Notas                     = @Notas,
               ModificadoPor             = @UsuarioEmail,
               FechaModificacion         = SYSUTCDATETIME()
        WHERE  IDCreditoPuenteLoteHito = @IDCreditoPuenteLoteHito;

        DECLARE @Nuevo NVARCHAR(MAX) = (
            SELECT IDCreditoPuenteLoteHito, IDCreditoPuenteLote, IDHito,
                   FechaPlaneadaHito, FechaPlaneadaVisitaPerito, FechaProyectadaDesembolso,
                   FechaRealHito, FechaRealVisitaPerito, FechaRealDesembolso,
                   EstadoTramite, Notas
            FROM [pro_app].[credito_puente_lote_hito]
            WHERE IDCreditoPuenteLoteHito = @IDCreditoPuenteLoteHito
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.credito_puente_lote_hito', @IDCreditoPuenteLoteHito, 'UPDATE', @UsuarioEmail,
             @Anterior, @Nuevo,
             CONCAT('Hito de lote CP ', @IDCreditoPuenteLoteHito, ' actualizado'));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_actualizar_monto_financia_banco]
    @IDCaso                    INT,
    @MontoFinanciaBanco_CRC    MONEY = NULL,
    @MontoLoteFinanciado_CRC   MONEY = NULL,
    @LoteHistoricoCobrado_CRC  MONEY = NULL,
    @PagoCliente_CRC           MONEY = NULL,
    @FechaPagoCliente          DATE  = NULL,
    @Notas                     NVARCHAR(500) = NULL,
    @UsuarioEmail              NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM pro_ventas.Casos WHERE IDCaso = @IDCaso)
        THROW 51980, 'IDCaso no existe en pro_ventas.Casos.', 1;

    IF @MontoFinanciaBanco_CRC IS NOT NULL AND @MontoFinanciaBanco_CRC < 0
        THROW 51981, 'MontoFinanciaBanco_CRC no puede ser negativo.', 1;
    IF @MontoLoteFinanciado_CRC IS NOT NULL AND @MontoLoteFinanciado_CRC < 0
        THROW 51982, 'MontoLoteFinanciado_CRC no puede ser negativo.', 1;
    IF @LoteHistoricoCobrado_CRC IS NOT NULL AND @LoteHistoricoCobrado_CRC < 0
        THROW 51985, 'LoteHistoricoCobrado_CRC no puede ser negativo.', 1;
    IF @PagoCliente_CRC IS NOT NULL AND @PagoCliente_CRC < 0
        THROW 51983, 'PagoCliente_CRC no puede ser negativo.', 1;

    IF @MontoLoteFinanciado_CRC IS NOT NULL
       AND @MontoFinanciaBanco_CRC IS NOT NULL
       AND @MontoLoteFinanciado_CRC > @MontoFinanciaBanco_CRC
        THROW 51984,
              'MontoLoteFinanciado_CRC no puede ser mayor a MontoFinanciaBanco_CRC.',
              1;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
            SELECT IDCasoLoteBanco, MontoFinanciaBanco_CRC,
                   MontoLoteFinanciado_CRC, LoteHistoricoCobrado_CRC,
                   PagoCliente_CRC, FechaPagoCliente, Notas
            FROM [pro_app].caso_lote_banco
            WHERE IDCaso = @IDCaso
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        DECLARE @IDExistente INT;
        SELECT @IDExistente = IDCasoLoteBanco
        FROM [pro_app].caso_lote_banco WHERE IDCaso = @IDCaso;

        DECLARE @Accion VARCHAR(20);
        DECLARE @IDActualizado INT;

        IF @IDExistente IS NOT NULL
        BEGIN
            UPDATE [pro_app].caso_lote_banco
            SET    MontoFinanciaBanco_CRC   = COALESCE(@MontoFinanciaBanco_CRC,   MontoFinanciaBanco_CRC),
                   MontoLoteFinanciado_CRC  = COALESCE(@MontoLoteFinanciado_CRC,  MontoLoteFinanciado_CRC),
                   LoteHistoricoCobrado_CRC = COALESCE(@LoteHistoricoCobrado_CRC, LoteHistoricoCobrado_CRC),
                   PagoCliente_CRC          = COALESCE(@PagoCliente_CRC,          PagoCliente_CRC),
                   FechaPagoCliente         = COALESCE(@FechaPagoCliente,         FechaPagoCliente),
                   Notas                    = COALESCE(@Notas,                    Notas),
                   FechaModificacion        = SYSUTCDATETIME()
            WHERE IDCasoLoteBanco = @IDExistente;
            SET @IDActualizado = @IDExistente;
            SET @Accion = 'UPDATE';
        END
        ELSE
        BEGIN
            INSERT INTO [pro_app].caso_lote_banco
                (IDCaso, MontoPagaBancoPorLote_CRC,
                 MontoFinanciaBanco_CRC, MontoLoteFinanciado_CRC,
                 LoteHistoricoCobrado_CRC,
                 PagoCliente_CRC, FechaPagoCliente, Notas)
            VALUES
                (@IDCaso, ISNULL(@MontoFinanciaBanco_CRC, 0),
                 @MontoFinanciaBanco_CRC, @MontoLoteFinanciado_CRC,
                 @LoteHistoricoCobrado_CRC,
                 @PagoCliente_CRC, @FechaPagoCliente, @Notas);
            SET @IDActualizado = SCOPE_IDENTITY();
            SET @Accion = 'INSERT';
        END

        DECLARE @ValorNuevoJSON NVARCHAR(MAX) = (
            SELECT IDCasoLoteBanco, MontoFinanciaBanco_CRC,
                   MontoLoteFinanciado_CRC, LoteHistoricoCobrado_CRC,
                   PagoCliente_CRC, FechaPagoCliente, Notas
            FROM [pro_app].caso_lote_banco
            WHERE IDCasoLoteBanco = @IDActualizado
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO [pro_app].audit_log
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.caso_lote_banco', @IDActualizado, @Accion, @UsuarioEmail,
             @ValorAnteriorJSON, @ValorNuevoJSON,
             CONCAT('Captura de préstamo bancario caso ', @IDCaso));

        COMMIT TRANSACTION;

        SELECT @IDActualizado AS IDCasoLoteBanco, @Accion AS Accion;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_actualizar_movimiento_dbo]
    @IDMovimiento                 INT,
    @IDTipmov                     INT,
    @FechaSolicitudMovimiento     DATE,
    @FechaMovimiento              DATE,
    @Moneda                       NCHAR(10),
    @TipoCambio                   MONEY,
    @MontoColones                 MONEY,
    @MontoDolares                 MONEY = NULL,
    @Depositante                  NVARCHAR(20),
    @DetalleTransferencia         NVARCHAR(250) = NULL,
    @Observaciones                NVARCHAR(MAX) = NULL,
    @AzureBlobId                  VARCHAR(120) = NULL,
    @AzureBlobURL                 VARCHAR(250) = NULL,
    @UsuarioEmail                 NVARCHAR(200)
WITH EXECUTE AS OWNER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM pro_ventas.Movimientos WHERE IDMovimiento = @IDMovimiento)
        THROW 53050, 'IDMovimiento no existe.', 1;

    DECLARE @Categoria VARCHAR(10);
    SELECT @Categoria = LTRIM(RTRIM(Categoria)) FROM pro_ventas.TipMovi WHERE IDTmov = @IDTipmov;
    IF @Categoria IS NULL
        THROW 53051, 'IDTipmov no existe.', 1;

    SET @Moneda = LEFT(LTRIM(RTRIM(@Moneda)) + REPLICATE(' ', 10), 10);
    IF LTRIM(RTRIM(@Moneda)) NOT IN ('CRC', 'USD')
        THROW 53052, 'Moneda invalida.', 1;
    IF @TipoCambio IS NULL OR @TipoCambio <= 0
        THROW 53053, 'TipoCambio debe ser > 0.', 1;
    -- Se captura positivo; el SP aplica el signo (DV -> negativo). Se usa ABS
    -- para tolerar que el form mande el valor ya negativo de una DV existente.
    IF @MontoColones IS NULL OR ABS(@MontoColones) = 0
        THROW 53054, 'MontoColones debe ser distinto de 0.', 1;

    IF @MontoDolares IS NULL AND @TipoCambio > 0
        SET @MontoDolares = @MontoColones / @TipoCambio;

    -- Convencion de signo (23-jun-2026): devoluciones (DV) en negativo, resto
    -- en positivo. ABS normaliza venga como venga del form.
    IF @Categoria = 'DV'
    BEGIN
        SET @MontoColones = -ABS(@MontoColones);
        SET @MontoDolares = -ABS(@MontoDolares);
    END
    ELSE
    BEGIN
        SET @MontoColones = ABS(@MontoColones);
        SET @MontoDolares = ABS(@MontoDolares);
    END

    IF @Depositante NOT IN ('BANCO', 'CLIENTE')
        THROW 53055, 'Depositante invalido.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @ValorAnterior NVARCHAR(MAX) = (
            SELECT IDTipmov, FechaSolicitudMovimiento, FechaMovimiento,
                   Moneda, TipoCambio, MontoColones, MontoDolares,
                   Depositante, DetalleTransferencia, Observaciones
            FROM pro_ventas.Movimientos
            WHERE IDMovimiento = @IDMovimiento
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        UPDATE pro_ventas.Movimientos
        SET    IDTipmov                  = @IDTipmov,
               FechaSolicitudMovimiento  = @FechaSolicitudMovimiento,
               FechaMovimiento           = @FechaMovimiento,
               Moneda                    = @Moneda,
               TipoCambio                = @TipoCambio,
               MontoColones              = @MontoColones,
               MontoDolares              = @MontoDolares,
               Depositante               = @Depositante,
               DetalleTransferencia      = @DetalleTransferencia,
               Observaciones             = @Observaciones,
               AzureBlobId               = ISNULL(@AzureBlobId, AzureBlobId),
               AzureBlobURL              = ISNULL(@AzureBlobURL, AzureBlobURL),
               FechaModificacion         = SYSUTCDATETIME()
        WHERE  IDMovimiento = @IDMovimiento;

        DECLARE @ValorNuevo NVARCHAR(MAX) = (
            SELECT IDTipmov, FechaSolicitudMovimiento, FechaMovimiento,
                   Moneda, TipoCambio, MontoColones, MontoDolares,
                   Depositante, DetalleTransferencia, Observaciones
            FROM pro_ventas.Movimientos
            WHERE IDMovimiento = @IDMovimiento
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_ventas.Movimientos', @IDMovimiento, 'UPDATE', @UsuarioEmail,
             @ValorAnterior, @ValorNuevo,
             CONCAT('Movimiento ', @IDMovimiento, ' actualizado desde app de Flujo'));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_actualizar_pago_cliente]
    @IDPago                 INT,
    @Concepto               VARCHAR(20)   = NULL,
    @MontoPlaneado_CRC      MONEY         = NULL,
    @FechaPlaneada          DATE          = NULL,
    @FechaReal              DATE          = NULL,
    @IDMovimientoVinculado  INT           = NULL,
    @IDExtra                INT           = NULL,
    @Notas                  NVARCHAR(500) = NULL,
    @UsuarioEmail           NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM [pro_app].[pago_cliente] WHERE IDPago = @IDPago)
        THROW 51994, 'IDPago no existe.', 1;

    IF @Concepto IS NOT NULL
       AND @Concepto NOT IN ('PRIMA','EXTRA','GASTO_ADICIONAL','CUOTA','LOTE')
        THROW 51991, 'Concepto inválido.', 1;
    IF @MontoPlaneado_CRC IS NOT NULL AND @MontoPlaneado_CRC <= 0
        THROW 51992, 'MontoPlaneado_CRC debe ser mayor a cero.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
            SELECT IDPago, IDCaso, Concepto, IDExtra, MontoPlaneado_CRC,
                   FechaPlaneada, FechaReal, IDMovimientoVinculado, Notas
            FROM [pro_app].[pago_cliente]
            WHERE IDPago = @IDPago
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        UPDATE [pro_app].[pago_cliente]
        SET    Concepto              = COALESCE(@Concepto, Concepto),
               MontoPlaneado_CRC     = COALESCE(@MontoPlaneado_CRC, MontoPlaneado_CRC),
               FechaPlaneada         = COALESCE(@FechaPlaneada, FechaPlaneada),
               FechaReal             = COALESCE(@FechaReal, FechaReal),
               IDMovimientoVinculado = COALESCE(@IDMovimientoVinculado, IDMovimientoVinculado),
               IDExtra               = COALESCE(@IDExtra, IDExtra),
               Notas                 = COALESCE(@Notas, Notas),
               ModificadoPor         = @UsuarioEmail,
               FechaModificacion     = SYSUTCDATETIME()
        WHERE  IDPago = @IDPago;

        DECLARE @ValorNuevoJSON NVARCHAR(MAX) = (
            SELECT IDPago, IDCaso, Concepto, IDExtra, MontoPlaneado_CRC,
                   FechaPlaneada, FechaReal, IDMovimientoVinculado, Notas
            FROM [pro_app].[pago_cliente]
            WHERE IDPago = @IDPago
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.pago_cliente', @IDPago, 'UPDATE', @UsuarioEmail,
             @ValorAnteriorJSON, @ValorNuevoJSON,
             CONCAT('Update pago cliente IDPago=', @IDPago));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_actualizar_proyeccion_formalizacion]
    @IDCaso          INT,
    @FechaProyectada DATE,
    @NivelConfianza  CHAR(1),
    @Notas           NVARCHAR(1000) = NULL,
    @UsuarioEmail    NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Validar caso existe y es Reservado
    IF NOT EXISTS (SELECT 1 FROM pro_ventas.Casos WHERE IDCaso = @IDCaso AND IDEstado = 4)
        THROW 51900, 'IDCaso inválido o no está en estado Reservado.', 1;

    IF @FechaProyectada IS NULL
        THROW 51901, 'FechaProyectada es obligatoria.', 1;

    IF @FechaProyectada < CAST(GETDATE() AS DATE)
        THROW 51902, 'FechaProyectada no puede ser anterior a hoy.', 1;

    IF @NivelConfianza IS NULL OR @NivelConfianza NOT IN ('A', 'M', 'B')
        THROW 51903, 'NivelConfianza debe ser A (Alta), M (Media) o B (Baja).', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Capturar valor anterior para audit (proyección activa actual)
        DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
            SELECT IDProyeccion, FechaProyectada, NivelConfianza, Notas
            FROM [pro_app].[proyeccion_formalizacion]
            WHERE IDCaso = @IDCaso AND Activa = 1
            FOR JSON PATH
        );

        -- Marcar proyecciones anteriores como inactivas
        DECLARE @CantCerradas INT;
        UPDATE [pro_app].[proyeccion_formalizacion]
        SET    Activa = 0,
               FechaModificacion = SYSUTCDATETIME()
        WHERE  IDCaso = @IDCaso AND Activa = 1;
        SET @CantCerradas = @@ROWCOUNT;

        -- Insertar la nueva proyección
        INSERT INTO [pro_app].[proyeccion_formalizacion]
            (IDCaso, FechaProyectada, NivelConfianza, Notas, Activa)
        VALUES
            (@IDCaso, @FechaProyectada, @NivelConfianza, @Notas, 1);

        DECLARE @NuevoID INT = SCOPE_IDENTITY();

        DECLARE @ValorNuevoJSON NVARCHAR(MAX) = (
            SELECT IDCaso = @IDCaso,
                   FechaProyectada = @FechaProyectada,
                   NivelConfianza = @NivelConfianza,
                   Notas = @Notas
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.proyeccion_formalizacion', @NuevoID,
             CASE WHEN @CantCerradas > 0 THEN 'UPDATE' ELSE 'INSERT' END,
             @UsuarioEmail, @ValorAnteriorJSON, @ValorNuevoJSON,
             CONCAT(
                 'Proyección de formalización del caso ', @IDCaso,
                 ' (', @CantCerradas, ' versión(es) anterior(es) marcadas inactivas)'
             ));

        COMMIT TRANSACTION;

        SELECT @NuevoID AS IDProyeccionCreada, @CantCerradas AS VersionesCerradas;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
-- -----------------------------------------------------------------------------
-- 7. SP sp_actualizar_valoracion_banco (recreado con dimensión proyecto)
-- -----------------------------------------------------------------------------
CREATE PROCEDURE [pro_app].[sp_actualizar_valoracion_banco]
    @IDProyecto                INT,
    @IDBan                     INT,
    @ValorM2Lote               DECIMAL(10,2),
    @Moneda                    CHAR(3) = 'USD',
    @PorcentajeFinanciamiento  DECIMAL(5,2),
    @VigenteDesde              DATE,
    @Notas                     NVARCHAR(500) = NULL,
    @UsuarioEmail              NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @IDProyecto IS NULL OR NOT EXISTS (SELECT 1 FROM pro_ventas.Proyecto WHERE IDProyecto = @IDProyecto)
        THROW 51200, 'IDProyecto inválido o no existe.', 1;

    IF @IDBan IS NULL OR NOT EXISTS (SELECT 1 FROM pro_ventas.Bancos WHERE IDBan = @IDBan)
        THROW 51201, 'IDBan inválido o no existe.', 1;

    IF @ValorM2Lote <= 0
        THROW 51202, 'ValorM2Lote debe ser mayor a 0.', 1;

    IF @PorcentajeFinanciamiento <= 0 OR @PorcentajeFinanciamiento > 100
        THROW 51203, 'PorcentajeFinanciamiento debe estar entre 0 y 100.', 1;

    IF @VigenteDesde IS NULL
        THROW 51204, 'VigenteDesde es obligatorio.', 1;

    IF EXISTS (
        SELECT 1 FROM [pro_app].[banco_valoracion_lote]
        WHERE IDProyecto = @IDProyecto AND IDBan = @IDBan AND VigenteDesde = @VigenteDesde
    )
        THROW 51205, 'Ya existe una valoración para ese proyecto/banco con esa fecha.', 1;

    DECLARE @UltimaVigenteDesde DATE = (
        SELECT MAX(VigenteDesde) FROM [pro_app].[banco_valoracion_lote]
        WHERE IDProyecto = @IDProyecto AND IDBan = @IDBan AND VigenteHasta IS NULL
    );
    IF @UltimaVigenteDesde IS NOT NULL AND @VigenteDesde <= @UltimaVigenteDesde
        THROW 51206, 'La nueva vigencia debe ser posterior a la valoración actual del proyecto/banco.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @IDValoracionCerrada INT;
        DECLARE @VigenteHastaCerrada DATE = DATEADD(DAY, -1, @VigenteDesde);

        UPDATE [pro_app].[banco_valoracion_lote]
        SET    VigenteHasta = @VigenteHastaCerrada,
               @IDValoracionCerrada = IDValoracion
        WHERE  IDProyecto = @IDProyecto AND IDBan = @IDBan AND VigenteHasta IS NULL;

        IF @IDValoracionCerrada IS NOT NULL
        BEGIN
            INSERT INTO [pro_app].[audit_log]
                (Tabla, IDRegistro, Accion, UsuarioEmail, ValorNuevoJSON, Contexto)
            VALUES
                ('pro_app.banco_valoracion_lote', @IDValoracionCerrada, 'UPDATE', @UsuarioEmail,
                 (SELECT VigenteHasta = @VigenteHastaCerrada FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                 CONCAT('Cierre de vigencia por nueva valoración (proy=', @IDProyecto, ', ban=', @IDBan, ')'));
        END;

        DECLARE @NuevoID INT;
        INSERT INTO [pro_app].[banco_valoracion_lote]
            (IDProyecto, IDBan, ValorM2Lote, Moneda, PorcentajeFinanciamiento,
             VigenteDesde, VigenteHasta, Notas)
        VALUES
            (@IDProyecto, @IDBan, @ValorM2Lote, @Moneda, @PorcentajeFinanciamiento,
             @VigenteDesde, NULL, @Notas);
        SET @NuevoID = SCOPE_IDENTITY();

        DECLARE @ValorJSON NVARCHAR(MAX) = (
            SELECT IDProyecto = @IDProyecto,
                   IDBan = @IDBan,
                   ValorM2Lote = @ValorM2Lote,
                   Moneda = @Moneda,
                   PorcentajeFinanciamiento = @PorcentajeFinanciamiento,
                   VigenteDesde = @VigenteDesde,
                   Notas = @Notas
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.banco_valoracion_lote', @NuevoID, 'INSERT', @UsuarioEmail,
             @ValorJSON, CONCAT('Nueva valoración (proy=', @IDProyecto, ', ban=', @IDBan, ')'));

        COMMIT TRANSACTION;

        SELECT @NuevoID AS IDValoracionCreada, @IDValoracionCerrada AS IDValoracionCerrada;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_aprobar_extra]
    @IDExtra          INT,
    @FechaAprobacion  DATE,
    @UsuarioEmail     NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Estado VARCHAR(20), @IDCaso INT;
    SELECT @Estado = Estado, @IDCaso = IDCaso
    FROM [pro_app].[caso_extra] WHERE IDExtra = @IDExtra;

    IF @Estado IS NULL
        THROW 52004, 'IDExtra no existe.', 1;
    IF @Estado <> 'COTIZADA'
        THROW 52006, 'Solo se puede aprobar una extra en estado COTIZADA.', 1;
    IF @FechaAprobacion IS NULL
        THROW 52007, 'FechaAprobacion es obligatoria.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
            SELECT IDExtra, Estado, FechaAprobacion, AprobadoPor
            FROM [pro_app].[caso_extra] WHERE IDExtra = @IDExtra
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        UPDATE [pro_app].[caso_extra]
        SET    Estado          = 'APROBADA',
               FechaAprobacion = @FechaAprobacion,
               AprobadoPor     = @UsuarioEmail,
               ModificadoPor   = @UsuarioEmail,
               FechaModificacion = SYSUTCDATETIME()
        WHERE  IDExtra = @IDExtra;

        DECLARE @ValorNuevoJSON NVARCHAR(MAX) = (
            SELECT IDExtra, Estado, FechaAprobacion, AprobadoPor
            FROM [pro_app].[caso_extra] WHERE IDExtra = @IDExtra
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.caso_extra', @IDExtra, 'UPDATE', @UsuarioEmail,
             @ValorAnteriorJSON, @ValorNuevoJSON,
             CONCAT('Aprobación extra ', @IDExtra));

        -- Recalcular PrecioVentaActual del caso afectado
        EXEC [pro_app].[sp_recalcular_precio_venta_actual] @IDCaso = @IDCaso;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_confirmar_cancelacion_lote_cp]
    @IDCreditoPuenteLote              INT,
    @FechaConfirmacionCancelacion     DATE,
    @MontoConfirmadoAlBanco_CRC       MONEY,
    @ComprobanteCancelacion           NVARCHAR(200) = NULL,
    @Notas                            NVARCHAR(500) = NULL,
    @UsuarioEmail                     NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @IDCreditoPuenteLote IS NULL OR NOT EXISTS (
        SELECT 1 FROM [pro_app].[credito_puente_lote] WHERE IDCreditoPuenteLote = @IDCreditoPuenteLote
    )
        THROW 52020, 'IDCreditoPuenteLote no existe.', 1;
    IF @FechaConfirmacionCancelacion IS NULL
        THROW 52021, 'FechaConfirmacionCancelacion es obligatoria.', 1;
    IF @MontoConfirmadoAlBanco_CRC IS NULL OR @MontoConfirmadoAlBanco_CRC < 0
        THROW 52022, 'MontoConfirmadoAlBanco_CRC es obligatorio y >= 0.', 1;

    DECLARE @EstadoAnterior VARCHAR(30);
    SELECT @EstadoAnterior = Estado
    FROM   [pro_app].[credito_puente_lote]
    WHERE  IDCreditoPuenteLote = @IDCreditoPuenteLote;

    IF @EstadoAnterior <> 'CANCELACION_PROGRAMADA'
        THROW 52023, 'Solo se puede confirmar un lote con cancelacion en estado CANCELACION_PROGRAMADA.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @ValorAnterior NVARCHAR(MAX) = (
            SELECT Estado, FechaCancelacionAlBanco, MontoCanceladoAlBanco_CRC,
                   FechaConfirmacionCancelacion, MontoConfirmadoAlBanco_CRC,
                   ComprobanteCancelacion, Notas
            FROM [pro_app].[credito_puente_lote]
            WHERE IDCreditoPuenteLote = @IDCreditoPuenteLote
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        UPDATE [pro_app].[credito_puente_lote]
        SET    Estado                        = 'CANCELACION_CONFIRMADA',
               FechaConfirmacionCancelacion  = @FechaConfirmacionCancelacion,
               MontoConfirmadoAlBanco_CRC    = @MontoConfirmadoAlBanco_CRC,
               ComprobanteCancelacion        = @ComprobanteCancelacion,
               Notas                         = ISNULL(@Notas, Notas),
               ModificadoPor                 = @UsuarioEmail,
               FechaModificacion             = SYSUTCDATETIME()
        WHERE  IDCreditoPuenteLote = @IDCreditoPuenteLote;

        DECLARE @ValorNuevo NVARCHAR(MAX) = (
            SELECT Estado, FechaCancelacionAlBanco, MontoCanceladoAlBanco_CRC,
                   FechaConfirmacionCancelacion, MontoConfirmadoAlBanco_CRC,
                   ComprobanteCancelacion, Notas
            FROM [pro_app].[credito_puente_lote]
            WHERE IDCreditoPuenteLote = @IDCreditoPuenteLote
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.credito_puente_lote', @IDCreditoPuenteLote, 'UPDATE', @UsuarioEmail,
             @ValorAnterior, @ValorNuevo,
             CONCAT('Confirmacion de cancelacion del lote CP ', @IDCreditoPuenteLote, ' (Fase 6.3)'));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_crear_extra]
    @IDCaso           INT,
    @Tipo             VARCHAR(20),
    @Descripcion      NVARCHAR(500),
    @MontoAjuste_CRC  MONEY,
    @FechaCotizacion  DATE,
    @Notas            NVARCHAR(1000) = NULL,
    @UsuarioEmail     NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM pro_ventas.Casos WHERE IDCaso = @IDCaso)
        THROW 52000, 'IDCaso no existe.', 1;
    IF @Tipo NOT IN ('EXTRA','DESCUENTO','GASTO')
        THROW 52001, 'Tipo inválido (EXTRA, DESCUENTO, GASTO).', 1;
    IF @MontoAjuste_CRC IS NULL OR @MontoAjuste_CRC <= 0
        THROW 52002, 'MontoAjuste_CRC debe ser mayor a cero.', 1;
    IF @Descripcion IS NULL OR LTRIM(RTRIM(@Descripcion)) = ''
        THROW 52003, 'Descripcion es obligatoria.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        INSERT INTO [pro_app].[caso_extra]
            (IDCaso, Tipo, Descripcion, MontoAjuste_CRC,
             FechaCotizacion, Notas, CreadoPor)
        VALUES
            (@IDCaso, @Tipo, @Descripcion, @MontoAjuste_CRC,
             @FechaCotizacion, @Notas, @UsuarioEmail);

        DECLARE @NuevoID INT = SCOPE_IDENTITY();

        DECLARE @ValorNuevoJSON NVARCHAR(MAX) = (
            SELECT IDExtra = @NuevoID, IDCaso = @IDCaso, Tipo = @Tipo,
                   Descripcion = @Descripcion, MontoAjuste_CRC = @MontoAjuste_CRC,
                   FechaCotizacion = @FechaCotizacion, Estado = 'COTIZADA',
                   Notas = @Notas
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.caso_extra', @NuevoID, 'INSERT', @UsuarioEmail,
             NULL, @ValorNuevoJSON,
             CONCAT('Extra creada caso ', @IDCaso, ' · ', @Tipo,
                    ' · ', CAST(@MontoAjuste_CRC AS NVARCHAR(40))));

        COMMIT TRANSACTION;

        SELECT @NuevoID AS IDExtra;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_crear_movimiento_dbo]
    @IDCaso                       INT,
    @IDTipmov                     INT,
    @FechaSolicitudMovimiento     DATE,
    @FechaMovimiento              DATE,
    @Moneda                       NCHAR(10),
    @TipoCambio                   MONEY,
    @MontoColones                 MONEY,
    @MontoDolares                 MONEY = NULL,
    @Depositante                  NVARCHAR(20),
    @DetalleTransferencia         NVARCHAR(250) = NULL,
    @Observaciones                NVARCHAR(MAX) = NULL,
    @AzureBlobId                  VARCHAR(120) = NULL,
    @AzureBlobURL                 VARCHAR(250) = NULL,
    @IDHito                       INT = NULL,            -- opcional, autolink
    @MontoAplicado_CRC            MONEY = NULL,          -- si link, monto aplicado al hito (default = MontoColones)
    @UsuarioEmail                 NVARCHAR(200)
WITH EXECUTE AS OWNER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Validaciones de entrada.
    IF @IDCaso IS NULL OR NOT EXISTS (SELECT 1 FROM pro_ventas.Casos WHERE IDCaso = @IDCaso)
        THROW 53000, 'IDCaso no existe en pro_ventas.Casos.', 1;

    DECLARE @TgDesembolso BIT;
    DECLARE @Categoria VARCHAR(10);
    SELECT @TgDesembolso = TgDesembolso,
           @Categoria    = LTRIM(RTRIM(Categoria))
    FROM pro_ventas.TipMovi WHERE IDTmov = @IDTipmov;
    IF @TgDesembolso IS NULL
        THROW 53001, 'IDTipmov no existe en pro_ventas.TipMovi.', 1;

    IF @FechaMovimiento IS NULL
        THROW 53002, 'FechaMovimiento es obligatoria.', 1;
    IF @FechaSolicitudMovimiento IS NULL
        SET @FechaSolicitudMovimiento = @FechaMovimiento;

    -- Moneda en BD es NCHAR(10) con padding ("CRC       "). Aceptamos sin padding y normalizamos.
    SET @Moneda = LEFT(LTRIM(RTRIM(@Moneda)) + REPLICATE(' ', 10), 10);
    IF LTRIM(RTRIM(@Moneda)) NOT IN ('CRC', 'USD')
        THROW 53003, 'Moneda invalida (CRC o USD).', 1;
    IF @TipoCambio IS NULL OR @TipoCambio <= 0
        THROW 53004, 'TipoCambio debe ser > 0.', 1;
    -- El monto SIEMPRE se captura positivo (tambien para devoluciones). El SP
    -- aplica el signo segun la categoria (DV -> negativo).
    IF @MontoColones IS NULL OR @MontoColones <= 0
        THROW 53005, 'MontoColones debe ser > 0. Capturá siempre positivo; las devoluciones (DV) se guardan en negativo automáticamente.', 1;

    -- Si no se pasa MontoDolares, calcular.
    IF @MontoDolares IS NULL AND @TipoCambio > 0
        SET @MontoDolares = @MontoColones / @TipoCambio;

    -- Convencion de signo (23-jun-2026): las devoluciones (categoria DV) se
    -- almacenan en NEGATIVO aunque el UI capture el monto positivo.
    IF @Categoria = 'DV'
    BEGIN
        SET @MontoColones = -ABS(@MontoColones);
        SET @MontoDolares = -ABS(@MontoDolares);
    END

    -- Depositante: lista cerrada en este SP. Si necesitas mas valores en el
    -- futuro, ampliar aqui.
    IF @Depositante NOT IN ('BANCO', 'CLIENTE')
        THROW 53006, 'Depositante invalido (BANCO o CLIENTE).', 1;

    -- Validacion del autolink (si aplica).
    IF @IDHito IS NOT NULL
    BEGIN
        IF @TgDesembolso <> 1
            THROW 53007, 'Solo se puede vincular a hito si IDTipmov es de desembolso (TgDesembolso=1).', 1;
        IF NOT EXISTS (SELECT 1 FROM [pro_app].catalogo_hito WHERE IDHito = @IDHito)
            THROW 53008, 'IDHito no existe en catalogo_hito.', 1;
    END

    DECLARE @IDMovimiento INT;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- UsuarioCarga es varchar(50). Email puede ser mas largo, lo truncamos.
        -- ComprobanteMov es binary(50) — no se usa en Fase 6.4 (adjunto en
        -- Fase 2). Lo dejamos NULL.
        INSERT INTO pro_ventas.Movimientos
            (IDCaso, IDTipmov, FechaSolicitudMovimiento, FechaMovimiento,
             Moneda, TipoCambio, MontoColones, MontoDolares,
             Depositante, DetalleTransferencia, Observaciones,
             AzureBlobId, AzureBlobURL,
             UsuarioCarga, FechaCreacion)
        VALUES
            (@IDCaso, @IDTipmov, @FechaSolicitudMovimiento, @FechaMovimiento,
             @Moneda, @TipoCambio, @MontoColones, @MontoDolares,
             @Depositante, @DetalleTransferencia, @Observaciones,
             @AzureBlobId, @AzureBlobURL,
             LEFT(CONVERT(VARCHAR(50), @UsuarioEmail), 50), CAST(SYSUTCDATETIME() AS DATE));

        SET @IDMovimiento = SCOPE_IDENTITY();

        -- Audit log.
        DECLARE @ValorNuevoJSON NVARCHAR(MAX) = (
            SELECT IDMovimiento = @IDMovimiento, IDCaso = @IDCaso,
                   IDTipmov = @IDTipmov, FechaMovimiento = @FechaMovimiento,
                   MontoColones = @MontoColones, MontoDolares = @MontoDolares,
                   Moneda = @Moneda, Depositante = @Depositante,
                   DetalleTransferencia = @DetalleTransferencia
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_ventas.Movimientos', @IDMovimiento, 'INSERT', @UsuarioEmail,
             NULL, @ValorNuevoJSON,
             CONCAT('Movimiento creado desde app de Flujo (Fase 6.4)',
                    CASE WHEN @Categoria = 'DV' THEN ' [DV: guardado en negativo]' ELSE '' END,
                    CASE WHEN @IDHito IS NOT NULL THEN CONCAT(' + autolink a IDHito=', @IDHito) ELSE '' END));

        -- Autolink al hito si aplica. Reusamos el SP existente
        -- sp_vincular_a_hito_de_caso (Fase 4.6f) que materializa la proyeccion
        -- si no existe y crea el link con auto-DESEMBOLSADO (Fase 4.6j).
        IF @IDHito IS NOT NULL
        BEGIN
            DECLARE @MontoLink MONEY = ISNULL(@MontoAplicado_CRC, @MontoColones);

            EXEC [pro_app].sp_vincular_a_hito_de_caso
                @IDMovimiento        = @IDMovimiento,
                @IDCaso              = @IDCaso,
                @IDHito              = @IDHito,
                @MontoAplicado_CRC   = @MontoLink,
                @UsuarioEmail        = @UsuarioEmail;
        END

        COMMIT TRANSACTION;

        SELECT @IDMovimiento AS IDMovimiento;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_crear_pago_cliente]
    @IDCaso             INT,
    @Concepto           VARCHAR(20),
    @MontoPlaneado_CRC  MONEY,
    @FechaPlaneada      DATE,
    @IDExtra            INT = NULL,
    @Notas              NVARCHAR(500) = NULL,
    @UsuarioEmail       NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM pro_ventas.Casos WHERE IDCaso = @IDCaso)
        THROW 51990, 'IDCaso no existe.', 1;
    IF @Concepto NOT IN ('PRIMA','EXTRA','GASTO_ADICIONAL','CUOTA','LOTE')
        THROW 51991,
              'Concepto inválido (PRIMA, EXTRA, GASTO_ADICIONAL, CUOTA, LOTE).',
              1;
    IF @MontoPlaneado_CRC IS NULL OR @MontoPlaneado_CRC <= 0
        THROW 51992, 'MontoPlaneado_CRC debe ser mayor a cero.', 1;
    IF @FechaPlaneada IS NULL
        THROW 51993, 'FechaPlaneada es obligatoria.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        INSERT INTO [pro_app].[pago_cliente]
            (IDCaso, Concepto, IDExtra, MontoPlaneado_CRC, FechaPlaneada,
             Notas, CreadoPor)
        VALUES
            (@IDCaso, @Concepto, @IDExtra, @MontoPlaneado_CRC, @FechaPlaneada,
             @Notas, @UsuarioEmail);

        DECLARE @NuevoID INT = SCOPE_IDENTITY();

        DECLARE @ValorNuevoJSON NVARCHAR(MAX) = (
            SELECT IDPago = @NuevoID, IDCaso = @IDCaso, Concepto = @Concepto,
                   IDExtra = @IDExtra, MontoPlaneado_CRC = @MontoPlaneado_CRC,
                   FechaPlaneada = @FechaPlaneada, Notas = @Notas
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.pago_cliente', @NuevoID, 'INSERT', @UsuarioEmail,
             NULL, @ValorNuevoJSON,
             CONCAT('Pago cliente caso ', @IDCaso, ' · ', @Concepto));

        COMMIT TRANSACTION;

        SELECT @NuevoID AS IDPago;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_crear_proyeccion_historica]
    @IDCaso              INT,
    @IDHito              INT,
    @FechaRealDesembolso DATE,
    @UsuarioEmail        NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Si ya existe, devolver el IDCasoHito sin crear nada
    DECLARE @Existente INT;
    SELECT @Existente = IDCasoHito
    FROM [pro_app].[caso_hito_proyeccion]
    WHERE IDCaso = @IDCaso AND IDHito = @IDHito;

    IF @Existente IS NOT NULL
    BEGIN
        SELECT @Existente AS IDCasoHito, 0 AS Creada;
        RETURN;
    END

    -- Encontrar IDBanco del caso
    DECLARE @IDBanco INT;
    SELECT @IDBanco = IDBanco FROM pro_ventas.Casos WHERE IDCaso = @IDCaso;
    IF @IDBanco IS NULL
        THROW 51970, 'IDCaso inválido o sin IDBanco asignado.', 1;

    -- Encontrar esquema vigente del banco y el OrdenEnEsquema del IDHito
    DECLARE @IDEsquema INT, @OrdenEnEsquema INT;
    SELECT
        @IDEsquema      = e.IDEsquema,
        @OrdenEnEsquema = e.OrdenEnEsquema
    FROM [pro_app].[banco_esquema_desembolso] e
    WHERE e.IDBan = @IDBanco
      AND e.IDHito = @IDHito
      AND e.VigenteHasta IS NULL;

    IF @IDEsquema IS NULL OR @OrdenEnEsquema IS NULL
        THROW 51971,
              'No hay esquema vigente para el banco del caso, o el hito no pertenece al esquema.',
              1;

    BEGIN TRY
        BEGIN TRANSACTION;

        INSERT INTO [pro_app].[caso_hito_proyeccion]
            (IDCaso, IDHito, IDEsquema, OrdenEnCaso,
             FechaRealDesembolso, EstadoTramite, Notas)
        VALUES
            (@IDCaso, @IDHito, @IDEsquema, @OrdenEnEsquema,
             @FechaRealDesembolso, 'DESEMBOLSADO',
             'Creada por reconciliación histórica');

        DECLARE @NuevoID INT = SCOPE_IDENTITY();

        DECLARE @ValorNuevoJSON NVARCHAR(MAX) = (
            SELECT IDCasoHito        = @NuevoID,
                   IDCaso            = @IDCaso,
                   IDHito            = @IDHito,
                   IDEsquema         = @IDEsquema,
                   OrdenEnCaso       = @OrdenEnEsquema,
                   FechaRealDesembolso = @FechaRealDesembolso,
                   EstadoTramite     = 'DESEMBOLSADO'
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.caso_hito_proyeccion', @NuevoID, 'INSERT', @UsuarioEmail,
             NULL, @ValorNuevoJSON,
             CONCAT('Reconciliación histórica caso ', @IDCaso,
                    ' hito ', @IDHito,
                    ' (orden ', @OrdenEnEsquema, ')'));

        COMMIT TRANSACTION;

        SELECT @NuevoID AS IDCasoHito, 1 AS Creada;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_desactivar_proyeccion_formalizacion]
    @IDCaso       INT,
    @UsuarioEmail NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM pro_ventas.Casos WHERE IDCaso = @IDCaso)
        THROW 51910, 'IDCaso no existe.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Capturar lo que estamos desactivando para audit.
        DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
            SELECT IDProyeccion, FechaProyectada, NivelConfianza, Notas
            FROM [pro_app].[proyeccion_formalizacion]
            WHERE IDCaso = @IDCaso AND Activa = 1
            FOR JSON PATH
        );

        DECLARE @CantCerradas INT;
        UPDATE [pro_app].[proyeccion_formalizacion]
        SET    Activa = 0,
               FechaModificacion = SYSUTCDATETIME()
        WHERE  IDCaso = @IDCaso AND Activa = 1;
        SET @CantCerradas = @@ROWCOUNT;

        IF @CantCerradas > 0
        BEGIN
            INSERT INTO [pro_app].[audit_log]
                (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON, Contexto)
            VALUES
                ('pro_app.proyeccion_formalizacion', @IDCaso, 'DELETE', @UsuarioEmail,
                 @ValorAnteriorJSON,
                 CONCAT('Devuelto a sin proyectar — ', @CantCerradas, ' versión(es) marcada(s) inactiva(s).'));
        END;

        COMMIT TRANSACTION;

        SELECT @CantCerradas AS VersionesCerradas;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_desvincular_mov_cp_de_hito_lote]
    @IDLinkCP       INT,
    @UsuarioEmail   NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDCreditoPuenteLoteHito INT;
    SELECT @IDCreditoPuenteLoteHito = IDCreditoPuenteLoteHito
    FROM [pro_app].[credito_puente_link]
    WHERE IDLinkCP = @IDLinkCP;

    IF @IDCreditoPuenteLoteHito IS NULL
        THROW 52120, 'IDLinkCP no existe.', 1;

    DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
        SELECT IDLinkCP, IDMovCP, IDCreditoPuenteLoteHito,
               MontoAplicado_CRC, Notas, UsuarioVinculo, FechaVinculacion
        FROM [pro_app].[credito_puente_link]
        WHERE IDLinkCP = @IDLinkCP
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    BEGIN TRY
        BEGIN TRANSACTION;

        DELETE FROM [pro_app].[credito_puente_link]
        WHERE IDLinkCP = @IDLinkCP;

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.credito_puente_link', @IDLinkCP, 'DELETE', @UsuarioEmail,
             @ValorAnteriorJSON, NULL,
             CONCAT('Desvinculacion link CP ', @IDLinkCP));

        -- Refrescar fecha real y estado del hito de lote (puede quedar PLANEADO)
        EXEC [pro_app].sp_refrescar_fecha_real_lote_hito
             @IDCreditoPuenteLoteHito = @IDCreditoPuenteLoteHito;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_desvincular_mov_de_pago_cliente]
    @IDLink        INT,
    @UsuarioEmail  NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDPago INT;
    SELECT @IDPago = IDPago
    FROM [pro_app].[pago_cliente_mov_link]
    WHERE IDLink = @IDLink;

    DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
        SELECT IDLink, IDPago, IDMovimiento,
               MontoAplicado_CRC, Notas, UsuarioVinculo, FechaVinculacion
        FROM [pro_app].[pago_cliente_mov_link]
        WHERE IDLink = @IDLink
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    IF @ValorAnteriorJSON IS NULL
        THROW 52205, 'IDLink no existe.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        DELETE FROM [pro_app].[pago_cliente_mov_link]
        WHERE IDLink = @IDLink;

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.pago_cliente_mov_link', @IDLink, 'DELETE', @UsuarioEmail,
             @ValorAnteriorJSON, NULL,
             CONCAT('Desvinculación de link ', @IDLink, ' (pago cliente)'));

        -- Refrescar FechaReal del pago (puede quedar en NULL si era el único)
        IF @IDPago IS NOT NULL
            EXEC [pro_app].[sp_refrescar_pago_cliente] @IDPago = @IDPago;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_desvincular_movimiento_hito]
    @IDLink        INT,
    @UsuarioEmail  NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDCasoHito INT;
    SELECT @IDCasoHito = IDCasoHito
    FROM [pro_app].[movimiento_hito_link]
    WHERE IDLink = @IDLink;

    IF @IDCasoHito IS NULL
        THROW 51955, 'IDLink no existe.', 1;

    DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
        SELECT IDLink, IDMovimiento, IDCasoHito,
               MontoAplicado_CRC, Notas, UsuarioVinculo, FechaVinculacion
        FROM [pro_app].[movimiento_hito_link]
        WHERE IDLink = @IDLink
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    BEGIN TRY
        BEGIN TRANSACTION;

        DELETE FROM [pro_app].[movimiento_hito_link]
        WHERE IDLink = @IDLink;

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.movimiento_hito_link', @IDLink, 'DELETE', @UsuarioEmail,
             @ValorAnteriorJSON, NULL,
             CONCAT('Desvinculación de link ', @IDLink));

        -- Refrescar fecha real y estado del hito (puede quedar sin links).
        EXEC [pro_app].sp_refrescar_fecha_real_hito @IDCasoHito = @IDCasoHito;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_dividir_movimiento]
    @IDMovimiento  INT,
    @LinksJSON     NVARCHAR(MAX),
    @UsuarioEmail  NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDCasoMov INT, @MontoMov MONEY;
    SELECT @IDCasoMov = IDCaso, @MontoMov = MontoColones
    FROM pro_ventas.Movimientos
    WHERE IDMovimiento = @IDMovimiento;

    IF @IDCasoMov IS NULL
        THROW 51950, 'IDMovimiento no existe en pro_ventas.Movimientos.', 1;

    IF @LinksJSON IS NULL OR LTRIM(RTRIM(@LinksJSON)) = '' OR ISJSON(@LinksJSON) = 0
        THROW 51956, 'LinksJSON inválido o vacío.', 1;

    DECLARE @Items TABLE (
        IDCasoHito        INT NOT NULL,
        MontoAplicado_CRC MONEY NOT NULL,
        Notas             NVARCHAR(500) NULL
    );

    INSERT INTO @Items (IDCasoHito, MontoAplicado_CRC, Notas)
    SELECT IDCasoHito, MontoAplicado_CRC, Notas
    FROM OPENJSON(@LinksJSON)
    WITH (
        IDCasoHito        INT           '$.IDCasoHito',
        MontoAplicado_CRC MONEY         '$.MontoAplicado_CRC',
        Notas             NVARCHAR(500) '$.Notas'
    );

    IF NOT EXISTS (SELECT 1 FROM @Items)
        THROW 51957, 'LinksJSON debe contener al menos un item.', 1;

    -- Validaciones por item
    IF EXISTS (SELECT 1 FROM @Items WHERE MontoAplicado_CRC <= 0)
        THROW 51953, 'MontoAplicado_CRC debe ser mayor a cero en todos los items.', 1;

    -- Sum total no debe exceder MontoColones del mov
    IF (SELECT SUM(MontoAplicado_CRC) FROM @Items) > ISNULL(@MontoMov, 0)
        THROW 51954,
              'La suma de montos vinculados excede el MontoColones del movimiento.',
              1;

    -- Validar que todos los hitos pertenezcan al caso del mov
    IF EXISTS (
        SELECT 1 FROM @Items i
        LEFT JOIN [pro_app].[caso_hito_proyeccion] chp ON chp.IDCasoHito = i.IDCasoHito
        WHERE chp.IDCasoHito IS NULL OR chp.IDCaso <> @IDCasoMov
    )
        THROW 51952, 'Algún IDCasoHito no existe o pertenece a otro caso.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Hitos previamente afectados por links del mov (para refresh post-DELETE)
        DECLARE @HitosAfectados TABLE (IDCasoHito INT PRIMARY KEY);
        INSERT INTO @HitosAfectados (IDCasoHito)
        SELECT DISTINCT IDCasoHito FROM [pro_app].[movimiento_hito_link]
        WHERE IDMovimiento = @IDMovimiento;

        -- Borrar todos los links existentes del mov
        DECLARE @LinksBorrados INT = (
            SELECT COUNT(*) FROM [pro_app].[movimiento_hito_link]
            WHERE IDMovimiento = @IDMovimiento
        );

        DELETE FROM [pro_app].[movimiento_hito_link]
        WHERE IDMovimiento = @IDMovimiento;

        -- Insertar los nuevos
        INSERT INTO [pro_app].[movimiento_hito_link]
            (IDMovimiento, IDCasoHito, MontoAplicado_CRC, Notas, UsuarioVinculo)
        SELECT @IDMovimiento, IDCasoHito, MontoAplicado_CRC, Notas, @UsuarioEmail
        FROM @Items;

        -- Agregar nuevos hitos al set de afectados
        INSERT INTO @HitosAfectados (IDCasoHito)
        SELECT i.IDCasoHito FROM @Items i
        WHERE NOT EXISTS (SELECT 1 FROM @HitosAfectados h WHERE h.IDCasoHito = i.IDCasoHito);

        -- Audit log: una entrada general
        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.movimiento_hito_link', @IDMovimiento, 'UPDATE', @UsuarioEmail,
             NULL, @LinksJSON,
             CONCAT('División de movimiento ', @IDMovimiento,
                    ': borrados ', @LinksBorrados,
                    ', creados ', (SELECT COUNT(*) FROM @Items)));

        -- Refrescar fecha/estado de cada hito afectado
        DECLARE @cur CURSOR;
        DECLARE @h INT;
        SET @cur = CURSOR LOCAL FAST_FORWARD FOR
            SELECT IDCasoHito FROM @HitosAfectados;
        OPEN @cur;
        FETCH NEXT FROM @cur INTO @h;
        WHILE @@FETCH_STATUS = 0
        BEGIN
            EXEC [pro_app].sp_refrescar_fecha_real_hito @IDCasoHito = @h;
            FETCH NEXT FROM @cur INTO @h;
        END
        CLOSE @cur;
        DEALLOCATE @cur;

        COMMIT TRANSACTION;

        SELECT @LinksBorrados AS LinksReemplazados,
               (SELECT COUNT(*) FROM @Items) AS LinksCreados;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
-- -----------------------------------------------------------------------------
-- 1. sp_editar_distribucion_vigente
--    UPDATE de la fila de distribucion_config + DELETE/INSERT de las entidades.
-- -----------------------------------------------------------------------------
CREATE PROCEDURE [pro_app].[sp_editar_distribucion_vigente]
    @IDProyecto       INT,
    @PrecioInternoM2  DECIMAL(10,2),
    @Moneda           CHAR(3) = 'USD',
    @Notas            NVARCHAR(500) = NULL,
    @EntidadesJSON    NVARCHAR(MAX),
    @UsuarioEmail     NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @IDProyecto IS NULL OR NOT EXISTS (SELECT 1 FROM pro_ventas.Proyecto WHERE IDProyecto = @IDProyecto)
        THROW 51600, 'IDProyecto inválido o no existe.', 1;

    IF @PrecioInternoM2 <= 0
        THROW 51601, 'PrecioInternoM2 debe ser mayor a 0.', 1;

    IF @EntidadesJSON IS NULL OR ISJSON(@EntidadesJSON) = 0
        THROW 51602, 'EntidadesJSON debe ser un JSON válido.', 1;

    DECLARE @entidades TABLE (
        IDEntidad   INT NOT NULL,
        Porcentaje  DECIMAL(5,2) NOT NULL,
        Notas       NVARCHAR(500) NULL
    );
    INSERT INTO @entidades (IDEntidad, Porcentaje, Notas)
    SELECT IDEntidad, Porcentaje, Notas
    FROM OPENJSON(@EntidadesJSON)
    WITH (
        IDEntidad  INT          '$.IDEntidad',
        Porcentaje DECIMAL(5,2) '$.Porcentaje',
        Notas      NVARCHAR(500) '$.Notas'
    );

    IF NOT EXISTS (SELECT 1 FROM @entidades)
        THROW 51603, 'Debe especificar al menos una entidad.', 1;

    IF EXISTS (SELECT 1 FROM @entidades WHERE Porcentaje < 0 OR Porcentaje > 100)
        THROW 51604, 'Cada Porcentaje debe estar entre 0 y 100.', 1;

    DECLARE @suma DECIMAL(7,2) = (SELECT SUM(Porcentaje) FROM @entidades);
    IF @suma <> 100
        THROW 51605, 'La suma de los porcentajes debe ser 100.', 1;

    IF EXISTS (
        SELECT 1 FROM @entidades e
        LEFT JOIN [pro_app].[catalogo_entidad_distribucion] ce ON ce.IDEntidad = e.IDEntidad
        WHERE ce.IDEntidad IS NULL OR ce.Activo = 0
    )
        THROW 51606, 'Hay IDEntidad inválido o entidad inactiva.', 1;

    DECLARE @IDConfig INT = (
        SELECT TOP 1 IDConfig FROM [pro_app].[distribucion_config]
        WHERE IDProyecto = @IDProyecto AND VigenteHasta IS NULL
        ORDER BY VigenteDesde DESC
    );
    IF @IDConfig IS NULL
        THROW 51607, 'No hay distribución vigente para este proyecto. Use sp_actualizar_distribucion_config.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Snapshot anterior para audit
        DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
            SELECT
                IDProyecto = dc.IDProyecto,
                PrecioInternoM2 = dc.PrecioInternoM2,
                Moneda = dc.Moneda,
                Notas = dc.Notas,
                Entidades = JSON_QUERY((
                    SELECT IDEntidad, Porcentaje, Notas
                    FROM [pro_app].[distribucion_config_entidad]
                    WHERE IDConfig = @IDConfig
                    FOR JSON PATH
                ))
            FROM [pro_app].[distribucion_config] dc
            WHERE dc.IDConfig = @IDConfig
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        UPDATE [pro_app].[distribucion_config]
        SET PrecioInternoM2 = @PrecioInternoM2,
            Moneda          = @Moneda,
            Notas           = @Notas
        WHERE IDConfig = @IDConfig;

        DELETE FROM [pro_app].[distribucion_config_entidad]
        WHERE IDConfig = @IDConfig;

        INSERT INTO [pro_app].[distribucion_config_entidad] (IDConfig, IDEntidad, Porcentaje, Notas)
        SELECT @IDConfig, IDEntidad, Porcentaje, Notas FROM @entidades;

        DECLARE @ValorNuevoJSON NVARCHAR(MAX) = (
            SELECT IDProyecto = @IDProyecto,
                   PrecioInternoM2 = @PrecioInternoM2,
                   Moneda = @Moneda,
                   Notas = @Notas,
                   Entidades = JSON_QUERY(@EntidadesJSON)
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.distribucion_config', @IDConfig, 'UPDATE', @UsuarioEmail,
             @ValorAnteriorJSON, @ValorNuevoJSON,
             CONCAT('Edición in-place de distribución vigente del proyecto ', @IDProyecto));

        COMMIT TRANSACTION;

        SELECT @IDConfig AS IDConfigEditado;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_editar_esquema_vigente_banco]
    @IDBan                INT,
    @DiaSemanaPeritoFijo  TINYINT = NULL,
    @Notas                NVARCHAR(500) = NULL,
    @HitosJSON            NVARCHAR(MAX),
    @UsuarioEmail         NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @IDBan IS NULL OR NOT EXISTS (SELECT 1 FROM pro_ventas.Bancos WHERE IDBan = @IDBan)
        THROW 51500, 'IDBan invalido o no existe.', 1;

    IF @DiaSemanaPeritoFijo IS NOT NULL AND (@DiaSemanaPeritoFijo < 1 OR @DiaSemanaPeritoFijo > 7)
        THROW 51501, 'DiaSemanaPeritoFijo debe estar entre 1 y 7.', 1;

    IF @HitosJSON IS NULL OR ISJSON(@HitosJSON) = 0
        THROW 51502, 'HitosJSON debe ser un JSON valido.', 1;

    DECLARE @hitos TABLE (
        IDHito                    INT NOT NULL,
        OrdenEnEsquema            INT NOT NULL,
        Porcentaje                DECIMAL(5,2) NOT NULL,
        DiasSolicitudVisita       INT NOT NULL,
        DiasDesembolsoPostVisita  INT NOT NULL,
        Notas                     NVARCHAR(500) NULL
    );
    INSERT INTO @hitos
    SELECT IDHito, OrdenEnEsquema, Porcentaje, DiasSolicitudVisita, DiasDesembolsoPostVisita, Notas
    FROM OPENJSON(@HitosJSON)
    WITH (
        IDHito                   INT          '$.IDHito',
        OrdenEnEsquema           INT          '$.OrdenEnEsquema',
        Porcentaje               DECIMAL(5,2) '$.Porcentaje',
        DiasSolicitudVisita      INT          '$.DiasSolicitudVisita',
        DiasDesembolsoPostVisita INT          '$.DiasDesembolsoPostVisita',
        Notas                    NVARCHAR(500) '$.Notas'
    );

    IF NOT EXISTS (SELECT 1 FROM @hitos)
        THROW 51503, 'Debe especificar al menos un hito.', 1;

    IF EXISTS (SELECT 1 FROM @hitos WHERE Porcentaje <= 0 OR Porcentaje > 100)
        THROW 51504, 'Cada Porcentaje debe ser > 0 y <= 100.', 1;

    DECLARE @suma DECIMAL(7,2) = (SELECT SUM(Porcentaje) FROM @hitos);
    IF @suma <> 100
        THROW 51505, 'La suma de los porcentajes debe ser 100 (los hitos fijos no se incluyen en este calculo).', 1;

    IF EXISTS (
        SELECT 1 FROM @hitos h
        LEFT JOIN [pro_app].[catalogo_hito] ch ON ch.IDHito = h.IDHito
        WHERE ch.IDHito IS NULL OR ch.Activo = 0
    )
        THROW 51506, 'Hay IDHito invalido o hito inactivo.', 1;

    -- No permitir enviar hitos fijos en el JSON (son automaticos).
    IF EXISTS (
        SELECT 1 FROM @hitos h
        WHERE EXISTS (
            SELECT 1 FROM [pro_app].[banco_esquema_desembolso] e
            WHERE e.IDBan = @IDBan AND e.IDHito = h.IDHito AND e.EsMontoFijo = 1
        )
    )
        THROW 51510,
              'No se pueden enviar hitos con EsMontoFijo en el JSON; se preservan automaticamente.',
              1;

    DECLARE @IDHitoLote INT = (SELECT IDHito FROM [pro_app].[catalogo_hito] WHERE Codigo = 'LOTE');
    IF @IDHitoLote IS NOT NULL AND EXISTS (SELECT 1 FROM @hitos WHERE IDHito = @IDHitoLote)
        THROW 51511,
              'No se puede enviar el hito LOTE en el JSON; es siempre fijo y se auto-inserta.',
              1;

    DECLARE @VigenteDesde DATE = (
        SELECT MIN(VigenteDesde) FROM [pro_app].[banco_esquema_desembolso]
        WHERE IDBan = @IDBan AND VigenteHasta IS NULL
    );
    IF @VigenteDesde IS NULL
        THROW 51507, 'No hay esquema vigente para este banco. Use sp_actualizar_esquema_banco para crearlo.', 1;

    -- Construir el set "objetivo" final: no-fijos del JSON + fijos vigentes (incluyendo LOTE auto).
    DECLARE @hitosFinales TABLE (
        IDHito                    INT NOT NULL,
        OrdenEnEsquema            INT NOT NULL,
        PorcentajeDesembolso      DECIMAL(5,2) NOT NULL,
        DiasSolicitudVisita       INT NOT NULL,
        DiasDesembolsoPostVisita  INT NOT NULL,
        EsMontoFijo               BIT NOT NULL,
        Notas                     NVARCHAR(500) NULL
    );
    INSERT INTO @hitosFinales
    SELECT IDHito, OrdenEnEsquema, Porcentaje, DiasSolicitudVisita, DiasDesembolsoPostVisita, 0, Notas
    FROM @hitos;

    INSERT INTO @hitosFinales
    SELECT IDHito, OrdenEnEsquema, PorcentajeDesembolso, DiasSolicitudVisita, DiasDesembolsoPostVisita, 1, Notas
    FROM [pro_app].[banco_esquema_desembolso]
    WHERE IDBan = @IDBan AND VigenteHasta IS NULL AND EsMontoFijo = 1;

    -- Auto-asegurar LOTE si el banco no lo tiene aun.
    IF @IDHitoLote IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM @hitosFinales WHERE IDHito = @IDHitoLote)
    BEGIN
        INSERT INTO @hitosFinales
            (IDHito, OrdenEnEsquema, PorcentajeDesembolso,
             DiasSolicitudVisita, DiasDesembolsoPostVisita, EsMontoFijo, Notas)
        VALUES
            (@IDHitoLote, 0, 0, 0, 0, 1,
             N'Hito virtual: lote bancario (monto fijo). Auto-creado por SP.');
    END

    -- Verificar que ningun hito a "quitar" tenga casos referenciandolo.
    DECLARE @CasosBloqueando NVARCHAR(MAX) = (
        SELECT TOP 5 e.IDEsquema, h.Codigo AS HitoCodigo, COUNT(chp.IDCasoHito) AS CasosUsando
        FROM [pro_app].[banco_esquema_desembolso] e
        INNER JOIN [pro_app].[catalogo_hito] h ON h.IDHito = e.IDHito
        INNER JOIN [pro_app].[caso_hito_proyeccion] chp ON chp.IDEsquema = e.IDEsquema
        WHERE e.IDBan = @IDBan
          AND e.VigenteHasta IS NULL
          AND e.IDHito NOT IN (SELECT IDHito FROM @hitosFinales)
        GROUP BY e.IDEsquema, h.Codigo
        FOR JSON PATH
    );
    IF @CasosBloqueando IS NOT NULL
        THROW 51513,
              'No se puede quitar un hito del esquema porque hay casos referenciandolo. Crea una nueva version del esquema en su lugar (Nueva version) para que los casos viejos sigan apuntando al hito viejo.',
              1;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Snapshot anterior para audit.
        DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
            SELECT IDHito, OrdenEnEsquema, PorcentajeDesembolso AS Porcentaje,
                   DiasSolicitudVisita, DiasDesembolsoPostVisita,
                   DiaSemanaPeritoFijo, EsMontoFijo, Notas
            FROM [pro_app].[banco_esquema_desembolso]
            WHERE IDBan = @IDBan AND VigenteHasta IS NULL
            ORDER BY OrdenEnEsquema
            FOR JSON PATH
        );

        -- 1. DELETE los hitos vigentes que ya no estan en @hitosFinales.
        --    (Ya validamos arriba que no tienen casos; el DELETE es seguro.)
        DELETE FROM [pro_app].[banco_esquema_desembolso]
        WHERE IDBan = @IDBan
          AND VigenteHasta IS NULL
          AND IDHito NOT IN (SELECT IDHito FROM @hitosFinales);

        -- 2. UPDATE los hitos vigentes que siguen estando (matchea por IDHito).
        --    Preserva el IDEsquema, asi las FK de caso_hito_proyeccion siguen
        --    funcionando.
        UPDATE e
        SET    OrdenEnEsquema           = hf.OrdenEnEsquema,
               PorcentajeDesembolso     = hf.PorcentajeDesembolso,
               DiasSolicitudVisita      = hf.DiasSolicitudVisita,
               DiasDesembolsoPostVisita = hf.DiasDesembolsoPostVisita,
               DiaSemanaPeritoFijo      = @DiaSemanaPeritoFijo,
               EsMontoFijo              = hf.EsMontoFijo,
               Notas                    = ISNULL(hf.Notas, @Notas)
        FROM   [pro_app].[banco_esquema_desembolso] e
        INNER JOIN @hitosFinales hf ON hf.IDHito = e.IDHito
        WHERE  e.IDBan = @IDBan AND e.VigenteHasta IS NULL;

        -- 3. INSERT los hitos nuevos del JSON que no existian antes.
        INSERT INTO [pro_app].[banco_esquema_desembolso]
            (IDBan, IDHito, OrdenEnEsquema, PorcentajeDesembolso,
             DiasSolicitudVisita, DiasDesembolsoPostVisita, DiaSemanaPeritoFijo,
             EsMontoFijo, Notas, VigenteDesde, VigenteHasta)
        SELECT
            @IDBan, hf.IDHito, hf.OrdenEnEsquema, hf.PorcentajeDesembolso,
            hf.DiasSolicitudVisita, hf.DiasDesembolsoPostVisita, @DiaSemanaPeritoFijo,
            hf.EsMontoFijo, ISNULL(hf.Notas, @Notas), @VigenteDesde, NULL
        FROM @hitosFinales hf
        WHERE NOT EXISTS (
            SELECT 1 FROM [pro_app].[banco_esquema_desembolso] e
            WHERE e.IDBan = @IDBan AND e.IDHito = hf.IDHito AND e.VigenteHasta IS NULL
        );

        DECLARE @ValorNuevoJSON NVARCHAR(MAX) = (
            SELECT IDBan = @IDBan,
                   VigenteDesde = @VigenteDesde,
                   DiaSemanaPeritoFijo = @DiaSemanaPeritoFijo,
                   Notas = @Notas,
                   Hitos = JSON_QUERY(@HitosJSON),
                   HitosFinales = (SELECT COUNT(*) FROM @hitosFinales)
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.banco_esquema_desembolso', @IDBan, 'UPDATE', @UsuarioEmail,
             @ValorAnteriorJSON, @ValorNuevoJSON,
             CONCAT('Edicion in-place del esquema vigente del banco ', @IDBan));

        COMMIT TRANSACTION;

        SELECT @IDBan AS IDBanEditado, @VigenteDesde AS VigenteDesde;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
-- -----------------------------------------------------------------------------
-- 2. sp_editar_valoracion_vigente_banco
--    UPDATE de la fila vigente de banco_valoracion_lote.
-- -----------------------------------------------------------------------------
CREATE PROCEDURE [pro_app].[sp_editar_valoracion_vigente_banco]
    @IDProyecto                INT,
    @IDBan                     INT,
    @ValorM2Lote               DECIMAL(10,2),
    @Moneda                    CHAR(3) = 'USD',
    @PorcentajeFinanciamiento  DECIMAL(5,2),
    @Notas                     NVARCHAR(500) = NULL,
    @UsuarioEmail              NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @IDProyecto IS NULL OR NOT EXISTS (SELECT 1 FROM pro_ventas.Proyecto WHERE IDProyecto = @IDProyecto)
        THROW 51700, 'IDProyecto inválido o no existe.', 1;

    IF @IDBan IS NULL OR NOT EXISTS (SELECT 1 FROM pro_ventas.Bancos WHERE IDBan = @IDBan)
        THROW 51701, 'IDBan inválido o no existe.', 1;

    IF @ValorM2Lote <= 0
        THROW 51702, 'ValorM2Lote debe ser mayor a 0.', 1;

    IF @PorcentajeFinanciamiento <= 0 OR @PorcentajeFinanciamiento > 100
        THROW 51703, 'PorcentajeFinanciamiento debe estar entre 0 y 100.', 1;

    DECLARE @IDValoracion INT = (
        SELECT TOP 1 IDValoracion FROM [pro_app].[banco_valoracion_lote]
        WHERE IDProyecto = @IDProyecto AND IDBan = @IDBan AND VigenteHasta IS NULL
        ORDER BY VigenteDesde DESC
    );
    IF @IDValoracion IS NULL
        THROW 51704, 'No hay valoración vigente para ese proyecto/banco. Use sp_actualizar_valoracion_banco.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
            SELECT IDProyecto, IDBan, ValorM2Lote, Moneda, PorcentajeFinanciamiento, Notas
            FROM [pro_app].[banco_valoracion_lote]
            WHERE IDValoracion = @IDValoracion
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        UPDATE [pro_app].[banco_valoracion_lote]
        SET ValorM2Lote              = @ValorM2Lote,
            Moneda                   = @Moneda,
            PorcentajeFinanciamiento = @PorcentajeFinanciamiento,
            Notas                    = @Notas
        WHERE IDValoracion = @IDValoracion;

        DECLARE @ValorNuevoJSON NVARCHAR(MAX) = (
            SELECT IDProyecto = @IDProyecto,
                   IDBan = @IDBan,
                   ValorM2Lote = @ValorM2Lote,
                   Moneda = @Moneda,
                   PorcentajeFinanciamiento = @PorcentajeFinanciamiento,
                   Notas = @Notas
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.banco_valoracion_lote', @IDValoracion, 'UPDATE', @UsuarioEmail,
             @ValorAnteriorJSON, @ValorNuevoJSON,
             CONCAT('Edición in-place de valoración vigente (proy=', @IDProyecto, ', ban=', @IDBan, ')'));

        COMMIT TRANSACTION;

        SELECT @IDValoracion AS IDValoracionEditada;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_eliminar_credito_puente]
    @IDCreditoPuente  INT,
    @UsuarioEmail     NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM [pro_app].[credito_puente] WHERE IDCreditoPuente = @IDCreditoPuente)
        THROW 52006, 'IDCreditoPuente no existe.', 1;

    IF EXISTS (SELECT 1 FROM [pro_app].[credito_puente_lote] WHERE IDCreditoPuente = @IDCreditoPuente)
        THROW 52007, 'No se puede eliminar: el credito tiene lotes asociados. Eliminelos primero.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @ValorAnterior NVARCHAR(MAX) = (
            SELECT IDCreditoPuente, IDBan, Codigo, MontoTotal_CRC,
                   GastosFormalizacion_CRC, TasaAnual, FechaAprobacion,
                   FechaVencimiento, Estado, Notas
            FROM [pro_app].[credito_puente]
            WHERE IDCreditoPuente = @IDCreditoPuente
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        DELETE FROM [pro_app].[credito_puente] WHERE IDCreditoPuente = @IDCreditoPuente;

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.credito_puente', @IDCreditoPuente, 'DELETE', @UsuarioEmail,
             @ValorAnterior, NULL,
             CONCAT('Credito puente ', @IDCreditoPuente, ' eliminado'));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_eliminar_credito_puente_lote]
    @IDCreditoPuenteLote  INT,
    @UsuarioEmail         NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM [pro_app].[credito_puente_lote] WHERE IDCreditoPuenteLote = @IDCreditoPuenteLote)
        THROW 52013, 'IDCreditoPuenteLote no existe.', 1;

    IF EXISTS (SELECT 1 FROM [pro_app].[credito_puente_lote]
               WHERE IDCreditoPuenteLote = @IDCreditoPuenteLote
                 AND Estado = 'CANCELADO_AL_BANCO')
        THROW 52014, 'No se puede eliminar un lote ya cancelado al banco. Revertirlo a PENDIENTE primero si fue un error.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @ValorAnterior2 NVARCHAR(MAX) = (
            SELECT IDCreditoPuenteLote, IDCreditoPuente, IDLote,
                   MontoResponsabilidadTeorica_CRC,
                   GastosFormalizacionLote_CRC, GastosFormalizacionOverride,
                   Estado, Notas
            FROM [pro_app].[credito_puente_lote]
            WHERE IDCreditoPuenteLote = @IDCreditoPuenteLote
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        DELETE FROM [pro_app].[credito_puente_lote] WHERE IDCreditoPuenteLote = @IDCreditoPuenteLote;

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.credito_puente_lote', @IDCreditoPuenteLote, 'DELETE', @UsuarioEmail,
             @ValorAnterior2, NULL,
             CONCAT('Lote credito puente ', @IDCreditoPuenteLote, ' eliminado'));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_eliminar_credito_puente_movimiento]
    @IDMovCP        INT,
    @UsuarioEmail   NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM [pro_app].[credito_puente_movimiento] WHERE IDMovCP = @IDMovCP)
        THROW 52105, 'IDMovCP no existe.', 1;

    DECLARE @CantLinks INT = (
        SELECT COUNT(*) FROM [pro_app].[credito_puente_link] WHERE IDMovCP = @IDMovCP
    );
    IF @CantLinks > 0
        THROW 52106,
              'No se puede eliminar el movimiento porque tiene links activos. Desvincula primero.',
              1;

    DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
        SELECT IDMovCP, IDCreditoPuente, FechaMovimiento, MontoColones,
               Concepto, NumeroComprobante, Estado, Notas
        FROM [pro_app].[credito_puente_movimiento]
        WHERE IDMovCP = @IDMovCP
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    BEGIN TRY
        BEGIN TRANSACTION;

        DELETE FROM [pro_app].[credito_puente_movimiento] WHERE IDMovCP = @IDMovCP;

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.credito_puente_movimiento', @IDMovCP, 'DELETE', @UsuarioEmail,
             @ValorAnteriorJSON, NULL,
             CONCAT('Mov CP ', @IDMovCP, ' eliminado'));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_eliminar_extra]
    @IDExtra       INT,
    @UsuarioEmail  NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Estado VARCHAR(20), @IDCaso INT;
    SELECT @Estado = Estado, @IDCaso = IDCaso
    FROM [pro_app].[caso_extra] WHERE IDExtra = @IDExtra;

    IF @Estado IS NULL
        THROW 52004, 'IDExtra no existe.', 1;
    IF @Estado = 'APROBADA'
        THROW 52009, 'No se puede eliminar una extra aprobada. Rechazala primero.', 1;

    DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
        SELECT IDExtra, IDCaso, Tipo, Descripcion, MontoAjuste_CRC,
               Estado, FechaCotizacion, Notas
        FROM [pro_app].[caso_extra] WHERE IDExtra = @IDExtra
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    BEGIN TRY
        BEGIN TRANSACTION;

        DELETE FROM [pro_app].[caso_extra] WHERE IDExtra = @IDExtra;

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.caso_extra', @IDExtra, 'DELETE', @UsuarioEmail,
             @ValorAnteriorJSON, NULL,
             CONCAT('Eliminación extra ', @IDExtra));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
-- -----------------------------------------------------------------------------
-- 3. Modificar sp_eliminar_movimiento_dbo para cascade delete de UtilidadMov.
-- -----------------------------------------------------------------------------
CREATE   PROCEDURE [pro_app].[sp_eliminar_movimiento_dbo]
    @IDMovimiento INT,
    @UsuarioEmail NVARCHAR(200)
WITH EXECUTE AS OWNER
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM pro_ventas.Movimientos WHERE IDMovimiento = @IDMovimiento)
        THROW 53100, 'IDMovimiento no existe.', 1;

    IF EXISTS (
        SELECT 1 FROM [pro_app].[movimiento_hito_link]
        WHERE IDMovimiento = @IDMovimiento
    )
        THROW 53101,
              'No se puede eliminar: el movimiento tiene links activos a hitos. Desvinculalos primero.',
              1;

    IF EXISTS (
        SELECT 1 FROM [pro_app].[pago_cliente_mov_link]
        WHERE IDMovimiento = @IDMovimiento
    )
        THROW 53103,
              'No se puede eliminar: el movimiento esta vinculado a uno o más pagos cliente. Desvinculalos primero.',
              1;

    IF EXISTS (
        SELECT 1 FROM [pro_app].[pago_cliente]
        WHERE IDMovimientoVinculado = @IDMovimiento
    )
        THROW 53102,
              'No se puede eliminar: el movimiento esta vinculado a un pago cliente (modelo legacy 1:1). Desvinculalo primero.',
              1;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @ValorAnterior NVARCHAR(MAX) = (
            SELECT IDCaso, IDTipmov, FechaMovimiento, MontoColones,
                   Moneda, Depositante, DetalleTransferencia, UtilidadReservada
            FROM pro_ventas.Movimientos
            WHERE IDMovimiento = @IDMovimiento
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        -- Cascade delete (Fase 8.bis Tarea C):
        -- - liquidacion_lote_override (override de Fase 6.5c).
        -- - pro_ventas.UtilidadMovimiento (espejo contable de Fase 8.bis C).
        DELETE FROM [pro_app].[liquidacion_lote_override]
        WHERE IDMovimiento = @IDMovimiento;

        DELETE FROM pro_ventas.UtilidadMovimiento
        WHERE IDMovimiento = @IDMovimiento;

        DELETE FROM pro_ventas.Movimientos WHERE IDMovimiento = @IDMovimiento;

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_ventas.Movimientos', @IDMovimiento, 'DELETE', @UsuarioEmail,
             @ValorAnterior, NULL,
             CONCAT('Movimiento ', @IDMovimiento,
                    ' eliminado desde app de Flujo (cascade: override + UtilidadMovimiento).'));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_eliminar_pago_cliente]
    @IDPago        INT,
    @UsuarioEmail  NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
        SELECT IDPago, IDCaso, Concepto, IDExtra, MontoPlaneado_CRC,
               FechaPlaneada, FechaReal, IDMovimientoVinculado, Notas
        FROM [pro_app].[pago_cliente]
        WHERE IDPago = @IDPago
        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
    );

    IF @ValorAnteriorJSON IS NULL
        THROW 51994, 'IDPago no existe.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        DELETE FROM [pro_app].[pago_cliente] WHERE IDPago = @IDPago;

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.pago_cliente', @IDPago, 'DELETE', @UsuarioEmail,
             @ValorAnteriorJSON, NULL,
             CONCAT('Eliminación pago cliente ', @IDPago));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_migrar_caso_a_esquema_vigente]
    @IDCaso        INT,
    @UsuarioEmail  NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- 1. Obtener IDBanco del caso.
    DECLARE @IDBanco INT;
    SELECT @IDBanco = IDBanco FROM pro_ventas.Casos WHERE IDCaso = @IDCaso;
    IF @IDBanco IS NULL
        THROW 53100, 'IDCaso inexistente o sin banco asignado.', 1;

    -- 2. Verificar que el banco tiene esquema vigente.
    IF NOT EXISTS (
        SELECT 1 FROM [pro_app].banco_esquema_desembolso
        WHERE IDBan = @IDBanco AND VigenteHasta IS NULL
    )
        THROW 53101, 'El banco del caso no tiene esquema vigente.', 1;

    -- Contadores para la respuesta.
    DECLARE @HitosAgregados INT = 0;
    DECLARE @HitosEliminados INT = 0;
    DECLARE @HitosHuerfanosConservados INT = 0;
    DECLARE @HitosActualizados INT = 0;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- ----------------------------------------------------------------
        -- 3. INSERTAR hitos del esquema vigente que no estén en chp del caso.
        -- ----------------------------------------------------------------
        DECLARE @Insertados TABLE (
            IDCasoHito INT,
            IDHito INT,
            IDEsquema INT,
            OrdenEnCaso INT
        );

        INSERT INTO [pro_app].caso_hito_proyeccion
            (IDCaso, IDHito, IDEsquema, OrdenEnCaso, EstadoTramite, Notas)
        OUTPUT inserted.IDCasoHito, inserted.IDHito, inserted.IDEsquema,
               inserted.OrdenEnCaso
        INTO @Insertados (IDCasoHito, IDHito, IDEsquema, OrdenEnCaso)
        SELECT
            @IDCaso, e.IDHito, e.IDEsquema, e.OrdenEnEsquema,
            'PLANEADO',
            CONCAT('Insertado al migrar caso ', @IDCaso, ' al esquema vigente.')
        FROM [pro_app].banco_esquema_desembolso e
        WHERE e.IDBan = @IDBanco
          AND e.VigenteHasta IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM [pro_app].caso_hito_proyeccion chp
              WHERE chp.IDCaso = @IDCaso AND chp.IDHito = e.IDHito
          );

        SET @HitosAgregados = @@ROWCOUNT;

        -- Audit log de inserciones
        INSERT INTO [pro_app].audit_log
            (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON,
             ValorNuevoJSON, Contexto)
        SELECT
            'pro_app.caso_hito_proyeccion', i.IDCasoHito, 'INSERT', @UsuarioEmail,
            NULL,
            (SELECT IDCasoHito = i.IDCasoHito,
                    IDCaso = @IDCaso,
                    IDHito = i.IDHito,
                    IDEsquema = i.IDEsquema,
                    OrdenEnCaso = i.OrdenEnCaso,
                    EstadoTramite = 'PLANEADO'
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
            CONCAT('Migración de caso ', @IDCaso,
                   ' al esquema vigente del banco: hito agregado.')
        FROM @Insertados i;

        -- ----------------------------------------------------------------
        -- 4. ELIMINAR chps cuyo hito ya no está en esquema vigente Y
        --    no tienen links activos en movimiento_hito_link.
        -- ----------------------------------------------------------------
        DECLARE @Eliminables TABLE (
            IDCasoHito INT,
            IDHito INT,
            JSON_Original NVARCHAR(MAX)
        );

        INSERT INTO @Eliminables (IDCasoHito, IDHito, JSON_Original)
        SELECT
            chp.IDCasoHito,
            chp.IDHito,
            (SELECT IDCasoHito = chp.IDCasoHito,
                    IDCaso = chp.IDCaso,
                    IDHito = chp.IDHito,
                    IDEsquema = chp.IDEsquema,
                    OrdenEnCaso = chp.OrdenEnCaso,
                    EstadoTramite = chp.EstadoTramite,
                    FechaPlaneadaHito = chp.FechaPlaneadaHito,
                    FechaPlaneadaVisitaPerito = chp.FechaPlaneadaVisitaPerito,
                    FechaProyectadaDesembolso = chp.FechaProyectadaDesembolso,
                    FechaRealHito = chp.FechaRealHito,
                    FechaRealVisitaPerito = chp.FechaRealVisitaPerito,
                    FechaRealDesembolso = chp.FechaRealDesembolso
             FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
        FROM [pro_app].caso_hito_proyeccion chp
        WHERE chp.IDCaso = @IDCaso
          AND NOT EXISTS (
              SELECT 1 FROM [pro_app].banco_esquema_desembolso e
              WHERE e.IDBan = @IDBanco
                AND e.VigenteHasta IS NULL
                AND e.IDHito = chp.IDHito
          )
          AND NOT EXISTS (
              SELECT 1 FROM [pro_app].movimiento_hito_link lk
              WHERE lk.IDCasoHito = chp.IDCasoHito
          );

        DELETE FROM [pro_app].caso_hito_proyeccion
        WHERE IDCasoHito IN (SELECT IDCasoHito FROM @Eliminables);

        SET @HitosEliminados = @@ROWCOUNT;

        -- Audit log de eliminaciones
        INSERT INTO [pro_app].audit_log
            (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON,
             ValorNuevoJSON, Contexto)
        SELECT
            'pro_app.caso_hito_proyeccion', e.IDCasoHito, 'DELETE', @UsuarioEmail,
            e.JSON_Original, NULL,
            CONCAT('Migración de caso ', @IDCaso,
                   ' al esquema vigente: hito eliminado (sin links activos, ',
                   'ya no en esquema vigente).')
        FROM @Eliminables e;

        -- ----------------------------------------------------------------
        -- 5. CONTAR huérfanos conservados (con links activos, no se borran).
        -- ----------------------------------------------------------------
        SELECT @HitosHuerfanosConservados = COUNT(*)
        FROM [pro_app].caso_hito_proyeccion chp
        WHERE chp.IDCaso = @IDCaso
          AND NOT EXISTS (
              SELECT 1 FROM [pro_app].banco_esquema_desembolso e
              WHERE e.IDBan = @IDBanco
                AND e.VigenteHasta IS NULL
                AND e.IDHito = chp.IDHito
          );

        -- ----------------------------------------------------------------
        -- 6. ACTUALIZAR IDEsquema/OrdenEnCaso de los chps existentes que SÍ
        --    están en el esquema vigente, para que apunten a la versión
        --    actual. (Solo si hay diferencia, para no escribir innecesario.)
        -- ----------------------------------------------------------------
        UPDATE chp
        SET    IDEsquema   = e.IDEsquema,
               OrdenEnCaso = e.OrdenEnEsquema
        FROM [pro_app].caso_hito_proyeccion chp
        INNER JOIN [pro_app].banco_esquema_desembolso e
            ON e.IDBan = @IDBanco
           AND e.VigenteHasta IS NULL
           AND e.IDHito = chp.IDHito
        WHERE chp.IDCaso = @IDCaso
          AND (chp.IDEsquema <> e.IDEsquema OR chp.OrdenEnCaso <> e.OrdenEnEsquema);

        SET @HitosActualizados = @@ROWCOUNT;

        -- Audit log resumen (única fila con contadores).
        INSERT INTO [pro_app].audit_log
            (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON,
             ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.caso_hito_proyeccion', @IDCaso, 'MIGRATE', @UsuarioEmail,
             NULL,
             (SELECT HitosAgregados             = @HitosAgregados,
                     HitosEliminados            = @HitosEliminados,
                     HitosHuerfanosConservados  = @HitosHuerfanosConservados,
                     HitosActualizados          = @HitosActualizados
              FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
             CONCAT('Migración del caso ', @IDCaso,
                    ' al esquema vigente del banco ', @IDBanco, '.'));

        COMMIT TRANSACTION;

        -- Devolver resumen.
        SELECT @HitosAgregados            AS HitosAgregados,
               @HitosEliminados           AS HitosEliminados,
               @HitosHuerfanosConservados AS HitosHuerfanosConservados,
               @HitosActualizados         AS HitosActualizados;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_recalcular_precio_actual_caso]
    @IDCaso INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @PrecioBase MONEY = (
        SELECT PrecioVenta FROM pro_ventas.Casos WHERE IDCaso = @IDCaso
    );

    IF @PrecioBase IS NULL
        RETURN; -- caso no existe o sin precio

    -- EXTRA y GASTO suman al precio actual.
    DECLARE @SumaExtras MONEY = (
        SELECT ISNULL(SUM(MontoAjuste_CRC), 0)
        FROM [pro_app].[caso_extra]
        WHERE IDCaso = @IDCaso
          AND Estado = 'APROBADA'
          AND Tipo IN ('EXTRA', 'GASTO')
    );

    -- DESCUENTO resta.
    DECLARE @SumaDescuentos MONEY = (
        SELECT ISNULL(SUM(MontoAjuste_CRC), 0)
        FROM [pro_app].[caso_extra]
        WHERE IDCaso = @IDCaso
          AND Estado = 'APROBADA'
          AND Tipo = 'DESCUENTO'
    );

    DECLARE @PrecioActual MONEY = @PrecioBase + @SumaExtras - @SumaDescuentos;

    -- UPSERT en caso_lote_banco
    IF EXISTS (SELECT 1 FROM [pro_app].[caso_lote_banco] WHERE IDCaso = @IDCaso)
    BEGIN
        UPDATE [pro_app].[caso_lote_banco]
        SET    PrecioVentaActual_CRC = @PrecioActual,
               FechaModificacion     = SYSUTCDATETIME()
        WHERE  IDCaso = @IDCaso;
    END
    ELSE
    BEGIN
        INSERT INTO [pro_app].[caso_lote_banco]
            (IDCaso, MontoPagaBancoPorLote_CRC, PrecioVentaActual_CRC)
        VALUES
            (@IDCaso, @PrecioActual, @PrecioActual);
    END
END;
GO
CREATE PROCEDURE [pro_app].[sp_recalcular_precio_venta_actual]
    @IDCaso INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @PrecioBase MONEY;
    SELECT @PrecioBase = PrecioVenta FROM pro_ventas.Casos WHERE IDCaso = @IDCaso;

    IF @PrecioBase IS NULL
        RETURN; -- caso no existe o sin precio

    DECLARE @SumaExtras MONEY = (
        SELECT ISNULL(SUM(MontoAjuste_CRC), 0)
        FROM [pro_app].[caso_extra]
        WHERE IDCaso = @IDCaso
          AND Estado = 'APROBADA'
          AND Tipo = 'EXTRA'
    );

    DECLARE @SumaDescuentos MONEY = (
        SELECT ISNULL(SUM(MontoAjuste_CRC), 0)
        FROM [pro_app].[caso_extra]
        WHERE IDCaso = @IDCaso
          AND Estado = 'APROBADA'
          AND Tipo = 'DESCUENTO'
    );

    DECLARE @PrecioActual MONEY = @PrecioBase + @SumaExtras - @SumaDescuentos;

    -- UPSERT en caso_lote_banco
    IF EXISTS (SELECT 1 FROM [pro_app].[caso_lote_banco] WHERE IDCaso = @IDCaso)
    BEGIN
        UPDATE [pro_app].[caso_lote_banco]
        SET    PrecioVentaActual_CRC = @PrecioActual,
               FechaModificacion     = SYSUTCDATETIME()
        WHERE  IDCaso = @IDCaso;
    END
    ELSE
    BEGIN
        INSERT INTO [pro_app].[caso_lote_banco]
            (IDCaso, MontoPagaBancoPorLote_CRC, PrecioVentaActual_CRC)
        VALUES
            (@IDCaso, @PrecioActual, @PrecioActual);
    END
END;
GO
-- =============================================================================
-- 18-may-2026 — Utilidad AD sin lote interno
--
-- Cambio de fórmula confirmado con Tesorería:
--   - El 5% del lote interno que recibe AD ES una comisión por gestionar el
--     lote (que es propiedad de QFI/GM). NO es utilidad de venta.
--   - Por lo tanto, la base para calcular UtilidadReservada deja de ser
--     TotalAD y pasa a ser solo "AD sobrante construcción".
--   - La exclusividad sigue como hoy: se descuenta del TotalAD pero no del
--     base de utilidad (opción A propuesta en planificación).
--
-- Fórmula NUEVA (movs del lote, EsCapturaBruta=1):
--   MontoBaseUtilidad_CRC = MontoAplicadoLote_CRC − LoteInterno_CRC
--                         = "AD sobrante construcción"
--   UtilidadReservada     = MontoBaseUtilidad × PorcentajeUtilidadP / 100
--
-- Fórmula NUEVA (movs NO del lote o EsCapturaBruta=0):
--   MontoBaseUtilidad_CRC = MontoColones (sin cambios)
--   UtilidadReservada     = MontoColones × PorcentajeUtilidadP / 100
--
-- Cambios:
--   1. sp_recalcular_utilidad_mov: nueva fórmula.
--   2. vw_utilidad_powerbi (NUEVA): vista plana con todos los componentes
--      AD desglosados, pensada para reportes PowerBI.
--   3. Script de recálculo histórico: itera sobre movs del lote y dispara
--      sp_recalcular_utilidad_mov para refrescar UtilidadReservada con la
--      nueva fórmula. Reemplaza también pro_ventas.UtilidadMovimiento (vía SP).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Recrear sp_recalcular_utilidad_mov con nueva fórmula.
-- -----------------------------------------------------------------------------
CREATE   PROCEDURE [pro_app].[sp_recalcular_utilidad_mov]
    @IDMovimiento INT
WITH EXECUTE AS OWNER
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @IDCaso INT;
    DECLARE @MontoMov MONEY;
    DECLARE @Categoria VARCHAR(10);
    DECLARE @Porcentaje DECIMAL(9, 2);
    DECLARE @MontoBase MONEY;
    DECLARE @Utilidad MONEY;

    SELECT
        @IDCaso    = m.IDCaso,
        @MontoMov  = m.MontoColones,
        @Categoria = LTRIM(RTRIM(tm.Categoria)),
        @Porcentaje = cs.PorcentajeUtilidadP
    FROM pro_ventas.Movimientos m
    INNER JOIN pro_ventas.TipMovi tm ON tm.IDTmov = m.IDTipmov
    INNER JOIN pro_ventas.Casos cs   ON cs.IDCaso = m.IDCaso
    WHERE m.IDMovimiento = @IDMovimiento;

    IF @IDCaso IS NULL RETURN;

    -- Categorías que NO generan utilidad → UtilidadReservada = NULL.
    IF @Categoria NOT IN ('D', 'EX')
    BEGIN
        UPDATE pro_ventas.Movimientos
        SET    UtilidadReservada = NULL
        WHERE  IDMovimiento = @IDMovimiento;
        EXEC [pro_app].[sp_upsert_utilidad_movimiento] @IDMovimiento = @IDMovimiento;
        RETURN;
    END

    -- Si no hay PorcentajeUtilidadP capturado, dejamos NULL.
    IF @Porcentaje IS NULL OR @Porcentaje = 0
    BEGIN
        UPDATE pro_ventas.Movimientos
        SET    UtilidadReservada = NULL
        WHERE  IDMovimiento = @IDMovimiento;
        EXEC [pro_app].[sp_upsert_utilidad_movimiento] @IDMovimiento = @IDMovimiento;
        RETURN;
    END

    -- NUEVA FÓRMULA (18-may-2026):
    -- Para movs del lote (EsCapturaBruta=1, vinculados a hito LOTE o
    -- pago_cliente LOTE), la base es SOLO la parte de "sobrante construcción"
    -- (MontoAplicadoLote − LoteInterno), porque el 5% del lote interno es
    -- comisión de AD por gestionar el lote, no utilidad de venta.
    --
    -- vw_liquidacion_lote tiene los campos MontoAplicadoLote_CRC y
    -- LoteInterno_CRC iguales para todas las filas del mismo mov (lo que
    -- cambia entre filas es MontoEntidad_CRC). Tomamos la fila AD para
    -- extraerlos.
    DECLARE @MontoBaseConstruccion MONEY = NULL;
    SELECT TOP 1
        @MontoBaseConstruccion = MontoAplicadoLote_CRC - LoteInterno_CRC
    FROM [pro_app].vw_liquidacion_lote
    WHERE IDMovimiento = @IDMovimiento
      AND CodigoEntidad = 'AD'
      AND EsCapturaBruta = 1;

    -- Si encontró fila bruta del lote → usar la base "construcción".
    -- Si no encontró → es mov de casa o legacy neto → usar MontoColones.
    SET @MontoBase = ISNULL(@MontoBaseConstruccion, @MontoMov);

    -- Edge case: MontoBase negativo (lote sobre-cobrado: aplicado < interno).
    -- En ese escenario raro NO hay utilidad — clampear a 0.
    IF @MontoBase < 0 SET @MontoBase = 0;

    SET @Utilidad = CAST(@MontoBase * @Porcentaje / 100.0 AS MONEY);

    UPDATE pro_ventas.Movimientos
    SET    UtilidadReservada = @Utilidad
    WHERE  IDMovimiento = @IDMovimiento;

    -- Espejo en pro_ventas.UtilidadMovimiento (INSERT o UPDATE).
    EXEC [pro_app].[sp_upsert_utilidad_movimiento] @IDMovimiento = @IDMovimiento;
END;
GO
CREATE PROCEDURE [pro_app].[sp_rechazar_extra]
    @IDExtra       INT,
    @Notas         NVARCHAR(1000) = NULL,
    @UsuarioEmail  NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @Estado VARCHAR(20), @IDCaso INT;
    SELECT @Estado = Estado, @IDCaso = IDCaso
    FROM [pro_app].[caso_extra] WHERE IDExtra = @IDExtra;

    IF @Estado IS NULL
        THROW 52004, 'IDExtra no existe.', 1;
    IF @Estado = 'RECHAZADA'
        THROW 52008, 'La extra ya está rechazada.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @EstadoAnterior VARCHAR(20) = @Estado;

        UPDATE [pro_app].[caso_extra]
        SET    Estado            = 'RECHAZADA',
               Notas             = COALESCE(@Notas, Notas),
               ModificadoPor     = @UsuarioEmail,
               FechaModificacion = SYSUTCDATETIME()
        WHERE  IDExtra = @IDExtra;

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.caso_extra', @IDExtra, 'UPDATE', @UsuarioEmail,
             CONCAT('{"Estado":"', @EstadoAnterior, '"}'),
             '{"Estado":"RECHAZADA"}',
             CONCAT('Rechazo extra ', @IDExtra));

        -- Si venía aprobada, recalcular PrecioVentaActual (al rechazar
        -- una APROBADA se debe quitar del cálculo)
        IF @EstadoAnterior = 'APROBADA'
            EXEC [pro_app].[sp_recalcular_precio_venta_actual] @IDCaso = @IDCaso;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_refrescar_fecha_real_hito]
    @IDCasoHito INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @MaxFecha DATE = (
        SELECT MAX(m.FechaMovimiento)
        FROM [pro_app].[movimiento_hito_link] lk
        INNER JOIN pro_ventas.Movimientos m ON m.IDMovimiento = lk.IDMovimiento
        WHERE lk.IDCasoHito = @IDCasoHito
    );

    DECLARE @NumLinks INT = (
        SELECT COUNT(*) FROM [pro_app].[movimiento_hito_link]
        WHERE IDCasoHito = @IDCasoHito
    );

    UPDATE [pro_app].[caso_hito_proyeccion]
    SET FechaRealDesembolso = @MaxFecha,
        EstadoTramite       = CASE WHEN @NumLinks > 0 THEN 'DESEMBOLSADO' ELSE 'PLANEADO' END,
        FechaModificacion   = SYSUTCDATETIME()
    WHERE IDCasoHito = @IDCasoHito;
END;
GO
CREATE PROCEDURE [pro_app].[sp_refrescar_fecha_real_lote_hito]
    @IDCreditoPuenteLoteHito INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @MaxFecha DATE = (
        SELECT MAX(m.FechaMovimiento)
        FROM [pro_app].[credito_puente_link] lk
        INNER JOIN [pro_app].[credito_puente_movimiento] m ON m.IDMovCP = lk.IDMovCP
        WHERE lk.IDCreditoPuenteLoteHito = @IDCreditoPuenteLoteHito
    );

    DECLARE @NumLinks INT = (
        SELECT COUNT(*) FROM [pro_app].[credito_puente_link]
        WHERE IDCreditoPuenteLoteHito = @IDCreditoPuenteLoteHito
    );

    UPDATE [pro_app].[credito_puente_lote_hito]
    SET FechaRealDesembolso = @MaxFecha,
        EstadoTramite       = CASE WHEN @NumLinks > 0 THEN 'DESEMBOLSADO' ELSE 'PLANEADO' END,
        FechaModificacion   = SYSUTCDATETIME()
    WHERE IDCreditoPuenteLoteHito = @IDCreditoPuenteLoteHito;
END;
GO
CREATE PROCEDURE [pro_app].[sp_refrescar_pago_cliente]
    @IDPago INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @MaxFecha DATE = (
        SELECT MAX(m.FechaMovimiento)
        FROM [pro_app].[pago_cliente_mov_link] lk
        INNER JOIN pro_ventas.Movimientos m ON m.IDMovimiento = lk.IDMovimiento
        WHERE lk.IDPago = @IDPago
    );

    UPDATE [pro_app].[pago_cliente]
    SET    FechaReal = @MaxFecha
    WHERE  IDPago = @IDPago;
END;
GO
CREATE PROCEDURE [pro_app].[sp_revertir_confirmacion_lote_cp]
    @IDCreditoPuenteLote              INT,
    @MotivoReversion                  NVARCHAR(500) = NULL,
    @UsuarioEmail                     NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @IDCreditoPuenteLote IS NULL OR NOT EXISTS (
        SELECT 1 FROM [pro_app].[credito_puente_lote] WHERE IDCreditoPuenteLote = @IDCreditoPuenteLote
    )
        THROW 52030, 'IDCreditoPuenteLote no existe.', 1;

    DECLARE @EstadoAnterior VARCHAR(30);
    SELECT @EstadoAnterior = Estado
    FROM   [pro_app].[credito_puente_lote]
    WHERE  IDCreditoPuenteLote = @IDCreditoPuenteLote;

    IF @EstadoAnterior <> 'CANCELACION_CONFIRMADA'
        THROW 52031, 'Solo se puede revertir un lote en estado CANCELACION_CONFIRMADA.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @ValorAnterior NVARCHAR(MAX) = (
            SELECT Estado, FechaConfirmacionCancelacion, MontoConfirmadoAlBanco_CRC,
                   ComprobanteCancelacion
            FROM [pro_app].[credito_puente_lote]
            WHERE IDCreditoPuenteLote = @IDCreditoPuenteLote
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        UPDATE [pro_app].[credito_puente_lote]
        SET    Estado                        = 'CANCELACION_PROGRAMADA',
               FechaConfirmacionCancelacion  = NULL,
               MontoConfirmadoAlBanco_CRC    = NULL,
               ComprobanteCancelacion        = NULL,
               ModificadoPor                 = @UsuarioEmail,
               FechaModificacion             = SYSUTCDATETIME()
        WHERE  IDCreditoPuenteLote = @IDCreditoPuenteLote;

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.credito_puente_lote', @IDCreditoPuenteLote, 'UPDATE', @UsuarioEmail,
             @ValorAnterior,
             (SELECT Estado = 'CANCELACION_PROGRAMADA' FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
             CONCAT('Reversion de cancelacion confirmada del lote CP ', @IDCreditoPuenteLote,
                    CASE WHEN @MotivoReversion IS NOT NULL THEN CONCAT(' — motivo: ', @MotivoReversion) ELSE '' END,
                    ' (Fase 6.3)'));

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_upsert_liquidacion_lote_override]
    @IDMovimiento             INT,
    @LoteInternoOverride_CRC  MONEY = NULL,
    @ExclusividadOverride_CRC MONEY = NULL,
    @UsuarioEmail             NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (SELECT 1 FROM pro_ventas.Movimientos WHERE IDMovimiento = @IDMovimiento)
        THROW 53200, 'IDMovimiento no existe en pro_ventas.Movimientos.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @ValorAnterior NVARCHAR(MAX) = (
            SELECT IDMovimiento, LoteInternoOverride_CRC, ExclusividadOverride_CRC
            FROM [pro_app].liquidacion_lote_override
            WHERE IDMovimiento = @IDMovimiento
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        IF @LoteInternoOverride_CRC IS NULL AND @ExclusividadOverride_CRC IS NULL
        BEGIN
            -- Ambos NULL = quitar override.
            DELETE FROM [pro_app].liquidacion_lote_override
            WHERE IDMovimiento = @IDMovimiento;

            IF @ValorAnterior IS NOT NULL
            BEGIN
                INSERT INTO [pro_app].audit_log
                    (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON, ValorNuevoJSON, Contexto)
                VALUES
                    ('pro_app.liquidacion_lote_override', @IDMovimiento, 'DELETE', @UsuarioEmail,
                     @ValorAnterior, NULL,
                     CONCAT('Override de liquidacion eliminado (mov ', @IDMovimiento, ')'));
            END
        END
        ELSE IF EXISTS (SELECT 1 FROM [pro_app].liquidacion_lote_override WHERE IDMovimiento = @IDMovimiento)
        BEGIN
            UPDATE [pro_app].liquidacion_lote_override
            SET    LoteInternoOverride_CRC    = @LoteInternoOverride_CRC,
                   ExclusividadOverride_CRC   = @ExclusividadOverride_CRC,
                   ModificadoPor              = @UsuarioEmail,
                   FechaModificacion          = SYSUTCDATETIME()
            WHERE  IDMovimiento = @IDMovimiento;

            INSERT INTO [pro_app].audit_log
                (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON, ValorNuevoJSON, Contexto)
            VALUES
                ('pro_app.liquidacion_lote_override', @IDMovimiento, 'UPDATE', @UsuarioEmail,
                 @ValorAnterior,
                 (SELECT IDMovimiento = @IDMovimiento,
                         LoteInternoOverride_CRC = @LoteInternoOverride_CRC,
                         ExclusividadOverride_CRC = @ExclusividadOverride_CRC
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                 CONCAT('Override de liquidacion actualizado (mov ', @IDMovimiento, ')'));
        END
        ELSE
        BEGIN
            INSERT INTO [pro_app].liquidacion_lote_override
                (IDMovimiento, LoteInternoOverride_CRC, ExclusividadOverride_CRC, CreadoPor)
            VALUES
                (@IDMovimiento, @LoteInternoOverride_CRC, @ExclusividadOverride_CRC, @UsuarioEmail);

            INSERT INTO [pro_app].audit_log
                (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON, ValorNuevoJSON, Contexto)
            VALUES
                ('pro_app.liquidacion_lote_override', @IDMovimiento, 'INSERT', @UsuarioEmail,
                 NULL,
                 (SELECT IDMovimiento = @IDMovimiento,
                         LoteInternoOverride_CRC = @LoteInternoOverride_CRC,
                         ExclusividadOverride_CRC = @ExclusividadOverride_CRC
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                 CONCAT('Override de liquidacion creado (mov ', @IDMovimiento, ')'));
        END

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_upsert_proyeccion_caso]
    @IDCaso                     INT,
    @IDHito                     INT,
    @FechaPlaneadaHito          DATE = NULL,
    @FechaPlaneadaVisitaPerito  DATE = NULL,
    @FechaProyectadaDesembolso  DATE = NULL,
    @FechaRealHito              DATE = NULL,
    @FechaRealVisitaPerito      DATE = NULL,
    @FechaRealDesembolso        DATE = NULL,
    @EstadoTramite              VARCHAR(30) = 'PLANEADO',
    @Notas                      NVARCHAR(1000) = NULL,
    @UsuarioEmail               NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @IDCaso IS NULL OR NOT EXISTS (SELECT 1 FROM pro_ventas.Casos WHERE IDCaso = @IDCaso)
        THROW 51800, 'IDCaso inválido o no existe.', 1;

    IF @IDHito IS NULL OR NOT EXISTS (SELECT 1 FROM [pro_app].[catalogo_hito] WHERE IDHito = @IDHito)
        THROW 51801, 'IDHito inválido o no existe.', 1;

    IF @EstadoTramite NOT IN ('PLANEADO', 'VISITA_SOLICITADA', 'VISITA_REALIZADA', 'DESEMBOLSADO', 'CANCELADO')
        THROW 51802, 'EstadoTramite inválido.', 1;

    DECLARE @IDBanco INT, @FechaFormalizacion DATE;
    SELECT @IDBanco = IDBanco, @FechaFormalizacion = FechaFormalizacion
    FROM pro_ventas.Casos WHERE IDCaso = @IDCaso;

    DECLARE @IDEsquema INT, @OrdenEnCaso INT;
    SELECT TOP 1
        @IDEsquema = IDEsquema,
        @OrdenEnCaso = OrdenEnEsquema
    FROM [pro_app].[banco_esquema_desembolso]
    WHERE IDBan = @IDBanco
      AND IDHito = @IDHito
      AND VigenteDesde <= ISNULL(@FechaFormalizacion, GETDATE())
      AND (VigenteHasta IS NULL OR VigenteHasta >= ISNULL(@FechaFormalizacion, GETDATE()))
    ORDER BY VigenteDesde DESC;

    IF @IDEsquema IS NULL
        THROW 51803, 'No se encontró esquema de desembolso vigente para el banco/hito del caso.', 1;

    -- Bloqueo Issue P parte BD: si hay links activos, no permitir cambio a
    -- estado distinto de DESEMBOLSADO.
    DECLARE @IDExistente INT;
    SELECT @IDExistente = IDCasoHito FROM [pro_app].[caso_hito_proyeccion]
    WHERE IDCaso = @IDCaso AND IDHito = @IDHito;

    IF @IDExistente IS NOT NULL AND @EstadoTramite <> 'DESEMBOLSADO'
    BEGIN
        DECLARE @NumLinksActivos INT = (
            SELECT COUNT(*) FROM [pro_app].[movimiento_hito_link]
            WHERE IDCasoHito = @IDExistente
        );
        IF @NumLinksActivos > 0
            THROW 51804,
                  'No se puede cambiar el estado del hito porque tiene movimientos vinculados. Desvinculá primero.',
                  1;
    END

    BEGIN TRY
        BEGIN TRANSACTION;

        IF @IDExistente IS NULL
        BEGIN
            INSERT INTO [pro_app].[caso_hito_proyeccion]
                (IDCaso, IDHito, IDEsquema, OrdenEnCaso,
                 FechaPlaneadaHito, FechaPlaneadaVisitaPerito, FechaProyectadaDesembolso,
                 FechaRealHito, FechaRealVisitaPerito, FechaRealDesembolso,
                 Moneda, EstadoTramite, Notas)
            VALUES
                (@IDCaso, @IDHito, @IDEsquema, @OrdenEnCaso,
                 @FechaPlaneadaHito, @FechaPlaneadaVisitaPerito, @FechaProyectadaDesembolso,
                 @FechaRealHito, @FechaRealVisitaPerito, @FechaRealDesembolso,
                 'CRC', @EstadoTramite, @Notas);
            SET @IDExistente = SCOPE_IDENTITY();

            INSERT INTO [pro_app].[audit_log]
                (Tabla, IDRegistro, Accion, UsuarioEmail, ValorNuevoJSON, Contexto)
            VALUES
                ('pro_app.caso_hito_proyeccion', @IDExistente, 'INSERT', @UsuarioEmail,
                 (SELECT IDCaso = @IDCaso, IDHito = @IDHito,
                         FechaProyectadaDesembolso = @FechaProyectadaDesembolso,
                         EstadoTramite = @EstadoTramite, Notas = @Notas
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                 CONCAT('Proyección caso ', @IDCaso, ' / hito ', @IDHito));
        END
        ELSE
        BEGIN
            DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = (
                SELECT FechaPlaneadaHito, FechaPlaneadaVisitaPerito, FechaProyectadaDesembolso,
                       FechaRealHito, FechaRealVisitaPerito, FechaRealDesembolso,
                       EstadoTramite, Notas
                FROM [pro_app].[caso_hito_proyeccion] WHERE IDCasoHito = @IDExistente
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            );

            UPDATE [pro_app].[caso_hito_proyeccion]
            SET FechaPlaneadaHito          = @FechaPlaneadaHito,
                FechaPlaneadaVisitaPerito  = @FechaPlaneadaVisitaPerito,
                FechaProyectadaDesembolso  = @FechaProyectadaDesembolso,
                FechaRealHito              = @FechaRealHito,
                FechaRealVisitaPerito      = @FechaRealVisitaPerito,
                FechaRealDesembolso        = @FechaRealDesembolso,
                EstadoTramite              = @EstadoTramite,
                Notas                      = @Notas,
                FechaModificacion          = SYSUTCDATETIME()
            WHERE IDCasoHito = @IDExistente;

            INSERT INTO [pro_app].[audit_log]
                (Tabla, IDRegistro, Accion, UsuarioEmail, ValorAnteriorJSON, ValorNuevoJSON, Contexto)
            VALUES
                ('pro_app.caso_hito_proyeccion', @IDExistente, 'UPDATE', @UsuarioEmail,
                 @ValorAnteriorJSON,
                 (SELECT FechaPlaneadaHito = @FechaPlaneadaHito,
                         FechaPlaneadaVisitaPerito = @FechaPlaneadaVisitaPerito,
                         FechaProyectadaDesembolso = @FechaProyectadaDesembolso,
                         FechaRealHito = @FechaRealHito,
                         FechaRealVisitaPerito = @FechaRealVisitaPerito,
                         FechaRealDesembolso = @FechaRealDesembolso,
                         EstadoTramite = @EstadoTramite, Notas = @Notas
                  FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                 CONCAT('Update proyección caso ', @IDCaso, ' / hito ', @IDHito));
        END;

        COMMIT TRANSACTION;

        SELECT @IDExistente AS IDProyeccion;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_upsert_utilidad_movimiento]
    @IDMovimiento INT
WITH EXECUTE AS OWNER
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Utilidad MONEY;
    DECLARE @IDCaso INT;
    DECLARE @IDLote INT;
    DECLARE @Fecha DATE;
    DECLARE @Moneda NCHAR(10);
    DECLARE @TC MONEY;

    SELECT
        @Utilidad = m.UtilidadReservada,
        @IDCaso   = m.IDCaso,
        @IDLote   = cs.IDLote,
        @Fecha    = m.FechaMovimiento,
        @Moneda   = m.Moneda,
        @TC       = m.TipoCambio
    FROM pro_ventas.Movimientos m
    INNER JOIN pro_ventas.Casos cs ON cs.IDCaso = m.IDCaso
    WHERE m.IDMovimiento = @IDMovimiento;

    -- Si el mov no existe o no tiene utilidad, eliminar la fila si existiera.
    IF @IDCaso IS NULL OR @Utilidad IS NULL OR @Utilidad = 0
    BEGIN
        DELETE FROM pro_ventas.UtilidadMovimiento WHERE IDMovimiento = @IDMovimiento;
        RETURN;
    END

    DECLARE @MontoUSD MONEY = NULL;
    IF @TC IS NOT NULL AND @TC > 0
        SET @MontoUSD = CAST(@Utilidad / @TC AS MONEY);

    -- NOTA: AñoMov, MesMov y NumMesMov son columnas calculadas (computed) en
    -- pro_ventas.UtilidadMovimiento — SQL Server las deriva automáticamente de
    -- FechaMovimiento. NO se incluyen en INSERT/UPDATE.

    IF EXISTS (SELECT 1 FROM pro_ventas.UtilidadMovimiento WHERE IDMovimiento = @IDMovimiento)
    BEGIN
        UPDATE pro_ventas.UtilidadMovimiento
        SET    IDCaso          = @IDCaso,
               IDLote          = @IDLote,
               FechaMovimiento = @Fecha,
               Moneda          = @Moneda,
               MontoBase       = @Utilidad,
               MontoColones    = @Utilidad,
               MontoDolares    = @MontoUSD,
               TipoCambio      = @TC,
               TgSumaResta     = 1,
               TipoMovimiento  = 'Utilidad Ingresada',
               TgDesarrollos   = 1,
               FechaModificado = GETDATE()
        WHERE  IDMovimiento = @IDMovimiento;
    END
    ELSE
    BEGIN
        INSERT INTO pro_ventas.UtilidadMovimiento
            (IDMovimiento, IDCaso, IDLote, IDTipmov, FechaMovimiento, Moneda,
             MontoBase, MontoColones, MontoDolares, TipoCambio,
             TgSumaResta, TipoMovimiento,
             TgDesarrollos, FechaCreacion)
        VALUES
            (@IDMovimiento, @IDCaso, @IDLote, NULL, @Fecha, @Moneda,
             @Utilidad, @Utilidad, @MontoUSD, @TC,
             1, 'Utilidad Ingresada',
             1, GETDATE());
    END
END;
GO
CREATE PROCEDURE [pro_app].[sp_vincular_a_hito_de_caso]
    @IDMovimiento       INT,
    @IDCaso             INT,
    @IDHito             INT,
    @MontoAplicado_CRC  MONEY,
    @Notas              NVARCHAR(500) = NULL,
    @UsuarioEmail       NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDCasoMov INT, @MontoMov MONEY, @FechaMov DATE;
    SELECT @IDCasoMov = IDCaso,
           @MontoMov  = MontoColones,
           @FechaMov  = FechaMovimiento
    FROM pro_ventas.Movimientos
    WHERE IDMovimiento = @IDMovimiento;

    IF @IDCasoMov IS NULL
        THROW 51960, 'IDMovimiento no existe en pro_ventas.Movimientos.', 1;

    IF @IDCasoMov <> @IDCaso
        THROW 51961, 'El movimiento no pertenece al IDCaso indicado.', 1;

    IF @MontoAplicado_CRC IS NULL OR @MontoAplicado_CRC <= 0
        THROW 51962, 'MontoAplicado_CRC debe ser mayor a cero.', 1;

    DECLARE @IDCasoHito INT;
    SELECT @IDCasoHito = IDCasoHito
    FROM [pro_app].[caso_hito_proyeccion]
    WHERE IDCaso = @IDCaso AND IDHito = @IDHito;

    DECLARE @ProyeccionCreada BIT = 0;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF @IDCasoHito IS NULL
        BEGIN
            DECLARE @IDBanco INT;
            SELECT @IDBanco = IDBanco FROM pro_ventas.Casos WHERE IDCaso = @IDCaso;
            IF @IDBanco IS NULL
                THROW 51963, 'IDCaso inválido o sin IDBanco asignado.', 1;

            DECLARE @IDEsquema INT, @OrdenEnEsquema INT;
            SELECT @IDEsquema      = e.IDEsquema,
                   @OrdenEnEsquema = e.OrdenEnEsquema
            FROM [pro_app].[banco_esquema_desembolso] e
            WHERE e.IDBan = @IDBanco
              AND e.IDHito = @IDHito
              AND e.VigenteHasta IS NULL;

            IF @IDEsquema IS NULL OR @OrdenEnEsquema IS NULL
                THROW 51964,
                      'No hay esquema vigente para el banco del caso, o el hito no pertenece al esquema.',
                      1;

            INSERT INTO [pro_app].[caso_hito_proyeccion]
                (IDCaso, IDHito, IDEsquema, OrdenEnCaso,
                 FechaRealDesembolso, EstadoTramite, Notas)
            VALUES
                (@IDCaso, @IDHito, @IDEsquema, @OrdenEnEsquema,
                 @FechaMov, 'DESEMBOLSADO',
                 CONCAT('Creada al vincular movimiento ', @IDMovimiento));

            SET @IDCasoHito       = SCOPE_IDENTITY();
            SET @ProyeccionCreada = 1;

            DECLARE @ProyJSON NVARCHAR(MAX) = (
                SELECT IDCasoHito          = @IDCasoHito,
                       IDCaso              = @IDCaso,
                       IDHito              = @IDHito,
                       IDEsquema           = @IDEsquema,
                       OrdenEnCaso         = @OrdenEnEsquema,
                       FechaRealDesembolso = @FechaMov,
                       EstadoTramite       = 'DESEMBOLSADO'
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            );

            INSERT INTO [pro_app].[audit_log]
                (Tabla, IDRegistro, Accion, UsuarioEmail,
                 ValorAnteriorJSON, ValorNuevoJSON, Contexto)
            VALUES
                ('pro_app.caso_hito_proyeccion', @IDCasoHito, 'INSERT', @UsuarioEmail,
                 NULL, @ProyJSON,
                 CONCAT('Proyección materializada al vincular mov ', @IDMovimiento,
                        ' a caso ', @IDCaso, ' hito ', @IDHito,
                        ' (orden ', @OrdenEnEsquema, ')'));
        END

        DECLARE @MontoActualEnLink MONEY;
        SELECT @MontoActualEnLink = MontoAplicado_CRC
        FROM [pro_app].[movimiento_hito_link]
        WHERE IDMovimiento = @IDMovimiento AND IDCasoHito = @IDCasoHito;

        DECLARE @SumaOtros MONEY;
        SELECT @SumaOtros = ISNULL(SUM(MontoAplicado_CRC), 0)
        FROM [pro_app].[movimiento_hito_link]
        WHERE IDMovimiento = @IDMovimiento
          AND IDCasoHito  <> @IDCasoHito;

        IF (@SumaOtros + @MontoAplicado_CRC) > ISNULL(@MontoMov, 0)
            THROW 51965,
                  'La suma de montos vinculados excede el MontoColones del movimiento.',
                  1;

        DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = NULL;
        DECLARE @AccionLink VARCHAR(20);
        DECLARE @IDLink INT;

        IF @MontoActualEnLink IS NOT NULL
        BEGIN
            SET @ValorAnteriorJSON = (
                SELECT IDLink, IDMovimiento, IDCasoHito,
                       MontoAplicado_CRC, Notas, UsuarioVinculo, FechaVinculacion
                FROM [pro_app].[movimiento_hito_link]
                WHERE IDMovimiento = @IDMovimiento AND IDCasoHito = @IDCasoHito
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            );

            UPDATE [pro_app].[movimiento_hito_link]
            SET    MontoAplicado_CRC = @MontoAplicado_CRC,
                   Notas             = @Notas,
                   UsuarioVinculo    = @UsuarioEmail,
                   FechaVinculacion  = SYSUTCDATETIME()
            WHERE  IDMovimiento = @IDMovimiento
               AND IDCasoHito  = @IDCasoHito;

            SELECT @IDLink = IDLink
            FROM [pro_app].[movimiento_hito_link]
            WHERE IDMovimiento = @IDMovimiento AND IDCasoHito = @IDCasoHito;

            SET @AccionLink = 'UPDATE';
        END
        ELSE
        BEGIN
            INSERT INTO [pro_app].[movimiento_hito_link]
                (IDMovimiento, IDCasoHito, MontoAplicado_CRC, Notas, UsuarioVinculo)
            VALUES
                (@IDMovimiento, @IDCasoHito, @MontoAplicado_CRC, @Notas, @UsuarioEmail);

            SET @IDLink     = SCOPE_IDENTITY();
            SET @AccionLink = 'INSERT';
        END

        DECLARE @LinkJSON NVARCHAR(MAX) = (
            SELECT IDLink            = @IDLink,
                   IDMovimiento      = @IDMovimiento,
                   IDCasoHito        = @IDCasoHito,
                   MontoAplicado_CRC = @MontoAplicado_CRC,
                   Notas             = @Notas
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.movimiento_hito_link', @IDLink, @AccionLink, @UsuarioEmail,
             @ValorAnteriorJSON, @LinkJSON,
             CONCAT('Vinculación movimiento ', @IDMovimiento,
                    ' -> hito ', @IDCasoHito,
                    ' por ', CAST(@MontoAplicado_CRC AS NVARCHAR(40)), ' CRC',
                    CASE WHEN @ProyeccionCreada = 1
                         THEN ' (proyección recién creada)'
                         ELSE '' END));

        -- Refrescar fecha real y estado del hito según links activos.
        EXEC [pro_app].sp_refrescar_fecha_real_hito @IDCasoHito = @IDCasoHito;

        COMMIT TRANSACTION;

        SELECT @IDCasoHito       AS IDCasoHito,
               @IDLink           AS IDLink,
               @AccionLink       AS Accion,
               @ProyeccionCreada AS ProyeccionCreada;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_vincular_mov_a_pago_cliente]
    @IDMovimiento       INT,
    @IDPago             INT,
    @MontoAplicado_CRC  MONEY,
    @Notas              NVARCHAR(500) = NULL,
    @UsuarioEmail       NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Validaciones de existencia
    DECLARE @IDCasoMov INT, @MontoMov MONEY;
    SELECT @IDCasoMov = IDCaso, @MontoMov = MontoColones
    FROM pro_ventas.Movimientos
    WHERE IDMovimiento = @IDMovimiento;

    IF @IDCasoMov IS NULL
        THROW 52200, 'IDMovimiento no existe en pro_ventas.Movimientos.', 1;

    DECLARE @IDCasoPago INT;
    SELECT @IDCasoPago = IDCaso
    FROM [pro_app].[pago_cliente]
    WHERE IDPago = @IDPago;

    IF @IDCasoPago IS NULL
        THROW 52201, 'IDPago no existe en [pro_app].pago_cliente.', 1;

    IF @IDCasoMov <> @IDCasoPago
        THROW 52202, 'El movimiento y el pago cliente pertenecen a casos distintos.', 1;

    IF @MontoAplicado_CRC IS NULL OR @MontoAplicado_CRC <= 0
        THROW 52203, 'MontoAplicado_CRC debe ser mayor a cero.', 1;

    -- Validar que el mov no quede sobrevinculado:
    -- suma aplicada a hitos + suma aplicada a otros pagos cliente + este
    -- upsert no debe exceder MontoColones.
    DECLARE @MontoActualEnLink MONEY;
    SELECT @MontoActualEnLink = MontoAplicado_CRC
    FROM [pro_app].[pago_cliente_mov_link]
    WHERE IDMovimiento = @IDMovimiento AND IDPago = @IDPago;

    DECLARE @SumaHitos MONEY = ISNULL(
        (SELECT SUM(MontoAplicado_CRC)
         FROM [pro_app].[movimiento_hito_link]
         WHERE IDMovimiento = @IDMovimiento), 0);

    DECLARE @SumaOtrosPagos MONEY = ISNULL(
        (SELECT SUM(MontoAplicado_CRC)
         FROM [pro_app].[pago_cliente_mov_link]
         WHERE IDMovimiento = @IDMovimiento
           AND IDPago      <> @IDPago), 0);

    IF (@SumaHitos + @SumaOtrosPagos + @MontoAplicado_CRC) > ISNULL(@MontoMov, 0)
        THROW 52204,
              'La suma de montos vinculados (hitos + pagos cliente) excede el MontoColones del movimiento.',
              1;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = NULL;
        DECLARE @Accion VARCHAR(20);
        DECLARE @IDLink INT;

        IF @MontoActualEnLink IS NOT NULL
        BEGIN
            SET @ValorAnteriorJSON = (
                SELECT IDLink, IDPago, IDMovimiento,
                       MontoAplicado_CRC, Notas, UsuarioVinculo, FechaVinculacion
                FROM [pro_app].[pago_cliente_mov_link]
                WHERE IDPago = @IDPago AND IDMovimiento = @IDMovimiento
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            );

            UPDATE [pro_app].[pago_cliente_mov_link]
            SET    MontoAplicado_CRC = @MontoAplicado_CRC,
                   Notas             = @Notas,
                   UsuarioVinculo    = @UsuarioEmail,
                   FechaVinculacion  = SYSUTCDATETIME()
            WHERE  IDPago = @IDPago
               AND IDMovimiento = @IDMovimiento;

            SELECT @IDLink = IDLink
            FROM [pro_app].[pago_cliente_mov_link]
            WHERE IDPago = @IDPago AND IDMovimiento = @IDMovimiento;

            SET @Accion = 'UPDATE';
        END
        ELSE
        BEGIN
            INSERT INTO [pro_app].[pago_cliente_mov_link]
                (IDPago, IDMovimiento, MontoAplicado_CRC, Notas, UsuarioVinculo)
            VALUES
                (@IDPago, @IDMovimiento, @MontoAplicado_CRC, @Notas, @UsuarioEmail);

            SET @IDLink = SCOPE_IDENTITY();
            SET @Accion = 'INSERT';
        END

        DECLARE @ValorNuevoJSON NVARCHAR(MAX) = (
            SELECT IDLink            = @IDLink,
                   IDPago            = @IDPago,
                   IDMovimiento      = @IDMovimiento,
                   MontoAplicado_CRC = @MontoAplicado_CRC,
                   Notas             = @Notas
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.pago_cliente_mov_link', @IDLink, @Accion, @UsuarioEmail,
             @ValorAnteriorJSON, @ValorNuevoJSON,
             CONCAT('Vinculación mov ', @IDMovimiento,
                    ' -> pago cliente ', @IDPago,
                    ' por ', CAST(@MontoAplicado_CRC AS NVARCHAR(40)), ' CRC'));

        -- Refrescar FechaReal del pago (MAX de FechaMovimiento de sus links)
        EXEC [pro_app].[sp_refrescar_pago_cliente] @IDPago = @IDPago;

        COMMIT TRANSACTION;

        SELECT @IDLink AS IDLink, @Accion AS Accion;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_vincular_mov_cp_a_hito_lote]
    @IDMovCP                     INT,
    @IDCreditoPuenteLoteHito     INT,
    @MontoAplicado_CRC           MONEY,
    @Notas                       NVARCHAR(500) = NULL,
    @UsuarioEmail                NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Validar mov
    DECLARE @IDCpDelMov INT, @MontoMov MONEY, @EstadoMov VARCHAR(20);
    SELECT @IDCpDelMov = IDCreditoPuente,
           @MontoMov   = MontoColones,
           @EstadoMov  = Estado
    FROM [pro_app].[credito_puente_movimiento]
    WHERE IDMovCP = @IDMovCP;

    IF @IDCpDelMov IS NULL
        THROW 52110, 'IDMovCP no existe.', 1;

    IF @EstadoMov = 'ANULADO'
        THROW 52111, 'No se puede vincular un movimiento anulado.', 1;

    -- Validar hito de lote y que pertenezca al mismo CP
    DECLARE @IDCpDelHito INT;
    SELECT @IDCpDelHito = cpl.IDCreditoPuente
    FROM [pro_app].[credito_puente_lote_hito] cplh
    INNER JOIN [pro_app].[credito_puente_lote] cpl
        ON cpl.IDCreditoPuenteLote = cplh.IDCreditoPuenteLote
    WHERE cplh.IDCreditoPuenteLoteHito = @IDCreditoPuenteLoteHito;

    IF @IDCpDelHito IS NULL
        THROW 52112, 'IDCreditoPuenteLoteHito no existe.', 1;

    IF @IDCpDelHito <> @IDCpDelMov
        THROW 52113,
              'El hito de lote no pertenece al mismo credito puente del movimiento.',
              1;

    IF @MontoAplicado_CRC IS NULL OR @MontoAplicado_CRC <= 0
        THROW 52114, 'MontoAplicado_CRC debe ser mayor a cero.', 1;

    -- Validar suma de aplicados no exceda el monto del mov
    DECLARE @MontoActualEnLink MONEY;
    SELECT @MontoActualEnLink = MontoAplicado_CRC
    FROM [pro_app].[credito_puente_link]
    WHERE IDMovCP = @IDMovCP AND IDCreditoPuenteLoteHito = @IDCreditoPuenteLoteHito;

    DECLARE @SumaOtros MONEY;
    SELECT @SumaOtros = ISNULL(SUM(MontoAplicado_CRC), 0)
    FROM [pro_app].[credito_puente_link]
    WHERE IDMovCP = @IDMovCP
      AND IDCreditoPuenteLoteHito <> @IDCreditoPuenteLoteHito;

    IF (@SumaOtros + @MontoAplicado_CRC) > ISNULL(@MontoMov, 0)
        THROW 52115,
              'La suma de montos vinculados excede el MontoColones del movimiento.',
              1;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = NULL;
        DECLARE @Accion VARCHAR(20);
        DECLARE @IDLinkCP INT;

        IF @MontoActualEnLink IS NOT NULL
        BEGIN
            SET @ValorAnteriorJSON = (
                SELECT IDLinkCP, IDMovCP, IDCreditoPuenteLoteHito,
                       MontoAplicado_CRC, Notas, UsuarioVinculo, FechaVinculacion
                FROM [pro_app].[credito_puente_link]
                WHERE IDMovCP = @IDMovCP AND IDCreditoPuenteLoteHito = @IDCreditoPuenteLoteHito
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            );

            UPDATE [pro_app].[credito_puente_link]
            SET    MontoAplicado_CRC = @MontoAplicado_CRC,
                   Notas             = @Notas,
                   UsuarioVinculo    = @UsuarioEmail,
                   FechaVinculacion  = SYSUTCDATETIME()
            WHERE  IDMovCP = @IDMovCP
               AND IDCreditoPuenteLoteHito = @IDCreditoPuenteLoteHito;

            SELECT @IDLinkCP = IDLinkCP
            FROM [pro_app].[credito_puente_link]
            WHERE IDMovCP = @IDMovCP AND IDCreditoPuenteLoteHito = @IDCreditoPuenteLoteHito;

            SET @Accion = 'UPDATE';
        END
        ELSE
        BEGIN
            INSERT INTO [pro_app].[credito_puente_link]
                (IDMovCP, IDCreditoPuenteLoteHito, MontoAplicado_CRC, Notas, UsuarioVinculo)
            VALUES
                (@IDMovCP, @IDCreditoPuenteLoteHito, @MontoAplicado_CRC, @Notas, @UsuarioEmail);

            SET @IDLinkCP = SCOPE_IDENTITY();
            SET @Accion   = 'INSERT';
        END

        DECLARE @LinkJSON NVARCHAR(MAX) = (
            SELECT IDLinkCP                = @IDLinkCP,
                   IDMovCP                 = @IDMovCP,
                   IDCreditoPuenteLoteHito = @IDCreditoPuenteLoteHito,
                   MontoAplicado_CRC       = @MontoAplicado_CRC,
                   Notas                   = @Notas
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.credito_puente_link', @IDLinkCP, @Accion, @UsuarioEmail,
             @ValorAnteriorJSON, @LinkJSON,
             CONCAT('Vinculacion mov CP ', @IDMovCP,
                    ' -> hito lote ', @IDCreditoPuenteLoteHito,
                    ' por ', CAST(@MontoAplicado_CRC AS NVARCHAR(40)), ' CRC'));

        -- Refrescar fecha real y estado del hito de lote (auto-DESEMBOLSADO)
        EXEC [pro_app].sp_refrescar_fecha_real_lote_hito
             @IDCreditoPuenteLoteHito = @IDCreditoPuenteLoteHito;

        COMMIT TRANSACTION;

        SELECT @IDLinkCP AS IDLinkCP, @Accion AS Accion;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE PROCEDURE [pro_app].[sp_vincular_movimiento_hito]
    @IDMovimiento       INT,
    @IDCasoHito         INT,
    @MontoAplicado_CRC  MONEY,
    @Notas              NVARCHAR(500) = NULL,
    @UsuarioEmail       NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @IDCasoMov INT, @MontoMov MONEY;
    SELECT @IDCasoMov = IDCaso, @MontoMov = MontoColones
    FROM pro_ventas.Movimientos
    WHERE IDMovimiento = @IDMovimiento;

    IF @IDCasoMov IS NULL
        THROW 51950, 'IDMovimiento no existe en pro_ventas.Movimientos.', 1;

    DECLARE @IDCasoHitoCaso INT;
    SELECT @IDCasoHitoCaso = IDCaso
    FROM [pro_app].[caso_hito_proyeccion]
    WHERE IDCasoHito = @IDCasoHito;

    IF @IDCasoHitoCaso IS NULL
        THROW 51951, 'IDCasoHito no existe en [pro_app].caso_hito_proyeccion.', 1;

    IF @IDCasoMov <> @IDCasoHitoCaso
        THROW 51952, 'El movimiento y el hito pertenecen a casos distintos.', 1;

    IF @MontoAplicado_CRC IS NULL OR @MontoAplicado_CRC <= 0
        THROW 51953, 'MontoAplicado_CRC debe ser mayor a cero.', 1;

    DECLARE @MontoActualEnLink MONEY;
    SELECT @MontoActualEnLink = MontoAplicado_CRC
    FROM [pro_app].[movimiento_hito_link]
    WHERE IDMovimiento = @IDMovimiento AND IDCasoHito = @IDCasoHito;

    DECLARE @SumaOtros MONEY;
    SELECT @SumaOtros = ISNULL(SUM(MontoAplicado_CRC), 0)
    FROM [pro_app].[movimiento_hito_link]
    WHERE IDMovimiento = @IDMovimiento
      AND IDCasoHito  <> @IDCasoHito;

    IF (@SumaOtros + @MontoAplicado_CRC) > ISNULL(@MontoMov, 0)
        THROW 51954,
              'La suma de montos vinculados excede el MontoColones del movimiento.',
              1;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @ValorAnteriorJSON NVARCHAR(MAX) = NULL;
        DECLARE @Accion VARCHAR(20);
        DECLARE @IDLink INT;

        IF @MontoActualEnLink IS NOT NULL
        BEGIN
            SET @ValorAnteriorJSON = (
                SELECT IDLink, IDMovimiento, IDCasoHito,
                       MontoAplicado_CRC, Notas, UsuarioVinculo, FechaVinculacion
                FROM [pro_app].[movimiento_hito_link]
                WHERE IDMovimiento = @IDMovimiento AND IDCasoHito = @IDCasoHito
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            );

            UPDATE [pro_app].[movimiento_hito_link]
            SET    MontoAplicado_CRC = @MontoAplicado_CRC,
                   Notas             = @Notas,
                   UsuarioVinculo    = @UsuarioEmail,
                   FechaVinculacion  = SYSUTCDATETIME()
            WHERE  IDMovimiento = @IDMovimiento
               AND IDCasoHito  = @IDCasoHito;

            SELECT @IDLink = IDLink
            FROM [pro_app].[movimiento_hito_link]
            WHERE IDMovimiento = @IDMovimiento AND IDCasoHito = @IDCasoHito;

            SET @Accion = 'UPDATE';
        END
        ELSE
        BEGIN
            INSERT INTO [pro_app].[movimiento_hito_link]
                (IDMovimiento, IDCasoHito, MontoAplicado_CRC, Notas, UsuarioVinculo)
            VALUES
                (@IDMovimiento, @IDCasoHito, @MontoAplicado_CRC, @Notas, @UsuarioEmail);

            SET @IDLink = SCOPE_IDENTITY();
            SET @Accion = 'INSERT';
        END

        DECLARE @ValorNuevoJSON NVARCHAR(MAX) = (
            SELECT IDLink            = @IDLink,
                   IDMovimiento      = @IDMovimiento,
                   IDCasoHito        = @IDCasoHito,
                   MontoAplicado_CRC = @MontoAplicado_CRC,
                   Notas             = @Notas
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO [pro_app].[audit_log]
            (Tabla, IDRegistro, Accion, UsuarioEmail,
             ValorAnteriorJSON, ValorNuevoJSON, Contexto)
        VALUES
            ('pro_app.movimiento_hito_link', @IDLink, @Accion, @UsuarioEmail,
             @ValorAnteriorJSON, @ValorNuevoJSON,
             CONCAT('Vinculación movimiento ', @IDMovimiento,
                    ' -> hito ', @IDCasoHito,
                    ' por ', CAST(@MontoAplicado_CRC AS NVARCHAR(40)), ' CRC'));

        -- Refrescar fecha real y estado del hito según links activos.
        EXEC [pro_app].sp_refrescar_fecha_real_hito @IDCasoHito = @IDCasoHito;

        COMMIT TRANSACTION;

        SELECT @IDLink AS IDLink, @Accion AS Accion;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
CREATE VIEW [pro_app].[vw_avance_obra_actual] AS
SELECT
    s.IDCaso,
    s.IDLote,
    s.PorcentajeAvance,
    s.FechaCorte,
    s.Fuente,
    s.DetalleHitosJSON,
    s.FechaSincronizacion
FROM [pro_app].[avance_obra_snapshot] s
WHERE s.EsUltimo = 1;
GO
CREATE VIEW [pro_app].[vw_caso_extras] AS
SELECT
    e.IDExtra,
    e.IDCaso,
    cs.DetCaso                  AS CodigoCaso,
    cl.NombreCompleto           AS Cliente,
    p.AbreviaturaProyecto,
    lt.Lote                     AS CodigoLote,
    e.Tipo,
    e.Descripcion,
    e.MontoAjuste_CRC,
    e.Estado,
    e.FechaCotizacion,
    e.FechaAprobacion,
    e.ArchivoCotizacion,
    e.ArchivoAprobacion,
    e.Notas,
    e.CreadoPor,
    e.AprobadoPor,
    e.FechaCreacion,
    e.ModificadoPor,
    e.FechaModificacion
FROM [pro_app].[caso_extra] e
INNER JOIN pro_ventas.Casos cs    ON cs.IDCaso = e.IDCaso
LEFT  JOIN pro_ventas.Clientes cl ON cl.IDCliente = cs.IDCliente
LEFT  JOIN pro_ventas.Lotes lt    ON lt.IDLote = cs.IDLote
LEFT  JOIN pro_ventas.Proyecto p  ON p.IDProyecto = lt.IDProyecto;
GO
CREATE VIEW [pro_app].[vw_casos_activos] AS
SELECT
    c.IDCaso,
    c.DetCaso                       AS CodigoCaso,
    c.IDEstado,
    e.Estado                        AS NombreEstado,
    e.Abreviatura                   AS AbrevEstado,
    c.IDCliente,
    cl.NombreCompleto               AS Cliente,
    c.IDLote,
    l.Lote                          AS CodigoLote,
    l.Area                          AS AreaLote,
    c.IDBloque,
    b.Bloque                        AS NombreBloque,
    l.IDProyecto,
    p.Nombre                        AS NombreProyecto,
    p.AbreviaturaProyecto           AS AbrevProyecto,
    c.IDModelo,
    m.Modelo                        AS NombreModelo,
    m.AreaTotal                     AS AreaModelo,
    c.IDBanco,
    bk.Abreviatura                  AS AbrevBanco,
    bk.NombreEntidad                AS NombreBanco,
    bk.ColorHEXBan                  AS ColorBanco,
    c.PrecioVenta,
    c.PrecioFinanciar,
    c.PrecioCasa,
    c.PrecioLote,
    c.Prima                         AS MontoPrima,
    c.MontoBono,
    c.MontoDescuento,
    c.Moneda                        AS MonedaCaso,
    c.TipoCambio,
    c.FechaReserva,
    c.FechaFormalizacion,
    c.FechaEntrega,
    c.FechaRetiro,
    c.FechaPF                       AS FechaPF_Ventas,
    c.IDVendedor,
    c.IDFormalizador
FROM pro_ventas.Casos c
INNER JOIN pro_ventas.Estados   e  ON e.IDEst = c.IDEstado
INNER JOIN pro_ventas.Clientes  cl ON cl.IDCliente = c.IDCliente
INNER JOIN pro_ventas.Lotes     l  ON l.IDLote = c.IDLote
LEFT  JOIN pro_ventas.Bloques   b  ON b.IDBloq = c.IDBloque
LEFT  JOIN pro_ventas.Proyecto  p  ON p.IDProyecto = l.IDProyecto
LEFT  JOIN pro_ventas.Modelos   m  ON m.IDMod = c.IDModelo
LEFT  JOIN pro_ventas.Bancos    bk ON bk.IDBan = c.IDBanco
WHERE c.IDEstado IN (2, 4);
GO
CREATE VIEW [pro_app].[vw_casos_para_formalizar] AS
SELECT
    cs.IDCaso,
    cs.DetCaso                AS CodigoCaso,
    cl.NombreCompleto         AS Cliente,
    cs.IDLote,
    lt.Lote                   AS CodigoLote,
    lt.Area                   AS AreaLote_m2,
    bl.IDBloq                 AS IDBloque,
    bl.Bloque                 AS NombreBloque,
    md.IDMod                  AS IDModelo,
    md.Modelo                 AS NombreModelo,
    cs.IDBanco                AS IDBan,
    bk.Abreviatura            AS AbrevBanco,
    bk.NombreEntidad          AS NombreBanco,
    bk.ColorHEXBan            AS ColorBanco,
    p.IDProyecto,
    p.AbreviaturaProyecto,
    p.Nombre                  AS NombreProyecto,
    p.ColorHEX_P              AS ColorProyecto,
    cs.PrecioVenta,
    cs.FechaReserva,
    -- Proyección activa actual (NULL si todavía no hay)
    pf.IDProyeccion,
    pf.FechaProyectada,
    pf.NivelConfianza,
    pf.Notas,
    pf.FechaCreacion          AS ProyeccionCreadaEn,
    pf.FechaModificacion      AS ProyeccionModificadaEn,
    -- Cuántas versiones históricas hay (incluida la activa)
    (
        SELECT COUNT(*)
        FROM [pro_app].[proyeccion_formalizacion] pf2
        WHERE pf2.IDCaso = cs.IDCaso
    )                         AS NumVersiones
FROM pro_ventas.Casos cs
INNER JOIN pro_ventas.Clientes cl  ON cl.IDCliente = cs.IDCliente
INNER JOIN pro_ventas.Lotes lt     ON lt.IDLote = cs.IDLote
LEFT JOIN pro_ventas.Bloques bl    ON bl.IDBloq = cs.IDBloque
LEFT JOIN pro_ventas.Modelos md    ON md.IDMod = cs.IDModelo
LEFT JOIN pro_ventas.Bancos bk     ON bk.IDBan = cs.IDBanco
LEFT JOIN pro_ventas.Proyecto p    ON p.IDProyecto = lt.IDProyecto
OUTER APPLY (
    SELECT TOP 1 *
    FROM [pro_app].[proyeccion_formalizacion] pf
    WHERE pf.IDCaso = cs.IDCaso AND pf.Activa = 1
    ORDER BY pf.FechaCreacion DESC
) pf
WHERE cs.IDEstado = 4;  -- solo Reservados
GO
CREATE VIEW [pro_app].[vw_credito_puente_lote_hito] AS
SELECT
    cplh.IDCreditoPuenteLoteHito,
    cplh.IDCreditoPuenteLote,
    cpl.IDCreditoPuente,
    cpl.IDLote,
    l.Lote                              AS CodigoLote,
    p.AbreviaturaProyecto,
    cp.IDBan                            AS IDBancoCP,
    b.Abreviatura                       AS AbrevBancoCP,
    cplh.IDHito,
    h.Codigo                            AS CodigoHito,
    h.Nombre                            AS NombreHito,
    h.ColorHEX                          AS ColorHito,
    cpeh.OrdenEnEsquema,
    cpeh.Porcentaje,
    cpeh.DiasSolicitudVisita,
    cpeh.DiasDesembolsoPostVisita,
    cpeh.DiaSemanaPeritoFijo,
    -- Parte construccion del lote (excluye gastos formalizacion)
    CAST(
        cpl.MontoResponsabilidadTeorica_CRC
        - ISNULL(
            CASE
                WHEN cpl.GastosFormalizacionOverride = 1
                     THEN cpl.GastosFormalizacionLote_CRC
                WHEN cp.GastosFormalizacion_CRC IS NULL
                     THEN 0
                ELSE cp.GastosFormalizacion_CRC
                     * (CAST(cpl.MontoResponsabilidadTeorica_CRC AS DECIMAL(38,10))
                        / NULLIF(CAST(cp.MontoTotal_CRC AS DECIMAL(38,10)), 0))
            END, 0)
    AS MONEY)                           AS ParteConstruccionLote_CRC,
    -- Monto esperado del hito = parte construccion x % / 100
    CAST(
        (
            cpl.MontoResponsabilidadTeorica_CRC
            - ISNULL(
                CASE
                    WHEN cpl.GastosFormalizacionOverride = 1
                         THEN cpl.GastosFormalizacionLote_CRC
                    WHEN cp.GastosFormalizacion_CRC IS NULL
                         THEN 0
                    ELSE cp.GastosFormalizacion_CRC
                         * (CAST(cpl.MontoResponsabilidadTeorica_CRC AS DECIMAL(38,10))
                            / NULLIF(CAST(cp.MontoTotal_CRC AS DECIMAL(38,10)), 0))
                END, 0)
        ) * cpeh.Porcentaje / 100.0
    AS MONEY)                           AS MontoHitoEsperado_CRC,
    -- Cobertura de los links activos (sumando todos los movs vinculados,
    -- incluyendo ANULADOS — el SP de anular bloquea si hay links, asi que
    -- en estado normal nunca habra links a movs ANULADOS).
    ISNULL(agg.MontoAplicado_CRC, 0)    AS MontoAplicado_CRC,
    CAST(
        CASE
            WHEN (
                cpl.MontoResponsabilidadTeorica_CRC
                - ISNULL(
                    CASE
                        WHEN cpl.GastosFormalizacionOverride = 1
                             THEN cpl.GastosFormalizacionLote_CRC
                        WHEN cp.GastosFormalizacion_CRC IS NULL
                             THEN 0
                        ELSE cp.GastosFormalizacion_CRC
                             * (CAST(cpl.MontoResponsabilidadTeorica_CRC AS DECIMAL(38,10))
                                / NULLIF(CAST(cp.MontoTotal_CRC AS DECIMAL(38,10)), 0))
                    END, 0)
            ) * cpeh.Porcentaje / 100.0 - ISNULL(agg.MontoAplicado_CRC, 0) < 0
            THEN 0
            ELSE (
                cpl.MontoResponsabilidadTeorica_CRC
                - ISNULL(
                    CASE
                        WHEN cpl.GastosFormalizacionOverride = 1
                             THEN cpl.GastosFormalizacionLote_CRC
                        WHEN cp.GastosFormalizacion_CRC IS NULL
                             THEN 0
                        ELSE cp.GastosFormalizacion_CRC
                             * (CAST(cpl.MontoResponsabilidadTeorica_CRC AS DECIMAL(38,10))
                                / NULLIF(CAST(cp.MontoTotal_CRC AS DECIMAL(38,10)), 0))
                    END, 0)
            ) * cpeh.Porcentaje / 100.0 - ISNULL(agg.MontoAplicado_CRC, 0)
        END
    AS MONEY)                           AS MontoPendiente_CRC,
    ISNULL(agg.CantidadLinks, 0)        AS CantidadLinks,
    -- Fechas
    cplh.FechaPlaneadaHito,
    cplh.FechaPlaneadaVisitaPerito,
    cplh.FechaProyectadaDesembolso,
    cplh.FechaRealHito,
    cplh.FechaRealVisitaPerito,
    cplh.FechaRealDesembolso,
    -- Fecha proyectada efectiva (lo que se usa en la matriz para ubicar el hito)
    COALESCE(
        cplh.FechaRealDesembolso,
        cplh.FechaProyectadaDesembolso,
        cplh.FechaPlaneadaHito
    )                                   AS FechaProyectada,
    cplh.EstadoTramite,
    cplh.Notas,
    cplh.CreadoPor,
    cplh.FechaCreacion,
    cplh.ModificadoPor,
    cplh.FechaModificacion
FROM [pro_app].[credito_puente_lote_hito] cplh
INNER JOIN [pro_app].[credito_puente_lote] cpl ON cpl.IDCreditoPuenteLote = cplh.IDCreditoPuenteLote
INNER JOIN [pro_app].[credito_puente] cp       ON cp.IDCreditoPuente      = cpl.IDCreditoPuente
INNER JOIN pro_ventas.Lotes l                     ON l.IDLote                = cpl.IDLote
INNER JOIN pro_ventas.Proyecto p                  ON p.IDProyecto            = l.IDProyecto
INNER JOIN pro_ventas.Bancos b                    ON b.IDBan                 = cp.IDBan
INNER JOIN [pro_app].[catalogo_hito] h         ON h.IDHito                = cplh.IDHito
LEFT JOIN [pro_app].[credito_puente_esquema_hito] cpeh
    ON cpeh.IDCreditoPuente = cpl.IDCreditoPuente
   AND cpeh.IDHito          = cplh.IDHito
LEFT JOIN (
    SELECT
        IDCreditoPuenteLoteHito,
        SUM(MontoAplicado_CRC) AS MontoAplicado_CRC,
        COUNT(*)               AS CantidadLinks
    FROM [pro_app].[credito_puente_link]
    GROUP BY IDCreditoPuenteLoteHito
) agg ON agg.IDCreditoPuenteLoteHito = cplh.IDCreditoPuenteLoteHito;
GO
CREATE VIEW [pro_app].[vw_credito_puente_movimiento] AS
SELECT
    m.IDMovCP,
    m.IDCreditoPuente,
    cp.IDBan                                AS IDBancoCP,
    b.Abreviatura                           AS AbrevBancoCP,
    b.NombreEntidad                         AS NombreBancoCP,
    cp.MontoTotal_CRC                       AS MontoTotalCP_CRC,
    m.FechaMovimiento,
    m.MontoColones                          AS MontoMovimiento_CRC,
    m.Concepto,
    m.NumeroComprobante,
    m.Estado,
    m.Notas,
    ISNULL(agg.MontoAplicado_CRC, 0)        AS MontoAplicado_CRC,
    CAST(
        m.MontoColones - ISNULL(agg.MontoAplicado_CRC, 0)
    AS MONEY)                               AS MontoSinAplicar_CRC,
    ISNULL(agg.CantidadLinks, 0)            AS CantidadLinks,
    CASE WHEN ISNULL(agg.CantidadLinks, 0) > 0 THEN 1 ELSE 0 END
                                            AS EstaVinculado,
    m.CreadoPor,
    m.FechaCreacion,
    m.ModificadoPor,
    m.FechaModificacion
FROM [pro_app].[credito_puente_movimiento] m
INNER JOIN [pro_app].[credito_puente] cp ON cp.IDCreditoPuente = m.IDCreditoPuente
INNER JOIN pro_ventas.Bancos b              ON b.IDBan            = cp.IDBan
LEFT JOIN (
    SELECT
        IDMovCP,
        SUM(MontoAplicado_CRC) AS MontoAplicado_CRC,
        COUNT(*)               AS CantidadLinks
    FROM [pro_app].[credito_puente_link]
    GROUP BY IDMovCP
) agg ON agg.IDMovCP = m.IDMovCP;
GO
CREATE VIEW [pro_app].[vw_credito_puente_resumen] AS
SELECT
    cp.IDCreditoPuente,
    cp.IDBan,
    b.Abreviatura                                       AS AbrevBanco,
    b.NombreEntidad                                     AS NombreBanco,
    b.ColorHEXBan                                       AS ColorBanco,
    cp.Codigo,
    cp.MontoTotal_CRC,
    cp.GastosFormalizacion_CRC,
    cp.TasaAnual,
    cp.FechaAprobacion,
    cp.FechaVencimiento,
    cp.Estado,
    cp.Notas,
    ISNULL((
        SELECT SUM(cpl.MontoResponsabilidadTeorica_CRC)
        FROM [pro_app].[credito_puente_lote] cpl
        WHERE cpl.IDCreditoPuente = cp.IDCreditoPuente
    ), 0)                                               AS MontoAsignadoLotes_CRC,
    cp.MontoTotal_CRC - ISNULL((
        SELECT SUM(cpl.MontoResponsabilidadTeorica_CRC)
        FROM [pro_app].[credito_puente_lote] cpl
        WHERE cpl.IDCreditoPuente = cp.IDCreditoPuente
    ), 0)                                               AS MontoSinAsignar_CRC,
    ISNULL((
        SELECT COUNT(*)
        FROM [pro_app].[credito_puente_lote] cpl
        WHERE cpl.IDCreditoPuente = cp.IDCreditoPuente
    ), 0)                                               AS CantidadLotes,
    -- Conteo de lotes por estado.
    ISNULL((
        SELECT COUNT(*)
        FROM [pro_app].[credito_puente_lote] cpl
        WHERE cpl.IDCreditoPuente = cp.IDCreditoPuente
          AND cpl.Estado = 'PENDIENTE'
    ), 0)                                               AS LotesPendientes,
    ISNULL((
        SELECT COUNT(*)
        FROM [pro_app].[credito_puente_lote] cpl
        WHERE cpl.IDCreditoPuente = cp.IDCreditoPuente
          AND cpl.Estado = 'CANCELACION_PROGRAMADA'
    ), 0)                                               AS LotesProgramados,
    ISNULL((
        SELECT COUNT(*)
        FROM [pro_app].[credito_puente_lote] cpl
        WHERE cpl.IDCreditoPuente = cp.IDCreditoPuente
          AND cpl.Estado = 'CANCELACION_CONFIRMADA'
    ), 0)                                               AS LotesConfirmados,
    -- Compat Fase 6.2: LotesCancelados = programados + confirmados.
    ISNULL((
        SELECT COUNT(*)
        FROM [pro_app].[credito_puente_lote] cpl
        WHERE cpl.IDCreditoPuente = cp.IDCreditoPuente
          AND cpl.Estado IN ('CANCELACION_PROGRAMADA','CANCELACION_CONFIRMADA')
    ), 0)                                               AS LotesCancelados,
    -- Total cancelado: distinguir programado (estimacion) vs confirmado (real).
    ISNULL((
        SELECT SUM(cpl.MontoCanceladoAlBanco_CRC)
        FROM [pro_app].[credito_puente_lote] cpl
        WHERE cpl.IDCreditoPuente = cp.IDCreditoPuente
          AND cpl.Estado = 'CANCELACION_PROGRAMADA'
    ), 0)                                               AS MontoProgramadoTotal_CRC,
    ISNULL((
        SELECT SUM(cpl.MontoConfirmadoAlBanco_CRC)
        FROM [pro_app].[credito_puente_lote] cpl
        WHERE cpl.IDCreditoPuente = cp.IDCreditoPuente
          AND cpl.Estado = 'CANCELACION_CONFIRMADA'
    ), 0)                                               AS MontoConfirmadoTotal_CRC,
    -- Compatibilidad: MontoCanceladoTotal_CRC ahora suma ambos (programado +
    -- confirmado) para no romper consumers existentes.
    ISNULL((
        SELECT SUM(
                   CASE
                       WHEN cpl.Estado = 'CANCELACION_CONFIRMADA' THEN cpl.MontoConfirmadoAlBanco_CRC
                       WHEN cpl.Estado = 'CANCELACION_PROGRAMADA' THEN cpl.MontoCanceladoAlBanco_CRC
                       ELSE 0
                   END
               )
        FROM [pro_app].[credito_puente_lote] cpl
        WHERE cpl.IDCreditoPuente = cp.IDCreditoPuente
          AND cpl.Estado IN ('CANCELACION_PROGRAMADA','CANCELACION_CONFIRMADA')
    ), 0)                                               AS MontoCanceladoTotal_CRC,
    -- Pendiente cobertura: lo que aun debe cobrarse para cubrir el CP.
    -- Usa el confirmado donde ya hay (mas exacto) y programado donde no.
    CAST(
        CASE
            WHEN cp.MontoTotal_CRC - ISNULL((
                SELECT SUM(
                           CASE
                               WHEN cpl.Estado = 'CANCELACION_CONFIRMADA' THEN cpl.MontoConfirmadoAlBanco_CRC
                               WHEN cpl.Estado = 'CANCELACION_PROGRAMADA' THEN cpl.MontoCanceladoAlBanco_CRC
                               ELSE 0
                           END
                       )
                FROM [pro_app].[credito_puente_lote] cpl
                WHERE cpl.IDCreditoPuente = cp.IDCreditoPuente
                  AND cpl.Estado IN ('CANCELACION_PROGRAMADA','CANCELACION_CONFIRMADA')
            ), 0) < 0 THEN 0
            ELSE cp.MontoTotal_CRC - ISNULL((
                SELECT SUM(
                           CASE
                               WHEN cpl.Estado = 'CANCELACION_CONFIRMADA' THEN cpl.MontoConfirmadoAlBanco_CRC
                               WHEN cpl.Estado = 'CANCELACION_PROGRAMADA' THEN cpl.MontoCanceladoAlBanco_CRC
                               ELSE 0
                           END
                       )
                FROM [pro_app].[credito_puente_lote] cpl
                WHERE cpl.IDCreditoPuente = cp.IDCreditoPuente
                  AND cpl.Estado IN ('CANCELACION_PROGRAMADA','CANCELACION_CONFIRMADA')
            ), 0)
        END
    AS MONEY)                                           AS MontoPendienteCobertura_CRC,
    cp.CreadoPor,
    cp.FechaCreacion,
    cp.ModificadoPor,
    cp.FechaModificacion
FROM [pro_app].[credito_puente] cp
INNER JOIN pro_ventas.Bancos b ON b.IDBan = cp.IDBan;
GO
-- =============================================================================
-- Fase 6.10 — Dashboard: rama C para formalizados sin proyección (Contado puro)
--
-- Problema:
--   La vista vw_dashboard_caso tiene 2 ramas hoy:
--     A) Casos con proyección de hitos (FROM vw_proyeccion_desembolsos GROUP BY).
--     B) Reservados (IDEstado=4) sin proyección.
--   Los casos formalizados (IDEstado=1 o 2) cuyo banco no tiene esquema vigente
--   no tienen filas en vw_proyeccion_desembolsos y no caen en ninguna rama.
--   Este es el escenario típico de Contado puro (IDBanco=6) donde no hay
--   esquema bancario y el flujo es solo pagos cliente.
--
-- Casos afectados al momento de la migración: 21 (20 Entregados y 1 Formalizado).
-- El más visible es IDCaso=1999 (Marianela Davila, L.05, formalizado, contado)
-- que el operador reportó como ausente del Dashboard.
--
-- Cambio:
--   Agregar rama C al UNION ALL con la misma forma de la rama B, pero filtrando
--   por IDEstado IN (1, 2) y EsReservado = 0. El filtro de "sin proyección"
--   evita duplicación con la rama A.
--
-- Semántica de la rama C (Contado puro / sin esquema):
--   - MontoBanco_CRC = 0 (no hay banco hipotecario).
--   - PrecioVenta_CRC = COALESCE(clb.PrecioVentaActual_CRC, cs.PrecioVenta).
--   - Pendiente_CRC = PrecioVentaActual - cobrado real del cliente (igual a B).
--   - PorcentajeAvance = cobrado real cliente / PrecioVentaActual (igual a B).
--   - Hitos = 0, próximo hito = NULL.
--   - Formalización = cs.FechaFormalizacion (ya formalizado).
-- =============================================================================

CREATE   VIEW [pro_app].[vw_dashboard_caso] AS
WITH CasoAgg AS (
    SELECT
        IDCaso,
        MAX(CodigoCaso)                AS CodigoCaso,
        MAX(Cliente)                   AS Cliente,
        MAX(NombreModelo)              AS NombreModelo,
        MAX(IDLote)                    AS IDLote,
        MAX(NombreBloque)              AS NombreBloque,
        MAX(CodigoLote)                AS CodigoLote,
        MAX(AreaLote_m2)               AS AreaLote_m2,
        MAX(IDBan)                     AS IDBan,
        MAX(AbrevBanco)                AS AbrevBanco,
        MAX(NombreBanco)               AS NombreBanco,
        MAX(ColorBanco)                AS ColorBanco,
        MAX(IDProyecto)                AS IDProyecto,
        MAX(AbreviaturaProyecto)       AS AbreviaturaProyecto,
        MAX(NombreProyecto)            AS NombreProyecto,
        MAX(CAST(EsReservado AS INT))  AS EsReservado,
        MAX(NivelConfianzaFormalizacion) AS NivelConfianzaFormalizacion,
        MAX(MontoBanco)                AS MontoBanco,
        MAX(PagadoPorBanco)            AS Pagado_Proyectado_CRC,
        MAX(IngresoTotalAD_CRC)        AS IngresoTotalAD_CRC,
        MAX(PrecioLoteInterno_CRC)     AS PrecioLoteInterno_CRC,
        MAX(FechaFormalizacion)        AS FechaFormalizacion,
        COUNT(*)                       AS TotalHitos
    FROM [pro_app].vw_proyeccion_desembolsos
    GROUP BY IDCaso
),
HitosCubiertosPorCaso AS (
    SELECT
        chp.IDCaso,
        SUM(CASE WHEN linkAgg.NumLinks >= 1 THEN 1 ELSE 0 END) AS HitosCubiertos
    FROM [pro_app].caso_hito_proyeccion chp
    LEFT JOIN (
        SELECT IDCasoHito, COUNT(*) AS NumLinks
        FROM [pro_app].movimiento_hito_link
        GROUP BY IDCasoHito
    ) linkAgg ON linkAgg.IDCasoHito = chp.IDCasoHito
    GROUP BY chp.IDCaso
),
PagadoReal AS (
    SELECT
        chp.IDCaso,
        SUM(lk.MontoAplicado_CRC) AS PagadoReal_CRC,
        COUNT(lk.IDLink)          AS NumLinks
    FROM [pro_app].caso_hito_proyeccion chp
    INNER JOIN [pro_app].movimiento_hito_link lk ON lk.IDCasoHito = chp.IDCasoHito
    GROUP BY chp.IDCaso
),
PagosCliente AS (
    SELECT
        pc.IDCaso,
        SUM(pc.MontoPlaneado_CRC) AS TotalPagoCliente_CRC,
        SUM(
            CASE
                WHEN pc.IDMovimientoVinculado IS NOT NULL
                     THEN ISNULL(m.MontoColones, 0)
                WHEN pc.FechaReal IS NOT NULL
                     THEN pc.MontoPlaneado_CRC
                ELSE 0
            END
        ) AS TotalPagoClienteCobrado_CRC,
        COUNT(*) AS NumPagosCliente,
        MIN(pc.FechaPlaneada) AS PrimerPagoCliente
    FROM [pro_app].[pago_cliente] pc
    LEFT JOIN pro_ventas.Movimientos m ON m.IDMovimiento = pc.IDMovimientoVinculado
    GROUP BY pc.IDCaso
),
ExtrasAgg AS (
    SELECT
        IDCaso,
        SUM(CASE WHEN Tipo = 'EXTRA' AND Estado = 'APROBADA'
                 THEN MontoAjuste_CRC ELSE 0 END)        AS TotalExtras_CRC,
        SUM(CASE WHEN Tipo = 'DESCUENTO' AND Estado = 'APROBADA'
                 THEN MontoAjuste_CRC ELSE 0 END)        AS TotalDescuentos_CRC,
        SUM(CASE WHEN Estado = 'COTIZADA' THEN 1 ELSE 0 END) AS ExtrasPendientes,
        COUNT(*)                                         AS TotalExtras
    FROM [pro_app].[caso_extra]
    GROUP BY IDCaso
),
ProximoHito AS (
    SELECT
        IDCaso, CodigoHito, NombreHito, ColorHito,
        MontoHitoEsperado, FechaProyectada,
        ROW_NUMBER() OVER (PARTITION BY IDCaso ORDER BY FechaProyectada, OrdenEnEsquema) AS rn
    FROM [pro_app].vw_proyeccion_desembolsos
    WHERE HitoCubierto = 0 AND FechaProyectada IS NOT NULL
)
-- Parte A: casos con proyección de hitos (formalizados + reservados con proyección)
SELECT
    ca.IDCaso,
    ca.CodigoCaso,
    ca.Cliente,
    ca.NombreModelo,
    ca.IDLote,
    ca.NombreBloque,
    ca.CodigoLote,
    ca.AreaLote_m2,
    ca.IDBan,
    ca.AbrevBanco,
    ca.NombreBanco,
    ca.ColorBanco,
    ca.IDProyecto,
    ca.AbreviaturaProyecto,
    ca.NombreProyecto,
    cs.IDEstado,
    ca.EsReservado,
    ca.NivelConfianzaFormalizacion,
    ISNULL(clb.PrecioVentaActual_CRC, cs.PrecioVenta)                 AS PrecioVenta_CRC,
    cs.PrecioVenta                                                    AS PrecioVentaContractual_CRC,
    cs.FechaReserva,
    ca.FechaFormalizacion,
    ISNULL(ex.TotalExtras_CRC, 0)                                     AS TotalExtras_CRC,
    ISNULL(ex.TotalDescuentos_CRC, 0)                                 AS TotalDescuentos_CRC,
    ISNULL(ex.ExtrasPendientes, 0)                                    AS ExtrasPendientesAprobacion,
    ISNULL(ex.TotalExtras, 0)                                         AS NumExtrasTotal,
    ca.MontoBanco                                                     AS MontoBanco_CRC,
    clb.MontoFinanciaBanco_CRC                                        AS MontoFinanciaBancoCapturado_CRC,
    clb.MontoLoteFinanciado_CRC                                       AS MontoLoteFinanciado_CRC,
    clb.LoteHistoricoCobrado_CRC                                      AS LoteHistoricoCobrado_CRC,
    ISNULL(pcl.TotalPagoCliente_CRC, 0)                               AS PagoCliente_CRC,
    ISNULL(pcl.NumPagosCliente, 0)                                    AS NumPagosCliente,
    pcl.PrimerPagoCliente                                             AS FechaPagoCliente,
    clb.Notas                                                         AS NotasPrestamoBanco,
    ISNULL(ca.Pagado_Proyectado_CRC, 0)                               AS PagadoProyectado_CRC,
    ISNULL(pr.PagadoReal_CRC, 0)                                      AS PagadoReal_CRC,
    ISNULL(pr.NumLinks, 0)                                            AS NumLinks,
    CAST(
        CASE
            WHEN ca.EsReservado = 1 THEN
                CASE
                    WHEN ISNULL(pcl.TotalPagoClienteCobrado_CRC, 0)
                         >= ISNULL(clb.PrecioVentaActual_CRC, cs.PrecioVenta)
                    THEN 0
                    ELSE ISNULL(clb.PrecioVentaActual_CRC, cs.PrecioVenta)
                         - ISNULL(pcl.TotalPagoClienteCobrado_CRC, 0)
                END
            WHEN ISNULL(pr.PagadoReal_CRC, 0)
                 + ISNULL(clb.LoteHistoricoCobrado_CRC, 0)
                 >= ISNULL(ca.MontoBanco, 0)
                THEN 0
            ELSE ISNULL(ca.MontoBanco, 0)
                 - ISNULL(pr.PagadoReal_CRC, 0)
                 - ISNULL(clb.LoteHistoricoCobrado_CRC, 0)
        END AS MONEY
    )                                                                 AS Pendiente_CRC,
    CAST(
        CASE WHEN ISNULL(pr.PagadoReal_CRC, 0)
                  + ISNULL(clb.LoteHistoricoCobrado_CRC, 0)
                  > ISNULL(ca.MontoBanco, 0)
             THEN ISNULL(pr.PagadoReal_CRC, 0)
                  + ISNULL(clb.LoteHistoricoCobrado_CRC, 0)
                  - ISNULL(ca.MontoBanco, 0)
             ELSE 0
        END AS MONEY
    )                                                                 AS Sobrecobro_CRC,
    CASE WHEN ISNULL(pr.PagadoReal_CRC, 0)
              + ISNULL(clb.LoteHistoricoCobrado_CRC, 0)
              > ISNULL(ca.MontoBanco, 0)
         THEN 1 ELSE 0 END                                            AS TieneSobrecobro,
    CAST(
        (ISNULL(pr.PagadoReal_CRC, 0) + ISNULL(clb.LoteHistoricoCobrado_CRC, 0))
        / NULLIF(ca.MontoBanco, 0)
        AS DECIMAL(7,2)
    )                                                                 AS RatioCobroReal,
    ca.IngresoTotalAD_CRC                                             AS IngresoTotalAD_CRC,
    CAST(
        (CASE WHEN ISNULL(pr.PagadoReal_CRC, 0)
                   + ISNULL(clb.LoteHistoricoCobrado_CRC, 0)
                   >= ISNULL(ca.MontoBanco, 0)
              THEN 0
              ELSE ISNULL(ca.MontoBanco, 0)
                   - ISNULL(pr.PagadoReal_CRC, 0)
                   - ISNULL(clb.LoteHistoricoCobrado_CRC, 0)
         END)
        * (ISNULL(ca.IngresoTotalAD_CRC, 0) / NULLIF(ca.MontoBanco, 0))
        AS MONEY
    )                                                                 AS PendienteAD_CRC,
    ca.TotalHitos,
    ISNULL(hc.HitosCubiertos, 0)                                      AS HitosCubiertos,
    CAST(
        CASE
            WHEN ISNULL(clb.PrecioVentaActual_CRC, cs.PrecioVenta) IS NULL
                 OR ISNULL(clb.PrecioVentaActual_CRC, cs.PrecioVenta) = 0
                THEN 0
            ELSE
                CASE
                    WHEN (ISNULL(pr.PagadoReal_CRC, 0)
                          + ISNULL(clb.LoteHistoricoCobrado_CRC, 0)
                          + ISNULL(pcl.TotalPagoClienteCobrado_CRC, 0))
                         >= ISNULL(clb.PrecioVentaActual_CRC, cs.PrecioVenta)
                    THEN 100
                    ELSE
                        (ISNULL(pr.PagadoReal_CRC, 0)
                         + ISNULL(clb.LoteHistoricoCobrado_CRC, 0)
                         + ISNULL(pcl.TotalPagoClienteCobrado_CRC, 0))
                        * 100.0
                        / ISNULL(clb.PrecioVentaActual_CRC, cs.PrecioVenta)
                END
        END
        AS DECIMAL(5,2)
    )                                                                 AS PorcentajeAvance,
    ph.CodigoHito                                                     AS ProximoCodigoHito,
    ph.NombreHito                                                     AS ProximoNombreHito,
    ph.ColorHito                                                      AS ProximoColorHito,
    ph.MontoHitoEsperado                                              AS ProximoMonto_CRC,
    CAST(
        ph.MontoHitoEsperado
        * (ISNULL(ca.IngresoTotalAD_CRC, 0) / NULLIF(ca.MontoBanco, 0))
        AS MONEY
    )                                                                 AS ProximoMontoAD_CRC,
    ph.FechaProyectada                                                AS ProximaFechaDesembolso,
    pf.FechaProyectada                                                AS FechaProyectadaFormalizacion,
    pf.Notas                                                          AS NotasFormalizacion
FROM CasoAgg ca
INNER JOIN pro_ventas.Casos cs                ON cs.IDCaso = ca.IDCaso
LEFT  JOIN [pro_app].caso_lote_banco clb   ON clb.IDCaso = ca.IDCaso
LEFT  JOIN HitosCubiertosPorCaso hc    ON hc.IDCaso = ca.IDCaso
LEFT  JOIN PagadoReal pr               ON pr.IDCaso = ca.IDCaso
LEFT  JOIN PagosCliente pcl            ON pcl.IDCaso = ca.IDCaso
LEFT  JOIN ExtrasAgg ex                ON ex.IDCaso = ca.IDCaso
LEFT  JOIN ProximoHito ph              ON ph.IDCaso = ca.IDCaso AND ph.rn = 1
LEFT  JOIN [pro_app].proyeccion_formalizacion pf
       ON pf.IDCaso = ca.IDCaso AND pf.Activa = 1

UNION ALL

-- Parte B: Reservados (IDEstado=4) sin proyección de hitos.
SELECT
    cs.IDCaso,
    cs.DetCaso                                                        AS CodigoCaso,
    cl.NombreCompleto                                                 AS Cliente,
    md.Modelo                                                         AS NombreModelo,
    cs.IDLote,
    bl.Bloque                                                         AS NombreBloque,
    lt.Lote                                                           AS CodigoLote,
    lt.Area                                                           AS AreaLote_m2,
    cs.IDBanco                                                        AS IDBan,
    bk.Abreviatura                                                    AS AbrevBanco,
    bk.NombreEntidad                                                  AS NombreBanco,
    bk.ColorHEXBan                                                    AS ColorBanco,
    p.IDProyecto,
    p.AbreviaturaProyecto,
    p.Nombre                                                          AS NombreProyecto,
    cs.IDEstado,
    1                                                                 AS EsReservado,
    NULL                                                              AS NivelConfianzaFormalizacion,
    ISNULL(clb.PrecioVentaActual_CRC, cs.PrecioVenta)                 AS PrecioVenta_CRC,
    cs.PrecioVenta                                                    AS PrecioVentaContractual_CRC,
    cs.FechaReserva,
    NULL                                                              AS FechaFormalizacion,
    ISNULL(ex.TotalExtras_CRC, 0)                                     AS TotalExtras_CRC,
    ISNULL(ex.TotalDescuentos_CRC, 0)                                 AS TotalDescuentos_CRC,
    ISNULL(ex.ExtrasPendientes, 0)                                    AS ExtrasPendientesAprobacion,
    ISNULL(ex.TotalExtras, 0)                                         AS NumExtrasTotal,
    NULL                                                              AS MontoBanco_CRC,
    clb.MontoFinanciaBanco_CRC                                        AS MontoFinanciaBancoCapturado_CRC,
    clb.MontoLoteFinanciado_CRC                                       AS MontoLoteFinanciado_CRC,
    clb.LoteHistoricoCobrado_CRC                                      AS LoteHistoricoCobrado_CRC,
    ISNULL(pcl.TotalPagoCliente_CRC, 0)                               AS PagoCliente_CRC,
    ISNULL(pcl.NumPagosCliente, 0)                                    AS NumPagosCliente,
    pcl.PrimerPagoCliente                                             AS FechaPagoCliente,
    clb.Notas                                                         AS NotasPrestamoBanco,
    0                                                                 AS PagadoProyectado_CRC,
    0                                                                 AS PagadoReal_CRC,
    0                                                                 AS NumLinks,
    CAST(
        CASE
            WHEN ISNULL(pcl.TotalPagoClienteCobrado_CRC, 0)
                 >= ISNULL(clb.PrecioVentaActual_CRC, cs.PrecioVenta)
            THEN 0
            ELSE ISNULL(clb.PrecioVentaActual_CRC, cs.PrecioVenta)
                 - ISNULL(pcl.TotalPagoClienteCobrado_CRC, 0)
        END AS MONEY
    )                                                                 AS Pendiente_CRC,
    CAST(0 AS MONEY)                                                  AS Sobrecobro_CRC,
    0                                                                 AS TieneSobrecobro,
    NULL                                                              AS RatioCobroReal,
    NULL                                                              AS IngresoTotalAD_CRC,
    NULL                                                              AS PendienteAD_CRC,
    0                                                                 AS TotalHitos,
    0                                                                 AS HitosCubiertos,
    CAST(
        CASE
            WHEN ISNULL(clb.PrecioVentaActual_CRC, cs.PrecioVenta) IS NULL
                 OR ISNULL(clb.PrecioVentaActual_CRC, cs.PrecioVenta) = 0
                THEN 0
            WHEN ISNULL(pcl.TotalPagoClienteCobrado_CRC, 0)
                 >= ISNULL(clb.PrecioVentaActual_CRC, cs.PrecioVenta)
                THEN 100
            ELSE ISNULL(pcl.TotalPagoClienteCobrado_CRC, 0)
                 * 100.0
                 / ISNULL(clb.PrecioVentaActual_CRC, cs.PrecioVenta)
        END
        AS DECIMAL(5,2)
    )                                                                 AS PorcentajeAvance,
    NULL                                                              AS ProximoCodigoHito,
    NULL                                                              AS ProximoNombreHito,
    NULL                                                              AS ProximoColorHito,
    NULL                                                              AS ProximoMonto_CRC,
    NULL                                                              AS ProximoMontoAD_CRC,
    NULL                                                              AS ProximaFechaDesembolso,
    NULL                                                              AS FechaProyectadaFormalizacion,
    NULL                                                              AS NotasFormalizacion
FROM pro_ventas.Casos cs
INNER JOIN pro_ventas.Clientes cl   ON cl.IDCliente = cs.IDCliente
LEFT  JOIN pro_ventas.Lotes lt      ON lt.IDLote = cs.IDLote
LEFT  JOIN pro_ventas.Bloques bl    ON bl.IDBloq = cs.IDBloque
LEFT  JOIN pro_ventas.Modelos md    ON md.IDMod = cs.IDModelo
LEFT  JOIN pro_ventas.Bancos bk     ON bk.IDBan = cs.IDBanco
LEFT  JOIN pro_ventas.Proyecto p    ON p.IDProyecto = lt.IDProyecto
LEFT  JOIN [pro_app].caso_lote_banco clb ON clb.IDCaso = cs.IDCaso
LEFT  JOIN PagosCliente pcl  ON pcl.IDCaso = cs.IDCaso
LEFT  JOIN ExtrasAgg ex      ON ex.IDCaso = cs.IDCaso
WHERE cs.IDEstado = 4
  AND cs.IDCaso NOT IN (
      SELECT DISTINCT IDCaso FROM [pro_app].vw_proyeccion_desembolsos
  )

UNION ALL

-- Parte C: Formalizados/Entregados (IDEstado IN 1, 2) sin proyección de hitos.
-- Cubre típicamente Contado puro (IDBanco=6 sin esquema vigente). El flujo
-- de cobro es vía pago_cliente, no vía hitos bancarios.
-- Estructura paralela a la parte B con EsReservado=0 y FechaFormalizacion.
SELECT
    cs.IDCaso,
    cs.DetCaso                                                        AS CodigoCaso,
    cl.NombreCompleto                                                 AS Cliente,
    md.Modelo                                                         AS NombreModelo,
    cs.IDLote,
    bl.Bloque                                                         AS NombreBloque,
    lt.Lote                                                           AS CodigoLote,
    lt.Area                                                           AS AreaLote_m2,
    cs.IDBanco                                                        AS IDBan,
    bk.Abreviatura                                                    AS AbrevBanco,
    bk.NombreEntidad                                                  AS NombreBanco,
    bk.ColorHEXBan                                                    AS ColorBanco,
    p.IDProyecto,
    p.AbreviaturaProyecto,
    p.Nombre                                                          AS NombreProyecto,
    cs.IDEstado,
    0                                                                 AS EsReservado,
    NULL                                                              AS NivelConfianzaFormalizacion,
    ISNULL(clb.PrecioVentaActual_CRC, cs.PrecioVenta)                 AS PrecioVenta_CRC,
    cs.PrecioVenta                                                    AS PrecioVentaContractual_CRC,
    cs.FechaReserva,
    cs.FechaFormalizacion                                             AS FechaFormalizacion,
    ISNULL(ex.TotalExtras_CRC, 0)                                     AS TotalExtras_CRC,
    ISNULL(ex.TotalDescuentos_CRC, 0)                                 AS TotalDescuentos_CRC,
    ISNULL(ex.ExtrasPendientes, 0)                                    AS ExtrasPendientesAprobacion,
    ISNULL(ex.TotalExtras, 0)                                         AS NumExtrasTotal,
    CAST(0 AS MONEY)                                                  AS MontoBanco_CRC,
    clb.MontoFinanciaBanco_CRC                                        AS MontoFinanciaBancoCapturado_CRC,
    clb.MontoLoteFinanciado_CRC                                       AS MontoLoteFinanciado_CRC,
    clb.LoteHistoricoCobrado_CRC                                      AS LoteHistoricoCobrado_CRC,
    ISNULL(pcl.TotalPagoCliente_CRC, 0)                               AS PagoCliente_CRC,
    ISNULL(pcl.NumPagosCliente, 0)                                    AS NumPagosCliente,
    pcl.PrimerPagoCliente                                             AS FechaPagoCliente,
    clb.Notas                                                         AS NotasPrestamoBanco,
    0                                                                 AS PagadoProyectado_CRC,
    0                                                                 AS PagadoReal_CRC,
    0                                                                 AS NumLinks,
    CAST(
        CASE
            WHEN ISNULL(pcl.TotalPagoClienteCobrado_CRC, 0)
                 >= ISNULL(clb.PrecioVentaActual_CRC, cs.PrecioVenta)
            THEN 0
            ELSE ISNULL(clb.PrecioVentaActual_CRC, cs.PrecioVenta)
                 - ISNULL(pcl.TotalPagoClienteCobrado_CRC, 0)
        END AS MONEY
    )                                                                 AS Pendiente_CRC,
    CAST(0 AS MONEY)                                                  AS Sobrecobro_CRC,
    0                                                                 AS TieneSobrecobro,
    NULL                                                              AS RatioCobroReal,
    NULL                                                              AS IngresoTotalAD_CRC,
    NULL                                                              AS PendienteAD_CRC,
    0                                                                 AS TotalHitos,
    0                                                                 AS HitosCubiertos,
    CAST(
        CASE
            WHEN ISNULL(clb.PrecioVentaActual_CRC, cs.PrecioVenta) IS NULL
                 OR ISNULL(clb.PrecioVentaActual_CRC, cs.PrecioVenta) = 0
                THEN 0
            WHEN ISNULL(pcl.TotalPagoClienteCobrado_CRC, 0)
                 >= ISNULL(clb.PrecioVentaActual_CRC, cs.PrecioVenta)
                THEN 100
            ELSE ISNULL(pcl.TotalPagoClienteCobrado_CRC, 0)
                 * 100.0
                 / ISNULL(clb.PrecioVentaActual_CRC, cs.PrecioVenta)
        END
        AS DECIMAL(5,2)
    )                                                                 AS PorcentajeAvance,
    NULL                                                              AS ProximoCodigoHito,
    NULL                                                              AS ProximoNombreHito,
    NULL                                                              AS ProximoColorHito,
    NULL                                                              AS ProximoMonto_CRC,
    NULL                                                              AS ProximoMontoAD_CRC,
    NULL                                                              AS ProximaFechaDesembolso,
    NULL                                                              AS FechaProyectadaFormalizacion,
    NULL                                                              AS NotasFormalizacion
FROM pro_ventas.Casos cs
INNER JOIN pro_ventas.Clientes cl   ON cl.IDCliente = cs.IDCliente
LEFT  JOIN pro_ventas.Lotes lt      ON lt.IDLote = cs.IDLote
LEFT  JOIN pro_ventas.Bloques bl    ON bl.IDBloq = cs.IDBloque
LEFT  JOIN pro_ventas.Modelos md    ON md.IDMod = cs.IDModelo
LEFT  JOIN pro_ventas.Bancos bk     ON bk.IDBan = cs.IDBanco
LEFT  JOIN pro_ventas.Proyecto p    ON p.IDProyecto = lt.IDProyecto
LEFT  JOIN [pro_app].caso_lote_banco clb ON clb.IDCaso = cs.IDCaso
LEFT  JOIN PagosCliente pcl  ON pcl.IDCaso = cs.IDCaso
LEFT  JOIN ExtrasAgg ex      ON ex.IDCaso = cs.IDCaso
WHERE cs.IDEstado IN (1, 2)
  AND cs.IDCaso NOT IN (
      SELECT DISTINCT IDCaso FROM [pro_app].vw_proyeccion_desembolsos
  );
GO
CREATE VIEW [pro_app].[vw_distribucion_caso] AS
WITH ConfigVigentePorCaso AS (
    SELECT
        cs.IDCaso,
        cs.IDLote,
        cs.IDBanco,
        cs.PrecioLote,
        cs.TipoCambio,
        cv.IDConfig,
        cv.PrecioInternoM2,
        cv.Moneda
    FROM pro_ventas.Casos cs
    INNER JOIN pro_ventas.Lotes l ON l.IDLote = cs.IDLote
    CROSS APPLY (
        SELECT TOP 1 dc.IDConfig, dc.PrecioInternoM2, dc.Moneda
        FROM [pro_app].[distribucion_config] dc
        WHERE dc.IDProyecto = l.IDProyecto
          AND dc.VigenteDesde <= ISNULL(cs.FechaFormalizacion, GETDATE())
          AND (dc.VigenteHasta IS NULL OR dc.VigenteHasta >= ISNULL(cs.FechaFormalizacion, GETDATE()))
        ORDER BY dc.VigenteDesde DESC
    ) cv
    WHERE cs.IDEstado IN (1, 2, 4)
)
SELECT
    cv.IDCaso,
    cv.IDLote,
    cv.IDBanco,
    cv.PrecioLote                                                AS PrecioLoteInterno_CRC,
    cv.TipoCambio                                                AS TipoCambioCaso,
    cv.PrecioInternoM2                                           AS TarifaInterna_USDm2,
    cv.IDConfig                                                  AS IDConfigAplicado,
    e.IDEntidad,
    ce.Codigo                                                    AS CodigoEntidad,
    ce.Nombre                                                    AS NombreEntidad,
    e.Porcentaje                                                 AS PctEntidad,
    CAST(ISNULL(cv.PrecioLote, 0) * e.Porcentaje / 100.0
         AS DECIMAL(18,2))                                       AS MontoEntidad_CRC,
    e.Notas                                                      AS NotasEntidad
FROM ConfigVigentePorCaso cv
INNER JOIN [pro_app].[distribucion_config_entidad] e ON e.IDConfig = cv.IDConfig
INNER JOIN [pro_app].[catalogo_entidad_distribucion] ce ON ce.IDEntidad = e.IDEntidad;
GO
-- -----------------------------------------------------------------------------
-- 7. Vista vw_historico_distribucion (recreada con dimensión proyecto y entidades)
-- -----------------------------------------------------------------------------
CREATE VIEW [pro_app].[vw_historico_distribucion] AS
SELECT
    dc.IDConfig,
    dc.IDProyecto,
    p.AbreviaturaProyecto,
    p.Nombre AS NombreProyecto,
    dc.PrecioInternoM2,
    dc.Moneda,
    dc.VigenteDesde,
    dc.VigenteHasta,
    CASE
        WHEN dc.VigenteHasta IS NULL THEN 'VIGENTE'
        WHEN dc.VigenteHasta >= CAST(GETDATE() AS DATE) THEN 'VIGENTE'
        ELSE 'HISTORICA'
    END AS Estado,
    DATEDIFF(DAY, dc.VigenteDesde, ISNULL(dc.VigenteHasta, CAST(GETDATE() AS DATE))) AS DiasVigencia,
    -- Lista de entidades como JSON: [{"Codigo":"AD","Porcentaje":5,"Notas":"..."}, ...]
    (
        SELECT ce.Codigo, ce.Nombre, e.Porcentaje, e.Notas
        FROM [pro_app].[distribucion_config_entidad] e
        INNER JOIN [pro_app].[catalogo_entidad_distribucion] ce ON ce.IDEntidad = e.IDEntidad
        WHERE e.IDConfig = dc.IDConfig
        ORDER BY e.Porcentaje DESC
        FOR JSON PATH
    ) AS EntidadesJSON,
    dc.Notas,
    dc.FechaCreacion
FROM [pro_app].[distribucion_config] dc
INNER JOIN pro_ventas.Proyecto p ON p.IDProyecto = dc.IDProyecto;
GO
CREATE VIEW [pro_app].[vw_historico_esquema_banco] AS
SELECT
    bk.IDBan,
    bk.Abreviatura          AS AbrevBanco,
    bk.NombreEntidad        AS NombreBanco,
    bk.ColorHEXBan          AS ColorBanco,
    bk.OrdenGal,
    e.VigenteDesde,
    MIN(e.VigenteHasta)     AS VigenteHasta,
    MAX(e.DiaSemanaPeritoFijo) AS DiaSemanaPeritoFijo,
    MAX(e.Notas)            AS Notas,
    CASE
        WHEN MIN(e.VigenteHasta) IS NULL THEN 'VIGENTE'
        WHEN MIN(e.VigenteHasta) >= CAST(GETDATE() AS DATE) THEN 'VIGENTE'
        ELSE 'HISTORICA'
    END                     AS Estado,
    DATEDIFF(DAY, e.VigenteDesde, ISNULL(MIN(e.VigenteHasta), CAST(GETDATE() AS DATE))) AS DiasVigencia,
    SUM(e.PorcentajeDesembolso) AS SumaPorcentaje,
    (
        SELECT h.IDHito,
               h.Codigo,
               h.Nombre,
               h.OrdenEstandar         AS OrdenHito,
               h.ColorHEX              AS ColorHito,
               e2.OrdenEnEsquema,
               e2.PorcentajeDesembolso AS Porcentaje,
               e2.DiasSolicitudVisita,
               e2.DiasDesembolsoPostVisita,
               e2.Notas                AS NotasHito,
               CAST(e2.EsMontoFijo AS INT) AS EsMontoFijo
        FROM [pro_app].[banco_esquema_desembolso] e2
        INNER JOIN [pro_app].[catalogo_hito] h ON h.IDHito = e2.IDHito
        WHERE e2.IDBan = bk.IDBan AND e2.VigenteDesde = e.VigenteDesde
        ORDER BY e2.OrdenEnEsquema
        FOR JSON PATH
    )                       AS HitosJSON,
    MAX(e.FechaCreacion)    AS FechaCreacion
FROM [pro_app].[banco_esquema_desembolso] e
INNER JOIN pro_ventas.Bancos bk ON bk.IDBan = e.IDBan
GROUP BY bk.IDBan, bk.Abreviatura, bk.NombreEntidad, bk.ColorHEXBan, bk.OrdenGal, e.VigenteDesde;
GO
-- -----------------------------------------------------------------------------
-- 5. Vista vw_historico_valoracion_banco (con info de proyecto)
-- -----------------------------------------------------------------------------
CREATE VIEW [pro_app].[vw_historico_valoracion_banco] AS
SELECT
    v.IDValoracion,
    v.IDProyecto,
    p.AbreviaturaProyecto,
    p.Nombre                AS NombreProyecto,
    v.IDBan,
    bk.Abreviatura          AS AbrevBanco,
    bk.NombreEntidad        AS NombreBanco,
    bk.ColorHEXBan          AS ColorBanco,
    v.ValorM2Lote,
    v.Moneda,
    v.PorcentajeFinanciamiento,
    v.VigenteDesde,
    v.VigenteHasta,
    CASE
        WHEN v.VigenteHasta IS NULL THEN 'VIGENTE'
        WHEN v.VigenteHasta >= CAST(GETDATE() AS DATE) THEN 'VIGENTE'
        ELSE 'HISTORICA'
    END                     AS Estado,
    DATEDIFF(DAY, v.VigenteDesde, ISNULL(v.VigenteHasta, CAST(GETDATE() AS DATE))) AS DiasVigencia,
    v.Notas,
    v.FechaCreacion
FROM [pro_app].[banco_valoracion_lote] v
INNER JOIN pro_ventas.Bancos bk    ON bk.IDBan = v.IDBan
INNER JOIN pro_ventas.Proyecto p   ON p.IDProyecto = v.IDProyecto;
GO
CREATE VIEW [pro_app].[vw_hitos_con_pagos] AS
SELECT
    chp.IDCasoHito,
    chp.IDCaso,
    chp.IDHito,
    COUNT(lk.IDLink)                              AS NumPagos,
    ISNULL(SUM(lk.MontoAplicado_CRC), 0)          AS TotalAplicado_CRC,
    MAX(m.FechaMovimiento)                        AS UltimaFechaPago,
    CASE WHEN COUNT(lk.IDLink) >= 1 THEN 1 ELSE 0 END AS EstaCubierto
FROM [pro_app].[caso_hito_proyeccion] chp
LEFT JOIN [pro_app].[movimiento_hito_link] lk ON lk.IDCasoHito = chp.IDCasoHito
LEFT JOIN pro_ventas.Movimientos m               ON m.IDMovimiento = lk.IDMovimiento
GROUP BY chp.IDCasoHito, chp.IDCaso, chp.IDHito;
GO
-- -----------------------------------------------------------------------------
-- 1. Vista vw_hitos_con_uso
-- -----------------------------------------------------------------------------
CREATE VIEW [pro_app].[vw_hitos_con_uso] AS
SELECT
    h.IDHito,
    h.Codigo,
    h.Nombre,
    h.OrdenEstandar,
    h.Descripcion,
    h.ColorHEX,
    h.Activo,
    h.FechaCreacion,
    -- Cantidad de bancos cuyo esquema vigente incluye este hito.
    (
        SELECT COUNT(DISTINCT e.IDBan)
        FROM [pro_app].[banco_esquema_desembolso] e
        WHERE e.IDHito = h.IDHito AND e.VigenteHasta IS NULL
    ) AS BancosUsando,
    -- Cantidad total de filas históricas (para audit visual).
    (
        SELECT COUNT(*)
        FROM [pro_app].[banco_esquema_desembolso] e
        WHERE e.IDHito = h.IDHito
    ) AS RowsTotales
FROM [pro_app].[catalogo_hito] h;
GO
-- =============================================================================
-- Fase 8.bis Tarea A — Fix vw_liquidacion_lote rama Contado.
--
-- Problema:
--   La rama CLIENTE del UNION ALL en vw_liquidacion_lote lee de la columna
--   deprecated pago_cliente.IDMovimientoVinculado (modelo 1:1 viejo de Fase
--   4.6h). En Fase 6.8 migramos a modelo N:N vía pago_cliente_mov_link, pero
--   esta vista no se actualizó. Resultado: ningún mov contado nuevo aparece
--   en la liquidación → UI no muestra la distribución AD/QFI/GM al vincular
--   un mov a pago_cliente LOTE en contado.
--
-- Fix:
--   Reemplazar el JOIN por pago_cliente.IDMovimientoVinculado por uno via
--   pago_cliente_mov_link. SUM(MontoAplicado_CRC) por si hay splits del
--   mov entre varios pagos LOTE (poco probable pero soportado por N:N).
-- =============================================================================

CREATE   VIEW [pro_app].[vw_liquidacion_lote] AS
WITH MovsDelLote AS (
    -- Rama BANCO: mov vinculado a hito LOTE vía movimiento_hito_link.
    SELECT
        m.IDMovimiento, m.IDCaso, m.FechaMovimiento, m.MontoColones,
        m.TipoCambio, m.EsCapturaBruta,
        'BANCO' AS Origen,
        SUM(lk.MontoAplicado_CRC) AS MontoAplicadoLote_CRC
    FROM pro_ventas.Movimientos m
    INNER JOIN [pro_app].[movimiento_hito_link] lk ON lk.IDMovimiento = m.IDMovimiento
    INNER JOIN [pro_app].[caso_hito_proyeccion] chp ON chp.IDCasoHito = lk.IDCasoHito
    INNER JOIN [pro_app].[catalogo_hito] ch ON ch.IDHito = chp.IDHito
    WHERE ch.Codigo = 'LOTE'
    GROUP BY m.IDMovimiento, m.IDCaso, m.FechaMovimiento, m.MontoColones,
             m.TipoCambio, m.EsCapturaBruta

    UNION ALL

    -- Rama CLIENTE: mov vinculado a pago_cliente Concepto='LOTE' vía
    -- pago_cliente_mov_link (Fase 6.8 N:N). Antes leía de
    -- pago_cliente.IDMovimientoVinculado (deprecated).
    SELECT
        m.IDMovimiento, m.IDCaso, m.FechaMovimiento, m.MontoColones,
        m.TipoCambio, m.EsCapturaBruta,
        'CLIENTE' AS Origen,
        SUM(pcl.MontoAplicado_CRC) AS MontoAplicadoLote_CRC
    FROM pro_ventas.Movimientos m
    INNER JOIN [pro_app].[pago_cliente_mov_link] pcl ON pcl.IDMovimiento = m.IDMovimiento
    INNER JOIN [pro_app].[pago_cliente] pc ON pc.IDPago = pcl.IDPago
    WHERE pc.Concepto = 'LOTE'
    GROUP BY m.IDMovimiento, m.IDCaso, m.FechaMovimiento, m.MontoColones,
             m.TipoCambio, m.EsCapturaBruta
),
ConfigPorMov AS (
    SELECT
        mdl.IDMovimiento, mdl.IDCaso, mdl.FechaMovimiento, mdl.MontoColones,
        mdl.MontoAplicadoLote_CRC, mdl.TipoCambio, mdl.EsCapturaBruta, mdl.Origen,
        cs.IDLote, l.IDProyecto, l.Area AS AreaLote,
        dc.IDConfig, dc.PrecioInternoM2, dc.Moneda AS MonedaConfig,
        dc.ExclusividadEntidadCodigo, dc.ExclusividadUSDm2,
        -- Calculados (defaults del proyecto).
        CAST(
            CASE WHEN dc.Moneda = 'USD'
                 THEN ISNULL(dc.PrecioInternoM2, 0) * ISNULL(l.Area, 0) * ISNULL(mdl.TipoCambio, 0)
                 ELSE ISNULL(dc.PrecioInternoM2, 0) * ISNULL(l.Area, 0)
            END
        AS DECIMAL(18, 2)) AS LoteInternoCalculado_CRC,
        CAST(
            CASE WHEN dc.ExclusividadEntidadCodigo IS NOT NULL
                  AND dc.ExclusividadUSDm2 > 0
                 THEN ISNULL(l.Area, 0) * ISNULL(dc.ExclusividadUSDm2, 0) * ISNULL(mdl.TipoCambio, 0)
                 ELSE 0
            END
        AS DECIMAL(18, 2)) AS ExclusividadCalculada_CRC,
        -- Overrides (NULL si no hay).
        ov.LoteInternoOverride_CRC,
        ov.ExclusividadOverride_CRC,
        -- Efectivos = COALESCE(override, calculado).
        CAST(
            COALESCE(ov.LoteInternoOverride_CRC,
                CASE WHEN dc.Moneda = 'USD'
                     THEN ISNULL(dc.PrecioInternoM2, 0) * ISNULL(l.Area, 0) * ISNULL(mdl.TipoCambio, 0)
                     ELSE ISNULL(dc.PrecioInternoM2, 0) * ISNULL(l.Area, 0)
                END)
        AS DECIMAL(18, 2)) AS LoteInterno_CRC,
        CAST(
            COALESCE(ov.ExclusividadOverride_CRC,
                CASE WHEN dc.ExclusividadEntidadCodigo IS NOT NULL
                      AND dc.ExclusividadUSDm2 > 0
                     THEN ISNULL(l.Area, 0) * ISNULL(dc.ExclusividadUSDm2, 0) * ISNULL(mdl.TipoCambio, 0)
                     ELSE 0
                END)
        AS DECIMAL(18, 2)) AS Exclusividad_CRC,
        CASE WHEN ov.IDMovimiento IS NOT NULL THEN 1 ELSE 0 END AS TieneOverride
    FROM MovsDelLote mdl
    INNER JOIN pro_ventas.Casos cs ON cs.IDCaso = mdl.IDCaso
    INNER JOIN pro_ventas.Lotes l ON l.IDLote = cs.IDLote
    OUTER APPLY (
        SELECT TOP 1
            dc1.IDConfig, dc1.PrecioInternoM2, dc1.Moneda,
            dc1.ExclusividadEntidadCodigo, dc1.ExclusividadUSDm2
        FROM [pro_app].[distribucion_config] dc1
        WHERE dc1.IDProyecto = l.IDProyecto
          AND dc1.VigenteDesde <= mdl.FechaMovimiento
          AND (dc1.VigenteHasta IS NULL OR dc1.VigenteHasta >= mdl.FechaMovimiento)
        ORDER BY dc1.VigenteDesde DESC
    ) dc
    LEFT JOIN [pro_app].liquidacion_lote_override ov ON ov.IDMovimiento = mdl.IDMovimiento
)
-- Rama BRUTO: descomponer en AD/QFI/GM/Exclusividad.
SELECT
    cpm.IDMovimiento, cpm.IDCaso, cpm.FechaMovimiento,
    cpm.MontoColones                  AS MontoMovBruto_CRC,
    cpm.MontoAplicadoLote_CRC,
    cpm.Origen,
    cpm.EsCapturaBruta,
    cpm.IDLote, cpm.IDProyecto, cpm.AreaLote, cpm.IDConfig,
    cpm.LoteInterno_CRC, cpm.LoteInternoCalculado_CRC, cpm.LoteInternoOverride_CRC,
    cpm.Exclusividad_CRC, cpm.ExclusividadCalculada_CRC, cpm.ExclusividadOverride_CRC,
    cpm.ExclusividadEntidadCodigo, cpm.ExclusividadUSDm2,
    cpm.TieneOverride,
    ce.IDEntidad,
    ce.Codigo                         AS CodigoEntidad,
    ce.Nombre                         AS NombreEntidad,
    dce.Porcentaje                    AS PctEntidad,
    CAST(
        CASE
            WHEN ce.Codigo = 'AD' THEN
                  (cpm.LoteInterno_CRC * dce.Porcentaje / 100.0)
                + (cpm.MontoAplicadoLote_CRC - cpm.LoteInterno_CRC)
                - cpm.Exclusividad_CRC
            WHEN ce.Codigo = cpm.ExclusividadEntidadCodigo THEN
                  (cpm.LoteInterno_CRC * dce.Porcentaje / 100.0)
                + cpm.Exclusividad_CRC
            ELSE
                  (cpm.LoteInterno_CRC * dce.Porcentaje / 100.0)
        END
    AS DECIMAL(18, 2)) AS MontoEntidad_CRC
FROM ConfigPorMov cpm
INNER JOIN [pro_app].[distribucion_config_entidad] dce ON dce.IDConfig = cpm.IDConfig
INNER JOIN [pro_app].[catalogo_entidad_distribucion] ce ON ce.IDEntidad = dce.IDEntidad
WHERE cpm.EsCapturaBruta = 1

UNION ALL

-- Rama NETO AD legacy: una sola fila AD con monto = MontoColones.
SELECT
    cpm.IDMovimiento, cpm.IDCaso, cpm.FechaMovimiento,
    cpm.MontoColones                  AS MontoMovBruto_CRC,
    cpm.MontoAplicadoLote_CRC,
    cpm.Origen,
    cpm.EsCapturaBruta,
    cpm.IDLote, cpm.IDProyecto, cpm.AreaLote, cpm.IDConfig,
    cpm.LoteInterno_CRC, cpm.LoteInternoCalculado_CRC, cpm.LoteInternoOverride_CRC,
    cpm.Exclusividad_CRC, cpm.ExclusividadCalculada_CRC, cpm.ExclusividadOverride_CRC,
    cpm.ExclusividadEntidadCodigo, cpm.ExclusividadUSDm2,
    cpm.TieneOverride,
    ceAD.IDEntidad,
    ceAD.Codigo                       AS CodigoEntidad,
    ceAD.Nombre                       AS NombreEntidad,
    CAST(100 AS DECIMAL(5, 2))        AS PctEntidad,
    CAST(cpm.MontoColones AS DECIMAL(18, 2)) AS MontoEntidad_CRC
FROM ConfigPorMov cpm
INNER JOIN [pro_app].[catalogo_entidad_distribucion] ceAD ON ceAD.Codigo = 'AD'
WHERE cpm.EsCapturaBruta = 0;
GO
CREATE VIEW [pro_app].[vw_lote_credito_puente] AS
SELECT
    l.IDLote,
    l.Lote                              AS CodigoLote,
    l.IDProyecto,
    p.AbreviaturaProyecto,
    p.Nombre                            AS NombreProyecto,
    cpl.IDCreditoPuenteLote,
    cpl.IDCreditoPuente,
    cp.Codigo                           AS CodigoCP,
    cp.IDBan                            AS IDBancoCP,
    b.Abreviatura                       AS AbrevBancoCP,
    b.NombreEntidad                     AS NombreBancoCP,
    b.ColorHEXBan                       AS ColorBancoCP,
    cpl.MontoResponsabilidadTeorica_CRC,
    -- Gastos formalizacion del lote: override manual o proporcional.
    CAST(
        CASE
            WHEN cpl.GastosFormalizacionOverride = 1
                 THEN cpl.GastosFormalizacionLote_CRC
            WHEN cp.GastosFormalizacion_CRC IS NULL
                 THEN NULL
            ELSE cp.GastosFormalizacion_CRC
                 * (CAST(cpl.MontoResponsabilidadTeorica_CRC AS DECIMAL(38,10))
                    / NULLIF(CAST(cp.MontoTotal_CRC AS DECIMAL(38,10)), 0))
        END
    AS MONEY)                           AS GastosFormalizacionLoteCalculado_CRC,
    cpl.GastosFormalizacionLote_CRC     AS GastosFormalizacionLoteOverride_CRC,
    cpl.GastosFormalizacionOverride,
    cpl.Estado                          AS EstadoLoteCP,
    cpl.FechaCancelacionAlBanco,
    cpl.MontoCanceladoAlBanco_CRC,
    cpl.FechaConfirmacionCancelacion,
    cpl.MontoConfirmadoAlBanco_CRC,
    cpl.ComprobanteCancelacion,
    cp.Estado                           AS EstadoCredito,
    cpl.Notas                           AS NotasLoteCP,
    cpl.CreadoPor                       AS LoteCpCreadoPor,
    cpl.FechaCreacion                   AS LoteCpFechaCreacion,
    cpl.ModificadoPor                   AS LoteCpModificadoPor,
    cpl.FechaModificacion               AS LoteCpFechaModificacion
FROM [pro_app].[credito_puente_lote] cpl
INNER JOIN [pro_app].[credito_puente] cp ON cp.IDCreditoPuente = cpl.IDCreditoPuente
INNER JOIN pro_ventas.Lotes l ON l.IDLote = cpl.IDLote
INNER JOIN pro_ventas.Proyecto p ON p.IDProyecto = l.IDProyecto
INNER JOIN pro_ventas.Bancos b ON b.IDBan = cp.IDBan;
GO
CREATE VIEW [pro_app].[vw_monto_banco_por_lote] AS
SELECT
    cs.IDCaso,
    cs.IDLote,
    cs.IDBanco,
    l.IDProyecto,
    l.Area                                              AS AreaLote_m2,
    cs.TipoCambio                                       AS TipoCambioCaso,
    cs.PrecioVenta                                      AS PrecioVentaContractual_CRC,
    ISNULL(clb.PrecioVentaActual_CRC, cs.PrecioVenta)   AS PrecioVentaActual_CRC,
    CAST(
        ISNULL(clb.MontoFinanciaBanco_CRC,
               ISNULL(clb.PrecioVentaActual_CRC, cs.PrecioVenta))
    AS MONEY)                                           AS MontoPagaBancoPorLote_CRC,
    clb.MontoFinanciaBanco_CRC                          AS MontoFinanciaBancoCapturado_CRC,
    COALESCE(
        clb.MontoLoteFinanciado_CRC,
        CASE
            WHEN vv.ValorM2Lote IS NOT NULL THEN
                CAST(
                    CASE
                        WHEN vv.Moneda = 'USD' THEN
                            ISNULL(l.Area, 0) * ISNULL(vv.ValorM2Lote, 0)
                            * ISNULL(cs.TipoCambio, 0)
                        ELSE
                            ISNULL(l.Area, 0) * ISNULL(vv.ValorM2Lote, 0)
                    END * ISNULL(vv.PorcentajeFinanciamiento, 0) / 100.0
                AS MONEY)
            ELSE NULL
        END
    )                                                   AS MontoLoteFinanciado_CRC,
    clb.MontoLoteFinanciado_CRC                         AS MontoLoteFinanciadoCapturado_CRC,
    CASE
        WHEN vv.ValorM2Lote IS NOT NULL THEN
            CAST(
                CASE
                    WHEN vv.Moneda = 'USD' THEN
                        ISNULL(l.Area, 0) * ISNULL(vv.ValorM2Lote, 0)
                        * ISNULL(cs.TipoCambio, 0)
                    ELSE
                        ISNULL(l.Area, 0) * ISNULL(vv.ValorM2Lote, 0)
                END * ISNULL(vv.PorcentajeFinanciamiento, 0) / 100.0
            AS MONEY)
        ELSE NULL
    END                                                 AS MontoLoteSugerido_CRC,
    CASE
        WHEN clb.MontoLoteFinanciado_CRC IS NOT NULL THEN 'CAPTURADO'
        WHEN vv.ValorM2Lote IS NOT NULL              THEN 'SUGERIDO'
        ELSE                                              'NO_DISPONIBLE'
    END                                                 AS OrigenMontoLote,
    ISNULL(clb.PagoCliente_CRC, 0)                      AS PagoCliente_CRC,
    clb.FechaPagoCliente                                AS FechaPagoCliente,
    CASE
        WHEN clb.MontoFinanciaBanco_CRC IS NOT NULL THEN 'CAPTURADO'
        WHEN clb.PrecioVentaActual_CRC IS NOT NULL  THEN 'PRECIO_VENTA_ACTUAL'
        WHEN cs.PrecioVenta IS NOT NULL             THEN 'PRECIO_VENTA'
        ELSE 'NO_DISPONIBLE'
    END                                                 AS Origen,
    l.Area * vv.ValorM2Lote                             AS LoteAvaluado_CRC,
    vv.ValorM2Lote                                      AS ValorM2BancoUSD,
    vv.Moneda                                           AS MonedaValoracion,
    vv.PorcentajeFinanciamiento                         AS PorcentajeFinanciamiento,
    clb.IDCasoLoteBanco                                 AS IDRegistroManual
FROM pro_ventas.Casos cs
INNER JOIN pro_ventas.Lotes l ON l.IDLote = cs.IDLote
LEFT JOIN [pro_app].[caso_lote_banco] clb ON clb.IDCaso = cs.IDCaso
-- Cambio clave: usa la valoracion ACTUAL (VigenteHasta IS NULL), sin filtrar
-- por VigenteDesde. La unicidad esta garantizada por el SP que cierra la
-- anterior al insertar una nueva.
LEFT JOIN [pro_app].[banco_valoracion_lote] vv
       ON vv.IDProyecto = l.IDProyecto
      AND vv.IDBan = cs.IDBanco
      AND vv.VigenteHasta IS NULL
WHERE cs.IDEstado IN (1, 2, 4);
GO
CREATE VIEW [pro_app].[vw_movimientos_caso] AS
SELECT
    m.IDMovimiento,
    m.IDCaso,
    cs.DetCaso                                            AS CodigoCaso,
    cl.NombreCompleto                                     AS Cliente,
    cs.IDLote,
    lt.Lote                                               AS CodigoLote,
    bl.IDBloq                                             AS IDBloque,
    bl.Bloque                                             AS NombreBloque,
    md.Modelo                                             AS NombreModelo,
    m.IDTipmov,
    tm.Abreviatura                                        AS AbreviaturaTipo,
    tm.TipoMovimiento                                     AS NombreTipo,
    LTRIM(RTRIM(tm.Categoria))                            AS CategoriaTipo,
    tm.TgDesembolso,
    m.FechaSolicitudMovimiento                            AS FechaSolicitud,
    m.FechaMovimiento                                     AS FechaRealizado,
    m.Moneda,
    m.TipoCambio,
    m.MontoColones,
    m.MontoDolares,
    LTRIM(RTRIM(ISNULL(m.Depositante, '')))               AS Depositante,
    [pro_app].fn_clasificar_depositante(m.Depositante)        AS Clasificacion,
    m.DetalleTransferencia,
    m.Completado,
    m.TgSolicitado,
    -- Vinculación a HITOS
    ISNULL(lk.MontoVinculado_CRC, 0)                      AS MontoVinculadoHitos_CRC,
    ISNULL(lk.NumLinks, 0)                                AS NumHitosVinculados,
    -- Vinculación a PAGOS CLIENTE (ahora desde link table N:N)
    ISNULL(pc.MontoVinculadoPagos_CRC, 0)                 AS MontoVinculadoPagosCliente_CRC,
    ISNULL(pc.NumPagosClienteVinculados, 0)               AS NumPagosClienteVinculados,
    CASE WHEN ISNULL(pc.NumPagosClienteVinculados, 0) > 0
         THEN 1 ELSE 0 END                                AS EstaVinculadoAPagoCliente,
    -- Combinados (compat con la UI actual)
    CAST(
        ISNULL(lk.MontoVinculado_CRC, 0)
        + ISNULL(pc.MontoVinculadoPagos_CRC, 0)
    AS MONEY)                                             AS MontoVinculado_CRC,
    CAST(
        ISNULL(m.MontoColones, 0)
        - ISNULL(lk.MontoVinculado_CRC, 0)
        - ISNULL(pc.MontoVinculadoPagos_CRC, 0)
    AS MONEY)                                             AS MontoSinVincular_CRC,
    CASE
        WHEN ISNULL(lk.NumLinks, 0) > 0
          OR ISNULL(pc.NumPagosClienteVinculados, 0) > 0
        THEN 1 ELSE 0
    END                                                   AS EstaVinculado
FROM pro_ventas.Movimientos m
INNER JOIN pro_ventas.TipMovi tm   ON tm.IDTmov = m.IDTipmov
LEFT  JOIN pro_ventas.Casos cs     ON cs.IDCaso = m.IDCaso
LEFT  JOIN pro_ventas.Clientes cl  ON cl.IDCliente = cs.IDCliente
LEFT  JOIN pro_ventas.Lotes lt     ON lt.IDLote = cs.IDLote
LEFT  JOIN pro_ventas.Bloques bl   ON bl.IDBloq = cs.IDBloque
LEFT  JOIN pro_ventas.Modelos md   ON md.IDMod  = cs.IDModelo
LEFT JOIN (
    SELECT IDMovimiento,
           SUM(MontoAplicado_CRC) AS MontoVinculado_CRC,
           COUNT(*)               AS NumLinks
    FROM [pro_app].[movimiento_hito_link]
    GROUP BY IDMovimiento
) lk ON lk.IDMovimiento = m.IDMovimiento
LEFT JOIN (
    SELECT IDMovimiento,
           SUM(MontoAplicado_CRC) AS MontoVinculadoPagos_CRC,
           COUNT(*)               AS NumPagosClienteVinculados
    FROM [pro_app].[pago_cliente_mov_link]
    GROUP BY IDMovimiento
) pc ON pc.IDMovimiento = m.IDMovimiento;
GO
CREATE VIEW [pro_app].[vw_movimientos_clasificados] AS
SELECT
    m.IDMovimiento,
    m.IDCaso,
    m.FechaMovimiento,
    m.FechaSolicitudMovimiento,
    m.MontoColones,
    m.Completado,
    m.TgSolicitado,
    m.Depositante,
    [pro_app].fn_clasificar_depositante(m.Depositante) AS Clasificacion,
    m.IDTipmov,
    tm.TipoMovimiento,
    tm.Abreviatura                                  AS AbreviaturaTipo,
    LTRIM(RTRIM(tm.Categoria))                      AS CategoriaTipo,
    tm.TgDesembolso,
    -- Solo aplicable a tipos con Abreviatura tipo 'D1', 'D2', ..., 'D14'.
    -- TRY_CAST para evitar fallos si la abreviatura no encaja con el patrón.
    CASE
        WHEN LTRIM(RTRIM(tm.Categoria)) = 'D'
         AND LEFT(tm.Abreviatura, 1) = 'D'
         AND LEN(tm.Abreviatura) >= 2
            THEN TRY_CAST(SUBSTRING(tm.Abreviatura, 2, 10) AS INT)
        ELSE NULL
    END                                             AS NumeroDesembolso,
    -- Ranking por caso del N-ésimo desembolso completado clasificado como BANCO.
    -- Útil para asociar el primer pago del banco al primer hito del esquema.
    CASE
        WHEN m.Completado = 1
         AND [pro_app].fn_clasificar_depositante(m.Depositante) = 'BANCO'
         AND tm.TgDesembolso = 1
            THEN ROW_NUMBER() OVER (
                PARTITION BY m.IDCaso,
                             CASE WHEN m.Completado = 1
                                   AND [pro_app].fn_clasificar_depositante(m.Depositante) = 'BANCO'
                                   AND tm.TgDesembolso = 1 THEN 1 ELSE 0 END
                ORDER BY m.FechaMovimiento, m.IDMovimiento)
        ELSE NULL
    END                                             AS OrdenPagoBancoCompletado
FROM pro_ventas.Movimientos m
INNER JOIN pro_ventas.TipMovi tm ON tm.IDTmov = m.IDTipmov;
GO
CREATE VIEW [pro_app].[vw_pagos_cliente_caso] AS
WITH AggLinks AS (
    SELECT
        IDPago,
        SUM(MontoAplicado_CRC) AS MontoAplicado_CRC,
        COUNT(*)               AS NumLinks
    FROM [pro_app].[pago_cliente_mov_link]
    GROUP BY IDPago
)
SELECT
    pc.IDPago,
    pc.IDCaso,
    pc.Concepto,
    pc.IDExtra,
    pc.MontoPlaneado_CRC,
    pc.FechaPlaneada,
    pc.FechaReal,
    -- Mantenemos columna por compat histórica (NO usar para lógica nueva).
    pc.IDMovimientoVinculado,
    pc.Notas,
    pc.CreadoPor,
    pc.FechaCreacion,
    pc.ModificadoPor,
    pc.FechaModificacion,
    ISNULL(ag.MontoAplicado_CRC, 0)                   AS MontoAplicado_CRC,
    ISNULL(ag.NumLinks, 0)                            AS NumLinks,
    CAST(
        ISNULL(ag.MontoAplicado_CRC, 0) - pc.MontoPlaneado_CRC
        AS MONEY
    )                                                 AS Diferencia_CRC,
    CASE
        WHEN ISNULL(ag.NumLinks, 0) >= 1            THEN 'VINCULADO'
        WHEN pc.FechaReal IS NOT NULL               THEN 'REALIZADO'
        ELSE 'PROYECTADO'
    END                                               AS Estado
FROM [pro_app].[pago_cliente] pc
LEFT JOIN AggLinks ag ON ag.IDPago = pc.IDPago;
GO
CREATE VIEW [pro_app].[vw_pagos_por_caso] AS
SELECT
    m.IDCaso,
    SUM(CASE WHEN [pro_app].[fn_clasificar_depositante](m.Depositante) = 'BANCO'   AND m.Completado = 1
             THEN m.MontoColones ELSE 0 END)                              AS PagadoPorBanco,
    SUM(CASE WHEN [pro_app].[fn_clasificar_depositante](m.Depositante) = 'CLIENTE' AND m.Completado = 1
             THEN m.MontoColones ELSE 0 END)                              AS PagadoPorCliente,
    SUM(CASE WHEN [pro_app].[fn_clasificar_depositante](m.Depositante) = 'OTRO'    AND m.Completado = 1
             THEN m.MontoColones ELSE 0 END)                              AS PagadoOtroOrigen,
    SUM(CASE WHEN m.Completado = 1                       THEN m.MontoColones ELSE 0 END) AS TotalPagado,
    SUM(CASE WHEN m.TgSolicitado = 1 AND m.Completado=0  THEN m.MontoColones ELSE 0 END) AS TotalSolicitadoNoCompletado,
    SUM(CASE WHEN tm.TgDesembolso = 1 AND m.Completado = 1
             THEN m.MontoColones ELSE 0 END)                              AS TotalDesembolsos,
    COUNT(*)                                                              AS NumMovimientos,
    MAX(m.FechaMovimiento)                                                AS UltimaFechaMovimiento
FROM pro_ventas.Movimientos m
INNER JOIN pro_ventas.TipMovi tm ON tm.IDTmov = m.IDTipmov
GROUP BY m.IDCaso;
GO
CREATE VIEW [pro_app].[vw_proyeccion_desembolsos] AS
WITH BaseCasos AS (
    SELECT
        cs.IDCaso,
        cs.IDLote,
        cs.IDBanco,
        cs.PrecioVenta,
        cs.PrecioLote,
        cs.FechaFormalizacion AS FechaBase,
        cs.IDEstado,
        CAST(0 AS BIT) AS EsReservado,
        CAST(NULL AS CHAR(1)) AS NivelConfianzaForm
    FROM pro_ventas.Casos cs
    -- Incluir Formalizados (2) y Entregados (1). Los Entregados aparecen
    -- en la matriz cuando tienen hitos con FechaProyectada en el rango
    -- visible (tipicamente hitos DESEMBOLSADO con FechaRealDesembolso).
    -- El filtro del backlog excluye Entregados aparte para que no aparezcan
    -- como pendientes.
    WHERE cs.IDEstado IN (1, 2)

    UNION ALL

    SELECT
        cs.IDCaso,
        cs.IDLote,
        cs.IDBanco,
        cs.PrecioVenta,
        cs.PrecioLote,
        pf.FechaProyectada AS FechaBase,
        cs.IDEstado,
        CAST(1 AS BIT) AS EsReservado,
        pf.NivelConfianza AS NivelConfianzaForm
    FROM pro_ventas.Casos cs
    INNER JOIN [pro_app].[proyeccion_formalizacion] pf
        ON pf.IDCaso = cs.IDCaso AND pf.Activa = 1
    WHERE cs.IDEstado = 4
),
EsquemaPorCaso AS (
    SELECT
        bc.IDCaso,
        bc.IDLote,
        bc.IDBanco,
        bc.PrecioVenta,
        bc.PrecioLote,
        bc.FechaBase AS FechaFormalizacion,
        bc.EsReservado,
        bc.NivelConfianzaForm,
        l.IDProyecto,
        e.IDEsquema,
        e.IDHito,
        e.OrdenEnEsquema,
        e.PorcentajeDesembolso,
        e.EsMontoFijo,
        e.DiasSolicitudVisita,
        e.DiasDesembolsoPostVisita,
        e.DiaSemanaPeritoFijo,
        SUM(e.PorcentajeDesembolso) OVER (
            PARTITION BY bc.IDCaso
            ORDER BY e.OrdenEnEsquema
            ROWS UNBOUNDED PRECEDING
        ) AS PorcentajeAcumulado
    FROM BaseCasos bc
    INNER JOIN pro_ventas.Lotes l ON l.IDLote = bc.IDLote
    INNER JOIN [pro_app].[banco_esquema_desembolso] e
        ON e.IDBan = bc.IDBanco
       AND e.VigenteHasta IS NULL
)
SELECT
    ec.IDCaso,
    cs.DetCaso                                                AS CodigoCaso,
    cl.NombreCompleto                                         AS Cliente,
    md.Modelo                                                 AS NombreModelo,
    ec.IDLote,
    bl.Bloque                                                 AS NombreBloque,
    lt.Lote                                                   AS CodigoLote,
    lt.Area                                                   AS AreaLote_m2,
    ec.IDBanco                                                AS IDBan,
    bk.Abreviatura                                            AS AbrevBanco,
    bk.NombreEntidad                                          AS NombreBanco,
    bk.ColorHEXBan                                            AS ColorBanco,
    ec.IDProyecto,
    p.AbreviaturaProyecto,
    p.Nombre                                                  AS NombreProyecto,
    ec.IDHito,
    h.Codigo                                                  AS CodigoHito,
    h.Nombre                                                  AS NombreHito,
    h.ColorHEX                                                AS ColorHito,
    ec.OrdenEnEsquema,
    ec.PorcentajeDesembolso                                   AS PorcentajeHito,
    ec.PorcentajeAcumulado,
    ec.DiasSolicitudVisita,
    ec.DiasDesembolsoPostVisita,
    ec.DiaSemanaPeritoFijo,
    ec.IDEsquema,
    ec.EsMontoFijo,
    ec.EsReservado,
    ec.NivelConfianzaForm                                     AS NivelConfianzaFormalizacion,
    mb.MontoPagaBancoPorLote_CRC                              AS MontoBanco,
    CAST(
        ISNULL(mb.MontoPagaBancoPorLote_CRC, 0)
        - ISNULL(mb.MontoLoteFinanciado_CRC, 0)
    AS MONEY)                                                 AS MontoConstruccion_CRC,
    CAST(
        CASE WHEN ec.EsMontoFijo = 1
             THEN ISNULL(mb.MontoLoteFinanciado_CRC, 0)
             ELSE (ISNULL(mb.MontoPagaBancoPorLote_CRC, 0)
                   - ISNULL(mb.MontoLoteFinanciado_CRC, 0))
                  * ec.PorcentajeDesembolso / 100.0
        END
    AS DECIMAL(18,2))                                         AS MontoHitoEsperado,
    pg.PagadoPorBanco,
    ec.PrecioLote                                             AS PrecioLoteInterno_CRC,
    rlc.PagoADBase_CRC,
    rlc.DiferenciaBancoVsInterno_CRC,
    rlc.IngresoTotalAD_CRC,
    rlc.OrigenMontoBanco,
    CASE WHEN ISNULL(hp.NumPagos, 0) > 0 THEN 1 ELSE 0 END    AS HitoCubierto,
    chp.IDCasoHito                                            AS IDProyeccion,
    chp.FechaPlaneadaHito,
    chp.FechaPlaneadaVisitaPerito,
    chp.FechaProyectadaDesembolso,
    chp.FechaRealHito,
    chp.FechaRealVisitaPerito,
    chp.FechaRealDesembolso,
    chp.EstadoTramite                                         AS EstadoOverride,
    chp.Notas                                                 AS NotasOverride,
    chp.FechaModificacion                                     AS UltimaModificacion,
    COALESCE(
        chp.FechaRealDesembolso,
        chp.FechaProyectadaDesembolso,
        CASE WHEN chp.IDCasoHito IS NULL THEN
            CASE WHEN ec.EsMontoFijo = 1
                 THEN ec.FechaFormalizacion
                 ELSE DATEADD(day, 60 * (ec.OrdenEnEsquema - 1), ec.FechaFormalizacion)
            END
        ELSE NULL END
    )                                                         AS FechaProyectada,
    COALESCE(chp.EstadoTramite, 'PLANEADO')                   AS EstadoTramite,
    CASE WHEN chp.IDCasoHito IS NULL THEN 1 ELSE 0 END        AS EsDerivado,
    ec.FechaFormalizacion
FROM EsquemaPorCaso ec
INNER JOIN pro_ventas.Casos cs           ON cs.IDCaso = ec.IDCaso
INNER JOIN pro_ventas.Lotes lt           ON lt.IDLote = ec.IDLote
LEFT JOIN pro_ventas.Bloques bl          ON bl.IDBloq = cs.IDBloque
LEFT JOIN pro_ventas.Modelos md          ON md.IDMod = cs.IDModelo
INNER JOIN pro_ventas.Clientes cl        ON cl.IDCliente = cs.IDCliente
INNER JOIN pro_ventas.Bancos bk          ON bk.IDBan = ec.IDBanco
INNER JOIN pro_ventas.Proyecto p         ON p.IDProyecto = ec.IDProyecto
INNER JOIN [pro_app].[catalogo_hito] h ON h.IDHito = ec.IDHito
LEFT JOIN [pro_app].[vw_monto_banco_por_lote] mb ON mb.IDCaso = ec.IDCaso
LEFT JOIN [pro_app].[vw_pagos_por_caso] pg       ON pg.IDCaso = ec.IDCaso
LEFT JOIN [pro_app].[vw_resumen_lote_caso] rlc   ON rlc.IDCaso = ec.IDCaso
LEFT JOIN [pro_app].[caso_hito_proyeccion] chp
    ON chp.IDCaso = ec.IDCaso AND chp.IDHito = ec.IDHito
LEFT JOIN [pro_app].[vw_hitos_con_pagos] hp
    ON hp.IDCasoHito = chp.IDCasoHito;
GO
CREATE VIEW [pro_app].[vw_resumen_lote_caso] AS
WITH MontoEntidadAD AS (
    SELECT IDCaso, MontoEntidad_CRC AS PagoADBase_CRC
    FROM [pro_app].[vw_distribucion_caso]
    WHERE CodigoEntidad = 'AD'
)
SELECT
    cs.IDCaso,
    cs.IDLote,
    cs.IDBanco,
    l.IDProyecto,
    p.AbreviaturaProyecto,
    l.Area                                          AS AreaLote_m2,
    cs.TipoCambio                                   AS TipoCambioCaso,
    cs.PrecioLote                                   AS PrecioLoteInterno_CRC,
    ad.PagoADBase_CRC,
    bm.MontoPagaBancoPorLote_CRC,
    bm.Origen                                       AS OrigenMontoBanco,
    -- MontoLoteFinanciado_CRC: viene de vw_monto_banco_por_lote, que ya
    -- aplica COALESCE(capturado, sugerido) por la Opcion C.
    bm.MontoLoteFinanciado_CRC                      AS MontoLoteFinanciado_CRC,
    -- Capturado puro (sin fallback) para callers que necesiten distinguir.
    bm.MontoLoteFinanciadoCapturado_CRC             AS MontoLoteFinanciadoCapturado_CRC,
    -- Sugerido puro (sin capturado) para mostrar como referencia.
    bm.MontoLoteSugerido_CRC                        AS MontoLoteSugerido_CRC,
    bm.OrigenMontoLote                              AS OrigenMontoLote,
    -- Diferencia banco vs interno: usa el fallback. Si no hay ni capturado
    -- ni sugerido, queda NULL (no se puede calcular sin valoracion del lote).
    CASE
        WHEN bm.MontoLoteFinanciado_CRC IS NOT NULL
            THEN CAST(bm.MontoLoteFinanciado_CRC - cs.PrecioLote AS DECIMAL(18,2))
        ELSE NULL
    END                                             AS DiferenciaBancoVsInterno_CRC,
    -- Ingreso total AD: PagoADBase + sobrante (capturado o sugerido).
    CAST(
        ISNULL(ad.PagoADBase_CRC, 0)
        + ISNULL(
            CASE
                WHEN bm.MontoLoteFinanciado_CRC IS NOT NULL
                    THEN bm.MontoLoteFinanciado_CRC - cs.PrecioLote
                ELSE NULL
            END,
            0
        )
        AS DECIMAL(18,2)
    )                                               AS IngresoTotalAD_CRC
FROM pro_ventas.Casos cs
INNER JOIN pro_ventas.Lotes l        ON l.IDLote = cs.IDLote
INNER JOIN pro_ventas.Proyecto p     ON p.IDProyecto = l.IDProyecto
LEFT JOIN MontoEntidadAD ad   ON ad.IDCaso = cs.IDCaso
LEFT JOIN [pro_app].[vw_monto_banco_por_lote] bm ON bm.IDCaso = cs.IDCaso
-- 1=Entregado, 2=Formalizado, 4=Reservado. Cambio: agregamos 4.
WHERE cs.IDEstado IN (1, 2, 4);
GO
CREATE VIEW [pro_app].[vw_saldo_por_caso] AS
SELECT
    c.IDCaso,
    c.PrecioVenta,
    ISNULL(p.PagadoPorBanco, 0)                                  AS PagadoPorBanco,
    ISNULL(p.PagadoPorCliente, 0)                                AS PagadoPorCliente,
    ISNULL(p.PagadoOtroOrigen, 0)                                AS PagadoOtroOrigen,
    ISNULL(p.TotalPagado, 0)                                     AS TotalPagado,
    ISNULL(p.TotalSolicitadoNoCompletado, 0)                     AS TotalSolicitadoNoCompletado,
    c.PrecioVenta - ISNULL(p.TotalPagado, 0)                     AS SaldoPendiente,
    c.PrecioVenta - ISNULL(p.TotalPagado, 0) - ISNULL(p.TotalSolicitadoNoCompletado, 0)
                                                                 AS SaldoPendienteNeto
FROM pro_ventas.Casos c
LEFT JOIN [pro_app].[vw_pagos_por_caso] p ON p.IDCaso = c.IDCaso
WHERE c.IDEstado IN (1, 2);
GO
CREATE VIEW [pro_app].[vw_tipo_cambio] AS
SELECT
    tc.FechaTipoCambio,
    tc.TipoCambioCompra,
    tc.TipoCambioVenta
FROM pro_ventas.TipoCambio tc;
GO
CREATE VIEW [pro_app].[vw_tipos_movimiento] AS
SELECT
    tm.IDTmov,
    tm.Abreviatura,
    tm.TipoMovimiento,
    tm.Categoria,
    tm.Orden,
    tm.TgDesembolso,
    tm.TgSumaRestaMov
FROM pro_ventas.TipMovi tm;
GO
CREATE VIEW [pro_app].[vw_utilidad_powerbi] AS
WITH LiqAD AS (
    -- Solo la fila AD por mov del lote bruto. De ahí extraemos los
    -- campos compartidos (LoteInterno, Exclusividad, MontoAplicado).
    SELECT
        IDMovimiento,
        MontoMovBruto_CRC,
        MontoAplicadoLote_CRC,
        LoteInterno_CRC,
        Exclusividad_CRC,
        ExclusividadEntidadCodigo,
        PctEntidad           AS PctAD,
        MontoEntidad_CRC     AS MontoTotalAD_CRC,
        Origen,
        EsCapturaBruta,
        IDLote,
        IDProyecto,
        AreaLote,
        TieneOverride
    FROM [pro_app].vw_liquidacion_lote
    WHERE CodigoEntidad = 'AD'
),
LiqQFI AS (
    SELECT IDMovimiento, MontoEntidad_CRC AS MontoQFI_CRC
    FROM [pro_app].vw_liquidacion_lote
    WHERE CodigoEntidad = 'QFI'
),
LiqGM AS (
    SELECT IDMovimiento, MontoEntidad_CRC AS MontoGM_CRC
    FROM [pro_app].vw_liquidacion_lote
    WHERE CodigoEntidad = 'GM'
)
SELECT
    -- Identificación
    m.IDMovimiento,
    m.IDCaso,
    cs.IDLote,
    lt.IDProyecto,
    p.AbreviaturaProyecto,
    lt.Lote                                    AS CodigoLote,
    cl.NombreCompleto                          AS Cliente,
    m.FechaSolicitudMovimiento                 AS FechaSolicitud,
    m.FechaMovimiento                          AS FechaMovimiento,
    m.IDTipmov,
    tm.Abreviatura                             AS AbreviaturaTipo,
    tm.TipoMovimiento                          AS NombreTipo,
    LTRIM(RTRIM(tm.Categoria))                 AS CategoriaTipo,
    m.Moneda,
    m.TipoCambio,
    m.EsCapturaBruta,

    -- Banco del caso (puede ser NULL para contado).
    cs.IDBanco,
    b.Abreviatura                              AS AbrevBanco,
    b.NombreEntidad                            AS NombreBanco,

    -- Bruto y porciones por entidad (NULL si el mov no es del lote bruto).
    m.MontoColones                             AS MontoMovBruto_CRC,
    liq.MontoAplicadoLote_CRC,
    liq.Origen                                 AS OrigenLote,    -- BANCO / CLIENTE / NULL
    liq.LoteInterno_CRC,
    liq.Exclusividad_CRC,
    liq.ExclusividadEntidadCodigo,
    liq.AreaLote,
    liq.TieneOverride,
    liq.PctAD,
    qfi.MontoQFI_CRC,
    gm.MontoGM_CRC,

    -- Desglose de AD (solo movs del lote bruto):
    --   Componente 1: AD por % lote interno (típicamente 5%) — comisión de
    --   gestión, NO entra a utilidad.
    CAST(
        CASE WHEN liq.EsCapturaBruta = 1
             THEN ISNULL(liq.LoteInterno_CRC, 0) * ISNULL(liq.PctAD, 0) / 100.0
             ELSE NULL END
    AS DECIMAL(18, 2))                         AS MontoADLoteInterno_CRC,

    --   Componente 2: AD sobrante construcción — SÍ entra a utilidad.
    CAST(
        CASE WHEN liq.EsCapturaBruta = 1
             THEN ISNULL(liq.MontoAplicadoLote_CRC, 0) - ISNULL(liq.LoteInterno_CRC, 0)
             ELSE NULL END
    AS DECIMAL(18, 2))                         AS MontoADConstruccion_CRC,

    --   Componente 3: descuento por exclusividad (típicamente lo que AD
    --   paga a GM por participación). Negativo. No entra al base de utilidad.
    CAST(
        CASE WHEN liq.EsCapturaBruta = 1
             THEN -ISNULL(liq.Exclusividad_CRC, 0)
             ELSE NULL END
    AS DECIMAL(18, 2))                         AS MontoADExclusividad_CRC,

    --   Total AD (suma de los 3 componentes para mov del lote, o
    --   MontoColones para mov NO del lote o legacy neto).
    CAST(
        CASE WHEN liq.IDMovimiento IS NOT NULL
                  AND liq.EsCapturaBruta = 1
             THEN liq.MontoTotalAD_CRC
             ELSE m.MontoColones
        END
    AS DECIMAL(18, 2))                         AS MontoNetoAD_CRC,

    -- Utilidad:
    --   MontoBaseUtilidad_CRC = la porción de la cual se calcula la utilidad.
    --     - Movs del lote bruto: MontoADConstruccion (sin exclusividad).
    --     - Movs NO del lote o legacy: MontoColones.
    cs.PorcentajeUtilidadP                     AS PctUtilidad,
    CAST(
        CASE
            WHEN liq.IDMovimiento IS NOT NULL AND liq.EsCapturaBruta = 1 THEN
                -- Edge case: si LoteAplicado < LoteInterno (lote sobre-cobrado),
                -- el sobrante sería negativo. Clamp a 0.
                CASE WHEN (ISNULL(liq.MontoAplicadoLote_CRC, 0)
                          - ISNULL(liq.LoteInterno_CRC, 0)) < 0
                     THEN 0
                     ELSE (ISNULL(liq.MontoAplicadoLote_CRC, 0)
                          - ISNULL(liq.LoteInterno_CRC, 0))
                END
            ELSE m.MontoColones
        END
    AS DECIMAL(18, 2))                         AS MontoBaseUtilidad_CRC,

    --   UtilidadAD_CRC = MontoBaseUtilidad × Porcentaje / 100. Aplica solo
    --   si categoría es D o EX. Para DV/EP/PG/etc. va NULL.
    CASE
        WHEN LTRIM(RTRIM(tm.Categoria)) NOT IN ('D', 'EX') THEN NULL
        WHEN cs.PorcentajeUtilidadP IS NULL OR cs.PorcentajeUtilidadP = 0 THEN NULL
        ELSE CAST(
            CASE
                WHEN liq.IDMovimiento IS NOT NULL AND liq.EsCapturaBruta = 1 THEN
                    CASE WHEN (ISNULL(liq.MontoAplicadoLote_CRC, 0)
                              - ISNULL(liq.LoteInterno_CRC, 0)) < 0
                         THEN 0
                         ELSE (ISNULL(liq.MontoAplicadoLote_CRC, 0)
                              - ISNULL(liq.LoteInterno_CRC, 0))
                            * cs.PorcentajeUtilidadP / 100.0
                    END
                ELSE m.MontoColones * cs.PorcentajeUtilidadP / 100.0
            END
        AS DECIMAL(18, 2))
    END                                        AS UtilidadAD_CRC,

    -- Espejo del valor persistido en pro_ventas.Movimientos. Debe coincidir con
    -- UtilidadAD_CRC tras correr el script de recálculo (paso 3).
    m.UtilidadReservada                        AS UtilidadReservada_Persistida,

    -- Flags útiles para PowerBI.
    CASE WHEN liq.IDMovimiento IS NOT NULL THEN 1 ELSE 0 END
                                               AS EsMovLote,
    m.Depositante,
    m.DetalleTransferencia,
    m.Completado
FROM pro_ventas.Movimientos m
INNER JOIN pro_ventas.TipMovi tm ON tm.IDTmov = m.IDTipmov
LEFT  JOIN pro_ventas.Casos cs   ON cs.IDCaso = m.IDCaso
LEFT  JOIN pro_ventas.Clientes cl ON cl.IDCliente = cs.IDCliente
LEFT  JOIN pro_ventas.Lotes lt   ON lt.IDLote = cs.IDLote
LEFT  JOIN pro_ventas.Proyecto p ON p.IDProyecto = lt.IDProyecto
LEFT  JOIN pro_ventas.Bancos b   ON b.IDBan = cs.IDBanco
LEFT  JOIN LiqAD liq      ON liq.IDMovimiento = m.IDMovimiento
LEFT  JOIN LiqQFI qfi     ON qfi.IDMovimiento = m.IDMovimiento
LEFT  JOIN LiqGM gm       ON gm.IDMovimiento = m.IDMovimiento;
GO
CREATE VIEW [pro_ventas].[V_CasosActivos]
AS
SELECT
    C.IDCaso,
    CL.NombreCompleto AS Cliente,
    COD.NombreCompleto AS Codeudor,
    L.Lote,
    BL.Bloque,
    ES.Estado,
    L.Area,
    M.Modelo,
    V.Nombre AS Vendedor,
    F.Nombre AS Formalizador,
    BN.Abreviatura AS Banco,
    C.TgBono,
    C.PrecioVenta,
    C.Moneda,
    C.FechaFormalizacion,
    C.FechaEntrega,
    C.Observaciones,
    C.UsuarioCarga,
    C.FechaCreacion,
    C.AzureBlobId AS Adjunto,
    M.Niveles,
    C.TgExtra,
    C.TgRetirado,
    C.PrecioCasa,
    C.PrecioLote,
    C.MontoAvaluo,
    C.FechaRetiro,
    C.TgCodeudor,
    C.IDCliente,
    C.IDCodeudor,
    C.IDVendedor,
    C.IDFormalizador,
    C.IDBanco,
    C.IDModelo,
    C.Aprobado,
    C.MontoPrima,
    C.MontoExtra,
    C.MontoDescuento,
    C.FechaModificado,
    C.UsuarioModificado,
    C.Regalia,
    C.FechaPF,
    C.SemanaPF,
    C.DetExtra,
    C.FechaInicio,
    C.EnConstruccion,
    C.MotivoRetiro,
    C.Obsformalizacion,
    C.FechaConstruccion,
    L.Folio,
    L.NumCatastro,
    C.IDExtraCaso,
    C.DiasContrato,
    C.FechaContrato,
    L.Proyecto,
    C.Prima,
    C.SEMPF,
    C.DiasR,
    C.DiasPF,
    C.DiasF,
    C.DiasE,
    C.MesPF,
    C.AnioPF,
    C.TipoCambio,
    C.EstadoForma,
    C.IDActividadActual,
    C.IDControlObraActial,
    ES.ColorHEX,
    M.AvaluoBN,
    M.AvaluoBCR,
    M.AvaluoMUCAP,
    M.AvaluoBP,
    C.IDEstado,
    C.IDLote,
    C.IDBloque,
    L.IDProyecto,
    C.IDFaseFormalizacion,
    pro_ventas.FaseAD.Fase,
    pro_ventas.FaseAD.PorPeso AS PorPesoForma,
    BN.ColorHEXBan,
    L.TgModTramitado,
    L.TgModConstruido,
    pro_ventas.Modelos.Modelo AS ModeloConstruido,
    Modelos_1.Modelo AS ModeloTramitado,
    L.IDActividadC,
    pro_ventas.ActividadObra.Actividad AS ActividadC,
    L.IDModConstruido,
    L.IDModDefecto,
    C.MontoTributario,
    C.TipoCambioMontoTributario,
    C.MesF,
    C.AnioF,
    C.MesR,
    C.AnioR,
    C.MesE,
    C.AnioE,
    C.MesRT,
    C.AnioRT,
    C.MesT,
    C.AnioT,
    C.PrecioFinanciar,
    V.Iniciales AS VIniciales,
    F.Iniciales AS FIniciales,
    C.DiasRT,
    C.MontoPunta,
    C.TgPunta,
    C.ComprobantePT,
    C.ReciboPT,
    C.IDModificadopor,
    C.IDCreadopor,
    C.DetDescuento,
    C.IDReferido,
    C.TgReferido,
    C.MontoBono,
    C.TgDescuento,
    C.FechaCongelado,
    C.DiasCON,
    pro_ventas.Proyecto.ColorHEX_P,
    pro_ventas.Proyecto.Nombre AS NomProyecto,
    C.IDComenForma,
    pro_ventas.BitacoraVentas.Comentario AS UltimoMsjForma,
    C.IDEstAprobacion,
    C.TgModeloEspecial,
    C.FechaAprobado,
    C.ObsAprobado,
    C.IDAprobadopor,
    pro_ventas.Colaboradores.Nombre AS NomAprobadopor,
    pro_ventas.Estados.Estado AS EstadoApro,
    pro_ventas.Estados.ColorHEX AS ColorApro,
    C.SEMPFAnual,
    C.IDLoteTraslado,
    C.AreaExtraCasa,
    C.FechaReserva,
    L.IDBD,
    CASE 
        WHEN L.Lote IS NOT NULL AND CL.NombreCompleto IS NOT NULL THEN CONCAT(L.Lote, ' ', CL.NombreCompleto)
        WHEN L.Lote IS NOT NULL THEN L.Lote
        WHEN CL.NombreCompleto IS NOT NULL THEN CL.NombreCompleto
        ELSE 'Sin datos'
    END AS LoteCliente
FROM pro_ventas.FaseAD
    RIGHT OUTER JOIN pro_ventas.Casos AS C
    LEFT OUTER JOIN pro_ventas.Estados ON C.IDEstAprobacion = pro_ventas.Estados.IDEst
    LEFT OUTER JOIN pro_ventas.Colaboradores ON C.IDAprobadopor = pro_ventas.Colaboradores.IDCol
    LEFT OUTER JOIN pro_ventas.BitacoraVentas ON C.IDComenForma = pro_ventas.BitacoraVentas.IDBitacoraV
        ON pro_ventas.FaseAD.IDFaseAD = C.IDFaseFormalizacion
    LEFT OUTER JOIN pro_ventas.Clientes AS CL ON C.IDCliente = CL.IDCliente
    LEFT OUTER JOIN pro_ventas.Clientes AS COD ON C.IDCodeudor = COD.IDCliente
    LEFT OUTER JOIN pro_ventas.Proyecto
        RIGHT OUTER JOIN pro_ventas.Lotes AS L ON pro_ventas.Proyecto.IDProyecto = L.IDProyecto
        LEFT OUTER JOIN pro_ventas.ActividadObra ON L.IDActividadC = pro_ventas.ActividadObra.IDActividad
        LEFT OUTER JOIN pro_ventas.Modelos AS Modelos_1 ON L.IDModDefecto = Modelos_1.IDMod
        LEFT OUTER JOIN pro_ventas.Modelos ON L.IDModConstruido = pro_ventas.Modelos.IDMod
        ON C.IDLote = L.IDLote
    LEFT OUTER JOIN pro_ventas.Bloques AS BL ON BL.IDBloq = L.IDBloque
    LEFT OUTER JOIN pro_ventas.Estados AS ES ON ES.IDEst = C.IDEstado
    LEFT OUTER JOIN pro_ventas.Modelos AS M ON M.IDMod = C.IDModelo
    LEFT OUTER JOIN pro_ventas.Colaboradores AS V ON V.IDCol = C.IDVendedor
    LEFT OUTER JOIN pro_ventas.Colaboradores AS F ON F.IDCol = C.IDFormalizador
    LEFT OUTER JOIN pro_ventas.Bancos AS BN ON BN.IDBan = C.IDBanco
WHERE C.IDEstado IN (1, 2,4);
GO
CREATE VIEW pro_lab.v_ensayos_resumen AS
SELECT
    e.id                                  AS id_ensayo,
    e.id_muestra,
    e.edad_dias,
    e.fecha_prueba,
    COUNT(m.id)                           AS cantidad_mediciones,
    AVG(CAST(m.resistencia_mpa AS DECIMAL(10,4))) AS resistencia_mpa_promedio,
    AVG(CAST(m.resistencia_mpa AS DECIMAL(10,4))) * 10.197 AS resistencia_kg_cm2_promedio,
    MIN(m.resistencia_mpa)                AS resistencia_mpa_min,
    MAX(m.resistencia_mpa)                AS resistencia_mpa_max
FROM pro_lab.ensayos e
LEFT JOIN pro_lab.mediciones m ON m.id_ensayo = e.id
GROUP BY e.id, e.id_muestra, e.edad_dias, e.fecha_prueba;
GO
-- ---------- Bloques ----------
-- Bridge: COALESCE(IDProyecto, lookup por texto AbreviaturaProyecto)
-- por inconsistencia de datos (registros antiguos sin IDProyecto).
CREATE   VIEW pro_obc.vw_bloques AS
SELECT
    b.IDBloq                                                AS id,
    COALESCE(b.IDProyecto, p.IDProyecto)                    AS proyecto_id,
    b.Bloque                                                AS letra,
    b.Bloque                                                AS nombre,   -- no hay nombre separado
    b.Orden                                                 AS orden,
    b.CuotaCondominal                                       AS cuota_condominal
FROM pro_ventas.Bloques b
LEFT JOIN pro_ventas.Proyecto p
    ON p.AbreviaturaProyecto COLLATE Modern_Spanish_CI_AI
     = b.Proyecto             COLLATE Modern_Spanish_CI_AI;
GO
-- ---------- Modelos ----------
-- tipo_casa derivado de Niveles + TipoCubierta.
-- (1 Planta + T) → 1N-Techo;  (1 Planta + A) → 1N-Azotea
-- (2 Plantas + T) → 2N-Techo; (2 Plantas + A) → 2N-Azotea
-- Modelos sin combinación válida (Cuadruplex, nulls) devuelven NULL.
CREATE   VIEW pro_obc.vw_modelos AS
SELECT
    IDMod                   AS id,
    Modelo                  AS codigo,
    Modelo                  AS nombre,
    Categoria               AS categoria,
    Niveles                 AS niveles_texto,
    TipoCubierta            AS tipo_cubierta_codigo,
    CASE
        WHEN Niveles = N'1 Planta'  AND TipoCubierta = 'T' THEN '1N-Techo'
        WHEN Niveles = N'1 Planta'  AND TipoCubierta = 'A' THEN '1N-Azotea'
        WHEN Niveles = N'2 Plantas' AND TipoCubierta = 'T' THEN '2N-Techo'
        WHEN Niveles = N'2 Plantas' AND TipoCubierta = 'A' THEN '2N-Azotea'
        ELSE NULL
    END                     AS tipo_casa,
    AreaTotal               AS m2_construccion,
    PrecioReal              AS precio_real,
    PrecioOferta            AS precio_oferta,
    Activo                  AS activo,
    ActivoVN                AS activo_vn,
    ActivoVB                AS activo_vb,
    ActivoVC                AS activo_vc
FROM pro_ventas.Modelos;
GO
/* ---------------------------------------------------------------------
   Vista de conveniencia: marca si una obra YA inició un scope
   (= tiene al menos un peso congelado). Útil para la UI y para decidir
   si una sub-partida nueva aplica o no.
   --------------------------------------------------------------------- */
CREATE   VIEW pro_obc.vw_obra_scope_iniciado AS
SELECT DISTINCT obra_codigo, ambito, scope_id, MIN(congelado_en) AS iniciado_en
FROM pro_obc.obra_pesos
GROUP BY obra_codigo, ambito, scope_id;
GO
/* =====================================================================
   Fix pro_obc.vw_obras — tipo_casa / modelo / m² desde el MODELO DE VENTAS
   2026-06-03
   =====================================================================

   PROBLEMA: la vista derivaba tipo_casa + m² uniéndose a pro_ventas.Modelos POR
   NOMBRE (Modelo = pro_bi.dim_obra.display_name). Ese nombre casi nunca coincide
   (display_name viene como 'Santorini Azotea', 'Estella Az' o el propio
   código), así que 184 de 189 obras quedaban con tipo_casa y m2_construccion
   en NULL → datos incorrectos en reportes.

   FIX (confirmado con el negocio): el modelo se toma del MODELO ASIGNADO EN
   VENTAS, que vive en pro_ventas.V_CasosActivos (caso más reciente por IDBD = obra),
   y de ahí se puentea a pro_ventas.Modelos por IDModelo (FK numérica limpia). Sube la
   cobertura de tipo_casa de 5 → 170 / 189. Las ~19 restantes son modelos
   'POR DEFINIR' / sin caso de venta (correcto que queden NULL).

   NO cambia ninguna columna ni nombre → no afecta a obras.ts ni a otros
   consumidores. area_prorrateada se mantiene desde pro_bi.dim_obra (sus 72 ceros
   son un tema de origen en BC, no de esta vista).

   Aplicar:
     npm run migrar --workspace=@adelante/api -- ../db/scripts/fix-vw-obras-modelo-ventas.sql
   ===================================================================== */

CREATE   VIEW pro_obc.vw_obras AS
WITH casas AS (
    SELECT
        do2.works_no                                                  AS codigo,
        do2.display_name                                              AS nombre_modelo,
        do2.area_prorrateada_m2                                       AS area_prorrateada,
        do2.starting_date                                             AS fecha_inicio,
        do2.ending_date                                               AS fecha_fin,
        do2.status                                                    AS status_bc,
        LEFT(do2.works_no, 2)                                         AS proyecto_codigo,
        SUBSTRING(do2.works_no, 4, CHARINDEX('.', do2.works_no) - 4)  AS bloque_letra,
        SUBSTRING(do2.works_no, CHARINDEX('.', do2.works_no) + 1, 20) AS numero_obra
    FROM pro_bi.dim_obra do2
    WHERE do2.area_costeo = N'PRO VIVIENDA'
      AND do2.works_no LIKE '[A-Z][A-Z]-%.%'
      AND CHARINDEX('.', do2.works_no) > 3
),
-- Caso de venta más reciente por obra (IDBD = works_no). Trae el modelo que se
-- le asignó a la casa en ventas (IDModelo) — la fuente confiable del tipo.
caso AS (
    SELECT IDBD, IDModelo, Modelo,
           ROW_NUMBER() OVER (PARTITION BY IDBD ORDER BY IDCaso DESC) AS rn
    FROM pro_ventas.V_CasosActivos
    WHERE IDBD IS NOT NULL
)
SELECT
    c.codigo,                                       -- PK lógica (= pro_bi.dim_obra.works_no)
    c.proyecto_codigo,                              -- ej 'VN'
    p.IDProyecto                AS proyecto_id,     -- FK a pro_ventas.Proyecto
    p.Nombre                    AS proyecto_nombre,
    c.bloque_letra,                                 -- ej 'G'
    b.IDBloq                    AS bloque_id,       -- FK opcional a pro_ventas.Bloques
    c.numero_obra,                                  -- ej '01'
    -- Nombre del modelo: el de ventas (Modelos via IDModelo / caso); si no hay
    -- caso, el display_name de BC como último recurso. COLLATE unifica la
    -- collation (Modelos=SQL_Latin1, dim_obra/casos=Modern_Spanish) — sin él
    -- el COALESCE da "collation conflict".
    COALESCE(
        mv.Modelo      COLLATE DATABASE_DEFAULT,
        cv.Modelo      COLLATE DATABASE_DEFAULT,
        c.nombre_modelo COLLATE DATABASE_DEFAULT
    )                           AS nombre_modelo,
    mv.IDMod                    AS modelo_id,
    -- Tipo de casa derivado del modelo de VENTAS (V_CasosActivos.IDModelo).
    CASE
        WHEN mv.Niveles = N'1 Planta'  AND mv.TipoCubierta = 'T' THEN '1N-Techo'
        WHEN mv.Niveles = N'1 Planta'  AND mv.TipoCubierta = 'A' THEN '1N-Azotea'
        WHEN mv.Niveles = N'2 Plantas' AND mv.TipoCubierta = 'T' THEN '2N-Techo'
        WHEN mv.Niveles = N'2 Plantas' AND mv.TipoCubierta = 'A' THEN '2N-Azotea'
        ELSE NULL
    END                         AS tipo_casa,
    mv.AreaTotal                AS m2_construccion,
    c.area_prorrateada,
    c.fecha_inicio,
    c.fecha_fin,
    c.status_bc,
    b.CuotaCondominal           AS cuota_condominal
FROM casas c
LEFT JOIN pro_ventas.Proyecto p
       ON p.AbreviaturaProyecto COLLATE Modern_Spanish_CI_AI
        = c.proyecto_codigo     COLLATE Modern_Spanish_CI_AI
LEFT JOIN pro_ventas.Bloques b
       ON b.Bloque   COLLATE Modern_Spanish_CI_AI
        = c.bloque_letra COLLATE Modern_Spanish_CI_AI
      AND (b.IDProyecto = p.IDProyecto OR b.IDProyecto IS NULL)
LEFT JOIN caso cv
       ON cv.IDBD COLLATE Modern_Spanish_CI_AI = c.codigo COLLATE Modern_Spanish_CI_AI
      AND cv.rn = 1
LEFT JOIN pro_ventas.Modelos mv
       ON mv.IDMod = cv.IDModelo;
GO
-- ---------- Presupuestos: Partidas (vista de catálogo) ----------
-- Maestro lógico de partidas distintas extraídas de stg_job_budgets.
-- Solo task_type='Posting' (las hojas; los 'Total' son agrupadores).
-- Solo tipo_costo='Cost' (los Sales/Indirect Cost no aplican a obra).
CREATE   VIEW pro_obc.vw_partidas_bc AS
SELECT DISTINCT
    task_no                 AS codigo,
    description             AS nombre,
    task_type               AS tipo_bc
FROM pro_bi.stg_job_budgets
WHERE es_ultima_version = 1
  AND task_type = N'Posting'
  AND tipo_costo = N'Cost';
GO
-- ---------- Presupuestos: detalle por obra ----------
-- Filtrado a Cost + última versión. obra_codigo = works_no (estable).
-- No hace join a dbo.ObrasAD (obsoleta) — el bridge a la obra es por
-- works_no directo, validado contra vw_obras en la API.
CREATE   VIEW pro_obc.vw_presupuestos_obra AS
SELECT
    sjb.sk_budget                       AS id,
    sjb.works_no                        AS obra_codigo,    -- FK lógica → pro_bi.dim_obra.works_no
    sjb.version_code                    AS version_codigo,
    sjb.version_num                     AS version_numero,
    sjb.task_no                         AS partida_codigo,
    sjb.task_type                       AS tipo_bc,
    sjb.tipo_costo                      AS tipo_costo,
    sjb.description                     AS descripcion,
    sjb.code_order                      AS orden,
    sjb.quantity                        AS cantidad,
    sjb.unit_of_measure                 AS unidad,
    sjb.unit_amount                     AS precio_unitario,
    sjb.line_amount                     AS importe_linea,
    sjb.etl_loaded_at                   AS cargado_en
FROM pro_bi.stg_job_budgets sjb
WHERE sjb.es_ultima_version = 1
  AND sjb.tipo_costo = N'Cost';
GO
-- =====================================================================
-- 12. VISTAS DE INTEGRACIÓN CON ADELANTEDB EXISTENTE
-- =====================================================================
-- Vistas construidas tras validar columnas reales contra AdelanteDB
-- (mysqladelante.database.windows.net / AdelanteDB) el 2026-05-26.
--
-- Convenciones:
-- - Nombres en español/snake_case para compatibilidad con la app actual
-- - Mantenemos los IDs originales (IDProyecto, IDBloq, IDObraAD, IDMod)
--   como la PK estable para FKs desde pro_obc.*
-- - Filtros: aplicamos en la vista lo que tenga sentido a nivel app
--
-- IMPORTANTE: estas vistas son SOLO LECTURA. Los catálogos viven en BC
-- y AdelanteDB los mantiene. ObrasControl nunca escribe acá.

-- ---------- Proyectos ----------
-- Catálogo de proyectos. 14 totales en AdelanteDB; la app filtra los
-- relevantes en su capa (no acá) para mantener la vista neutral.
CREATE   VIEW pro_obc.vw_proyectos AS
SELECT
    IDProyecto              AS id,
    AbreviaturaProyecto     AS codigo,
    Nombre                  AS nombre,
    Categoria               AS categoria,
    TgDesarrollos           AS es_desarrollo,
    TgHomes                 AS es_homes,
    TgVentas                AS es_ventas,
    ColorHEX_P              AS color_hex
FROM pro_ventas.Proyecto;
GO
-- =============================================================================
-- 3) Sproc maestro: refresca ambas tablas. Lo llama el ETL nightly.
-- =============================================================================
CREATE   PROCEDURE pro_uti.sp_refresh_lookups_indirectos
AS
BEGIN
    SET NOCOUNT ON;
    EXEC pro_uti.sp_refresh_lote_presupuesto_bc;
    EXEC pro_uti.sp_refresh_mejor_caso_lote;
END;
GO
-- =============================================================================
-- 0017_fix_match_bc_por_proyecto.sql
--
-- BUG: el sproc `pro_uti.sp_refresh_lote_presupuesto_bc` (migración 0011) mapeaba
-- `pro_ventas.Lotes` con `pro_bi.dim_obra` usando solo el sufijo del código de lote:
--
--     INNER JOIN pro_bi.dim_obra o
--         ON o.works_no LIKE '%-' + l.Lote
--
-- Esto matchea CUALQUIER works_no que termine en `-<Lote>`. Para un lote VC
-- C.01 (IDLote 1138), si BC no tiene `VC-C.01` pero sí tiene `VN-C.01` (otro
-- lote de Valle Novarum con el mismo código de bloque), el LIKE matchea por
-- accidente y le asigna a VC el presupuesto de VN. Data tóxica.
--
-- Casos confirmados (IDProyecto 10 = Valle Castilla):
--   IDLote 1138 (VC C.01) → tenía works_no VN-C.01  ❌
--   IDLote 1153 (VC C.03) → tenía works_no VN-C.03  ❌
--   IDLote 1158 (VC C.08) → tenía works_no VN-C.08  ❌
--   IDLote 1201 (VC F.15) → tenía works_no VN-F.15  ❌
--   IDLote 1135 (VC D.01) → tenía works_no VC-D.01  ✓ (por suerte BC sí tenía)
--   IDLote 1136 (VC F.01) → tenía works_no VC-F.01  ✓
--
-- FIX: el sproc ahora hace match estricto por prefijo + lote:
--
--     INNER JOIN pro_ventas.Proyecto p ON p.IDProyecto = l.IDProyecto
--     INNER JOIN pro_bi.dim_obra o
--         ON o.works_no = p.AbreviaturaProyecto + '-' + l.Lote
--
-- Lotes que tenían presupuesto inferido erróneamente ahora quedan sin
-- match en BC. Pero la vista `v_obras_presupuesto` ya tiene fallback a
-- `pro_uti.t_mejor_caso_lote` (pro_ventas.Casos histórico) que se mantiene — el flujo
-- de negocio es: primero se crea el Caso (reserva del cliente) y solo
-- cuando la venta es segura se crea el Presupuesto en BC. Por eso el
-- fallback a Casos es legítimo y necesario.
--
-- NOTA sobre prefijos atípicos: proyectos internos (MAQ Maquinaria, etc.)
-- pueden no seguir la convención AbreviaturaProyecto + '-'. No son lotes
-- vendibles, no entran en este flujo. Ignorarlos es correcto.
-- =============================================================================

CREATE   PROCEDURE pro_uti.sp_refresh_lote_presupuesto_bc
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH PresupuestoBC AS (
        SELECT
            works_no,
            SUM(CASE WHEN tipo_costo = 'Cost'          THEN line_amount ELSE 0 END) AS pres_directo,
            SUM(CASE WHEN tipo_costo = 'Indirect Cost' THEN line_amount ELSE 0 END) AS pres_indirecto,
            SUM(CASE WHEN tipo_costo = 'Sales'         THEN line_amount ELSE 0 END) AS sales
        FROM pro_bi.fact_presupuesto
        WHERE task_type = 'Posting' AND es_ultima_version = 1
        GROUP BY works_no
    ),
    LotePresupuesto AS (
        SELECT
            l.IDLote,
            o.works_no,
            bc.pres_directo,
            bc.pres_indirecto,
            bc.sales - bc.pres_directo - bc.pres_indirecto AS util_proyectada
        FROM pro_ventas.Lotes l
        INNER JOIN pro_ventas.Proyecto p   ON p.IDProyecto = l.IDProyecto
        INNER JOIN pro_bi.dim_obra   o
               ON o.works_no COLLATE Modern_Spanish_CI_AI
                = (p.AbreviaturaProyecto + '-' + l.Lote) COLLATE Modern_Spanish_CI_AI
        INNER JOIN PresupuestoBC bc ON bc.works_no = o.works_no
        WHERE bc.pres_directo > 0
          AND bc.pres_indirecto > 0
          AND bc.sales > 0
          AND (bc.sales - bc.pres_directo - bc.pres_indirecto) > 0
    )
    MERGE pro_uti.t_lote_presupuesto_bc AS tgt
    USING (SELECT IDLote, works_no, pres_directo, pres_indirecto, util_proyectada
           FROM LotePresupuesto) AS src
       ON tgt.IDLote = src.IDLote
    WHEN MATCHED THEN UPDATE SET
        works_no        = src.works_no,
        pres_directo    = src.pres_directo,
        pres_indirecto  = src.pres_indirecto,
        util_proyectada = src.util_proyectada,
        refreshed_at    = SYSUTCDATETIME()
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (IDLote, works_no, pres_directo, pres_indirecto, util_proyectada)
        VALUES (src.IDLote, src.works_no, src.pres_directo, src.pres_indirecto, src.util_proyectada)
    WHEN NOT MATCHED BY SOURCE THEN DELETE;
END;
GO
CREATE   PROCEDURE pro_uti.sp_refresh_mejor_caso_lote
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH MCL AS (
        SELECT
            IDLote, IDCaso,
            PresupuestoDirecto, PresupuestoIndirecto, UtilidadProyectada,
            ROW_NUMBER() OVER (PARTITION BY IDLote ORDER BY IDCaso DESC) AS rn
        FROM pro_ventas.Casos
        WHERE PorcentajeUtilidadP > 0 AND PorcentajeUtilidadP <= 100
          AND PresupuestoIndirecto > 0
          AND PresupuestoDirecto > 0
          AND UtilidadProyectada > 0
    )
    MERGE pro_uti.t_mejor_caso_lote AS tgt
    USING (SELECT IDLote, IDCaso, PresupuestoDirecto, PresupuestoIndirecto, UtilidadProyectada
           FROM MCL WHERE rn = 1) AS src
       ON tgt.IDLote = src.IDLote
    WHEN MATCHED THEN UPDATE SET
        IDCaso               = src.IDCaso,
        PresupuestoDirecto   = src.PresupuestoDirecto,
        PresupuestoIndirecto = src.PresupuestoIndirecto,
        UtilidadProyectada   = src.UtilidadProyectada,
        refreshed_at         = SYSUTCDATETIME()
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (IDLote, IDCaso, PresupuestoDirecto, PresupuestoIndirecto, UtilidadProyectada)
        VALUES (src.IDLote, src.IDCaso, src.PresupuestoDirecto, src.PresupuestoIndirecto, src.UtilidadProyectada)
    WHEN NOT MATCHED BY SOURCE THEN DELETE;
END;
GO
-- =============================================================================
-- 7) Detalle de movimientos (página Detalle Utilidad — tabla exhaustiva)
--    Incluye JOIN a Lotes para el string de lote
-- =============================================================================
CREATE   VIEW pro_uti.v_detalle_movimientos AS
SELECT
    um.IDUtilidadMov                        AS id_utilidad_mov,
    um.IDMovimiento                         AS id_movimiento,
    um.FechaMovimiento                      AS fecha,
    YEAR(um.FechaMovimiento)                AS anio,
    MONTH(um.FechaMovimiento)               AS mes,
    DAY(um.FechaMovimiento)                 AS dia,
    DATEPART(QUARTER, um.FechaMovimiento)   AS trimestre,
    l.Lote                                  AS lote,
    um.TipoMovimiento                       AS tipo_movimiento,
    um.TgSumaResta                          AS tg_suma_resta,
    um.DetalleTransferencia                 AS detalle_transferencia,
    um.MontoColones                         AS monto_colones
FROM pro_ventas.UtilidadMovimiento um
LEFT JOIN pro_ventas.Lotes l ON l.IDLote = um.IDLote;
GO
-- Pegá en AdelanteDB
-- Restaura v_evolucion_neta_mensual a tirar del pool histórico,
-- independiente del cambio que hicimos en v_resumen_mensual.

CREATE   VIEW pro_uti.v_evolucion_neta_mensual AS
SELECT
    YEAR(um.FechaMovimiento)  AS anio,
    MONTH(um.FechaMovimiento) AS mes,
    SUM(CASE WHEN um.TgSumaResta = 1 THEN um.MontoColones ELSE 0 END) AS utilidad_total,
    SUM(CASE WHEN um.TgSumaResta = 0 THEN um.MontoColones ELSE 0 END) AS utilidad_gastada,
    SUM(CASE WHEN um.TgSumaResta = 1 THEN um.MontoColones ELSE 0 END) -
    SUM(CASE WHEN um.TgSumaResta = 0 THEN um.MontoColones ELSE 0 END) AS utilidad_neta
FROM pro_ventas.UtilidadMovimiento um
GROUP BY YEAR(um.FechaMovimiento), MONTH(um.FechaMovimiento);
GO
-- 2) Indirecto mensual (totales por anio, mes)
CREATE   VIEW pro_uti.v_indirecto_mensual AS
SELECT
    YEAR(FechaMovimiento)           AS anio,
    MONTH(FechaMovimiento)          AS mes,
    SUM(ISNULL(IndirectoAD_CRC, 0)) AS indirecto_total,
    COUNT(IndirectoAD_CRC)          AS cantidad_movimientos
FROM pro_uti.v_movimientos_con_indirecto
GROUP BY YEAR(FechaMovimiento), MONTH(FechaMovimiento);
GO
-- 3) Indirecto mensual por lote
CREATE   VIEW pro_uti.v_indirecto_por_lote AS
SELECT
    YEAR(FechaMovimiento)           AS anio,
    MONTH(FechaMovimiento)          AS mes,
    CodigoLote                      AS lote,
    SUM(ISNULL(IndirectoAD_CRC, 0)) AS indirecto_total,
    COUNT(IndirectoAD_CRC)          AS cantidad_movimientos
FROM pro_uti.v_movimientos_con_indirecto
WHERE CodigoLote IS NOT NULL
GROUP BY YEAR(FechaMovimiento), MONTH(FechaMovimiento), CodigoLote;
GO
-- =============================================================================
-- 0019_fix_ingreso_neto_ad_formula.sql
--
-- BUG: el `ingreso_neto_ad` que agregamos en 0018 usaba directamente
-- `MontoNetoAD_CRC` de `pro_app.vw_utilidad_powerbi`, pero esa columna NO
-- representa lo que pensamos. Para K.05 D2 daba ₡355,783 cuando el reporte
-- Excel del Flujo de Desembolsos muestra ₡63,292,966.
--
-- HALLAZGO (cruzando datos contra el Excel "Movimientos del período"):
--
--   Ingreso AD = MontoMovBruto - MontoQFI - MontoGM - MontoADLoteInterno
--
-- Notas:
--   - `MontoGM_CRC` ya incluye la exclusividad GM (no hay que restarla
--     aparte). En BD: MontoGM_CRC = GM_puro + Exclusividad_GM.
--   - `MontoADLoteInterno_CRC` es la "Comisión 5%" sobre el lote interno
--     (lo que aparece como "Comis. 5% (−)" en el Excel).
--   - Cuando el movimiento NO tiene desglose GM/QFI (todas NULL), la
--     fórmula da `base = bruto` (como debe ser para construcción pura).
--
-- VALIDADO contra Excel:
--   K.05 D2  (3139): 77.2M − 7.74M − 5.49M − 0.68M = 63,292,967  ✓ Excel exacto
--   J.31 D1  (3140): 69.1M − 5.96M − 4.22M − 0.52M = 58,434,587  ✓ Excel exacto
--   K.26 D2  (3092): 12.5M − 0 − 0 − 0            = 12,482,100  ✓ sin desglose
--   1.01 D3  (3146): 97.1M − 9.72M − 6.89M − 0.85M = 79,614,061  ✓
-- =============================================================================

CREATE   VIEW pro_uti.v_ingresos_utilidad_por_lote AS
SELECT
    YEAR(FechaMovimiento)  AS anio,
    MONTH(FechaMovimiento) AS mes,
    CodigoLote             AS lote,
    SUM(ISNULL(MontoMovBruto_CRC, 0))    AS ingresos,          -- bruto bancario
    SUM(
        ISNULL(MontoMovBruto_CRC, 0)
      - ISNULL(MontoQFI_CRC, 0)
      - ISNULL(MontoGM_CRC, 0)
      - ISNULL(MontoADLoteInterno_CRC, 0)
    )                                    AS ingreso_neto_ad,   -- ingreso real para AD
    SUM(ISNULL(UtilidadAD_CRC, 0))       AS utilidad
FROM pro_uti.v_movimientos_con_indirecto
WHERE CodigoLote IS NOT NULL
GROUP BY YEAR(FechaMovimiento), MONTH(FechaMovimiento), CodigoLote;
GO
-- =============================================================================
-- 8) Catálogo de lotes con actividad (para MultiSelectFilter)
--    Solo lotes que tienen al menos un movimiento en UtilidadMovimiento
-- =============================================================================
CREATE   VIEW pro_uti.v_lotes_activos AS
SELECT DISTINCT
    l.Lote                                                        AS lote,
    LEFT(l.Lote, CHARINDEX('.', l.Lote + '.') - 1)               AS bloque
FROM pro_ventas.Lotes l
WHERE EXISTS (
    SELECT 1 FROM pro_ventas.UtilidadMovimiento um WHERE um.IDLote = l.IDLote
);
GO
-- =============================================================================
-- 0015_fix_base_segun_desglose_gm_qfi.sql
--
-- REFINAMIENTO de la fórmula de 0014. Tras aplicar 0014 surgió un nuevo bug
-- en movimientos pre-mayo 2026: aparecían utilidades absurdamente bajas
-- (K.26 D2 abr → ₡107k cuando debía ser ~₡4.4M).
--
-- CAUSA RAÍZ (explicada por el usuario, dueño del schema pro_app.* de Flujo de
-- Desembolsos): la convención de captura del monto cambió a lo largo del año:
--
--   Hasta abril 2026: se registraba la PORCIÓN de construcción (neta).
--                     LoteInterno_CRC y Exclusividad_CRC podían estar
--                     llenos pero NO debían restarse del bruto, porque
--                     el bruto ya era construcción.
--
--   Desde mayo 2026:  se registra el BRUTO BANCARIO COMPLETO.
--                     Hay que restar LoteInterno y Exclusividad para
--                     obtener la base.
--
-- INDICADOR DEFINITIVO de la convención (en lugar de fecha rígida):
--   - Si MontoGM_CRC y MontoQFI_CRC son NULL/0  → "sin desglose" → bruto YA
--     es construcción → base = bruto, sin restar nada.
--   - Si MontoGM_CRC o MontoQFI_CRC tienen valor → "con desglose" → restar
--     LoteInterno y Exclusividad.
--
-- Esta regla cubre incluso casos atípicos (un movimiento de feb 2026 que
-- excepcionalmente sí tenía desglose entra por la rama correcta).
--
-- CASOS DE TEST (validados con datos):
--
--   3092 K.26 D2 abr 2026 (sin GM/QFI):
--     bruto 12,482,100 / LI 11.9M / Excl 283k / GM=NULL / QFI=NULL
--     Pre-0015: base = 12.5M − 11.9M − 283k = 300K → util 107k (mal)
--     Post-0015: base = 12,482,100 (bruto sin restar) → util ~4.45M ✓
--
--   3146 1.01 D3 may 2026 (con GM/QFI):
--     bruto 97,071,475 / LI 17M / Excl 406k / GM 6.9M / QFI 9.7M
--     base = 97.1M − 17M − 406k = 79.6M → util ~17.2M ✓ (sin cambio vs 0014)
--
--   3090/3091/3124 K.26 D1/D3/D4 (sin GM/QFI ni LI):
--     bruto 17,181,828 / todo NULL
--     base = 17,181,828 (bruto entero) → util ~6.1M ✓ (sin cambio vs 0014)
-- =============================================================================

CREATE   VIEW pro_uti.v_movimientos_con_indirecto AS
WITH MovEnriquecido AS (
    SELECT u.*,
        -- FÓRMULA con detección de convención:
        --   Sin desglose GM/QFI → bruto ya es construcción → base = bruto
        --   Con desglose GM/QFI → restar LoteInterno + Exclusividad
        CASE
            WHEN ISNULL(u.MontoGM_CRC, 0) = 0
             AND ISNULL(u.MontoQFI_CRC, 0) = 0
            THEN u.MontoMovBruto_CRC
            ELSE
                CASE
                    WHEN u.MontoMovBruto_CRC
                       - ISNULL(u.LoteInterno_CRC, 0)
                       - ISNULL(u.Exclusividad_CRC, 0) < 0
                    THEN 0
                    ELSE u.MontoMovBruto_CRC
                       - ISNULL(u.LoteInterno_CRC, 0)
                       - ISNULL(u.Exclusividad_CRC, 0)
                END
        END                            AS MontoBaseUtilidad_efectivo,
        bc.pres_directo                AS bc_pres_dir,
        bc.pres_indirecto              AS bc_pres_ind,
        bc.util_proyectada             AS bc_util_proy,
        mcl.PresupuestoDirecto         AS cs_pres_dir,
        mcl.PresupuestoIndirecto       AS cs_pres_ind,
        mcl.UtilidadProyectada         AS cs_util_proy
    FROM pro_app.vw_utilidad_powerbi u
    LEFT JOIN pro_uti.t_lote_presupuesto_bc bc ON bc.IDLote = u.IDLote
    LEFT JOIN pro_uti.t_mejor_caso_lote mcl    ON mcl.IDLote = u.IDLote
)
SELECT
    IDMovimiento, IDCaso, IDLote, IDProyecto, AbreviaturaProyecto, CodigoLote,
    Cliente, FechaSolicitud, FechaMovimiento, IDTipmov, AbreviaturaTipo,
    NombreTipo, CategoriaTipo, Moneda, TipoCambio, EsCapturaBruta, IDBanco,
    AbrevBanco, NombreBanco, MontoMovBruto_CRC, MontoAplicadoLote_CRC, OrigenLote,
    LoteInterno_CRC, Exclusividad_CRC, ExclusividadEntidadCodigo, AreaLote,
    TieneOverride, PctAD, MontoQFI_CRC, MontoGM_CRC, MontoADLoteInterno_CRC,
    MontoADConstruccion_CRC, MontoADExclusividad_CRC, MontoNetoAD_CRC,
    CAST(MontoBaseUtilidad_efectivo AS DECIMAL(18, 2))               AS MontoBaseUtilidad_CRC,
    UtilidadReservada_Persistida,
    EsMovLote, Depositante, DetalleTransferencia, Completado,
    CAST(CASE
        WHEN (COALESCE(bc_pres_dir, cs_pres_dir, 0)
            + COALESCE(bc_pres_ind, cs_pres_ind, 0)
            + COALESCE(bc_util_proy, cs_util_proy, 0)) > 0
        THEN COALESCE(bc_util_proy, cs_util_proy) * 100.0 /
             (COALESCE(bc_pres_dir, cs_pres_dir, 0)
            + COALESCE(bc_pres_ind, cs_pres_ind, 0)
            + COALESCE(bc_util_proy, cs_util_proy, 0))
        ELSE NULL
    END AS NUMERIC(18, 4))                                          AS PctUtilidad,
    CAST(CASE
        WHEN CategoriaTipo NOT IN ('D', 'EX') THEN NULL
        WHEN MontoBaseUtilidad_efectivo IS NULL THEN NULL
        WHEN (COALESCE(bc_pres_dir, cs_pres_dir, 0)
            + COALESCE(bc_pres_ind, cs_pres_ind, 0)
            + COALESCE(bc_util_proy, cs_util_proy, 0)) = 0 THEN NULL
        WHEN COALESCE(bc_util_proy, cs_util_proy) IS NULL THEN NULL
        ELSE MontoBaseUtilidad_efectivo * COALESCE(bc_util_proy, cs_util_proy) /
             (COALESCE(bc_pres_dir, cs_pres_dir, 0)
            + COALESCE(bc_pres_ind, cs_pres_ind, 0)
            + COALESCE(bc_util_proy, cs_util_proy, 0))
    END AS DECIMAL(18, 2))                                          AS UtilidadAD_CRC,
    CAST(CASE
        WHEN (COALESCE(bc_pres_dir, cs_pres_dir, 0)
            + COALESCE(bc_pres_ind, cs_pres_ind, 0)
            + COALESCE(bc_util_proy, cs_util_proy, 0)) > 0
        THEN COALESCE(bc_pres_ind, cs_pres_ind) * 100.0 /
             (COALESCE(bc_pres_dir, cs_pres_dir, 0)
            + COALESCE(bc_pres_ind, cs_pres_ind, 0)
            + COALESCE(bc_util_proy, cs_util_proy, 0))
        ELSE NULL
    END AS DECIMAL(10, 4))                                          AS PctIndirecto,
    CAST(CASE
        WHEN CategoriaTipo NOT IN ('D', 'EX') THEN NULL
        WHEN MontoBaseUtilidad_efectivo IS NULL THEN NULL
        WHEN COALESCE(bc_pres_ind, cs_pres_ind) IS NULL
          OR COALESCE(bc_pres_ind, cs_pres_ind) = 0 THEN NULL
        WHEN (COALESCE(bc_pres_dir, cs_pres_dir, 0)
            + COALESCE(bc_pres_ind, cs_pres_ind, 0)
            + COALESCE(bc_util_proy, cs_util_proy, 0)) = 0 THEN NULL
        ELSE MontoBaseUtilidad_efectivo * COALESCE(bc_pres_ind, cs_pres_ind) /
             (COALESCE(bc_pres_dir, cs_pres_dir, 0)
            + COALESCE(bc_pres_ind, cs_pres_ind, 0)
            + COALESCE(bc_util_proy, cs_util_proy, 0))
    END AS DECIMAL(18, 2))                                          AS IndirectoAD_CRC
FROM MovEnriquecido;
GO
-- =============================================================================
-- 0004_view_movimientos_reserva.sql
-- Vista que combina UtilidadMovimiento con el movimiento contable vinculado
-- (pro_ventas.Movimientos vía IDMovimiento) para mostrar la utilidad reservada
-- frente al ingreso que la originó, con porcentaje calculado.
-- =============================================================================

-- =============================================================================
-- Vista: pro_uti.v_movimientos_con_utilidad
-- Fila por cada registro de pro_ventas.UtilidadMovimiento, enriquecida con:
--   - monto_movimiento: el ingreso contable vinculado (NULL si huérfano)
--   - porcentaje_reservado: ratio utilidad/ingreso (NULL si no hay movimiento)
-- Nota: DetalleTransferencia sirve como descripción del destino/receptor.
-- =============================================================================
CREATE   VIEW pro_uti.v_movimientos_con_utilidad AS
SELECT
    um.IDUtilidadMov                        AS id_utilidad_mov,
    um.IDMovimiento                         AS id_movimiento,
    um.FechaMovimiento                      AS fecha,
    YEAR(um.FechaMovimiento)                AS anio,
    MONTH(um.FechaMovimiento)               AS mes,
    l.Lote                                  AS lote,
    um.TipoMovimiento                       AS tipo_movimiento,
    um.TgSumaResta                          AS tg_suma_resta,
    um.DetalleTransferencia                 AS detalle_transferencia,
    um.MontoColones                         AS monto_utilidad,
    m.MontoColones                          AS monto_movimiento,
    CASE
        WHEN m.MontoColones IS NOT NULL AND m.MontoColones > 0
        THEN CAST(um.MontoColones AS FLOAT) / CAST(m.MontoColones AS FLOAT)
        ELSE NULL
    END                                     AS porcentaje_reservado
FROM pro_ventas.UtilidadMovimiento um
LEFT JOIN pro_ventas.Lotes l
    ON l.IDLote = um.IDLote
LEFT JOIN pro_ventas.Movimientos m
    ON m.IDMovimiento = um.IDMovimiento;
GO
-- =============================================================================
-- 0016_view_obras_con_proyecto.sql
--
-- BUG: La pantalla Obras muestra duplicados (ej. dos filas "5.13", "C.01")
-- porque hay distintos `IDLote` en `pro_ventas.Lotes` con el mismo `CodigoLote`.
-- Es data legítima: VB y VI usan bloques numéricos (5.x, 6.x), VN y VC
-- usan letras (C.x, D.x, F.x) — pueden colisionar en los códigos pero son
-- proyectos distintos.
--
-- Causa visible: la columna `abreviatura_proyecto` se derivaba de
-- `pro_uti.v_movimientos_con_indirecto`, que solo tiene proyecto si el lote tuvo
-- movimientos bancarios. Los lotes presupuestados pero sin movimientos
-- quedaban con proyecto "—", indistinguibles entre proyectos.
--
-- FIX: traer `IDProyecto` directo de `pro_ventas.Lotes` y resolver la abreviatura
-- desde cualquier movimiento del mismo proyecto (ProyectoLookup). Así todo
-- lote tiene proyecto si el proyecto tiene al menos un movimiento en el
-- sistema. Además agregamos `id_proyecto` para que el frontend pueda usar
-- la combinación (proyecto + lote) como llave estable.
-- =============================================================================

CREATE   VIEW pro_uti.v_obras_presupuesto AS
WITH ProyectoLookup AS (
    -- Mapea IDProyecto → Abreviatura desde cualquier movimiento del proyecto
    SELECT IDProyecto, MAX(AbreviaturaProyecto) AS abrev
    FROM pro_app.vw_utilidad_powerbi
    WHERE IDProyecto IS NOT NULL
    GROUP BY IDProyecto
),
LoteInfo AS (
    -- Por IDLote: cliente y acumulados desde movimientos
    SELECT
        IDLote,
        MAX(CodigoLote)                      AS codigo_lote_mov,
        MAX(Cliente)                         AS cliente,
        SUM(ISNULL(MontoMovBruto_CRC, 0))    AS ingresos_acumulados_crc,
        SUM(ISNULL(UtilidadAD_CRC, 0))       AS utilidad_acumulada_crc,
        SUM(ISNULL(IndirectoAD_CRC, 0))      AS indirecto_acumulado_crc,
        COUNT(*)                              AS movimientos_count
    FROM pro_uti.v_movimientos_con_indirecto
    WHERE IDLote IS NOT NULL
    GROUP BY IDLote
),
LotesPresupuestados AS (
    SELECT bc.IDLote, bc.works_no,
           bc.pres_directo, bc.pres_indirecto, bc.util_proyectada,
           'BC' AS fuente
    FROM pro_uti.t_lote_presupuesto_bc bc
    UNION ALL
    SELECT mcl.IDLote, NULL AS works_no,
           mcl.PresupuestoDirecto, mcl.PresupuestoIndirecto, mcl.UtilidadProyectada,
           'Casos' AS fuente
    FROM pro_uti.t_mejor_caso_lote mcl
    WHERE NOT EXISTS (
        SELECT 1 FROM pro_uti.t_lote_presupuesto_bc bc WHERE bc.IDLote = mcl.IDLote
    )
)
SELECT
    lp.IDLote                                                          AS id_lote,
    l.IDProyecto                                                       AS id_proyecto,
    COALESCE(l.Lote, li.codigo_lote_mov)                               AS codigo_lote,
    pl.abrev                                                           AS abreviatura_proyecto,
    li.cliente,
    lp.works_no,
    lp.fuente,
    CAST(lp.pres_directo    AS DECIMAL(18, 2))                         AS presupuesto_directo,
    CAST(lp.pres_indirecto  AS DECIMAL(18, 2))                         AS presupuesto_indirecto,
    CAST(lp.util_proyectada AS DECIMAL(18, 2))                         AS utilidad_proyectada,
    CAST(lp.pres_directo + lp.pres_indirecto + lp.util_proyectada
         AS DECIMAL(18, 2))                                            AS venta,
    CAST(CASE
        WHEN (lp.pres_directo + lp.pres_indirecto + lp.util_proyectada) > 0
        THEN lp.util_proyectada * 100.0 /
             (lp.pres_directo + lp.pres_indirecto + lp.util_proyectada)
        ELSE NULL
    END AS DECIMAL(10, 4))                                             AS pct_utilidad,
    CAST(CASE
        WHEN (lp.pres_directo + lp.pres_indirecto + lp.util_proyectada) > 0
        THEN lp.pres_indirecto * 100.0 /
             (lp.pres_directo + lp.pres_indirecto + lp.util_proyectada)
        ELSE NULL
    END AS DECIMAL(10, 4))                                             AS pct_indirecto,
    CAST(ISNULL(li.ingresos_acumulados_crc, 0)   AS DECIMAL(18, 2))    AS ingresos_acumulados,
    CAST(ISNULL(li.utilidad_acumulada_crc, 0)    AS DECIMAL(18, 2))    AS utilidad_acumulada,
    CAST(ISNULL(li.indirecto_acumulado_crc, 0)   AS DECIMAL(18, 2))    AS indirecto_acumulado,
    ISNULL(li.movimientos_count, 0)                                    AS movimientos_count
FROM LotesPresupuestados lp
LEFT JOIN pro_ventas.Lotes      l  ON l.IDLote      = lp.IDLote
LEFT JOIN ProyectoLookup pl ON pl.IDProyecto = l.IDProyecto
LEFT JOIN LoteInfo       li ON li.IDLote     = lp.IDLote;
GO
-- =============================================================================
-- 3) Distribución por tipo de movimiento (para treemap)
-- =============================================================================
CREATE   VIEW pro_uti.v_por_tipo_movimiento AS
SELECT
    YEAR(um.FechaMovimiento)  AS anio,
    MONTH(um.FechaMovimiento) AS mes,
    um.TipoMovimiento         AS tipo_movimiento,
    SUM(um.MontoColones)      AS monto_total,
    COUNT(*)                  AS cantidad_movimientos
FROM pro_ventas.UtilidadMovimiento um
GROUP BY YEAR(um.FechaMovimiento), MONTH(um.FechaMovimiento), um.TipoMovimiento;
GO
-- 4) % indirecto mensual (ponderado)
CREATE   VIEW pro_uti.v_porcentaje_indirecto_mensual AS
SELECT
    YEAR(FechaMovimiento)           AS anio,
    MONTH(FechaMovimiento)          AS mes,
    SUM(ISNULL(IndirectoAD_CRC, 0)) AS indirecto_atribuible,
    SUM(CASE WHEN IndirectoAD_CRC IS NOT NULL
             THEN MontoBaseUtilidad_CRC ELSE 0 END) AS base_atribuible,
    CASE
        WHEN SUM(CASE WHEN IndirectoAD_CRC IS NOT NULL
                      THEN MontoBaseUtilidad_CRC ELSE 0 END) = 0
            THEN NULL
        ELSE SUM(ISNULL(IndirectoAD_CRC, 0)) * 100.0 /
             SUM(CASE WHEN IndirectoAD_CRC IS NOT NULL
                      THEN MontoBaseUtilidad_CRC ELSE 0 END)
    END                             AS porcentaje_indirecto
FROM pro_uti.v_movimientos_con_indirecto
GROUP BY YEAR(FechaMovimiento), MONTH(FechaMovimiento);
GO
CREATE   VIEW pro_uti.v_porcentaje_utilidad_mensual AS
SELECT
    YEAR(FechaMovimiento) AS anio, MONTH(FechaMovimiento) AS mes,
    SUM(ISNULL(UtilidadAD_CRC, 0)) AS utilidad_atribuible,
    SUM(CASE WHEN UtilidadAD_CRC IS NOT NULL THEN MontoBaseUtilidad_CRC ELSE 0 END) AS ingresos_atribuibles,
    CASE
        WHEN SUM(CASE WHEN UtilidadAD_CRC IS NOT NULL THEN MontoBaseUtilidad_CRC ELSE 0 END) = 0 THEN NULL
        ELSE SUM(ISNULL(UtilidadAD_CRC, 0)) * 1.0 /
             SUM(CASE WHEN UtilidadAD_CRC IS NOT NULL THEN MontoBaseUtilidad_CRC ELSE 0 END)
    END AS porcentaje_utilidad
FROM pro_uti.v_movimientos_con_indirecto
GROUP BY YEAR(FechaMovimiento), MONTH(FechaMovimiento);
GO
-- =============================================================================
-- 0013_fix_total_suma_devolucion.sql
--
-- BUG REPORTADO POR USUARIO (2026-06-17):
--   La pantalla "Resumen" mostraba `utilidad_total` igual a `utilidad_ingresada`,
--   sin sumar `devolucion_utilidad`. Power BI hace la suma correcta:
--
--     utilidad_total = utilidad_ingresada + devolucion_utilidad
--     utilidad_neta  = utilidad_total      - utilidad_gastada
--
--   (Las devoluciones SUMAN al pool porque son utilidad que vuelve, no
--    "salidas". En el pool histórico tienen TgSumaResta = 1.)
--
-- CAUSA:
--   En la migración 0008 se reemplazó `utilidad_total` por `utilidad_calc`
--   (= SUM(UtilidadAD_CRC) del cálculo BC). Esa columna SOLO representa la
--   utilidad ingresada calculada — NO incluía la devolución. Y como
--   `utilidad_neta` se derivaba RESTANDO la devolución, el error se duplicaba:
--
--     ANTES (incorrecto): neta = calc - devolución - gastada
--     AHORA (correcto):   neta = (calc + devolución) - gastada
--
--   Diferencia con devolución de ₡100.7M (Jun 2025):
--     - App pre-fix:    neta = 171.7M - 100.7M - 210.1M =  -139.1M ✗
--     - PowerBI:        neta = 177.7M + 100.7M - 210.1M =    68.3M ✓
--     - App post-fix:   neta = 171.7M + 100.7M - 210.1M =    62.3M  (~ PowerBI)
--
--   La diferencia residual (~6M en ingresada) entre nuestro cálculo y PowerBI
--   viene de la fórmula BC vs el pool histórico, no de este bug.
--
-- ALCANCE:
--   Arregla `v_resumen_mensual` y `v_resumen_mensual_por_lote`. No toca
--   `v_evolucion_neta_mensual` (0010) porque esa lee del pool histórico
--   directamente y SUM(TgSumaResta=1) ya incluye las devoluciones por
--   construcción.
-- =============================================================================

-- =============================================================================
-- v_resumen_mensual — Fix: utilidad_total ahora SUMA devolución
-- =============================================================================
CREATE   VIEW pro_uti.v_resumen_mensual AS
WITH UtilidadCalculadaMes AS (
    SELECT
        YEAR(FechaMovimiento)  AS anio,
        MONTH(FechaMovimiento) AS mes,
        SUM(ISNULL(UtilidadAD_CRC, 0)) AS utilidad_calc
    FROM pro_uti.v_movimientos_con_indirecto
    GROUP BY YEAR(FechaMovimiento), MONTH(FechaMovimiento)
),
PoolUtilidadMes AS (
    SELECT
        YEAR(um.FechaMovimiento)  AS anio,
        MONTH(um.FechaMovimiento) AS mes,
        SUM(CASE WHEN um.TipoMovimiento = 'Inversion Casas'        THEN um.MontoColones ELSE 0 END) AS inversion_casas,
        SUM(CASE WHEN um.TipoMovimiento = 'Inversion Proyectos'    THEN um.MontoColones ELSE 0 END) AS inversion_proyectos,
        SUM(CASE WHEN um.TipoMovimiento = 'Otros'                  THEN um.MontoColones ELSE 0 END) AS otros,
        SUM(CASE WHEN um.TipoMovimiento = 'Salida Quinta'          THEN um.MontoColones ELSE 0 END) AS salida_quinta,
        SUM(CASE WHEN um.TipoMovimiento = 'Salida Homes'           THEN um.MontoColones ELSE 0 END) AS salida_homes,
        SUM(CASE WHEN um.TipoMovimiento = 'Salida Socios'          THEN um.MontoColones ELSE 0 END) AS salida_socios,
        SUM(CASE WHEN um.TipoMovimiento = 'Creditos Clientes'      THEN um.MontoColones ELSE 0 END) AS credito_clientes,
        SUM(CASE WHEN um.TipoMovimiento = 'Creditos Colaboradores' THEN um.MontoColones ELSE 0 END) AS credito_colaboradores,
        SUM(CASE WHEN um.TipoMovimiento = 'Compra Maquinaria'      THEN um.MontoColones ELSE 0 END) AS compra_maquinaria,
        SUM(CASE WHEN um.TipoMovimiento = 'Devolucion Utilidad'    THEN um.MontoColones ELSE 0 END) AS devolucion_utilidad,
        SUM(CASE WHEN um.TgSumaResta = 0 THEN um.MontoColones ELSE 0 END) AS utilidad_gastada
    FROM pro_ventas.UtilidadMovimiento um
    GROUP BY YEAR(um.FechaMovimiento), MONTH(um.FechaMovimiento)
)
SELECT
    COALESCE(uc.anio, p.anio) AS anio,
    COALESCE(uc.mes,  p.mes)  AS mes,
    ISNULL(p.inversion_casas, 0)        AS inversion_casas,
    ISNULL(p.inversion_proyectos, 0)    AS inversion_proyectos,
    ISNULL(p.otros, 0)                  AS otros,
    ISNULL(p.salida_quinta, 0)          AS salida_quinta,
    ISNULL(p.salida_homes, 0)           AS salida_homes,
    ISNULL(p.salida_socios, 0)          AS salida_socios,
    ISNULL(p.credito_clientes, 0)       AS credito_clientes,
    ISNULL(p.credito_colaboradores, 0)  AS credito_colaboradores,
    ISNULL(p.compra_maquinaria, 0)      AS compra_maquinaria,
    -- Utilidad ingresada calculada desde BC (sin cambios respecto a 0008)
    ISNULL(uc.utilidad_calc, 0)         AS utilidad_ingresada,
    ISNULL(p.devolucion_utilidad, 0)    AS devolucion_utilidad,
    -- FIX 0013: utilidad_total = ingresada + devolución (antes era = ingresada)
    ISNULL(uc.utilidad_calc, 0)
      + ISNULL(p.devolucion_utilidad, 0) AS utilidad_total,
    ISNULL(p.utilidad_gastada, 0)       AS utilidad_gastada,
    -- FIX 0013: neta = total - gastada (= ingresada + devolución - gastada).
    -- Antes restaba devolución → doblemente mal.
    ISNULL(uc.utilidad_calc, 0)
      + ISNULL(p.devolucion_utilidad, 0)
      - ISNULL(p.utilidad_gastada, 0)   AS utilidad_neta
FROM UtilidadCalculadaMes uc
FULL OUTER JOIN PoolUtilidadMes p ON uc.anio = p.anio AND uc.mes = p.mes;
GO
-- =============================================================================
-- v_resumen_mensual_por_lote — Mismo fix por lote
-- =============================================================================
CREATE   VIEW pro_uti.v_resumen_mensual_por_lote AS
WITH UtilidadCalculadaLote AS (
    SELECT
        YEAR(FechaMovimiento)  AS anio,
        MONTH(FechaMovimiento) AS mes,
        CodigoLote             AS lote,
        SUM(ISNULL(UtilidadAD_CRC, 0)) AS utilidad_calc,
        SUM(ISNULL(MontoMovBruto_CRC, 0)) AS monto_total_calc
    FROM pro_uti.v_movimientos_con_indirecto
    WHERE CodigoLote IS NOT NULL
    GROUP BY YEAR(FechaMovimiento), MONTH(FechaMovimiento), CodigoLote
),
PoolUtilidadLote AS (
    SELECT
        YEAR(um.FechaMovimiento)  AS anio,
        MONTH(um.FechaMovimiento) AS mes,
        l.Lote                    AS lote,
        SUM(CASE WHEN um.TipoMovimiento = 'Devolucion Utilidad' THEN um.MontoColones ELSE 0 END) AS devolucion_utilidad,
        SUM(CASE WHEN um.TgSumaResta = 0 THEN um.MontoColones ELSE 0 END) AS utilidad_gastada,
        SUM(um.MontoColones)      AS monto_total_pool
    FROM pro_ventas.UtilidadMovimiento um
    INNER JOIN pro_ventas.Lotes l ON l.IDLote = um.IDLote
    GROUP BY YEAR(um.FechaMovimiento), MONTH(um.FechaMovimiento), l.Lote
)
SELECT
    COALESCE(uc.anio, p.anio) AS anio,
    COALESCE(uc.mes,  p.mes)  AS mes,
    COALESCE(uc.lote, p.lote) AS lote,
    ISNULL(uc.utilidad_calc, 0)         AS utilidad_ingresada,
    ISNULL(p.devolucion_utilidad, 0)    AS devolucion_utilidad,
    -- FIX 0013: utilidad_total = ingresada + devolución
    ISNULL(uc.utilidad_calc, 0)
      + ISNULL(p.devolucion_utilidad, 0) AS utilidad_total,
    ISNULL(p.utilidad_gastada, 0)       AS utilidad_gastada,
    ISNULL(uc.monto_total_calc, ISNULL(p.monto_total_pool, 0)) AS monto_total
FROM UtilidadCalculadaLote uc
FULL OUTER JOIN PoolUtilidadLote p
    ON uc.anio = p.anio AND uc.mes = p.mes AND uc.lote = p.lote;
GO
-- =============================================================================
-- 9) Utilidad Lotes e Ingresos por Lotes (medidas DAX §2.4)
--    Utilidad atribuible por lote: movimientos con IDMovimiento no nulo
--    Ingresos atribuibles por lote: movimientos con IDCaso no nulo
-- =============================================================================
CREATE   VIEW pro_uti.v_utilidad_ingresos_lotes AS
WITH utilidad_por_lote AS (
    SELECT
        YEAR(um.FechaMovimiento)  AS anio,
        MONTH(um.FechaMovimiento) AS mes,
        l.Lote                    AS lote,
        SUM(um.MontoColones)      AS utilidad_lotes
    FROM pro_ventas.UtilidadMovimiento um
    INNER JOIN pro_ventas.Lotes l ON l.IDLote = um.IDLote
    WHERE um.IDMovimiento IS NOT NULL
    GROUP BY YEAR(um.FechaMovimiento), MONTH(um.FechaMovimiento), l.Lote
),
ingresos_por_lote AS (
    SELECT
        YEAR(m.FechaMovimiento)  AS anio,
        MONTH(m.FechaMovimiento) AS mes,
        l.Lote                   AS lote,
        SUM(m.MontoColones)      AS ingresos_lotes
    FROM pro_ventas.Movimientos m
    INNER JOIN pro_ventas.Casos c ON c.IDCaso = m.IDCaso
    INNER JOIN pro_ventas.Lotes l ON l.IDLote = c.IDLote
    WHERE m.IDCaso IS NOT NULL
    GROUP BY YEAR(m.FechaMovimiento), MONTH(m.FechaMovimiento), l.Lote
)
SELECT
    COALESCE(u.anio,  i.anio)  AS anio,
    COALESCE(u.mes,   i.mes)   AS mes,
    COALESCE(u.lote,  i.lote)  AS lote,
    u.utilidad_lotes,
    i.ingresos_lotes
FROM utilidad_por_lote u
FULL OUTER JOIN ingresos_por_lote i
    ON u.anio = i.anio AND u.mes = i.mes AND u.lote = i.lote;
GO
