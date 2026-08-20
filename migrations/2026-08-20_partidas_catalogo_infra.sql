/* ============================================================================
   Catálogo de partidas por TIPO DE OBRA + catálogo de INFRAESTRUCTURA.

   POR QUÉ: `pro_obc` tenía UN solo catálogo (4 grupos / 20 partidas / 95
   subpartidas) y todo era de vivienda, así que la pantalla de Partidas solo podía
   mostrar casas. Se agrega `tipo_obra` al grupo —las 4 filas actuales quedan
   VIVIENDA, nada de lo existente cambia— y se siembra el catálogo de
   infraestructura tal cual la plantilla oficial "Plantilla_ Infra HDA_II"
   (hoja VentaAD, que es la más completa: la de Coste no trae 3.7 Pozo Potable).

   Los 13 capítulos de la plantilla entran como GRUPOS y sus 40 partidas como
   PARTIDAS — igual que en vivienda, donde el capítulo de BC "1 Obra Gris" es el
   grupo `gris` y "1.1 Fundaciones" es la partida. Sin subpartidas: esas son el
   desglose fino que solo usa Avance y se agregan cuando se ocupen.

   OJO con los códigos: infraestructura repite códigos de vivienda (1.1, 2.1,
   3.1…). No hay índice único sobre `codigo` en la tabla, y las validaciones de
   /api/partidas pasan a ser únicas POR TIPO DE OBRA, no globales.

   Idempotente: se puede correr varias veces. Keyed por (tipo_obra, codigo).
   Aplicar sobre AdelanteSBX (hoy es la base que lee el app, incluso en prod).
   ============================================================================ */

-- 1) tipo_obra en el grupo. Default VIVIENDA para no mover nada de lo actual.
IF COL_LENGTH('pro_obc.grupos_partida', 'tipo_obra') IS NULL
BEGIN
    ALTER TABLE pro_obc.grupos_partida
        ADD tipo_obra varchar(20) NOT NULL CONSTRAINT DF_grupos_partida_tipo_obra DEFAULT 'VIVIENDA';
END
GO

-- Los 4 grupos que ya existían son de vivienda (por si la columna se agregó antes
-- de este script y quedó algo en blanco).
UPDATE pro_obc.grupos_partida SET tipo_obra = 'VIVIENDA'
WHERE tipo_obra IS NULL OR LTRIM(RTRIM(tipo_obra)) = '';
GO

-- Un mismo código de grupo puede repetirse entre tipos de obra, pero no DENTRO
-- del mismo tipo.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_grupos_partida_tipo_codigo'
               AND object_id = OBJECT_ID('pro_obc.grupos_partida'))
BEGIN
    CREATE UNIQUE INDEX UX_grupos_partida_tipo_codigo
        ON pro_obc.grupos_partida (tipo_obra, codigo);
END
GO

-- 2) Los 13 capítulos de la plantilla de infraestructura, como grupos.
--    `orden` = número de capítulo (1..13), que es el orden de la plantilla.
MERGE pro_obc.grupos_partida AS d
USING (VALUES
    ('mov-tierra', N'Movimiento de Tierra', 1),
    ('trab-temp', N'Trabajos Temporales', 2),
    ('agua-potable', N'Red de Agua Potable', 3),
    ('sanitario', N'Alcantarillado Sanitario', 4),
    ('pluvial', N'Alcantarillado Pluvial', 5),
    ('pavimento', N'Estructura de Pavimento', 6),
    ('confinamiento', N'Confinamiento de Calles', 7),
    ('electricas', N'Obras Eléctricas', 8),
    ('adicionales', N'Obras Adicionales', 9),
    ('planta-trat', N'Planta de Tratamiento', 10),
    ('caseta', N'Caseta de Acceso', 11),
    ('piscina', N'Piscina', 12),
    ('casa-club', N'Casa Club', 13)
) AS s (codigo, nombre, orden)
   ON d.tipo_obra = 'INFRA' AND d.codigo = s.codigo
