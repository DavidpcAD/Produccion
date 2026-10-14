/* ============================================================================
   F-MADERAS: las últimas 3 `-MAQ` se van — primero se mueve el marcaje

   POR QUÉ: `2026-09-28_maderas_fuera_las_maq.sql` se llevó 14 de las 17 partidas
   `<MÁQUINA>-MAQ`, pero dejó TRES porque tenían trabajo abierto en H4 y las tareas
   reales de BC todavía no tenían subpartidas a dónde moverlo. Hoy (30/09) Luis
   Roberto creó esas subpartidas, así que ya se puede: David pidió
   «fas-maq debe pasarse a fas-01.1, ffj-maq a ffj-03.1, fla-maq a fla-03.1…
   esto para no perder el marcaje y cuando pase bórreme las fas-maq, ffj-maq y fla-maq».

   QUÉ HACE, en orden:
     1) Repunta la actividad de H4 (`h4.ObraSubpartida.idSubpartida`) a la subpartida
        de la tarea de BC. Las asignaciones, los tramos, los eventos y el avance
        cuelgan de `idObraSubpartida`, que NO cambia: el marcaje viaja completo,
        incluidos los 4 tramos que hoy están abiertos.
     2) Mueve el vínculo de la cuadrilla «Maderas y Muebles» a la subpartida nueva
        (si se borrara, la cuadrilla se quedaría sin poder asignar contra la máquina).
     3) Borra la subpartida `-MAQ` y su partida, con las mismas guardas del 28/09:
        solo si ya no queda NADA colgando.

   EL MAPA (máquina → tarea de BC que la representa):
     FAS-MAQ.1 Aserradero LT15 Wide               → FAS-01.1 Aserradero
     FFJ-MAQ.1 Fresadora Finger Joint FFJ 15 Full → FFJ-03.1 Finger Joint
     FLA-MAQ.1 Lijadora Calibradora Banda Ancha   → FLA-03.1 Lijadora Calibradora Banda Ancha

   Va sobre dbo + h4 de la base PRINCIPAL (AdelantePRO en producción). En AdelanteSBX
   no hay ninguna `-MAQ` (allá se fueron las 17 el 28/09): correrla es un no-op.
   Idempotente y re-corrible. NO toca BC. No borra nada de H4.

   DESHACER: el marcaje no se pierde, así que deshacer es volver a crear las 3
   partidas (están escritas en `2026-09-17_fabrica_solo_estructura_nueva.sql`) y
   repuntar la actividad de vuelta. Los ids de las filas tocadas salen en los
   SELECT de verificación del final.
   ============================================================================ */

SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Las subpartidas de F-MADERAS, por código: de aquí salen origen y destino.
;WITH subs AS (
  SELECT s.idSubPartida, s.codigo, p.idPartida, p.bcTaskNo
  FROM dbo.SubPartida s
  JOIN dbo.Partida p ON p.idPartida = s.idPartida
  JOIN dbo.Etapa   e ON e.id        = p.idEtapa
  WHERE e.tipoObra = 'FABRICA' AND e.bcWorksNo = 'F-MADERAS'
)
SELECT o.idSubPartida AS origen, o.idPartida AS idPartidaOrigen,
       d.idSubPartida AS destino, m.orig AS codOrigen, m.dest AS codDestino
INTO #mover
FROM (VALUES ('FAS-MAQ.1','FAS-01.1'),
             ('FFJ-MAQ.1','FFJ-03.1'),
             ('FLA-MAQ.1','FLA-03.1')) AS m(orig, dest)
JOIN subs o ON o.codigo = m.orig
JOIN subs d ON d.codigo = m.dest;

-- 1) El marcaje: la actividad de H4 pasa a la subpartida de la tarea de BC.
--    La guarda del NOT EXISTS es por `UQ_h4_ObraSubpartida (idObra, idSubpartida)`:
--    si esa obra YA tuviera una actividad en la subpartida destino, esta se queda
--    donde está (y entonces la partida no se borra: sale en la verificación).
UPDATE os
   SET os.idSubpartida      = f.destino,
       os.fechaModificacion = SYSUTCDATETIME(),
       os.modificadoPor     = 'migracion 2026-09-30'
FROM h4.ObraSubpartida os
JOIN #mover f ON f.origen = os.idSubpartida
WHERE NOT EXISTS (
  SELECT 1 FROM h4.ObraSubpartida x
  WHERE x.idObra = os.idObra AND x.idSubpartida = f.destino
);

-- 2) El vínculo de la cuadrilla se mueve igual (mismo ux: cuadrilla+proyecto+sub).
UPDATE cs
   SET cs.idSubPartida = f.destino
FROM dbo.CuadrillaSubPartida cs
JOIN #mover f ON f.origen = cs.idSubPartida
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.CuadrillaSubPartida x
  WHERE x.IDCuadrilla = cs.IDCuadrilla
    AND ISNULL(x.idProyecto, -1) = ISNULL(cs.idProyecto, -1)
    AND x.idSubPartida = f.destino
);
-- Si el destino ya lo tenía, el de la `-MAQ` sobra.
DELETE cs FROM dbo.CuadrillaSubPartida cs JOIN #mover f ON f.origen = cs.idSubPartida;

-- 3) Ahora sí: las `-MAQ` que ya no tienen nada colgando (mismas guardas del 28/09).
DECLARE @fuera TABLE (idPartida INT, idSubPartida INT NULL, codigo VARCHAR(50));

