/* ============================================================================
   F-MUEBLES: la partida es la OBRA (la casa) y las subpartidas son los procesos

   POR QUÉ: corrige lo que se hizo el mismo día en
   `2026-09-17_subpartidas_fabrica.sql`, donde los 29 procesos quedaron colgando
   de las 3 partidas que F-MUEBLES trae de BC (Puertas Madera, Rodapié,
   Instalación de muebles). Esas son productos, no obras. El usuario lo aclaró:
   en muebles la partida es la obra de vivienda —las que están en BC con área de
   costeo PRO VIVIENDA / PRO LOTES— y los procesos van abajo, en subpartidas.

   QUÉ HACE
     1. Borra las 87 subpartidas que habían quedado bajo F-SM / F-TAP / F-INST.
        Las 3 partidas NO se tocan: son de BC y siguen igual.
     2. Crea una partida por obra de vivienda viva (200: todo lo que resuelve a
        VIVIENDA y no está Blocked en AdelantePRO.dbo.Obra al 2026-09-17), con
        `bc_task_no` NULL. No se toca BC.
     3. Cuelga los 29 procesos de cada una de esas 200 → 5.800 subpartidas.

   LA LISTA VA ESCRITA, no leída de AdelantePRO: pro_obc vive en AdelanteSBX y el
   cruce entre bases no es confiable acá (ver el bug de Cuadrillas). Así la
   migración es reproducible y se audita leyéndola. Las obras nuevas que entren
   después hay que agregarlas a mano (o volver a generar esta lista).

   OJO CON EL TAMAÑO: la pestaña Fábrica de /partidas trae todas las subpartidas
   del tipo de una sola vez. Con esto pasa de 133 a ~5.850 filas por carga.

   NO SON CASAS pero entraron por ser PRO VIVIENDA: GEN-BAR, GEN-ILIOS y
   GEN-NOVA (gastos generales). Si estorban, `activo = 0` y desaparecen del árbol.

   Idempotente: keyed por código; corrido dos veces no hace nada.
   Aplicar sobre AdelanteSBX (donde vive pro_obc, también para producción).

   DESHACER (borra partidas de obra y sus procesos; deja intactas las 3 de BC):
     DELETE s FROM pro_obc.sub_partidas s
       JOIN pro_obc.partidas p ON p.id = s.partida_id
       JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
       WHERE g.bc_works_no = 'F-MUEBLES' AND p.bc_task_no IS NULL;
     DELETE p FROM pro_obc.partidas p
       JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
       WHERE g.bc_works_no = 'F-MUEBLES' AND p.bc_task_no IS NULL;
   ============================================================================ */

-- ---------------------------------------------------------------------------
-- 1) Fuera los 29 procesos que colgaban de las partidas de producto de BC.
-- ---------------------------------------------------------------------------
DELETE s
FROM pro_obc.sub_partidas s
JOIN pro_obc.partidas p ON p.id = s.partida_id
JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
WHERE g.bc_works_no = 'F-MUEBLES'
  AND p.bc_task_no IS NOT NULL;
GO

