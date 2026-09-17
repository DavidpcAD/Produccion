/* ============================================================================
   Fábrica: dejar SOLO la estructura de hoy y borrar la que había antes

   POR QUÉ: con las subpartidas puestas, el árbol quedó ilegible — en F-MADERAS
   se leían tres nombres distintos en tres niveles (ASERRADERO LT15 WIDE →
   FAS-01 Aserrio → Aserradero LT15 Wide) y en F-MUEBLES convivían las 200
   obras con las 3 partidas de producto que traía BC. El usuario pidió dejar solo
   lo definido hoy.

   CÓMO QUEDA
     F-MADERAS  máquina → la misma máquina → la misma máquina.
                Una sola partida por máquina, con código `<COD>-MAQ`.
     F-MUEBLES  obra → los 29 procesos. Nada más.

   QUÉ SE BORRA (40 partidas + 37 subpartidas; NADA las referencia: 0 filas en
   sub_partida_pesos_partida y 0 en dbo.clasificacion, verificado):
     · las 37 partidas-operación que BC tiene en las máquinas de F-MADERAS
       (FAS-01 Aserrio, FED-02 Encolado Doble, las 18 de Moldurera…)
     · las 3 partidas de producto de F-MUEBLES (F-SM, F-TAP, F-INST)

   QUÉ NO SE TOCA: el grupo `FG Fabrica General` y sus 5 partidas (Limpieza,
   Mantenimiento, Recepción Material, Complementarias, Instalación de muebles).
   No es una máquina y dos de esas SÍ están en la lista del usuario; borrarlas
   sería inventar. Si las quiere fuera, se dice y se borran.

   CÓDIGO `-MAQ` Y NO `-01`: `FAS-01` es el código de una tarea real de BC. Si la
   partida-máquina se llamara así, el próximo "Traer de BC" le pisaría el nombre
   (upsertPartida hace `SET nombre = @nombre` cuando empareja por código). Con
   `-MAQ` no empareja con nada de BC. Por lo mismo se renombran las 4 máquinas
   creadas hoy: FCAN-01 → FCAN-MAQ, etc.

   OJO — ESTO NO ES DEFINITIVO CONTRA BC: "Traer de BC" sobre F-MADERAS vuelve a
   crear las 37 operaciones (están en BC y el sync es aditivo). Y el cruce del
   Presupuesto contra el catálogo (nivel 2 = tarea de BC) ya no las va a encontrar
   para esa obra: las va a reportar como faltantes. Es el precio de tener el árbol
   en la forma que pidió el usuario.

   Idempotente. Aplicar sobre AdelanteSBX (donde vive pro_obc, también producción).

   DESHACER: no hay vuelta atrás automática para las 40 borradas — se recuperan
   con "Traer de BC" sobre F-MADERAS y F-MUEBLES (vuelven con su bc_task_no).
   ============================================================================ */

-- ---------------------------------------------------------------------------
-- 1) Las 4 máquinas de hoy pasan a `-MAQ` (mismo criterio que las de BC).
-- ---------------------------------------------------------------------------
UPDATE s
SET s.codigo = REPLACE(s.codigo, '-01.1', '-MAQ.1')
FROM pro_obc.sub_partidas s
JOIN pro_obc.partidas p ON p.id = s.partida_id
JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
WHERE g.bc_works_no = 'F-MADERAS' AND g.codigo IN ('FCAN','FREC','FESC','FCHI')
  AND s.codigo LIKE '%-01.1';

UPDATE p
SET p.codigo = REPLACE(p.codigo, '-01', '-MAQ')
FROM pro_obc.partidas p
JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
WHERE g.bc_works_no = 'F-MADERAS' AND g.codigo IN ('FCAN','FREC','FESC','FCHI')
  AND p.codigo LIKE '%-01';
GO

-- ---------------------------------------------------------------------------
-- 2) Una partida por máquina de BC: la máquina. (FG no entra: no es máquina.)
-- ---------------------------------------------------------------------------
INSERT INTO pro_obc.partidas (codigo, nombre, grupo_id, orden, activo, bc_task_no, creado_en)
SELECT g.codigo + '-MAQ', g.nombre, g.id, 1, 1, NULL, SYSUTCDATETIME()
FROM pro_obc.grupos_partida g
WHERE g.bc_works_no = 'F-MADERAS' AND g.codigo <> 'FG' AND g.activo = 1
  AND NOT EXISTS (SELECT 1 FROM pro_obc.partidas p WHERE p.grupo_id = g.id AND p.codigo = g.codigo + '-MAQ');

INSERT INTO pro_obc.sub_partidas (codigo, nombre, partida_id, sprint_numero, es_critica, activo)
SELECT p.codigo + '.1', g.nombre, p.id, NULL, 0, 1
FROM pro_obc.partidas p
JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
WHERE g.bc_works_no = 'F-MADERAS' AND p.codigo LIKE '%-MAQ'
  AND NOT EXISTS (SELECT 1 FROM pro_obc.sub_partidas s WHERE s.partida_id = p.id);
GO

-- ---------------------------------------------------------------------------
-- 3) Fuera lo de antes: operaciones de BC en maderas + productos de BC en muebles.
-- ---------------------------------------------------------------------------
SELECT p.id INTO #victimas
FROM pro_obc.partidas p
JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
WHERE (g.bc_works_no = 'F-MADERAS' AND g.codigo <> 'FG' AND p.bc_task_no IS NOT NULL)
   OR (g.bc_works_no = 'F-MUEBLES' AND p.bc_task_no IS NOT NULL);

DELETE s FROM pro_obc.sub_partidas s JOIN #victimas v ON v.id = s.partida_id;
DELETE x FROM pro_obc.sub_partida_pesos_partida x JOIN #victimas v ON v.id = x.partida_id;
DELETE p FROM pro_obc.partidas p JOIN #victimas v ON v.id = p.id;
DROP TABLE #victimas;
GO

-- ---------------------------------------------------------------------------
-- 4) Ordenar las máquinas por nombre, que es como se lee la lista de la fábrica.
-- ---------------------------------------------------------------------------
WITH orden AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY CASE WHEN codigo = 'FG' THEN 1 ELSE 0 END, nombre) AS n
    FROM pro_obc.grupos_partida
    WHERE bc_works_no = 'F-MADERAS' AND activo = 1
)
UPDATE g SET g.orden = o.n
FROM pro_obc.grupos_partida g JOIN orden o ON o.id = g.id;
GO

-- ---------------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------------
SELECT g.orden, g.codigo AS maquina, g.nombre,
       p.codigo AS partida, p.nombre AS partida_nombre, s.codigo AS sub, s.nombre AS sub_nombre
FROM pro_obc.grupos_partida g
LEFT JOIN pro_obc.partidas p ON p.grupo_id = g.id
LEFT JOIN pro_obc.sub_partidas s ON s.partida_id = p.id
WHERE g.bc_works_no = 'F-MADERAS'
ORDER BY g.orden, p.codigo;

SELECT g.bc_works_no AS obra, COUNT(DISTINCT g.id) AS procesos,
       COUNT(DISTINCT p.id) AS partidas, COUNT(s.id) AS subpartidas
FROM pro_obc.grupos_partida g
LEFT JOIN pro_obc.partidas p ON p.grupo_id = g.id
LEFT JOIN pro_obc.sub_partidas s ON s.partida_id = p.id
WHERE g.tipo_obra = 'FABRICA'
GROUP BY g.bc_works_no ORDER BY g.bc_works_no;
GO
