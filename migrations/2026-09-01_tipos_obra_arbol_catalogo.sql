/* ============================================================================
   TIPOS DE OBRA (O/I/A/F/T) + el catálogo como ÁRBOL, con la parte que vive en BC.

   POR QUÉ: el catálogo de `pro_obc` solo conocía dos tipos de obra —VIVIENDA e
   INFRA— porque `grupos_partida.tipo_obra` era texto libre validado a mano en las
   rutas. El negocio maneja CINCO:

       O = Obra Vivienda · I = Infraestructura · A = Administrativa
       F = Fábrica       · T = Torres

   Administrativas y fábricas SÍ tienen estructura, pero solo estaba en Business
   Central (capítulos "Total" + partidas "Posting" de la obra); Torres todavía no
   existe en ningún lado y hay que poder crearla a mano.

   QUÉ HACE ESTE SCRIPT
   1. Crea `pro_obc.tipos_obra`: los 5 tipos con su LETRA, el rótulo del nivel 1
      (Etapa / Sistema / Área / Proceso / Torre) y si usan sprints y tipos de casa
      (solo vivienda). `grupos_partida.tipo_obra` pasa a tener FK contra esta tabla:
      ya no se puede colar un tipo inventado.
   2. Crea `pro_obc.tipo_obra_area_costeo`: de qué tipo es una obra según su ÁREA DE
      COSTEO de BC (PRO VIVIENDA→O, PRO INFRA→I, PRO FABRICACION→F, el resto→A).
      Es una tabla y no un CASE en el código para que el negocio la mueva sin deploy.
   3. Hace EXPLÍCITO el puente con BC, que hasta hoy era implícito y frágil:
        · `grupos_partida.bc_task_no`  = capítulo ("Total") de la obra en BC.
          Vivienda/infra se rellenan con `orden` (gris=1, acabados=2… = "1","2"),
          que es exactamente el amarre que usaban los seeds anteriores.
        · `grupos_partida.bc_works_no` = obra de BC de la que salió el capítulo.
          NULL = catálogo COMPARTIDO por todas las obras del tipo (vivienda e infra,
          que es como se usan hoy). Con valor = estructura propia de ESA obra, que
          es la realidad de administrativas y fábricas: cada una tiene la suya y
          los códigos se repiten entre ellas (G1 "Generales" está en 7 casas, FM es
          "MOLDURERA" en F-MADERAS y "Fabrica de Maderas" en HER/ALM-SSO).
        · `partidas.bc_task_no`       = partida ("Posting") de la obra en BC.
      Por eso el único (tipo_obra, codigo) de grupos pasa a ser
      (tipo_obra, bc_works_no, codigo), y las partidas ganan un único
      (grupo_id, codigo) — antes se validaba por tipo de obra solo en el código.
   4. Siembra ADMIN y FABRICA desde el snapshot de BC (`pro_bi.fact_presupuesto`
      última versión + `pro_bi.dim_obra`): 53 capítulos y 158 partidas. Regla:
      cada "Posting" cuelga del "Total" cuyo código es su prefijo más largo
      (FG-01→FG, G1.1→G1); las que no tienen capítulo en BC (SSCC, HER, MAQ,
      COM-MER…) cuelgan de un grupo con el código de la obra, y los capítulos de BC
      que no tienen ninguna partida no se crean (MER-GASTOS, VENT-GASTOS, G2 de
      CS-LUIS R.). Los códigos de grupo y partida pasan a varchar(50): BC trae
      cosas como 'CNI-LC OLIVA VERDE' o 'PANT. PUBLICITARIA'.
   5. TORRES queda creado y VACÍO a propósito: no hay nada en BC todavía, se crea
      desde la pantalla de Partidas (o con el botón "Traer de BC" cuando exista).

   SUBPARTIDAS: siguen siendo 100% de SQL — BC solo tiene dos niveles. Nada de este
   script las toca.

   Idempotente (MERGE keyed por código). Aplicar sobre AdelanteSBX: es la base que
   lee el app incluso en producción (los schemas pro_* solo existen ahí).

     node scripts/aplicar-sql.mjs migrations/2026-09-01_tipos_obra_arbol_catalogo.sql --confirm
   ============================================================================ */

/* ---------------------------------------------------------------------------
   1) Catálogo de tipos de obra
   --------------------------------------------------------------------------- */
IF OBJECT_ID('pro_obc.tipos_obra') IS NULL
BEGIN
    CREATE TABLE pro_obc.tipos_obra (
        codigo          varchar(20)   NOT NULL CONSTRAINT PK_tipos_obra PRIMARY KEY,
        letra           char(1)       NOT NULL,  -- O / I / A / F / T
        nombre          nvarchar(60)  NOT NULL,
        -- Rótulo del nivel 1 del árbol: en vivienda se llama "Etapa", en infra
        -- "Sistema", en fábrica "Proceso"… Es el mismo objeto (grupos_partida).
        termino_grupo   nvarchar(20)  NOT NULL,
        termino_grupo_pl nvarchar(20) NOT NULL,
        -- Género del rótulo, para que la pantalla escriba bien: "Nueva etapa" vs
        -- "Nuevo proceso", "esta área" vs "este sistema".
        genero          char(1)       NOT NULL CONSTRAINT DF_tipos_obra_genero DEFAULT 'F',
        -- Sprints y tipos de casa son del mundo vivienda (es lo que consume Avance).
        usa_sprints     bit           NOT NULL CONSTRAINT DF_tipos_obra_sprints DEFAULT 0,
        usa_tipos_casa  bit           NOT NULL CONSTRAINT DF_tipos_obra_tipos_casa DEFAULT 0,
        orden           smallint      NOT NULL,
        activo          bit           NOT NULL CONSTRAINT DF_tipos_obra_activo DEFAULT 1,
        creado_en       datetime2(7)  NOT NULL CONSTRAINT DF_tipos_obra_creado DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UX_tipos_obra_letra UNIQUE (letra)
    );
