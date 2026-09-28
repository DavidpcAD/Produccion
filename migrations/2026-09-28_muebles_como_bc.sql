/* ============================================================================
   F-MUEBLES vuelve a ser lo que es en Business Central: 3 tareas, nada más

   POR QUÉ (Luis Roberto, WhatsApp del 28/09/2026, viendo la pantalla /partidas):
     — «Si tienen que quedar como Business Central.»
     — «Lo de colocar las Obras como Tareas es hasta que demos la indicación.»
     — «Si queda como BC, si ellos asignan así, cuando se envíe la información a
        BC no va a llegar.»
   O sea: la partida es la TAREA de BC. Poner las obras de vivienda como tareas
   —lo que hizo `2026-09-17_muebles_partida_por_obra.sql`— queda EN PAUSA hasta
   que el negocio dé la indicación; mientras tanto, lo que se asigne contra esas
   partidas inventadas no existe en BC y no llega.

   QUÉ TIENE BC PRODUCTION HOY (leído el 28/09/2026 del API custom, versión 'NO';
   no hay líneas "Total", así que las tres cuelgan del grupo con el código de la
   obra, que es como lo arma el sync):
     F-INST  Instalacion de muebles   (Posting, líneas Sales y Cost)
     F-SM    Puertas Madera           (Posting, líneas Sales y Cost)
     F-TAP   Rodapie 18x115           (Posting, líneas Sales y Cost)
     (CI Costos Indirectos es el bucket de coste indirecto: no es estructura.)

   QUÉ HACE
     1. Borra las 200 partidas-obra de F-MUEBLES (bcTaskNo NULL) y sus 5.800
        subpartidas de proceso.
     2. Crea las 3 partidas de BC con su bcTaskNo.
     3. Le cuelga a cada una su subpartida espejo `<código>.1`, que es la regla de
        fábrica/infra/admin (`2026-09-17_subpartida_espejo_toda_partida.sql`): sin
        desglose abajo, el árbol muestra "Esta partida no tiene subpartidas".

   NADIE LAS ESTABA USANDO — verificado en AdelantePRO antes de borrar, 0 filas en
   todas: Cuadrilla, CuadrillaSubPartida, EncargadoPartida, PedidoCompra,
   PlantillaSolicitud, SubPartidaTipoCasa, h4.ObraSubpartida, dbo.clasificacion,
   b0.BoletaPlantilla y b0.PartidaPermiso. El bloque de verificación de abajo lo
   vuelve a contar antes del DELETE y aborta si aparece alguna.

   NO SE TOCA BC. Esto es solo el catálogo del app.

   Va sobre dbo de la base PRINCIPAL (AdelantePRO en producción, AdelanteSBX en
   local) — ahí vive el catálogo desde el 24/09/2026. La copia vieja y congelada de
   `pro_obc` en SBX sigue con las 200 partidas: no la lee el árbol y se deja como
   está.

   Idempotente: corrida dos veces no hace nada.

   CÓMO DEVOLVERLO cuando den la indicación: la lista de las 200 obras y los 29
   procesos está escrita en `migrations/2026-09-17_muebles_partida_por_obra.sql`
   (contra pro_obc: hay que traducir grupos_partida→dbo.Etapa, partida_id→idPartida,
   activo→esActivo, sprint_numero→numSprint) y el blindaje que impide que "Traer de
   BC" las pise se vuelve a poner con una línea en `OBRAS_BLINDADAS`
   (lib/partidas/sync-estructura.ts).
   ============================================================================ */

DECLARE @etapa INT = (
    SELECT id FROM dbo.Etapa
    WHERE tipoObra = 'FABRICA' AND bcWorksNo = 'F-MUEBLES' AND codigo = 'F-MUEBLES');

IF @etapa IS NULL
BEGIN
    RAISERROR('No existe la etapa F-MUEBLES de fábrica en esta base.', 16, 1);
    RETURN;
END