-- ---------------------------------------------------------------------------
-- 2) Una partida por obra de vivienda.
-- ---------------------------------------------------------------------------
DECLARE @obras TABLE (codigo VARCHAR(50), nombre NVARCHAR(200), orden INT IDENTITY(1,1));
INSERT INTO @obras (codigo, nombre) VALUES
    ('GEN-BAR', N'GEN-BAR Generales Barani'),
    ('GEN-ILIOS', N'GEN-ILIOS Generales Ilios'),
    ('GEN-NOVA', N'GEN-NOVA Generales Novarum'),
    ('HO-CEDERIC', N'HO-CEDERIC Homes'),
    ('HO-COOPER', N'HO-COOPER'),
    ('HO-MALAVAS', N'HO-MALAVAS Homes'),
    ('PV-BARANI', N'PV-BARANI Post Venta Barani'),
    ('PV-ILIOS', N'PV-ILIOS Post Venta Ilios'),
    ('PV-NOVARUM', N'PV-NOVARUM Post Venta Novarum'),
    ('VB-1.02', N'VB-1.02 Santorini Especial'),
    ('VB-1.03', N'VB-1.03 Santorini Azotea'),
    ('VB-1.04', N'VB-1.04 Santorini Azotea Ampliada'),
    ('VB-1.05', N'VB-1.05 Santorini Azotea'),
    ('VB-1.17', N'VB-1.17 Estella Especial Techo'),
    ('VB-1.19', N'VB-1.19'),
    ('VB-2.02', N'VB-2.02'),
    ('VB-2.20', N'VB-2.20 Santorini Azotea'),
    ('VB-5.01', N'VB-5.01'),
    ('VB-5.12', N'VB-5.12 Santorini Az'),
    ('VB-5.13', N'VB-5.13'),
    ('VB-5.14', N'VB-5.14 Estella Az'),
    ('VB-5.15', N'VB-5.15 Estella Techo'),
    ('VB-5.16', N'VB-5.16'),
    ('VB-5.17', N'VB-5.17'),
    ('VB-5.22', N'VB-5.22 Zante Az'),
    ('VB-5.23', N'VB-5.23 Gyro Az'),
    ('VB-6.01', N'VB-6.01'),
    ('VB-6.02', N'VB-6.02 Santorini Az'),
    ('VB-6.03', N'VB-6.03 Santorini Azotea'),
    ('VB-6.07', N'VB-6.07 Tebas Azotea'),
    ('VB-6.08', N'VB-6.08 Caspe Azotea'),
    ('VB-6.24', N'VB-6.24 Santorini Azotea'),
    ('VB-6.26', N'VB-6.26 Santorini Azotea'),
    ('VC-D.01', N'VC-D.01 Avila'),
    ('VC-F.01', N'VC-F.01 Toledo'),
    ('VC-F.02', N'VC-F.02 TOLEDO SD 2B WC'),
    ('VC-F.03', N'VC-F.03 Toledo'),
    ('VC-F.10', N'VC-F.10 SALAMANCA 3D 2.5B WC (PA)'),
    ('VC-F.13', N'VC-F.13 Burgos'),
    ('VC-F.14', N'VC-F.14 Burgos'),
    ('VC-F.15', N'VC-F.15 Toledo'),
    ('VC-F.16', N'VC-F.16 Toledo'),
    ('VC-F.17', N'VC-F.17 Burgos'),
    ('VI-11.22', N'VI-11.22'),
    ('VI-13.58', N'VI-13.58'),
    ('VI-14.52', N'VI-14.52'),
    ('VI-16.03', N'VI-16.03'),
    ('VN-A.06', N'VN-A.06 Santorini Especial'),
    ('VN-A.07', N'VN-A.07 Santorini Azotea'),
    ('VN-A.10', N'VN-A.10'),
    ('VN-A.12', N'VN-A.12 Santorini Azotea'),
    ('VN-B.11', N'VN-B.11 Zante Azotea'),
    ('VN-B.14', N'VN-B.14 Kora Azotea'),
    ('VN-B.21', N'VN-B.21 Estella Azotea'),
    ('VN-B.22', N'VN-B.22 Estella 3D 2.5B Az'),
    ('VN-B.24', N'VN-B.24 Stella A 2D 1.5B (PA)'),
    ('VN-B.30', N'VN-B.30 Santorini Azotea'),
    ('VN-B.33', N'VN-B.33 Estella Azotea'),
    ('VN-C.01', N'VN-C.01 Zante Az'),
    ('VN-C.03', N'VN-C.03 Estella Az'),
    ('VN-C.08', N'VN-C.08 Estella Azotea'),
    ('VN-C.10', N'VN-C.10 Estella Techo'),
    ('VN-C.17', N'VN-C.17 Zante Az'),
    ('VN-C.22', N'VN-C.22 Zante Azotea'),
    ('VN-C.25', N'VN-C.25 Estella'),
    ('VN-D.14', N'VN-D.14 Ikaria Techo'),
    ('VN-D.15', N'VN-D.15 Estella Az'),
    ('VN-D.16', N'VN-D.16 Ikaria Techo'),
    ('VN-D.17', N'VN-D.17 Ikaria Azotea'),
    ('VN-D.19', N'VN-D.19 Milo Techo'),
    ('VN-D.21', N'VN-D.21 Ikaria Azotea'),
    ('VN-D.22', N'VN-D.22 Milo Azotea'),
    ('VN-F.15', N'VN-F.15 Milo'),
    ('VN-F.16', N'VN-F.16 Tebas'),
    ('VN-F.18', N'VN-F.18 Ikaria Az'),
    ('VN-F.21', N'VN-F.21 Tebas Techo'),
    ('VN-F.22', N'VN-F.22 Milo Techo'),
    ('VN-I.01', N'VN-I.01'),
    ('VN-I.02', N'VN-I.02 Zante Techo'),
    ('VN-I.04', N'VN-I.04 Estella Az'),
    ('VN-I.06', N'VN-I.06 Milo Techo'),
    ('VN-I.11', N'VN-I.11 Zante Az'),
    ('VN-I.13', N'VN-I.13 Zante'),
    ('VN-I.16', N'VN-I.16 Milo'),
    ('VN-I.17', N'VN-I.17 Santorini Azotea'),
    ('VN-I.19', N'VN-I.19 Santorini Azotea'),
    ('VN-I.25', N'VN-I.25 Stellita A 2D 1.5B WC'),
    ('VN-I.30', N'VN-I.30 Stella Az'),
    ('VN-I.31', N'VN-I.31 Zante Azotea'),
    ('VN-I.32', N'VN-I.32 Kora Azotea'),
    ('VN-I.33', N'VN-I.33 Fiora Azotea'),
    ('VN-I.36', N'VN-I.36 STELLA 3D 3.5B WC (PAB)'),
    ('VN-I.37', N'VN-I.37 Santorini Az'),
    ('VN-I.38', N'VN-I.38 Santorini Az'),
    ('VN-I.39', N'VN-I.39'),
    ('VN-I.40', N'VN-I.40 Santorini Azotea'),
    ('VN-J.04', N'VN-J.04 Santorini  Azotea'),
    ('VN-J.28', N'VN-J.28 Zante Azotea'),
    ('VN-J.31', N'VN-J.31 Estella 1D PA Techo'),
    ('VN-J.33', N'VN-J.33 Stella Az'),
    ('VN-J.35', N'VN-J.35 Estella Azotea'),
    ('VN-K.01', N'VN-K.01 Tebas Azotea'),
    ('VN-K.02', N'VN-K.02 Tebas Azotea'),
    ('VN-K.03', N'VN-K.03 Tebas'),
    ('VN-K.04', N'VN-K.04 Tebas Az'),
    ('VN-K.05', N'VN-K.05 Santorini 5D Azotea'),
    ('VN-K.06', N'VN-K.06 Santorini Az'),
    ('VN-K.07', N'VN-K.07 Santorini Azotea'),
    ('VN-K.08', N'VN-K.08 Santorini Azotea'),
    ('VN-K.09', N'VN-K.09 Neo Tripoli T 3D 2B WC'),
    ('VN-K.10', N'VN-K.10 Zante Az'),
    ('VN-K.11', N'VN-K.11 Zante Azotea'),
    ('VN-K.12', N'VN-K.12 Neo Tripoli A 3D 2B WC'),
    ('VN-K.13', N'VN-K.13 Ikaria'),
    ('VN-K.14', N'VN-K.14 Neotripoli Az'),
    ('VN-K.15', N'VN-K.15 Zante Az'),
    ('VN-K.16', N'VN-K.16 Gyro Az'),
    ('VN-K.17', N'VN-K.17 Tebas Azotea'),
    ('VN-K.18', N'VN-K.18 Ikaria Techo'),
    ('VN-K.19', N'VN-K.19 Gyro Azotea'),
    ('VN-K.20', N'VN-K.20 Zante Azotea'),
    ('VN-K.22', N'VN-K.22 Stella Az'),
    ('VN-K.23', N'VN-K.23 Tebas Az'),
    ('VN-K.24', N'VN-K.24 Neotripoli Az'),
    ('VN-K.25', N'VN-K.25 Tebas Azotea'),
    ('VN-K.26', N'VN-K.26 Ikaria Az'),
    ('VN-K.27', N'VN-K.27 Santorini Azotea'),
    ('VN-L.01', N'VN-L.01 Estella 3D2.5B Az'),
    ('VN-L.02', N'VN-L.02 Neotripoli Azotea'),
    ('VN-L.03', N'VN-L.03 Ikaria Techo'),
    ('VN-L.04', N'VN-L.04'),
    ('VN-L.05', N'VN-L.05 Santorini Az'),
    ('VN-L.09', N'VN-L.09 Santorini Azotea'),
    ('VN-L.10', N'VN-L.10 Tebas Techo'),
    ('VN-L.11', N'VN-L.11 Neotripoli Az'),
    ('VN-L.12', N'VN-L.12'),
    ('VN-L.13', N'VN-L.13 Estella Azotea'),
    ('VN-L.14', N'VN-L.14 Gyro Azotea'),
    ('VN-L.15', N'VN-L.15 Ikaria Techo'),
    ('VN-L.16', N'VN-L.16 Milo Techo'),
    ('VN-L.18', N'VN-L.18'),
    ('VN-L.19', N'VN-L.19 Gyrini Techo'),
    ('VN-L.20', N'VN-L.20 Tebas Techo'),
    ('VN-L.21', N'VN-L.21 Tebas Azotea Especial'),
    ('VN-L.22', N'VN-L.22'),
    ('VN-L.23', N'VN-L.23 Ikaria Techo'),
    ('VN-L.24', N'VN-L.24'),
    ('VN-L.25', N'VN-L.25 Zante Azotea'),
    ('VN-L.27', N'VN-L.27 Tebas sin WC Az'),
    ('VN-L.28', N'VN-L.28'),
    ('VN-L.29', N'VN-L.29 Ikaria Azotea'),
    ('VN-L.30', N'VN-L.30 Zante Azotea'),
    ('VN-L.31', N'VN-L.31 Estella Azotea'),
    ('VN-L.32', N'VN-L.32 Milo Techo'),
    ('VN-L.33', N'VN-L.33 Tebas Especial'),
    ('VN-L.34', N'VN-L.34 Santorini Azotea'),
    ('VN-L.39', N'VN-L.39 Santorini Az'),
    ('VN-L.40', N'VN-L.40 Tebas 3D 2B WC Az'),
    ('VN-L.41', N'VN-L.41 Milo Techo'),
    ('VN-L.42', N'VN-L.42 Estella Techo'),
    ('VN-L.43', N'VN-L.43 Neotripoli Azotea'),
    ('VN-L.44', N'VN-L.44 Neotripoli Techo'),
    ('VN-L.45', N'VN-L.45 Zante Azotea'),
    ('VN-L.46', N'VN-L.46 Tebas Especial Azotea'),
    ('VN-L.47', N'VN-L.47 Tebas Azotea'),
    ('VN-L.48', N'VN-L.48 Estella Azotea'),
    ('VN-L.49', N'VN-L.49'),
    ('VN-L.50', N'VN-L.50 Tebas Techo'),
    ('VN-L.51', N'VN-L.51 Tebas Especial T'),
    ('VN-L.52', N'VN-L.52 Tebas Azotea'),
    ('VN-L.53', N'VN-L.53 Zante Azotea'),
    ('VN-L.54', N'VN-L.54 Ikaria Azotea'),
    ('VN-M.01', N'VN-M.01 Zante T 4D'),
    ('VN-M.02', N'VN-M.02 Tebas T 3D 2B WC'),
    ('VN-M.03', N'VN-M.03 Ikaria Azotea'),
    ('VN-M.04', N'VN-M.04 Tebas Az'),
    ('VN-M.05', N'VN-M.05 Santorini Azotea'),
    ('VN-M.06', N'VN-M.06 Santorini Azotea'),
    ('VN-M.07', N'VN-M.07 Santorini Azotea'),
    ('VN-M.08', N'VN-M.08 Santorini Azotea'),
    ('VN-M.09', N'VN-M.09'),
    ('VN-M.10', N'VN-M.10 Estella Az'),
    ('VN-M.11', N'VN-M.11 Ikaria Az'),
    ('VN-M.12', N'VN-M.12 Ikaria A 2D 2B WC'),
    ('VN-M.13', N'VN-M.13 Milo Techo'),
    ('VN-M.14', N'VN-M.14 Milo Techo'),
    ('VN-M.15', N'VN-M.15 Ikaria Az'),
    ('VN-M.16', N'VN-M.16 Estellita Techo'),
    ('VN-M.17', N'VN-M.17 Estella'),
    ('VN-M.18', N'VN-M.18 Milo Azotea'),
    ('VN-M.19', N'VN-M.19 Ikaria A 2D 2B WC'),
    ('VN-M.20', N'VN-M.20 Santorini'),
    ('VN-M.21', N'VN-M.21 Milo'),
    ('VN-M.22', N'VN-M.22 Stellita A 2D 1.5B WC'),
    ('VN-M.23', N'VN-M.23 Ikaria Az'),
    ('VN-M.24', N'VN-M.24 Estella Azotea'),
    ('VN-M.25', N'VN-M.25 Santorini Az'),
    ('VN-M.26', N'VN-M.26'),
    ('VN-M.27', N'VN-M.27'),
    ('VN-M.28', N'VN-M.28 Estella Azotea 2D1.5B L');

