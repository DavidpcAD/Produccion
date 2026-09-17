/* ============================================================================
   Las 4 máquinas de F-MADERAS que no existen en BC: Canteadora, Recanteadora,
   Escuadradora y Chipeo

   POR QUÉ: están en la fábrica y en la lista del usuario, pero BC no las tiene
   como capítulo ni como tarea de F-MADERAS, así que el árbol de /partidas no las
   mostraba. Se crean SOLO EN SQL (bc_task_no NULL): no se toca BC.

   CÓMO QUEDAN: igual que las otras 14 máquinas — la máquina es la fila de arriba,
   su partida es la misma máquina y su subpartida también, que es la regla que
   pidió el usuario para maderas:

     FCAN Canteadora    → FCAN-01 Canteadora    → FCAN-01.1 Canteadora

   CÓDIGOS DE 4 LETRAS a propósito: los de BC en esta obra son de 2–3 (FAS, FED,
   FM, FPP…). Con 4 no chocan hoy ni cuando "Traer de BC" haga upsert por código
   (lib/partidas/sync-estructura.ts empareja por `codigo`), y de un vistazo se ve
   cuáles no son de BC. FES ya está tomado por la Encoladora Simple.

   Idempotente: keyed por código; corrido dos veces no hace nada.
   Aplicar sobre AdelanteSBX (donde vive pro_obc, también para producción).

   DESHACER:
     DELETE s FROM pro_obc.sub_partidas s JOIN pro_obc.partidas p ON p.id = s.partida_id
       JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
       WHERE g.codigo IN ('FCAN','FREC','FESC','FCHI') AND g.bc_works_no = 'F-MADERAS';
     DELETE p FROM pro_obc.partidas p JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
       WHERE g.codigo IN ('FCAN','FREC','FESC','FCHI') AND g.bc_works_no = 'F-MADERAS';
     DELETE FROM pro_obc.grupos_partida
       WHERE codigo IN ('FCAN','FREC','FESC','FCHI') AND bc_works_no = 'F-MADERAS';
   ============================================================================ */

DECLARE @maquinas TABLE (codigo VARCHAR(50), nombre NVARCHAR(200), orden SMALLINT);
INSERT INTO @maquinas (codigo, nombre, orden) VALUES
    ('FCAN', N'Canteadora',    1),
    ('FREC', N'Recanteadora',  2),
    ('FESC', N'Escuadradora',  3),
    ('FCHI', N'Chipeo',        4);

DECLARE @base SMALLINT = (
    SELECT ISNULL(MAX(orden), 0) FROM pro_obc.grupos_partida
    WHERE tipo_obra = 'FABRICA' AND bc_works_no = 'F-MADERAS'
);

-- 1) La máquina (nivel 1), sin código de BC.
INSERT INTO pro_obc.grupos_partida (codigo, nombre, tipo_obra, orden, activo, creado_en, bc_works_no, bc_task_no)
SELECT m.codigo, m.nombre, 'FABRICA', @base + m.orden, 1, SYSUTCDATETIME(), 'F-MADERAS', NULL
FROM @maquinas m
WHERE NOT EXISTS (
    SELECT 1 FROM pro_obc.grupos_partida g
    WHERE g.tipo_obra = 'FABRICA' AND g.bc_works_no = 'F-MADERAS' AND g.codigo = m.codigo
);

-- 2) Su partida: la misma máquina.
INSERT INTO pro_obc.partidas (codigo, nombre, grupo_id, orden, activo, bc_task_no, creado_en)
SELECT g.codigo + '-01', g.nombre, g.id, 1, 1, NULL, SYSUTCDATETIME()
FROM pro_obc.grupos_partida g
JOIN @maquinas m ON m.codigo = g.codigo
WHERE g.bc_works_no = 'F-MADERAS'
  AND NOT EXISTS (SELECT 1 FROM pro_obc.partidas p WHERE p.grupo_id = g.id);

-- 3) Su subpartida: la misma máquina otra vez (la regla de maderas).
INSERT INTO pro_obc.sub_partidas (codigo, nombre, partida_id, sprint_numero, es_critica, activo)
SELECT p.codigo + '.1', g.nombre, p.id, NULL, 0, 1
FROM pro_obc.partidas p
JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
JOIN @maquinas m ON m.codigo = g.codigo
WHERE g.bc_works_no = 'F-MADERAS'
  AND NOT EXISTS (SELECT 1 FROM pro_obc.sub_partidas s WHERE s.partida_id = p.id);
GO

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
SELECT g.codigo AS maquina, g.nombre, g.bc_task_no,
       p.codigo AS partida, s.codigo AS sub, s.nombre AS sub_nombre
FROM pro_obc.grupos_partida g
LEFT JOIN pro_obc.partidas p ON p.grupo_id = g.id
LEFT JOIN pro_obc.sub_partidas s ON s.partida_id = p.id
WHERE g.bc_works_no = 'F-MADERAS' AND g.codigo IN ('FCAN', 'FREC', 'FESC', 'FCHI')
ORDER BY g.orden;

SELECT COUNT(DISTINCT g.id) AS maquinas, COUNT(DISTINCT p.id) AS partidas, COUNT(s.id) AS subpartidas
FROM pro_obc.grupos_partida g
LEFT JOIN pro_obc.partidas p ON p.grupo_id = g.id
LEFT JOIN pro_obc.sub_partidas s ON s.partida_id = p.id
WHERE g.bc_works_no = 'F-MADERAS';
GO
