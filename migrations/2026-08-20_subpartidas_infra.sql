/* ============================================================================
   Subpartidas también en INFRAESTRUCTURA: `sprint_numero` pasa a ser opcional.

   POR QUÉ: `pro_obc.sub_partidas` nació 100% para vivienda, donde cada
   subpartida SIEMPRE cae en un sprint (es lo que consume Avance) y aplica a uno
   o más tipos de casa. Infraestructura no tiene ni sprints ni tipos de casa: sus
   partidas (3.1 Tubería Potable, 6.2 Sub Base Granular…) se desglosan igual pero
   el desglose no se planifica por sprint. Con la columna NOT NULL había que
   inventarle un sprint a cada subpartida de infra, así que la pantalla ni dejaba
   crearlas.

   QUÉ CAMBIA: `sprint_numero` admite NULL = "no aplica" (infra). Vivienda queda
   igual: las 95 subpartidas existentes conservan su sprint y /api/subpartidas
   sigue exigiéndolo cuando la partida es de vivienda.

   Las subpartidas de infra tampoco llevan filas en `sub_partida_tipos`, y TODAS
   las consultas de Avance hacen INNER JOIN contra esa tabla — así que quedan
   fuera de Avance por construcción, sin filtro extra.

   OJO con los códigos: como en partidas, infra repite los códigos de vivienda
   (1.1.1, 2.1.1…). No hay índice único sobre `codigo`; la validación de
   duplicados en /api/subpartidas pasa a ser POR TIPO DE OBRA, no global.

   Idempotente. Aplicar sobre AdelanteSBX (la base que lee el app, incluso prod).
   ============================================================================ */

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('pro_obc.sub_partidas')
      AND name = 'sprint_numero'
      AND is_nullable = 0
)
BEGIN
    ALTER TABLE pro_obc.sub_partidas ALTER COLUMN sprint_numero smallint NULL;
END
GO

-- Verificación: la columna queda nullable y ninguna subpartida de vivienda perdió
-- su sprint (deben seguir siendo 95 con sprint y 0 sin sprint).
SELECT c.is_nullable AS sprint_numero_nullable
FROM sys.columns c
WHERE c.object_id = OBJECT_ID('pro_obc.sub_partidas') AND c.name = 'sprint_numero';
GO

SELECT g.tipo_obra,
       COUNT(sp.id) AS subpartidas,
       SUM(CASE WHEN sp.sprint_numero IS NULL THEN 1 ELSE 0 END) AS sin_sprint
FROM pro_obc.grupos_partida g
JOIN pro_obc.partidas p ON p.grupo_id = g.id
JOIN pro_obc.sub_partidas sp ON sp.partida_id = p.id
GROUP BY g.tipo_obra
ORDER BY g.tipo_obra;
GO