INSERT INTO @fuera (idPartida, idSubPartida, codigo)
SELECT p.idPartida, s.idSubPartida, p.codigo
FROM dbo.Partida p
JOIN dbo.Etapa e ON e.id = p.idEtapa
LEFT JOIN dbo.SubPartida s ON s.idPartida = p.idPartida
WHERE e.tipoObra = 'FABRICA' AND e.bcWorksNo = 'F-MADERAS'
  AND p.codigo LIKE '%-MAQ' AND p.bcTaskNo IS NULL
  AND NOT EXISTS (SELECT 1 FROM h4.ObraSubpartida x       WHERE x.idSubpartida   = s.idSubPartida)
  AND NOT EXISTS (SELECT 1 FROM dbo.Cuadrilla x           WHERE x.idSubPartida   = s.idSubPartida)
  AND NOT EXISTS (SELECT 1 FROM dbo.CuadrillaSubPartida x WHERE x.idSubPartida   = s.idSubPartida)
  AND NOT EXISTS (SELECT 1 FROM dbo.EncargadoPartida x    WHERE x.idSubPartida   = s.idSubPartida)
  AND NOT EXISTS (SELECT 1 FROM dbo.PedidoCompra x        WHERE x.idSubPartida   = s.idSubPartida)
  AND NOT EXISTS (SELECT 1 FROM dbo.PlantillaSolicitud x  WHERE x.idSubPartida   = s.idSubPartida)
  AND NOT EXISTS (SELECT 1 FROM dbo.SubPartidaTipoCasa x  WHERE x.idSubPartida   = s.idSubPartida)
  AND NOT EXISTS (SELECT 1 FROM dbo.clasificacion x       WHERE x.sub_partida_id = s.idSubPartida)
  AND NOT EXISTS (SELECT 1 FROM dbo.clasificacion x       WHERE x.partida_id     = p.idPartida)
  AND NOT EXISTS (SELECT 1 FROM b0.BoletaPlantilla x      WHERE x.idPartida      = p.idPartida)
  AND NOT EXISTS (SELECT 1 FROM b0.PartidaPermiso x       WHERE x.idPartida      = p.idPartida);

DELETE s FROM dbo.SubPartida s JOIN @fuera f ON f.idSubPartida = s.idSubPartida;
DELETE p FROM dbo.Partida    p JOIN @fuera f ON f.idPartida    = p.idPartida;

SELECT (SELECT COUNT(*) FROM #mover)  AS marcajeMovido,
       (SELECT COUNT(*) FROM @fuera)  AS partidasBorradas;

DROP TABLE #mover;
COMMIT TRANSACTION;
GO

-- ---------------------------------------------------------------------------
-- Verificación 1: ¿queda alguna `-MAQ` en F-MADERAS? (lo esperado: ninguna)
-- ---------------------------------------------------------------------------
SELECT p.codigo AS quedaFuera, s.codigo AS subpartida, os.idObraSubpartida, os.estado
FROM dbo.Partida p
JOIN dbo.Etapa e ON e.id = p.idEtapa
LEFT JOIN dbo.SubPartida s ON s.idPartida = p.idPartida
LEFT JOIN h4.ObraSubpartida os ON os.idSubpartida = s.idSubPartida
WHERE e.tipoObra = 'FABRICA' AND e.bcWorksNo = 'F-MADERAS' AND p.codigo LIKE '%-MAQ'
ORDER BY p.codigo;
GO

-- ---------------------------------------------------------------------------
-- Verificación 2: el marcaje quedó vivo, ahora colgando de la tarea de BC.
-- ---------------------------------------------------------------------------
SELECT os.idObraSubpartida, s.codigo AS sub, s.nombre, os.estado, os.creadoPor,
       os.fechaAperturaUtc,
       (SELECT COUNT(*) FROM h4.AsignacionVigente a WHERE a.idObraSubpartida = os.idObraSubpartida) AS asignaciones,
       (SELECT COUNT(*) FROM h4.AsignacionTramo   a WHERE a.idObraSubpartida = os.idObraSubpartida) AS tramos,
       (SELECT COUNT(*) FROM h4.AsignacionTramo   a WHERE a.idObraSubpartida = os.idObraSubpartida
                                                      AND a.horaFinUtc IS NULL) AS tramosAbiertos
FROM h4.ObraSubpartida os
JOIN dbo.SubPartida s ON s.idSubPartida = os.idSubpartida
WHERE s.codigo IN ('FAS-01.1','FFJ-03.1','FLA-03.1')
ORDER BY s.codigo;
GO

-- ---------------------------------------------------------------------------
-- Verificación 3: la cuadrilla «Maderas y Muebles» sigue ligada a esas 3.
-- ---------------------------------------------------------------------------
SELECT c.nombre AS cuadrilla, s.codigo AS sub, s.nombre, cs.idProyecto
FROM dbo.CuadrillaSubPartida cs
JOIN dbo.SubPartida s ON s.idSubPartida = cs.idSubPartida
LEFT JOIN dbo.Cuadrilla c ON c.idCuadrilla = cs.IDCuadrilla
WHERE s.codigo IN ('FAS-01.1','FFJ-03.1','FLA-03.1')
ORDER BY s.codigo;
GO