-- ---------------------------------------------------------------------------
-- 0) Guarda: si alguien YA usó estas subpartidas, no se borra nada.
-- ---------------------------------------------------------------------------
DECLARE @usadas INT = (
    SELECT COUNT(*)
    FROM dbo.SubPartida s
    JOIN dbo.Partida p ON p.idPartida = s.idPartida
    WHERE p.idEtapa = @etapa AND p.bcTaskNo IS NULL
      AND (EXISTS (SELECT 1 FROM dbo.Cuadrilla x           WHERE x.idSubPartida = s.idSubPartida)
        OR EXISTS (SELECT 1 FROM dbo.CuadrillaSubPartida x WHERE x.idSubPartida = s.idSubPartida)
        OR EXISTS (SELECT 1 FROM dbo.EncargadoPartida x    WHERE x.idSubPartida = s.idSubPartida)
        OR EXISTS (SELECT 1 FROM dbo.PedidoCompra x        WHERE x.idSubPartida = s.idSubPartida)
        OR EXISTS (SELECT 1 FROM dbo.PlantillaSolicitud x  WHERE x.idSubPartida = s.idSubPartida)
        OR EXISTS (SELECT 1 FROM dbo.SubPartidaTipoCasa x  WHERE x.idSubPartida = s.idSubPartida)
        OR EXISTS (SELECT 1 FROM h4.ObraSubpartida x       WHERE x.idSubpartida = s.idSubPartida)
        OR EXISTS (SELECT 1 FROM dbo.clasificacion x       WHERE x.sub_partida_id = s.idSubPartida)));

IF @usadas > 0
BEGIN
    RAISERROR('ABORT: %d subpartidas de F-MUEBLES ya están en uso; revisar a mano antes de borrar.', 16, 1, @usadas);
    RETURN;
END

-- ---------------------------------------------------------------------------
-- 1) Fuera los 29 procesos de cada obra.
-- ---------------------------------------------------------------------------
DELETE s
FROM dbo.SubPartida s
JOIN dbo.Partida p ON p.idPartida = s.idPartida
WHERE p.idEtapa = @etapa AND p.bcTaskNo IS NULL;

-- ---------------------------------------------------------------------------
-- 2) Fuera las partidas-obra (las de BC tienen bcTaskNo y no entran acá).
-- ---------------------------------------------------------------------------
DELETE FROM dbo.Partida
WHERE idEtapa = @etapa AND bcTaskNo IS NULL;

-- ---------------------------------------------------------------------------
-- 3) Las 3 tareas de BC, en el orden en que BC las devuelve.
--    esPosting = 0: solo el catálogo compartido de vivienda lo lleva en 1 (es lo
--    que filtran las vistas b0 de Boletas).
-- ---------------------------------------------------------------------------
DECLARE @bc TABLE (codigo VARCHAR(50), nombre NVARCHAR(160), orden INT);
INSERT INTO @bc (codigo, nombre, orden) VALUES
    ('F-INST', N'Instalacion de muebles', 1),
    ('F-SM',   N'Puertas Madera',         2),
    ('F-TAP',  N'Rodapie 18x115',         3);

INSERT INTO dbo.Partida (codigo, nombre, idEtapa, orden, esActivo, bcTaskNo, fechaCreacion, esPosting)
SELECT b.codigo, b.nombre, @etapa, b.orden, 1, b.codigo, SYSUTCDATETIME(), 0
FROM @bc b
WHERE NOT EXISTS (SELECT 1 FROM dbo.Partida p WHERE p.idEtapa = @etapa AND p.codigo = b.codigo);

-- ---------------------------------------------------------------------------
-- 4) Subpartida espejo por partida (solo si la partida quedó sin ninguna).
-- ---------------------------------------------------------------------------
INSERT INTO dbo.SubPartida (codigo, nombre, idPartida, numSprint, esCritica, esActivo, fechaCreacion)
SELECT p.codigo + '.1', p.nombre, p.idPartida, NULL, 0, 1, SYSUTCDATETIME()
FROM dbo.Partida p
WHERE p.idEtapa = @etapa
  AND NOT EXISTS (SELECT 1 FROM dbo.SubPartida s WHERE s.idPartida = p.idPartida);
GO

-- ---------------------------------------------------------------------------
-- Verificación: tiene que decir 3 partidas y 3 subpartidas, las de BC.
-- ---------------------------------------------------------------------------
SELECT p.codigo, p.nombre, p.bcTaskNo, p.orden, p.esActivo,
       (SELECT COUNT(*) FROM dbo.SubPartida s WHERE s.idPartida = p.idPartida) AS subpartidas
FROM dbo.Partida p
JOIN dbo.Etapa e ON e.id = p.idEtapa
WHERE e.tipoObra = 'FABRICA' AND e.bcWorksNo = 'F-MUEBLES'
ORDER BY p.orden;
GO