END
GO

-- Por si la tabla ya existía sin la columna (script corrido antes de este cambio).
IF COL_LENGTH('pro_obc.tipos_obra', 'genero') IS NULL
    ALTER TABLE pro_obc.tipos_obra ADD genero char(1) NOT NULL CONSTRAINT DF_tipos_obra_genero DEFAULT 'F';
GO

MERGE pro_obc.tipos_obra AS d
USING (VALUES
    ('VIVIENDA', 'O', N'Obra Vivienda',   N'Etapa',   N'Etapas',   'F', 1, 1, 1),
    ('INFRA',    'I', N'Infraestructura', N'Sistema', N'Sistemas', 'M', 0, 0, 2),
    ('ADMIN',    'A', N'Administrativa',  N'Área',    N'Áreas',    'F', 0, 0, 3),
    ('FABRICA',  'F', N'Fábrica',         N'Proceso', N'Procesos', 'M', 0, 0, 4),
    ('TORRES',   'T', N'Torres',          N'Torre',   N'Torres',   'F', 0, 0, 5)
) AS s (codigo, letra, nombre, termino_grupo, termino_grupo_pl, genero, usa_sprints, usa_tipos_casa, orden)
   ON d.codigo = s.codigo
WHEN MATCHED THEN UPDATE SET
    d.letra = s.letra, d.nombre = s.nombre, d.termino_grupo = s.termino_grupo,
    d.termino_grupo_pl = s.termino_grupo_pl, d.genero = s.genero, d.usa_sprints = s.usa_sprints,
    d.usa_tipos_casa = s.usa_tipos_casa, d.orden = s.orden
WHEN NOT MATCHED THEN INSERT (codigo, letra, nombre, termino_grupo, termino_grupo_pl, genero, usa_sprints, usa_tipos_casa, orden, activo)
     VALUES (s.codigo, s.letra, s.nombre, s.termino_grupo, s.termino_grupo_pl, s.genero, s.usa_sprints, s.usa_tipos_casa, s.orden, 1);
GO

/* ---------------------------------------------------------------------------
   2) De qué tipo es una obra, según su área de costeo en BC
   --------------------------------------------------------------------------- */
IF OBJECT_ID('pro_obc.tipo_obra_area_costeo') IS NULL
BEGIN
    CREATE TABLE pro_obc.tipo_obra_area_costeo (
        area_costeo varchar(50) NOT NULL CONSTRAINT PK_tipo_obra_area_costeo PRIMARY KEY,
        tipo_obra   varchar(20) NOT NULL,
        CONSTRAINT FK_toac_tipo FOREIGN KEY (tipo_obra) REFERENCES pro_obc.tipos_obra (codigo)
    );
END
GO

-- Las áreas de costeo que hay hoy en BC (pro_bi.dim_obra.area_costeo). Lo que no
-- esté acá se trata como ADMIN (ver lib/partidas/tipos-obra.ts). Torres no tiene
-- área propia todavía: cuando BC la cree, se agrega su fila acá.
MERGE pro_obc.tipo_obra_area_costeo AS d
USING (VALUES
    ('PRO VIVIENDA', 'VIVIENDA'),
    -- 'PRO LOTES' es vivienda: en AdelantePRO hay casas con esa área de costeo
    -- (VB-5.13) cuyo presupuesto en BC es el de vivienda (1 Obra Gris, 1.1
    -- Fundaciones…). Sin esta fila caerían en ADMIN por el default.
    ('PRO LOTES', 'VIVIENDA'),
    ('PRO INFRA', 'INFRA'),
    ('PRO FABRICACION', 'FABRICA'),
    ('ADM FIJOS', 'ADMIN'),
    ('ADM VAR', 'ADMIN'),
    ('COM FORM', 'ADMIN'),
    ('COM MERC', 'ADMIN'),
    ('COM VENT', 'ADMIN'),
    ('IND VAR', 'ADMIN'),
    ('LC AD ALQ', 'ADMIN'),
    ('LC CNI', 'ADMIN'),
    ('MAQ HER', 'ADMIN'),
    ('MAQ VAR', 'ADMIN'),
    ('PRO EXTERNOS', 'ADMIN'),
    ('UTD ANTICIPADA', 'ADMIN')
) AS s (area_costeo, tipo_obra)
   ON d.area_costeo = s.area_costeo
WHEN MATCHED THEN UPDATE SET d.tipo_obra = s.tipo_obra
WHEN NOT MATCHED THEN INSERT (area_costeo, tipo_obra) VALUES (s.area_costeo, s.tipo_obra);
GO

/* ---------------------------------------------------------------------------
   3) grupos_partida: puente con BC + único por obra + FK al tipo
   --------------------------------------------------------------------------- */
IF COL_LENGTH('pro_obc.grupos_partida', 'bc_task_no') IS NULL
    ALTER TABLE pro_obc.grupos_partida ADD bc_task_no varchar(50) NULL;
GO
IF COL_LENGTH('pro_obc.grupos_partida', 'bc_works_no') IS NULL
    ALTER TABLE pro_obc.grupos_partida ADD bc_works_no varchar(20) NULL;
GO

-- Vivienda e infra: el capítulo de BC es el número de orden ("1 Obra Gris" = grupo
-- `gris`, orden 1). Se rellena solo donde está vacío para no pisar ajustes manuales.
UPDATE pro_obc.grupos_partida
   SET bc_task_no = CAST(orden AS varchar(50))
 WHERE bc_task_no IS NULL AND tipo_obra IN ('VIVIENDA', 'INFRA');