DECLARE @grupo INT = (
    SELECT TOP 1 id FROM pro_obc.grupos_partida
    WHERE tipo_obra = 'FABRICA' AND bc_works_no = 'F-MUEBLES' AND activo = 1
    ORDER BY id
);
IF @grupo IS NULL THROW 50000, 'No existe el grupo de F-MUEBLES en pro_obc.grupos_partida', 1;

INSERT INTO pro_obc.partidas (codigo, nombre, grupo_id, orden, activo, bc_task_no, creado_en)
SELECT o.codigo, o.nombre, @grupo, 10 + o.orden, 1, NULL, SYSUTCDATETIME()
FROM @obras o
WHERE NOT EXISTS (
    SELECT 1 FROM pro_obc.partidas p WHERE p.grupo_id = @grupo AND p.codigo = o.codigo
);
GO

-- ---------------------------------------------------------------------------
-- 3) Los 29 procesos en cada obra. "Conoce la obra" queda en `descripcion`,
--    tal como lo anotó el usuario (fabricación e instalación sí; acabado no).
-- ---------------------------------------------------------------------------
DECLARE @procesos TABLE (n INT, nombre NVARCHAR(150), conoce_obra BIT);
INSERT INTO @procesos (n, nombre, conoce_obra) VALUES
    ( 1, N'Medidas',                   1),
    ( 2, N'Corte',                     1),
    ( 3, N'Tapeteo',                   1),
    ( 4, N'Armado',                    1),
    ( 5, N'Lijado marco seguridad',    0),
    ( 6, N'Lijado guarnición',         0),
    ( 7, N'Lijado rodapié',            0),
    ( 8, N'Lijado puerta',             0),
    ( 9, N'Lijado tablilla teca',      0),
    (10, N'Lijado acanalado teca',     0),
    (11, N'Lijado accesorios teca',    0),
    (12, N'Lijado otros',              0),
    (13, N'Laqueo marco seguridad',    0),
    (14, N'Laqueo guarnición',         0),
    (15, N'Laqueo rodapié',            0),
    (16, N'Laqueo puerta',             0),
    (17, N'Laqueo tablilla teca',      0),
    (18, N'Laqueo acanalado teca',     0),
    (19, N'Laqueo accesorios teca',    0),
    (20, N'Laqueo otros',              0),
    (21, N'Inst. Puertas',             1),
    (22, N'Inst. rodapié',             1),
    (23, N'Inst. tablilla teca',       1),
    (24, N'Inst. acanalado teca',      1),
    (25, N'Inst. accesorios teca',     1),
    (26, N'Inst. otros',               1),
    (27, N'Detalle y maquillaje',      1),
    (28, N'Poncheo pre entrega',       1),
    (29, N'Poncheo post venta',        1);

