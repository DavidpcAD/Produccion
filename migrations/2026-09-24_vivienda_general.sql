/* ============================================================================
   VIVIENDA se parte en DOS: "Vivienda Construcción" y "Vivienda General"

   POR QUÉ: hasta hoy "Obra Vivienda" era UN catálogo compartido —las 4 etapas de
   una casa: Gris, Acabados, Electromecánico, Extras— y ahí caían de rebote las
   obras GENERALES de cada residencial (GEN-BAR, GEN-ILIOS, GEN-NOVA), que en
   Business Central tienen área de costeo PRO VIVIENDA pero no son casas: son los
   materiales, la mano de obra y los servicios generales del proyecto.

   QUÉ HACE
   1. El tipo VIVIENDA pasa a llamarse "Vivienda Construcción" (letra C) — es el
      MISMO código, así que Avance, Pesos, Cuadrillas y el cruce del presupuesto
      siguen viendo exactamente el catálogo de casas de siempre.
   2. Agrega el tipo VIVIENDA_GEN "Vivienda General" (letra G, orden 2). Su
      catálogo es POR OBRA (grupos_partida.bc_works_no), como administrativas y
      fábrica, y se lee igual que ellas:
        · la OBRA es el nivel de arriba (GEN-BAR "Generales Barani")
        · el ÁREA es la obra otra vez, porque BC no tiene líneas "Total" acá
        · la PARTIDA es la tarea Auxiliar de BC (GEN-MAT, GEN-MO, GEN-SERV…)
        · la SUBPARTIDA es la misma partida: espejo `<partida>.1`
      Es la misma forma que ya tiene, por ejemplo, COM-FORM → FORM-GEN → FORM-GEN.1.
   3. Siembra ese catálogo con lo que HOY tiene BC **Production** (workLines del
      API adelante/construction, versión "NO", líneas de venta y costo; el bucket
      de indirectos G-GEN "Gastos Generales" no es estructura y queda fuera):
        GEN-BAR   3 partidas · GEN-ILIOS 3 partidas · GEN-NOVA 6 partidas
        Total: 3 áreas · 12 partidas · 12 subpartidas espejo.
   4. Marca esas tres obras con dbo.Obra.tipoObra = 'VIVIENDA_GEN'. Con el tipo
      puesto manda lo elegido y ya no se deduce del área de costeo.

   Las HO-* (Homes) NO se tocan: siguen deduciéndose como vivienda.

   Idempotente: solo inserta/actualiza lo que falta, no borra ni mueve nada.
   Va en LAS DOS bases (h4 y dbo.Obra viven juntos en cada una):

     node scripts/aplicar-sql.mjs migrations/2026-09-24_vivienda_general.sql --confirm
     node scripts/aplicar-sql.mjs migrations/2026-09-24_vivienda_general.sql --destino=AdelantePRO --confirm --si-es-produccion

   DESHACER: UPDATE dbo.Obra SET tipoObra = NULL WHERE numeroObra LIKE 'GEN-%';
   borrar sub_partidas → partidas → grupos_partida de tipo_obra = 'VIVIENDA_GEN',
   la fila VIVIENDA_GEN de h4.tipos_obra, y devolverle a VIVIENDA su nombre
   ("Obra Vivienda") y su letra ('O').
   ============================================================================ */

/* ---------------------------------------------------------------------------
   1) Los dos tipos de vivienda
   --------------------------------------------------------------------------- */
-- La letra es UNIQUE: primero se libera la 'O' y después se usa la 'G'.
UPDATE h4.tipos_obra
   SET nombre = N'Vivienda Construcción', letra = 'C'
 WHERE codigo = 'VIVIENDA' AND (nombre <> N'Vivienda Construcción' OR letra <> 'C');
GO

MERGE h4.tipos_obra AS d
USING (VALUES
    ('VIVIENDA_GEN', 'G', N'Vivienda General', N'Área', N'Áreas', 'F', 0, 0, 2)
) AS s (codigo, letra, nombre, termino_grupo, termino_grupo_pl, genero, usa_sprints, usa_tipos_casa, orden)
   ON d.codigo = s.codigo