GO

-- Los códigos de BC son más largos que 20 ('CNI-LC OLIVA VERDE', 'PANT. PUBLICITARIA').
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_grupos_partida_tipo_codigo'
           AND object_id = OBJECT_ID('pro_obc.grupos_partida'))
    DROP INDEX UX_grupos_partida_tipo_codigo ON pro_obc.grupos_partida;
GO
IF COL_LENGTH('pro_obc.grupos_partida', 'codigo') < 50
    ALTER TABLE pro_obc.grupos_partida ALTER COLUMN codigo varchar(50) NOT NULL;
GO

-- Único por TIPO + OBRA + código: el catálogo compartido (bc_works_no NULL) no
-- puede repetir código dentro del tipo, y cada obra administrativa/fábrica tiene
-- su propio espacio de códigos (G1 existe en 7 casas). En un índice único de SQL
-- Server los NULL cuentan como un valor más, así que el caso compartido queda
-- cubierto con las mismas reglas.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_grupos_partida_tipo_obra_codigo'
               AND object_id = OBJECT_ID('pro_obc.grupos_partida'))
    CREATE UNIQUE INDEX UX_grupos_partida_tipo_obra_codigo
        ON pro_obc.grupos_partida (tipo_obra, bc_works_no, codigo);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_grupos_partida_tipo_obra')
    ALTER TABLE pro_obc.grupos_partida WITH CHECK
        ADD CONSTRAINT FK_grupos_partida_tipo_obra
        FOREIGN KEY (tipo_obra) REFERENCES pro_obc.tipos_obra (codigo);
GO

/* ---------------------------------------------------------------------------
   4) partidas: puente con BC + código único dentro del grupo
   --------------------------------------------------------------------------- */
IF COL_LENGTH('pro_obc.partidas', 'bc_task_no') IS NULL
    ALTER TABLE pro_obc.partidas ADD bc_task_no varchar(50) NULL;
GO
IF COL_LENGTH('pro_obc.partidas', 'codigo') < 50
    ALTER TABLE pro_obc.partidas ALTER COLUMN codigo varchar(50) NOT NULL;
GO

-- En vivienda e infra el código de la partida ES el "Posting" de BC (1.1, 3.4…).
UPDATE pro_obc.partidas SET bc_task_no = codigo WHERE bc_task_no IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_partidas_grupo_codigo'
               AND object_id = OBJECT_ID('pro_obc.partidas'))
    CREATE UNIQUE INDEX UX_partidas_grupo_codigo ON pro_obc.partidas (grupo_id, codigo);
GO

/* ---------------------------------------------------------------------------
   5) Estructura de ADMINISTRATIVAS y FÁBRICAS tal como está hoy en BC
      (snapshot pro_bi.fact_presupuesto, última versión). El botón "Traer de BC"
      de la pantalla de Partidas vuelve a leer BC EN VIVO y agrega lo que falte.
   --------------------------------------------------------------------------- */
