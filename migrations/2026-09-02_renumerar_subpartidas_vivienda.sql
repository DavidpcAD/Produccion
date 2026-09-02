/* ============================================================================
   Renumerar 3 subpartidas de vivienda cuyo código no calzaba con su partida

   POR QUÉ: el árbol de /partidas dejó a la vista tres subpartidas numeradas como
   si colgaran de otra partida — venían de cuando se renumeraron las partidas de
   Acabados (al meter "2.4 Maderas", Ventanería pasó de 2.4 a 2.5 y sus
   subpartidas quedaron con el código viejo):

     partida 2.5 Ventanería              2.4.1 Ventaneria Casas   → 2.5.1
                                         2.4.2 Puertas Corredizas → 2.5.2
     partida 2.8 Zacate, Limpieza y F.   2.3.6 Poncheo            → 2.8.5

   2.5 no tenía ninguna subpartida 2.5.x y 2.8 tenía 2.8.1–2.8.4, así que los
   números nuevos estaban libres.

   SEGURO DE HISTORIA: nada referencia la subpartida por CÓDIGO. Todo lo que
   cuelga de ella lo hace por `sub_partida_id`: avance_sub_partidas (157 filas de
   estas tres), obra_pesos (131), cierre_produccion_snapshots (72.652 en total),
   sub_partida_pesos_*, y h4.ObraSubpartida.idSubpartida en la base del app. Por
   eso cambiar el código no mueve ni desconecta nada; solo ordena el árbol.

   OJO (lo único que cambia afuera): la carga del "Presupuesto de Horas" resuelve
   la subpartida por código desde el Excel. Una plantilla vieja que diga 2.4.1,
   2.4.2 o 2.3.6 va a reportar "subpartida desconocida" — hay que actualizarla (o
   dejar la celda de código vacía, que ahí el parse la sugiere por nombre).

   Idempotente: keyed por (partida, código viejo); corrido dos veces no hace nada.
   Aplicar sobre AdelanteSBX (donde vive pro_obc, también para producción).
   ============================================================================ */

-- Guarda: no arrancar si el código nuevo ya existiera en la misma partida.
IF EXISTS (
    SELECT 1
    FROM pro_obc.sub_partidas sp
    JOIN pro_obc.partidas p ON p.id = sp.partida_id
    JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
    WHERE g.tipo_obra = 'VIVIENDA'
      AND ((p.codigo = '2.5' AND sp.codigo IN ('2.5.1', '2.5.2'))
        OR (p.codigo = '2.8' AND sp.codigo = '2.8.5'))
)
BEGIN
    RAISERROR('Los códigos nuevos (2.5.1 / 2.5.2 / 2.8.5) ya están usados: revisar a mano.', 16, 1);
END
GO

UPDATE sp SET codigo = '2.5.1'
FROM pro_obc.sub_partidas sp
JOIN pro_obc.partidas p ON p.id = sp.partida_id
JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
WHERE g.tipo_obra = 'VIVIENDA' AND p.codigo = '2.5' AND sp.codigo = '2.4.1';
GO

UPDATE sp SET codigo = '2.5.2'
FROM pro_obc.sub_partidas sp
JOIN pro_obc.partidas p ON p.id = sp.partida_id
JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
WHERE g.tipo_obra = 'VIVIENDA' AND p.codigo = '2.5' AND sp.codigo = '2.4.2';
GO

UPDATE sp SET codigo = '2.8.5'
FROM pro_obc.sub_partidas sp
JOIN pro_obc.partidas p ON p.id = sp.partida_id
JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
WHERE g.tipo_obra = 'VIVIENDA' AND p.codigo = '2.8' AND sp.codigo = '2.3.6';
GO

-- Verificación 1: las tres quedaron con su código nuevo y su sprint intacto.
SELECT p.codigo AS partida, p.nombre AS partida_nombre, sp.id, sp.codigo, sp.nombre, sp.sprint_numero
FROM pro_obc.sub_partidas sp
JOIN pro_obc.partidas p ON p.id = sp.partida_id
JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
WHERE g.tipo_obra = 'VIVIENDA' AND sp.id IN (50, 51, 91)
ORDER BY sp.codigo;
GO

-- Verificación 2: ya no queda NINGUNA subpartida de vivienda cuyo código no
-- empiece con el código de su partida (esperado: 0 filas).
SELECT p.codigo AS partida, sp.codigo AS subpartida, sp.nombre
FROM pro_obc.sub_partidas sp
JOIN pro_obc.partidas p ON p.id = sp.partida_id
JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
WHERE g.tipo_obra = 'VIVIENDA'
  AND LEFT(sp.codigo, LEN(p.codigo) + 1) <> p.codigo + '.'
ORDER BY p.codigo, sp.codigo;
GO

-- Verificación 3: lo que cuelga de esas tres sigue en su lugar (por id, intacto).
SELECT
    (SELECT COUNT(*) FROM pro_obc.avance_sub_partidas WHERE sub_partida_id IN (50,51,91)) AS avances,
    (SELECT COUNT(*) FROM pro_obc.obra_pesos WHERE sub_partida_id IN (50,51,91)) AS pesos,
    (SELECT COUNT(*) FROM pro_obc.cierre_produccion_snapshots WHERE sub_partida_id IN (50,51,91)) AS snapshots,
    (SELECT COUNT(*) FROM pro_obc.sub_partida_tipos WHERE sub_partida_id IN (50,51,91)) AS tipos_casa;
GO