WHEN MATCHED THEN UPDATE SET
    d.letra = s.letra, d.nombre = s.nombre, d.termino_grupo = s.termino_grupo,
    d.termino_grupo_pl = s.termino_grupo_pl, d.genero = s.genero, d.usa_sprints = s.usa_sprints,
    d.usa_tipos_casa = s.usa_tipos_casa, d.orden = s.orden, d.activo = 1
WHEN NOT MATCHED THEN INSERT (codigo, letra, nombre, termino_grupo, termino_grupo_pl, genero, usa_sprints, usa_tipos_casa, orden, activo, creado_en)
     VALUES (s.codigo, s.letra, s.nombre, s.termino_grupo, s.termino_grupo_pl, s.genero, s.usa_sprints, s.usa_tipos_casa, s.orden, 1, SYSUTCDATETIME());
GO

-- General va pegada a Construcción; las demás corren una posición.
UPDATE h4.tipos_obra
   SET orden = CASE codigo
                 WHEN 'VIVIENDA'     THEN 1
                 WHEN 'VIVIENDA_GEN' THEN 2
                 WHEN 'INFRA'        THEN 3
                 WHEN 'ADMIN'        THEN 4
                 WHEN 'FABRICA'      THEN 5
                 WHEN 'TORRES'       THEN 6
                 WHEN 'POSTVENTA'    THEN 7
                 ELSE orden END
 WHERE codigo IN ('VIVIENDA','VIVIENDA_GEN','INFRA','ADMIN','FABRICA','TORRES','POSTVENTA');
GO

/* ---------------------------------------------------------------------------
   2) La estructura tal como está en BC Production (leída el 2026-09-24)
   --------------------------------------------------------------------------- */
DECLARE @src TABLE (
    obra       varchar(20)   NOT NULL,
    obra_nom   nvarchar(200) NOT NULL,
    part_cod   varchar(50)   NOT NULL,
    part_nom   nvarchar(200) NOT NULL,
    part_orden smallint      NOT NULL
);

INSERT INTO @src (obra, obra_nom, part_cod, part_nom, part_orden) VALUES
  ('GEN-BAR',   N'Generales Barani',  'GEN-MAT',   N'Materiales Generales', 1),
  ('GEN-BAR',   N'Generales Barani',  'GEN-MO',    N'Mano de Obra General', 2),
  ('GEN-BAR',   N'Generales Barani',  'GEN-SERV',  N'Servicios Generales',  3),
  ('GEN-ILIOS', N'Generales Ilios',   'GEN-MAT',   N'Materiales Generales', 1),
  ('GEN-ILIOS', N'Generales Ilios',   'GEN-MO',    N'Mano de Obra General', 2),
  ('GEN-ILIOS', N'Generales Ilios',   'GEN-SERV',  N'Servicios Generales',  3),
  ('GEN-NOVA',  N'Generales Novarum', 'GEN-BOD',   N'Bodega Nueva Diesel',  1),
  ('GEN-NOVA',  N'Generales Novarum', 'GEN-COMED', N'Construcción Comedor', 2),
  ('GEN-NOVA',  N'Generales Novarum', 'GEN-MAT',   N'Materiales Generales', 3),
  ('GEN-NOVA',  N'Generales Novarum', 'GEN-MO',    N'Mano de Obra General', 4),
  ('GEN-NOVA',  N'Generales Novarum', 'GEN-MURO',  N'Muro de Retención Tercera Etapa', 5),
  ('GEN-NOVA',  N'Generales Novarum', 'GEN-SERV',  N'Servicios Generales',  6);

/* 2.1) El área: una por obra, con el código de la obra. Sin bc_task_no, porque
        estas obras no tienen líneas "Total" en BC — es el mismo caso de SSCC,
        HER o COM-FORM en administrativas. El nombre sale de dbo.Obra (igual que
        lo arma "Traer de BC") y, si la obra no estuviera, del literal de arriba. */