MERGE pro_obc.grupos_partida AS d
USING (VALUES
    ('ADMIN', 'ALM-SSO', N'Seguridad ocupacional', 1, 'ALM-SSO', NULL),
    ('ADMIN', 'COM-FORM', N'Formalización', 1, 'COM-FORM', NULL),
    ('ADMIN', 'COM-MER', N'Mercadeo', 1, 'COM-MER', NULL),
    ('ADMIN', 'COM-VENT', N'Ventas', 1, 'COM-VENT', NULL),
    ('ADMIN', 'G1', N'Generales 2025', 1, 'CS-D.JOSE', 'G1'),
    ('ADMIN', 'G2', N'Generales 2026', 2, 'CS-D.JOSE', 'G2'),
    ('ADMIN', 'G1', N'Generales', 1, 'CS-DANIEL', 'G1'),
    ('ADMIN', 'G2', N'Generales', 2, 'CS-DANIEL', 'G2'),
    ('ADMIN', 'G1', N'Generales', 1, 'CS-DAVID', 'G1'),
    ('ADMIN', 'G1', N'Generales 2025', 1, 'CS-GILDA', 'G1'),
    ('ADMIN', 'G2', N'Generales 2026', 2, 'CS-GILDA', 'G2'),
    ('ADMIN', 'G1', N'Generales', 1, 'CS-JOSE H.', 'G1'),
    ('ADMIN', 'G2', N'Generales', 2, 'CS-JOSE H.', 'G2'),
    ('ADMIN', 'CS-LUIS R.', N'Casa Luis Roberto', 1, 'CS-LUIS R.', NULL),
    ('ADMIN', 'G1', N'Generales 2025', 2, 'CS-LUIS R.', 'G1'),
    ('ADMIN', 'G1', N'Generales', 1, 'CS-MARCOS', 'G1'),
    ('ADMIN', 'G2', N'Generales', 2, 'CS-MARCOS', 'G2'),
    ('ADMIN', 'FE-INC', N'Feriados en Incapacidades', 1, 'FE-INC', NULL),
    ('ADMIN', 'HER', N'Herramienta', 1, 'HER', NULL),
    ('ADMIN', 'MAQ', N'MAQUINARIA', 1, 'MAQ', NULL),
    ('ADMIN', 'O-EXTERNAS', N'Obras Externas', 1, 'O-EXTERNAS', NULL),
    ('ADMIN', 'PD-AD-LOC', N'Adelante Locales', 1, 'PD-AD-LOC', NULL),
    ('ADMIN', 'PD-CNI-LOC', N'CNI Locales', 1, 'PD-CNI-LOC', NULL),
    ('ADMIN', 'SSCC', N'Servicios Centrales', 1, 'SSCC', NULL),
    ('FABRICA', 'F-AGREGADO', N'Agregados', 1, 'F-AGREGADO', NULL),
    ('FABRICA', 'ACO', N'Aire comprimido', 1, 'F-MAD-NUE', 'ACO'),
    ('FABRICA', 'CO', N'Construcción Obra Gris', 2, 'F-MAD-NUE', 'CO'),
    ('FABRICA', 'CU', N'Cubierta', 3, 'F-MAD-NUE', 'CU'),
    ('FABRICA', 'DP', N'Diseños y Permisos', 4, 'F-MAD-NUE', 'DP'),
    ('FABRICA', 'EM', N'Estructura Metalica', 5, 'F-MAD-NUE', 'EM'),
    ('FABRICA', 'INF', N'Infraestructura', 6, 'F-MAD-NUE', 'INF'),
    ('FABRICA', 'LV', N'Liviano y Acabados', 7, 'F-MAD-NUE', 'LV'),
    ('FABRICA', 'SE', N'Sistema Eléctrico', 8, 'F-MAD-NUE', 'SE'),
    ('FABRICA', 'SP', N'Sistema Potable', 9, 'F-MAD-NUE', 'SP'),
    ('FABRICA', 'SPL', N'Sistema Pluvial', 10, 'F-MAD-NUE', 'SPL'),
    ('FABRICA', 'SS', N'Sistema Sanitario', 11, 'F-MAD-NUE', 'SS'),
    ('FABRICA', 'FAS', N'Aserradero LT15 Wide', 1, 'F-MADERAS', 'FAS'),
    ('FABRICA', 'FED', N'Encoladora Doble ED4 1300', 2, 'F-MADERAS', 'FED'),
    ('FABRICA', 'FES', N'Encoladora Simple ES 1400', 3, 'F-MADERAS', 'FES'),
    ('FABRICA', 'FFJ', N'Fresadora Finger Joint FFJ 15 Full', 4, 'F-MADERAS', 'FFJ'),
    ('FABRICA', 'FG', N'Fabrica General', 5, 'F-MADERAS', 'FG'),
    ('FABRICA', 'FIM', N'Impregnadora Madera APV2 6.6', 6, 'F-MADERAS', 'FIM'),
    ('FABRICA', 'FLA', N'Lijadora Calibradora Banda Ancha', 7, 'F-MADERAS', 'FLA'),
    ('FABRICA', 'FM', N'MOLDURERA M620AT', 8, 'F-MADERAS', 'FM'),
    ('FABRICA', 'FPC', N'Prensa Calienta Tableros PHT 31', 9, 'F-MADERAS', 'FPC'),
    ('FABRICA', 'FPF', N'Prensa Finger Joint PFJ 6A', 10, 'F-MADERAS', 'FPF'),
    ('FABRICA', 'FPP', N'Prensa Puertas PF 25', 11, 'F-MADERAS', 'FPP'),
    ('FABRICA', 'FPV', N'Prensa Vigas Laminadas', 12, 'F-MADERAS', 'FPV'),
    ('FABRICA', 'FSM', N'Secadora de Madera ESV1 6.6', 13, 'F-MADERAS', 'FSM'),
    ('FABRICA', 'FTR', N'Tronzadora Rapida Neumatica TR18', 14, 'F-MADERAS', 'FTR'),
    ('FABRICA', 'F-METALES', N'Fabrica Metales', 1, 'F-METALES', NULL),
    ('FABRICA', 'F-MUEBLES', N'Fabrica Muebles', 1, 'F-MUEBLES', NULL),
    ('FABRICA', 'F-PREFA', N'Fabrica Prefabricados de Concreto', 1, 'F-PREFA', NULL)
) AS s (tipo_obra, codigo, nombre, orden, bc_works_no, bc_task_no)
   ON d.tipo_obra = s.tipo_obra AND d.bc_works_no = s.bc_works_no AND d.codigo = s.codigo
WHEN MATCHED THEN UPDATE SET d.nombre = s.nombre, d.orden = s.orden, d.bc_task_no = s.bc_task_no
WHEN NOT MATCHED THEN INSERT (codigo, nombre, orden, activo, tipo_obra, bc_works_no, bc_task_no, creado_en)
     VALUES (s.codigo, s.nombre, s.orden, 1, s.tipo_obra, s.bc_works_no, s.bc_task_no, SYSUTCDATETIME());
GO

