/* ============================================================================
   F-MADERAS: fuera las partidas `<MÁQUINA>-MAQ`

   POR QUÉ (Luis Roberto, 28/09/2026, viendo /partidas): «En Fabrica Maderas hay que
   quitar todos los que tiene al final -MAQ». Son las 17 partidas que inventó
   `2026-09-17_fabrica_solo_estructura_nueva.sql` —una por máquina, con su subpartida
   espejo `<CÓDIGO>-MAQ.1`— y que BC no tiene. Ahora que están las 44 tareas reales de
   BC (`2026-09-28_maderas_como_bc.sql`), sobran: lo que se asigne contra una tarea que
   BC no tiene no llega cuando se envía la información.

   QUÉ HACE: por cada partida `%-MAQ` de F-MADERAS, borra su vínculo de cuadrilla, su
   subpartida y la partida. Las 15 máquinas de BC se quedan con sus tareas; no se toca
   ninguna partida con `bcTaskNo`, ni lo que creó Luis Roberto a mano (ACB).

   NO BORRA LAS QUE TIENEN TRABAJO ABIERTO EN H4 — y hoy son TRES:
     FAS-MAQ.1  → h4.ObraSubpartida 246, Abierta desde el 25/09, 1 asignación vigente y 2 tramos
     FFJ-MAQ.1  → h4.ObraSubpartida 285, Abierta hoy 9:23 a. m., 1 asignación vigente y 1 tramo
     FLA-MAQ.1  → h4.ObraSubpartida 286, Abierta hoy 9:23 a. m., 2 asignaciones vigentes y 2 tramos
   Las abrió allisonm y hay gente asignada. Borrarlas se lleva ese marcaje, y HOY no se
   pueden mover a la tarea de BC que les toca porque esas tareas todavía no tienen
   subpartidas (las crea Luis Roberto). Cuando él cree, por ejemplo, la subpartida de
   FAS-01 Aserrio, se repunta `h4.ObraSubpartida.idSubpartida` y esta misma migración
   —que es re-corrible— se las lleva. El SELECT del final las lista.

   Va sobre dbo de la base PRINCIPAL (AdelantePRO en producción, AdelanteSBX en local).
   En SBX no hay cuadrillas ni H4 con datos, así que allá se van las 17.
   Idempotente. NO toca BC.

   DESHACER: las 17 están escritas en `2026-09-17_fabrica_solo_estructura_nueva.sql`.
   ============================================================================ */

-- Las que se pueden ir: `%-MAQ` sin bcTaskNo y sin nada colgando salvo la cuadrilla.
DECLARE @fuera TABLE (idPartida INT, idSubPartida INT NULL, codigo VARCHAR(50));

INSERT INTO @fuera (idPartida, idSubPartida, codigo)
SELECT p.idPartida, s.idSubPartida, p.codigo
FROM dbo.Partida p
JOIN dbo.Etapa e ON e.id = p.idEtapa
LEFT JOIN dbo.SubPartida s ON s.idPartida = p.idPartida
WHERE e.tipoObra = 'FABRICA' AND e.bcWorksNo = 'F-MADERAS'
  AND p.codigo LIKE '%-MAQ' AND p.bcTaskNo IS NULL
  AND NOT EXISTS (SELECT 1 FROM h4.ObraSubpartida x       WHERE x.idSubpartida  = s.idSubPartida)
  AND NOT EXISTS (SELECT 1 FROM dbo.Cuadrilla x           WHERE x.idSubPartida  = s.idSubPartida)
  AND NOT EXISTS (SELECT 1 FROM dbo.EncargadoPartida x    WHERE x.idSubPartida  = s.idSubPartida)
  AND NOT EXISTS (SELECT 1 FROM dbo.PedidoCompra x        WHERE x.idSubPartida  = s.idSubPartida)
  AND NOT EXISTS (SELECT 1 FROM dbo.PlantillaSolicitud x  WHERE x.idSubPartida  = s.idSubPartida)
  AND NOT EXISTS (SELECT 1 FROM dbo.SubPartidaTipoCasa x  WHERE x.idSubPartida  = s.idSubPartida)
  AND NOT EXISTS (SELECT 1 FROM dbo.clasificacion x       WHERE x.sub_partida_id = s.idSubPartida)
  AND NOT EXISTS (SELECT 1 FROM dbo.clasificacion x       WHERE x.partida_id     = p.idPartida)
  AND NOT EXISTS (SELECT 1 FROM b0.BoletaPlantilla x      WHERE x.idPartida      = p.idPartida)
  AND NOT EXISTS (SELECT 1 FROM b0.PartidaPermiso x       WHERE x.idPartida      = p.idPartida);

-- 1) El vínculo con la cuadrilla («Maderas y Muebles» las tenía todas).
DELETE cs FROM dbo.CuadrillaSubPartida cs
JOIN @fuera f ON f.idSubPartida = cs.idSubPartida;

-- 2) La subpartida espejo y 3) la partida.
DELETE s FROM dbo.SubPartida s JOIN @fuera f ON f.idSubPartida = s.idSubPartida;
DELETE p FROM dbo.Partida p JOIN @fuera f ON f.idPartida = p.idPartida;

SELECT COUNT(*) AS partidasBorradas FROM @fuera;
GO

-- ---------------------------------------------------------------------------
-- Verificación 1: lo que queda de `-MAQ` en F-MADERAS y por qué no se fue.
-- ---------------------------------------------------------------------------
SELECT p.codigo AS quedaFuera, s.codigo AS subpartida,
       os.idObraSubpartida, os.estado, os.creadoPor, os.fechaAperturaUtc,
       (SELECT COUNT(*) FROM h4.AsignacionVigente a WHERE a.idObraSubpartida = os.idObraSubpartida) AS asignaciones,
       (SELECT COUNT(*) FROM h4.AsignacionTramo a WHERE a.idObraSubpartida = os.idObraSubpartida) AS tramos
FROM dbo.Partida p
JOIN dbo.Etapa e ON e.id = p.idEtapa
LEFT JOIN dbo.SubPartida s ON s.idPartida = p.idPartida
LEFT JOIN h4.ObraSubpartida os ON os.idSubpartida = s.idSubPartida
WHERE e.tipoObra = 'FABRICA' AND e.bcWorksNo = 'F-MADERAS' AND p.codigo LIKE '%-MAQ'
ORDER BY p.codigo;
GO

-- ---------------------------------------------------------------------------
-- Verificación 2: las máquinas que quedaron SIN ninguna partida.
-- Son las 4 que BC tampoco tiene (Canteadora, Recanteadora, Escuadradora, Chipeo):
-- su única partida era la `-MAQ`. Se dejan; sacarlas es otra decisión.
-- ---------------------------------------------------------------------------
SELECT e.codigo AS maquinaVacia, e.nombre, e.bcTaskNo
FROM dbo.Etapa e
WHERE e.tipoObra = 'FABRICA' AND e.bcWorksNo = 'F-MADERAS'
  AND NOT EXISTS (SELECT 1 FROM dbo.Partida p WHERE p.idEtapa = e.id)
ORDER BY e.codigo;
GO
