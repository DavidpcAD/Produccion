/* ============================================================================
   Subpartidas de fábrica: F-MADERAS (la máquina) y F-MUEBLES (los procesos)

   POR QUÉ: el árbol de /partidas tenía las dos fábricas sin nivel 3. Lo que pidió
   el usuario (2026-09-17):

     F-MADERAS  la partida es la máquina y la subpartida es la misma máquina.
                No hay más detalle abajo: el trabajo se carga a la máquina y no
                conoce la obra (se produce contra inventario).

     F-MUEBLES  la partida es la casa (la obra de vivienda en construcción) y las
                subpartidas son los procesos: fabricación, acabado e instalación.
                Por eso TODA partida de F-MUEBLES lleva la misma lista de 29.

   NO SE TOCA BC: acá solo se crean subpartidas, que son nivel SQL puro (BC no
   tiene ese nivel). Ni un grupo ni una partida nueva, ni un bc_task_no.

   DETALLE DE NOMBRES en F-MADERAS: la subpartida se llama como la MÁQUINA (el
   nombre del grupo). La excepción es el grupo FG "Fabrica General", que no es una
   máquina: ahí la subpartida toma el nombre de su propia partida (Limpieza,
   Mantenimiento, Recepción Material…), que es como las nombró el usuario.

   QUEDAN FUERA (no tienen partida en BC y no se inventa estructura): Canteadora,
   Recanteadora, Escuadradora y Chipeo.

   "Conoce la obra": la anotación del usuario queda escrita en `descripcion` de las
   subpartidas de muebles que la llevaban (fabricación e instalación). No hay
   columna para eso; es texto, no regla.

   Idempotente: keyed por código de subpartida; corrido dos veces no hace nada.
   Aplicar sobre AdelanteSBX (donde vive pro_obc, también para producción).

   DESHACER (nada la referencia todavía):
     DELETE sp FROM pro_obc.sub_partidas sp
     JOIN pro_obc.partidas p ON p.id = sp.partida_id
     JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
     WHERE g.bc_works_no IN ('F-MADERAS','F-MUEBLES');
   ============================================================================ */

-- ---------------------------------------------------------------------------
-- 1) F-MADERAS: una subpartida por partida, con el nombre de la máquina.
-- ---------------------------------------------------------------------------
INSERT INTO pro_obc.sub_partidas (codigo, nombre, partida_id, sprint_numero, es_critica, activo)
SELECT
    p.codigo + '.1',
    CASE WHEN g.codigo = 'FG' THEN p.nombre ELSE g.nombre END,
    p.id,
    NULL,
    0,
    1
FROM pro_obc.partidas p
JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
WHERE g.bc_works_no = 'F-MADERAS'
  AND g.activo = 1
  AND p.activo = 1
  AND NOT EXISTS (SELECT 1 FROM pro_obc.sub_partidas s WHERE s.partida_id = p.id);
GO

-- ---------------------------------------------------------------------------
-- 2) F-MUEBLES: los 29 procesos, iguales para toda partida (la casa).
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
  AND g.activo = 1
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
SELECT g.bc_works_no AS obra, COUNT(DISTINCT p.id) AS partidas, COUNT(s.id) AS subpartidas
FROM pro_obc.grupos_partida g
JOIN pro_obc.partidas p ON p.grupo_id = g.id
LEFT JOIN pro_obc.sub_partidas s ON s.partida_id = p.id
WHERE g.bc_works_no IN ('F-MADERAS', 'F-MUEBLES')
GROUP BY g.bc_works_no;

SELECT g.codigo AS grupo, p.codigo AS partida, s.codigo AS sub, s.nombre AS sub_nombre
FROM pro_obc.grupos_partida g
JOIN pro_obc.partidas p ON p.grupo_id = g.id
JOIN pro_obc.sub_partidas s ON s.partida_id = p.id
WHERE g.bc_works_no = 'F-MADERAS'
ORDER BY p.codigo;
GO