MERGE pro_obc.partidas AS d
USING (
    SELECT g.id AS grupo_id, s.codigo, s.nombre, s.orden
    FROM (VALUES
    ('ADMIN', 'ALM-SSO', 'ALM-SSO', 'FM', N'Fabrica de Maderas', 1),
    ('ADMIN', 'ALM-SSO', 'ALM-SSO', 'SEG25', N'Seguridad Ocupacional 2025', 2),
    ('ADMIN', 'ALM-SSO', 'ALM-SSO', 'SEG26', N'Seguridad Ocupacional 2026', 3),
    ('ADMIN', 'COM-FORM', 'COM-FORM', 'FORM-GEN', N'Gastos Generales', 1),
    ('ADMIN', 'COM-MER', 'COM-MER', 'EXPO C 2026', N'Expo Casa 2026', 1),
    ('ADMIN', 'COM-MER', 'COM-MER', 'MER-GEN', N'Gastos Generales', 2),
    ('ADMIN', 'COM-MER', 'COM-MER', 'PANT. PUBLICITARIA', N'Pantalla Publicitaria', 3),
    ('ADMIN', 'COM-MER', 'COM-MER', 'REGALIAS', N'Regalias', 4),
    ('ADMIN', 'COM-MER', 'COM-MER', 'STAND 2025', N'Expo Construcción 2025', 5),
    ('ADMIN', 'COM-MER', 'COM-MER', 'STAND 2026', N'Expo Construcción 2026', 6),
    ('ADMIN', 'COM-VENT', 'COM-VENT', 'VENT-GEN', N'Gastos Generales', 1),
    ('ADMIN', 'CS-D.JOSE', 'G1', 'G1.1', N'Generales 2025', 1),
    ('ADMIN', 'CS-D.JOSE', 'G2', 'G2.1', N'Generales 2026', 1),
    ('ADMIN', 'CS-DANIEL', 'G1', 'G1.1', N'Generales 2025', 1),
    ('ADMIN', 'CS-DANIEL', 'G2', 'G2.2', N'Generales 2026', 1),
    ('ADMIN', 'CS-DAVID', 'G1', 'G1.1', N'Generales 2025', 1),
    ('ADMIN', 'CS-DAVID', 'G1', 'G1.2', N'Taller de Victor Leiva', 2),
    ('ADMIN', 'CS-DAVID', 'G1', 'G1.3', N'Generales 2026', 3),
    ('ADMIN', 'CS-GILDA', 'G1', 'G1.1', N'Generales 2025', 1),
    ('ADMIN', 'CS-GILDA', 'G2', 'G2.2', N'Generales 2026', 1),
    ('ADMIN', 'CS-JOSE H.', 'G1', 'G1.1', N'Generales 2025', 1),
    ('ADMIN', 'CS-JOSE H.', 'G2', 'G2.2', N'Generales 2026', 1),
    ('ADMIN', 'CS-LUIS R.', 'CS-LUIS R.', 'G.2.2', N'Generales 2026', 1),
    ('ADMIN', 'CS-LUIS R.', 'G1', 'G1.1', N'Generales 2025', 1),
    ('ADMIN', 'CS-MARCOS', 'G1', 'G1.1', N'Generales 2025', 1),
    ('ADMIN', 'CS-MARCOS', 'G2', 'G2.2', N'Generales 2026', 1),
    ('ADMIN', 'FE-INC', 'FE-INC', 'FE-INC', N'FERIADOS E INCAPACIDADES', 1),
    ('ADMIN', 'HER', 'HER', 'FM', N'Fabrica de Maderas', 1),
    ('ADMIN', 'HER', 'HER', 'HER-COMP', N'Compra', 2),
    ('ADMIN', 'HER', 'HER', 'HER-MANT', N'Mantenimiento', 3),
    ('ADMIN', 'HER', 'HER', 'HER-REP', N'Reparación', 4),
    ('ADMIN', 'MAQ', 'MAQ', 'CMAQ', N'PARQUE MAQUINARIA COSTES', 1),
    ('ADMIN', 'MAQ', 'MAQ', 'FOR', N'FORMALETA', 2),
    ('ADMIN', 'MAQ', 'MAQ', 'MACT', N'MEJORAS O CREACION DE ACTIVOS', 3),
    ('ADMIN', 'O-EXTERNAS', 'O-EXTERNAS', 'OE-AUT', N'Automania Limpieza Rio', 1),
    ('ADMIN', 'O-EXTERNAS', 'O-EXTERNAS', 'OE-CAC', N'OE-CACIQUE', 2),
    ('ADMIN', 'O-EXTERNAS', 'O-EXTERNAS', 'OE-CAPT', N'Capilla Tobosi', 3),
    ('ADMIN', 'O-EXTERNAS', 'O-EXTERNAS', 'OE-CBN', N'Cancha Barrio Nuevo', 4),
    ('ADMIN', 'O-EXTERNAS', 'O-EXTERNAS', 'OE-CCANG', N'Cancha la Cangreja', 5),
    ('ADMIN', 'O-EXTERNAS', 'O-EXTERNAS', 'OE-CCARP', N'Cancha la Carpintera', 6),
    ('ADMIN', 'O-EXTERNAS', 'O-EXTERNAS', 'OE-CDP', N'Centro Diurno Pitahaya', 7),
    ('ADMIN', 'O-EXTERNAS', 'O-EXTERNAS', 'OE-CMANI', N'Casa de Mani', 8),
    ('ADMIN', 'O-EXTERNAS', 'O-EXTERNAS', 'OE-COR', N'Casa Orlando', 9),
    ('ADMIN', 'O-EXTERNAS', 'O-EXTERNAS', 'OE-CPIT', N'Cancha La Pitthaya', 10),
    ('ADMIN', 'O-EXTERNAS', 'O-EXTERNAS', 'OE-CPV', N'Canna Pura Vida', 11),
    ('ADMIN', 'O-EXTERNAS', 'O-EXTERNAS', 'OE-CROG', N'Casa de Roger', 12),
    ('ADMIN', 'O-EXTERNAS', 'O-EXTERNAS', 'OE-CTEJ', N'Cancha Tejar', 13),
    ('ADMIN', 'O-EXTERNAS', 'O-EXTERNAS', 'OE-CTOB', N'Cancha Tobosi', 14),
    ('ADMIN', 'O-EXTERNAS', 'O-EXTERNAS', 'OE-ESTEJ', N'Escuela de Tejar', 15),
    ('ADMIN', 'O-EXTERNAS', 'O-EXTERNAS', 'OE-FUL', N'Fulcro (Trabajos mejoras)', 16),
    ('ADMIN', 'O-EXTERNAS', 'O-EXTERNAS', 'OE-HDE', N'OE Hogar de la Esperanza', 17),
    ('ADMIN', 'O-EXTERNAS', 'O-EXTERNAS', 'OE-IE', N'IGLESIA DE LA ESTRELLA', 18),
    ('ADMIN', 'O-EXTERNAS', 'O-EXTERNAS', 'OE-KOND', N'Kondomu', 19),
    ('ADMIN', 'O-EXTERNAS', 'O-EXTERNAS', 'OE-MCA', N'Mejoras Calle Albacete', 20),
    ('ADMIN', 'O-EXTERNAS', 'O-EXTERNAS', 'OE-SU', N'Super Uno Mas Uno', 21),
    ('ADMIN', 'O-EXTERNAS', 'O-EXTERNAS', 'OE-UNI', N'Hospital Universal (Pared y lavatorio)', 22),
    ('ADMIN', 'PD-AD-LOC', 'PD-AD-LOC', 'AD LOCAL 1', N'AD LOCAL 1', 1),
    ('ADMIN', 'PD-AD-LOC', 'PD-AD-LOC', 'AD LOCAL 2', N'AD LOCAL 2', 2),
    ('ADMIN', 'PD-AD-LOC', 'PD-AD-LOC', 'AD LOCAL 3', N'AD LOCAL 3', 3),
    ('ADMIN', 'PD-AD-LOC', 'PD-AD-LOC', 'AD LOCAL 4', N'AD LOCAL 4', 4),
    ('ADMIN', 'PD-AD-LOC', 'PD-AD-LOC', 'AD LOCAL 5', N'AD LOCAL 5', 5),
    ('ADMIN', 'PD-AD-LOC', 'PD-AD-LOC', 'AD LOCAL 6', N'AD LOCAL 6', 6),
    ('ADMIN', 'PD-AD-LOC', 'PD-AD-LOC', 'AD LOCAL 8', N'AD LOCAL 8', 7),
    ('ADMIN', 'PD-AD-LOC', 'PD-AD-LOC', 'AD LOCAL 9', N'AD LOCAL 9', 8),
    ('ADMIN', 'PD-AD-LOC', 'PD-AD-LOC', 'AD LOCAL 15', N'AD LOCAL 15', 9),
    ('ADMIN', 'PD-AD-LOC', 'PD-AD-LOC', 'AD-LC LANCO', N'AD LOCAL LANCO', 10),
    ('ADMIN', 'PD-AD-LOC', 'PD-AD-LOC', 'AD-LC-POPS', N'AD LOCAL POPS', 11),
    ('ADMIN', 'PD-AD-LOC', 'PD-AD-LOC', 'AD-MANT', N'AD MANTENIMIENTO GENERAL LOCAL', 12),
    ('ADMIN', 'PD-AD-LOC', 'PD-AD-LOC', 'AD-TOTEM', N'AD-TOTEM', 13),
    ('ADMIN', 'PD-CNI-LOC', 'PD-CNI-LOC', 'CNI-AMPL MELATTE', N'CNI AMPLIACION MELATTE', 1),
    ('ADMIN', 'PD-CNI-LOC', 'PD-CNI-LOC', 'CNI-LC COSECHA #13', N'CNI-LC COSECHA #13', 2),
    ('ADMIN', 'PD-CNI-LOC', 'PD-CNI-LOC', 'CNI-LC GOGO SUSHI', N'CNI LOCAL GO GO SUSHI', 3),
    ('ADMIN', 'PD-CNI-LOC', 'PD-CNI-LOC', 'CNI-LC OLIVA VERDE', N'CNI LOCAL OLIVA VERDE', 4),
    ('ADMIN', 'PD-CNI-LOC', 'PD-CNI-LOC', 'CNI-LC-ABOGADOS', N'CNI LOCAL ABOGADOS', 5),
    ('ADMIN', 'PD-CNI-LOC', 'PD-CNI-LOC', 'CNI-LOCAL #7', N'CNI LOCAL #7', 6),
    ('ADMIN', 'PD-CNI-LOC', 'PD-CNI-LOC', 'CNI-MANT', N'CNI MANTENIMIENTO GENERAL LOCAL', 7),
    ('ADMIN', 'SSCC', 'SSCC', 'CI.LC', N'Laboratorio de Concreto', 1),
    ('ADMIN', 'SSCC', 'SSCC', 'CI.MAN', N'Costes de Mantenimiento de Oficinas', 2),
    ('ADMIN', 'SSCC', 'SSCC', 'CI.PV', N'Costes indirectos postventa', 3),
    ('ADMIN', 'SSCC', 'SSCC', 'CI.SC', N'Costes indirectos servicios centrales', 4),
    ('ADMIN', 'SSCC', 'SSCC', 'CI.TR', N'Transportes', 5),
    ('FABRICA', 'F-AGREGADO', 'F-AGREGADO', 'F-Q', N'Quebrador concreto', 1),
    ('FABRICA', 'F-MAD-NUE', 'ACO', 'ACO-1', N'Aire comprimido', 1),
    ('FABRICA', 'F-MAD-NUE', 'CO', 'CO-1', N'Movimientos de Tierra', 1),
    ('FABRICA', 'F-MAD-NUE', 'CO', 'CO-2', N'Complementaria', 2),
    ('FABRICA', 'F-MAD-NUE', 'CO', 'CO-3', N'Cimentaciones', 3),
    ('FABRICA', 'F-MAD-NUE', 'CO', 'CO-4', N'Muro de contención', 4),
    ('FABRICA', 'F-MAD-NUE', 'CO', 'CO-5', N'Relleno/sustitución de suelos', 5),
    ('FABRICA', 'F-MAD-NUE', 'CO', 'CO-6', N'Contrapiso', 6),
    ('FABRICA', 'F-MAD-NUE', 'CO', 'CO-7', N'Cerramiento en prefabricado', 7),
    ('FABRICA', 'F-MAD-NUE', 'CU', 'CU-1', N'Hojalateria', 1),
    ('FABRICA', 'F-MAD-NUE', 'DP', 'DP-01', N'Diseños', 1),
    ('FABRICA', 'F-MAD-NUE', 'DP', 'DP-02', N'Permisos', 2),
    ('FABRICA', 'F-MAD-NUE', 'DP', 'DP-03', N'Estudios', 3),
    ('FABRICA', 'F-MAD-NUE', 'EM', 'EM-01', N'Estructura Metalica', 1),
    ('FABRICA', 'F-MAD-NUE', 'INF', 'INF-1', N'Conformación de Pavimentos', 1),
    ('FABRICA', 'F-MAD-NUE', 'LV', 'LV-01', N'Cerramientos livianos', 1),
    ('FABRICA', 'F-MAD-NUE', 'LV', 'LV-02', N'Enchapes', 2),
    ('FABRICA', 'F-MAD-NUE', 'LV', 'LV-03', N'Losa Sanitaria', 3),
    ('FABRICA', 'F-MAD-NUE', 'SE', 'SE-01', N'Sistema eléctrico', 1),
    ('FABRICA', 'F-MAD-NUE', 'SE', 'SE-02', N'Media Tensión', 2),
    ('FABRICA', 'F-MAD-NUE', 'SP', 'SP-01', N'Tuberia Potable', 1),
    ('FABRICA', 'F-MAD-NUE', 'SPL', 'SPL-01', N'Tuberia Pluvial', 1),
    ('FABRICA', 'F-MAD-NUE', 'SPL', 'SPL-02', N'Cabezal de desfogue', 2),
    ('FABRICA', 'F-MAD-NUE', 'SPL', 'SPL-03', N'Tanque de captación de agua', 3),
    ('FABRICA', 'F-MAD-NUE', 'SS', 'SS-01', N'Tuberia Sanitaria', 1),
    ('FABRICA', 'F-MAD-NUE', 'SS', 'SS-02', N'Pozos Sanitarios', 2),
    ('FABRICA', 'F-MADERAS', 'FAS', 'FAS-01', N'Aserrio', 1),
    ('FABRICA', 'F-MADERAS', 'FED', 'FED-01', N'Encolado Sencillo', 1),
    ('FABRICA', 'F-MADERAS', 'FED', 'FED-02', N'Encolado Doble', 2),
    ('FABRICA', 'F-MADERAS', 'FES', 'FES-01', N'Encolado Sencillo', 1),
    ('FABRICA', 'F-MADERAS', 'FFJ', 'FFJ-01', N'Finger Expuesto H=100mm', 1),
    ('FABRICA', 'F-MADERAS', 'FFJ', 'FFJ-02', N'Finger Oculto H=100mm', 2),
    ('FABRICA', 'F-MADERAS', 'FG', 'FG-01', N'Limpieza Fabrica', 1),
    ('FABRICA', 'F-MADERAS', 'FG', 'FG-02', N'Mantenimiento Maquinas', 2),
    ('FABRICA', 'F-MADERAS', 'FG', 'FG-03', N'Recepcion Material', 3),
    ('FABRICA', 'F-MADERAS', 'FG', 'FG-04', N'Complementarias', 4),
    ('FABRICA', 'F-MADERAS', 'FG', 'FG-05', N'Instalación de muebles', 5),
    ('FABRICA', 'F-MADERAS', 'FIM', 'FIM-01', N'Impregnacion R=1.8 kg', 1),
    ('FABRICA', 'F-MADERAS', 'FIM', 'FIM-02', N'Impregnacion R=2.4 kg', 2),
    ('FABRICA', 'F-MADERAS', 'FIM', 'FIM-03', N'Impregnacion R=3.2 kg', 3),
    ('FABRICA', 'F-MADERAS', 'FLA', 'FLA-01', N'Lijado Sencillo', 1),
    ('FABRICA', 'F-MADERAS', 'FLA', 'FLA-02', N'Lijado Doble Rodillo', 2),
    ('FABRICA', 'F-MADERAS', 'FM', 'FM-01', N'Rodapie Redondo+Rebaje Inferior', 1),
    ('FABRICA', 'F-MADERAS', 'FM', 'FM-02', N'Rodapie Angulo+Rebaje Inferior', 2),
    ('FABRICA', 'F-MADERAS', 'FM', 'FM-03', N'Rodapie Redondo+Rebaje Inferior+P.Cable', 3),
    ('FABRICA', 'F-MADERAS', 'FM', 'FM-04', N'Rodapie Angulo+Rebaje Inferior+P.Cable', 4),
    ('FABRICA', 'F-MADERAS', 'FM', 'FM-05', N'Marco Seguridad Sencillo', 5),
    ('FABRICA', 'F-MADERAS', 'FM', 'FM-06', N'Marco de Seguridad Borde Redondo', 6),
    ('FABRICA', 'F-MADERAS', 'FM', 'FM-07', N'Marco Seguridasd Borde Redondo+Ranura', 7),
    ('FABRICA', 'F-MADERAS', 'FM', 'FM-08', N'Moldura L Marco Seguridad', 8),
    ('FABRICA', 'F-MADERAS', 'FM', 'FM-09', N'Deck Borde Redondo', 9),
    ('FABRICA', 'F-MADERAS', 'FM', 'FM-10', N'Deck Borde Redondo Ranurado', 10),
    ('FABRICA', 'F-MADERAS', 'FM', 'FM-11', N'Siding Media Madera', 11),
    ('FABRICA', 'F-MADERAS', 'FM', 'FM-12', N'Siding Machimbre o Piso Cielo', 12),
    ('FABRICA', 'F-MADERAS', 'FM', 'FM-13', N'Moldura Ranurada Machimbre', 13),
    ('FABRICA', 'F-MADERAS', 'FM', 'FM-14', N'Moldura Ranurada Para Panel', 14),
    ('FABRICA', 'F-MADERAS', 'FM', 'FM-15', N'Moldura Redonda 4 Esquinas', 15),
    ('FABRICA', 'F-MADERAS', 'FM', 'FM-16', N'Cepillado 2 Caras', 16),
    ('FABRICA', 'F-MADERAS', 'FM', 'FM-17', N'Cepillado 4 Caras', 17),
    ('FABRICA', 'F-MADERAS', 'FM', 'FM-18', N'Corte Sierra', 18),
    ('FABRICA', 'F-MADERAS', 'FPC', 'FPC-01', N'Prensado Caliente', 1),
    ('FABRICA', 'F-MADERAS', 'FPF', 'FPF-01', N'Prensado', 1),
    ('FABRICA', 'F-MADERAS', 'FPP', 'FPP-01', N'Prensado 3 Hrs', 1),
    ('FABRICA', 'F-MADERAS', 'FPP', 'FPP-02', N'Prensado 4 Hrs', 2),
    ('FABRICA', 'F-MADERAS', 'FPV', 'FPV-01', N'Prensado 1 Seccion', 1),
    ('FABRICA', 'F-MADERAS', 'FPV', 'FPV-02', N'Prensado 2 Secciones', 2),
    ('FABRICA', 'F-MADERAS', 'FSM', 'FSM-01', N'Secado de Madera', 1),
    ('FABRICA', 'F-MADERAS', 'FTR', 'FTR-01', N'Corte', 1),
    ('FABRICA', 'F-METALES', 'F-METALES', 'F-FOX', N'Taller de FOX', 1),
    ('FABRICA', 'F-METALES', 'F-METALES', 'F-HOJ', N'Taller de Hojalatería', 2),
    ('FABRICA', 'F-METALES', 'F-METALES', 'F-SOLD', N'Taller de Soldadura', 3),
    ('FABRICA', 'F-MUEBLES', 'F-MUEBLES', 'F-INST', N'Instalacion de muebles', 1),
    ('FABRICA', 'F-MUEBLES', 'F-MUEBLES', 'F-SM', N'Puertas Madera', 2),
    ('FABRICA', 'F-MUEBLES', 'F-MUEBLES', 'F-TAP', N'Rodapie 18x115', 3),
    ('FABRICA', 'F-PREFA', 'F-PREFA', 'P-BETTON', N'Gastos Betton', 1),
    ('FABRICA', 'F-PREFA', 'F-PREFA', 'P-GENERAL', N'Gastos Generales', 2),
    ('FABRICA', 'F-PREFA', 'F-PREFA', 'P-TAPIAS', N'Gastos Tapia', 3)
    ) AS s (tipo_obra, grupo_works_no, grupo_codigo, codigo, nombre, orden)
    JOIN pro_obc.grupos_partida g
      ON g.tipo_obra = s.tipo_obra AND g.bc_works_no = s.grupo_works_no AND g.codigo = s.grupo_codigo
) AS s
   ON d.grupo_id = s.grupo_id AND d.codigo = s.codigo