INSERT INTO pro_obc.sub_partidas (codigo, nombre, partida_id, sprint_numero, es_critica, descripcion, activo)
SELECT
    p.codigo + '.' + RIGHT('0' + CAST(pr.n AS VARCHAR(2)), 2),
    pr.nombre,
    p.id,
    NULL,
    0,
    CASE WHEN pr.conoce_obra = 1 THEN N'Conoce la obra' ELSE NULL END,
    1
FROM pro_obc.partidas p
JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
CROSS JOIN @procesos pr
WHERE g.bc_works_no = 'F-MUEBLES'
  AND p.bc_task_no IS NULL          -- solo las partidas-obra; las 3 de BC no llevan procesos
  AND p.activo = 1
  AND NOT EXISTS (
      SELECT 1 FROM pro_obc.sub_partidas s
      WHERE s.partida_id = p.id
        AND s.codigo = p.codigo + '.' + RIGHT('0' + CAST(pr.n AS VARCHAR(2)), 2)
  );
GO

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
SELECT
    SUM(CASE WHEN p.bc_task_no IS NULL THEN 1 ELSE 0 END) AS partidas_obra,
    SUM(CASE WHEN p.bc_task_no IS NOT NULL THEN 1 ELSE 0 END) AS partidas_de_bc
FROM pro_obc.partidas p
JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
WHERE g.bc_works_no = 'F-MUEBLES';

SELECT COUNT(*) AS subpartidas_muebles
FROM pro_obc.sub_partidas s
JOIN pro_obc.partidas p ON p.id = s.partida_id
JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
WHERE g.bc_works_no = 'F-MUEBLES';

SELECT TOP 5 p.codigo AS partida, p.nombre, COUNT(s.id) AS procesos
FROM pro_obc.partidas p
JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
LEFT JOIN pro_obc.sub_partidas s ON s.partida_id = p.id
WHERE g.bc_works_no = 'F-MUEBLES' AND p.bc_task_no IS NULL
GROUP BY p.codigo, p.nombre ORDER BY p.codigo;
GO
