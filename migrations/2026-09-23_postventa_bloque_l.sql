/* ============================================================================
   PV-NOVARUM: el BLOQUE L, que en BC no tiene tarea padre

   POR QUÉ: en Business Central las casas VN-L.05, VN-L.15, VN-L.33 y VN-L.52
   existen, pero NO hay línea "Total" VN-L arriba de ellas (todos los demás
   bloques sí la tienen: VN-A…VN-K, VN-M). Al traer la estructura quedaron
   pegadas al BLOQUE K, que es el Total que tenían encima en BC. No son de K.

   QUÉ HACE
   1. Crea la etapa VN-L "BLOQUE L" en el catálogo de PV-NOVARUM, entre K y M.
      Va SIN `bc_task_no`: no es un puente a BC, porque BC no tiene esa tarea —
      en la pantalla se ve sin el chip "BC", que es justo lo que pasa.
      El nombre sale del patrón de sus hermanos (VN-A "BLOQUE A"… → VN-L
      "BLOQUE L"), que es la misma regla que ahora aplica "Traer de BC"
      (lib/partidas/tipos-obra.ts → nombreDeCapituloFaltante).
   2. Mueve las 4 casas VN-L.* de BLOQUE K a BLOQUE L. Sus subpartidas espejo se
      van con ellas: cuelgan de la partida, no del grupo.

   Nada referencia todavía a estas partidas (el catálogo de postventa se sembró
   hoy), así que mover es seguro. "Traer de BC" no las devuelve a K: el motor
   busca la partida por código en TODA la obra y solo le refresca el nombre.

   Idempotente. Aplicar sobre AdelanteSBX (donde vive pro_obc, también para
   producción):

     node scripts/aplicar-sql.mjs migrations/2026-09-23_postventa_bloque_l.sql --confirm

   DESHACER: mover las 4 partidas de vuelta al grupo VN-K y borrar VN-L.
   ============================================================================ */

-- 1) La etapa VN-L, entre BLOQUE K (12) y BLOQUE M (que pasa a 14).
UPDATE pro_obc.grupos_partida
   SET orden = 14
WHERE tipo_obra = 'POSTVENTA' AND bc_works_no = 'PV-NOVARUM' AND codigo = 'VN-M' AND orden <> 14;

INSERT INTO pro_obc.grupos_partida (codigo, nombre, tipo_obra, orden, activo, creado_en, bc_works_no, bc_task_no)
SELECT 'VN-L', N'BLOQUE L', 'POSTVENTA', 13, 1, SYSUTCDATETIME(), 'PV-NOVARUM', NULL
WHERE NOT EXISTS (
    SELECT 1 FROM pro_obc.grupos_partida
    WHERE tipo_obra = 'POSTVENTA' AND bc_works_no = 'PV-NOVARUM' AND codigo = 'VN-L');
GO

-- 2) Las casas VN-L.* se van al BLOQUE L, numeradas 1..n por código.
WITH destino AS (
    SELECT id FROM pro_obc.grupos_partida
    WHERE tipo_obra = 'POSTVENTA' AND bc_works_no = 'PV-NOVARUM' AND codigo = 'VN-L'
),
mover AS (
    SELECT p.id, ROW_NUMBER() OVER (ORDER BY p.codigo) AS nuevo_orden
    FROM pro_obc.partidas p
    JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
    WHERE g.tipo_obra = 'POSTVENTA' AND g.bc_works_no = 'PV-NOVARUM'
      AND p.codigo LIKE 'VN-L.%'
      AND g.codigo <> 'VN-L'
)
UPDATE p
   SET p.grupo_id = (SELECT id FROM destino),
       p.orden    = m.nuevo_orden
FROM pro_obc.partidas p
JOIN mover m ON m.id = p.id;
GO

-- Verificación: los bloques de PV-NOVARUM alrededor de la L, y dónde quedaron
-- las 4 casas con su subpartida.
SELECT g.codigo, g.nombre, g.orden, g.bc_task_no,
       COUNT(DISTINCT p.id)  AS partidas,
       COUNT(DISTINCT sp.id) AS subpartidas
FROM pro_obc.grupos_partida g
LEFT JOIN pro_obc.partidas p      ON p.grupo_id = g.id AND p.activo = 1
LEFT JOIN pro_obc.sub_partidas sp ON sp.partida_id = p.id AND sp.activo = 1
WHERE g.tipo_obra = 'POSTVENTA' AND g.bc_works_no = 'PV-NOVARUM'
  AND g.codigo IN ('VN-K', 'VN-L', 'VN-M')
GROUP BY g.codigo, g.nombre, g.orden, g.bc_task_no
ORDER BY g.orden;

SELECT g.codigo AS etapa, p.codigo AS partida, p.orden, sp.codigo AS subpartida
FROM pro_obc.partidas p
JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
LEFT JOIN pro_obc.sub_partidas sp ON sp.partida_id = p.id
WHERE g.tipo_obra = 'POSTVENTA' AND g.bc_works_no = 'PV-NOVARUM' AND p.codigo LIKE 'VN-L.%'
ORDER BY p.codigo;
GO