WHEN MATCHED THEN UPDATE SET d.nombre = s.nombre, d.orden = s.orden
WHEN NOT MATCHED THEN INSERT (codigo, nombre, orden, activo, tipo_obra)
     VALUES (s.codigo, s.nombre, s.orden, 1, 'INFRA');
GO

-- 3) Las 40 partidas, colgadas de su capítulo por el prefijo del código (3.4 -> 3).
MERGE pro_obc.partidas AS d
USING (
    SELECT s.codigo, s.nombre, g.id AS grupo_id, s.orden
    FROM (VALUES
        ('1.1', N'Movimiento de Tierra General', 1, 1),
        ('1.2', N'Conformacion de terreno', 1, 2),
        ('1.3', N'Conformacion de terrazas', 1, 3),
        ('2.1', N'Bodega', 2, 4),
        ('2.2', N'Cerramiento Temporal', 2, 5),
        ('3.1', N'Tubería Potable 150mm (6")', 3, 6),
        ('3.2', N'Prevista de Polietileno 1/2"', 3, 7),
        ('3.3', N'Válvula de 150mm', 3, 8),
        ('3.4', N'Hidrante + Válvula', 3, 9),
        ('3.5', N'Accesorios', 3, 10),
        ('3.6', N'Bomba y Equipo', 3, 11),
        ('3.7', N'Pozo Potable', 3, 12),
        ('4.1', N'Tubería Sanitaria 200mm', 4, 13),
        ('4.2', N'Prevista Sanitaria 100mm', 4, 14),
        ('4.3', N'Pozo Sanitario 0-1m', 4, 15),
        ('5.1', N'Tubería Pluvial', 5, 16),
        ('5.2', N'Pozo de Registro Pluvial', 5, 17),
        ('5.3', N'Tragante Doble', 5, 18),
        ('5.4', N'Laguna de retardo', 5, 19),
        ('6.1', N'Conformación de Sub Rasante', 6, 20),
        ('6.2', N'Sub Base Granular Lastre 20cm', 6, 21),
        ('6.3', N'Base Granular 15cm', 6, 22),
        ('6.4', N'Superficie de Rodamiento', 6, 23),
        ('7.1', N'Cordón y Caño', 7, 24),
        ('7.2', N'Bordillo', 7, 25),
        ('8.1', N'Media Tensión', 8, 26),
        ('9.1', N'Tapia Frontal', 9, 27),
        ('9.2', N'Tapia Perimetral', 9, 28),
        ('9.3', N'Limpieza general', 9, 29),
        ('9.4', N'Oficina, contenedor', 9, 30),
        ('9.5', N'Muro de contención', 9, 31),
        ('10.1', N'Obra Gris PT', 10, 32),
        ('10.2', N'Equipamiento PT', 10, 33),
        ('11.1', N'Obra Gris Caseta', 11, 34),
        ('11.2', N'Acabados Caseta', 11, 35),
        ('11.3', N'Equipamiento Caseta', 11, 36),
        ('12.1', N'Excavación y conformación de terreno', 12, 37),
        ('12.2', N'Obra gris piscina', 12, 38),
        ('13.1', N'Obra gris casa club', 13, 39),
        ('13.2', N'Acabados casa club', 13, 40)
    ) AS s (codigo, nombre, capitulo, orden)
    JOIN pro_obc.grupos_partida g
      ON g.tipo_obra = 'INFRA' AND g.orden = s.capitulo
) AS s
   ON d.codigo = s.codigo AND d.grupo_id = s.grupo_id
WHEN MATCHED THEN UPDATE SET d.nombre = s.nombre, d.orden = s.orden
WHEN NOT MATCHED THEN INSERT (codigo, nombre, grupo_id, orden, activo)
     VALUES (s.codigo, s.nombre, s.grupo_id, s.orden, 1);
GO

-- 4) Verificación: 13 grupos y 40 partidas de INFRA, y vivienda intacta (4 / 20).
SELECT g.tipo_obra, COUNT(DISTINCT g.id) AS grupos, COUNT(p.id) AS partidas
FROM pro_obc.grupos_partida g
LEFT JOIN pro_obc.partidas p ON p.grupo_id = g.id
GROUP BY g.tipo_obra
ORDER BY g.tipo_obra;
GO