WHEN MATCHED THEN UPDATE SET d.nombre = s.nombre, d.orden = s.orden, d.bc_task_no = s.codigo
WHEN NOT MATCHED THEN INSERT (codigo, nombre, grupo_id, orden, activo, bc_task_no, creado_en)
     VALUES (s.codigo, s.nombre, s.grupo_id, s.orden, 1, s.codigo, SYSUTCDATETIME());
GO

/* ---------------------------------------------------------------------------
   6) Verificación
   --------------------------------------------------------------------------- */
-- Esperado: VIVIENDA 4/20/95 · INFRA 13/40/0 · ADMIN 24/81/0 · FABRICA 29/77/0 ·
-- TORRES 0/0/0 (vacío a propósito).
SELECT t.letra, t.codigo AS tipo_obra, t.nombre, t.termino_grupo, t.genero,
       COUNT(DISTINCT g.id) AS grupos,
       COUNT(DISTINCT p.id) AS partidas,
       COUNT(DISTINCT sp.id) AS subpartidas
FROM pro_obc.tipos_obra t
LEFT JOIN pro_obc.grupos_partida g ON g.tipo_obra = t.codigo
LEFT JOIN pro_obc.partidas p       ON p.grupo_id = g.id
LEFT JOIN pro_obc.sub_partidas sp  ON sp.partida_id = p.id
GROUP BY t.letra, t.codigo, t.nombre, t.termino_grupo, t.genero, t.orden
ORDER BY t.orden;
GO

-- Ninguna partida debe quedar sin su puente a BC, y ningún grupo de vivienda/infra
-- sin capítulo. (Las partidas creadas a mano después SÍ pueden tener bc_task_no
-- propio: se guarda igual al código.)
SELECT
    (SELECT COUNT(*) FROM pro_obc.partidas WHERE bc_task_no IS NULL) AS partidas_sin_bc_task_no,
    (SELECT COUNT(*) FROM pro_obc.grupos_partida WHERE bc_task_no IS NULL AND tipo_obra IN ('VIVIENDA','INFRA')) AS grupos_vi_sin_bc_task_no,
    (SELECT COUNT(*) FROM pro_obc.grupos_partida WHERE bc_works_no IS NULL) AS grupos_compartidos,
    (SELECT COUNT(*) FROM pro_obc.grupos_partida WHERE bc_works_no IS NOT NULL) AS grupos_por_obra;
GO