INSERT INTO h4.grupos_partida (codigo, nombre, tipo_obra, orden, activo, creado_en, bc_works_no, bc_task_no)
SELECT s.obra,
       COALESCE(NULLIF(LTRIM(RTRIM(o.descripcion)), ''), NULLIF(LTRIM(RTRIM(o.nombreMostrado)), ''), s.obra_nom),
       'VIVIENDA_GEN',
       ROW_NUMBER() OVER (ORDER BY s.obra),
       1, SYSUTCDATETIME(), s.obra, NULL
FROM (SELECT DISTINCT obra, obra_nom FROM @src) s
LEFT JOIN dbo.Obra o ON o.numeroObra = s.obra
WHERE NOT EXISTS (
    SELECT 1 FROM h4.grupos_partida g
    WHERE g.tipo_obra = 'VIVIENDA_GEN' AND g.bc_works_no = s.obra AND g.codigo = s.obra);

/* 2.2) Las partidas: las tareas Auxiliar de BC. */
INSERT INTO h4.partidas (codigo, nombre, grupo_id, orden, activo, bc_task_no, creado_en)
SELECT s.part_cod, s.part_nom, g.id, s.part_orden, 1, s.part_cod, SYSUTCDATETIME()
FROM @src s
JOIN h4.grupos_partida g
  ON g.tipo_obra = 'VIVIENDA_GEN' AND g.bc_works_no = s.obra AND g.codigo = s.obra
WHERE NOT EXISTS (
    SELECT 1 FROM h4.partidas p
    JOIN h4.grupos_partida g2 ON g2.id = p.grupo_id
    WHERE g2.tipo_obra = 'VIVIENDA_GEN' AND g2.bc_works_no = s.obra AND p.codigo = s.part_cod);

/* 2.3) La subpartida ES la partida: espejo `<partida>.1` con el mismo nombre.
        Solo para la partida que no tenga ninguna, que es la misma regla que aplica
        "Traer de BC" (lib/partidas/sync-estructura.ts → espejoDeLaPartida). */
INSERT INTO h4.sub_partidas (codigo, nombre, partida_id, sprint_numero, es_critica, activo, creado_en)
SELECT LEFT(p.codigo + '.1', 50), p.nombre, p.id, NULL, 0, 1, SYSUTCDATETIME()
FROM h4.partidas p
JOIN h4.grupos_partida g ON g.id = p.grupo_id
WHERE g.tipo_obra = 'VIVIENDA_GEN'
  AND NOT EXISTS (SELECT 1 FROM h4.sub_partidas sp WHERE sp.partida_id = p.id);
GO

/* ---------------------------------------------------------------------------
   3) Las tres obras pasan al tipo nuevo
   --------------------------------------------------------------------------- */
UPDATE dbo.Obra
   SET tipoObra = 'VIVIENDA_GEN',
       fechaModificacion = SYSUTCDATETIME(),
       modificadoPor = 'migracion-vivienda-general'
WHERE numeroObra IN ('GEN-BAR', 'GEN-ILIOS', 'GEN-NOVA')
  AND ISNULL(tipoObra, '') <> 'VIVIENDA_GEN';
GO

/* ---------------------------------------------------------------------------
   Verificación
   --------------------------------------------------------------------------- */
SELECT codigo, letra, nombre, termino_grupo, orden, activo
FROM h4.tipos_obra ORDER BY orden;
GO

SELECT g.bc_works_no AS obra, g.codigo AS area, g.nombre AS area_nombre,
       p.codigo AS partida, p.nombre AS partida_nombre, sp.codigo AS subpartida
FROM h4.grupos_partida g
LEFT JOIN h4.partidas p      ON p.grupo_id = g.id AND p.activo = 1
LEFT JOIN h4.sub_partidas sp ON sp.partida_id = p.id AND sp.activo = 1
WHERE g.tipo_obra = 'VIVIENDA_GEN'
ORDER BY g.bc_works_no, p.orden;
GO

SELECT numeroObra, nombreMostrado, areaCosteo, tipoObra
FROM dbo.Obra WHERE numeroObra LIKE 'GEN-%' ORDER BY numeroObra;
GO
