/* ============================================================================
   dbo: la etapa EXTRAS con sus partidas y subpartidas, para la app de H4

   POR QUÉ: la aplicación de H4 lee el catálogo VIEJO de dbo (dbo.Etapa /
   dbo.Partida / dbo.SubPartida — h4.ObraSubpartida tiene FK a dbo.SubPartida),
   no el esquema h4. A ese catálogo le faltaba el mundo "Extras" que el catálogo
   de Producción sí tiene, y tres subpartidas quedaron con el código viejo.

   QUÉ HACE (los números que pasó el equipo de H4, verificados contra el
   catálogo vivo de Producción):
   1. dbo.Etapa      +1: EXT "EXTRAS".
   2. dbo.Partida    +2: 4.1 "EXTRAS" y 4.2 "REPARACIONES EN CONSTRUCCION",
      colgadas de EXT, esPosting = 1 (partidas reales de vivienda).
   3. dbo.SubPartida  3 corregidas:
        50  2.4.1 → 2.5.1  y pasa a 2.5 VENTANERIA   (era Ventaneria Casas)
        51  2.4.2 → 2.5.2  y pasa a 2.5 VENTANERIA   (era Puertas Corredizas)
        58  ya dice 4.1.1 pero colgaba de 3.2 (Mecánico) → pasa a la 4.1 nueva
   4. dbo.SubPartida +5 nuevas (sprint y crítica copiados del catálogo vivo):
        2.4.1 Cielos Madera (sprint 16)   → 2.4 MADERAS
        2.4.2 Fachadas Madera (sprint 16) → 2.4 MADERAS
        4.2.1 Reparaciones Electricas (23) → 4.2
        4.2.2 Reparaciones Obra Gris (1)   → 4.2
        4.2.3 Reparacion Acabados (1)      → 4.2

   El ORDEN importa: primero se corrigen 50/51 (liberan los códigos 2.4.x) y
   después se insertan las nuevas 2.4.x. Idempotente: cada paso se salta si ya
   está. Aplicar sobre AdelantePRO (ahí corre la app de H4):

     node scripts/aplicar-sql.mjs migrations/2026-09-24_dbo_extras_para_h4.sql --destino=AdelantePRO --confirm --si-es-produccion

   DESHACER: borrar las 5 subpartidas nuevas, devolver 50/51 a 2.4.x con
   idPartida 10 y 58 a idPartida 16, borrar las partidas 4.1/4.2 y la etapa EXT.
   ============================================================================ */
SET XACT_ABORT ON;
BEGIN TRAN;

-- 1) Etapa EXTRAS
IF NOT EXISTS (SELECT 1 FROM dbo.Etapa WHERE codigo = 'EXT')
    INSERT INTO dbo.Etapa (codigo, nombre) VALUES ('EXT', N'EXTRAS');

DECLARE @ext int = (SELECT TOP 1 id FROM dbo.Etapa WHERE codigo = 'EXT');

-- 2) Partidas 4.1 y 4.2
IF NOT EXISTS (SELECT 1 FROM dbo.Partida WHERE codigo = '4.1')
    INSERT INTO dbo.Partida (codigo, nombre, idEtapa, esPosting) VALUES ('4.1', N'EXTRAS', @ext, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.Partida WHERE codigo = '4.2')
    INSERT INTO dbo.Partida (codigo, nombre, idEtapa, esPosting) VALUES ('4.2', N'REPARACIONES EN CONSTRUCCION', @ext, 1);

DECLARE @p24 int = (SELECT TOP 1 idPartida FROM dbo.Partida WHERE codigo = '2.4' ORDER BY idPartida);
DECLARE @p25 int = (SELECT TOP 1 idPartida FROM dbo.Partida WHERE codigo = '2.5' ORDER BY idPartida);
DECLARE @p41 int = (SELECT TOP 1 idPartida FROM dbo.Partida WHERE codigo = '4.1' ORDER BY idPartida);
DECLARE @p42 int = (SELECT TOP 1 idPartida FROM dbo.Partida WHERE codigo = '4.2' ORDER BY idPartida);

-- 3) Correcciones (antes de las nuevas: liberan los códigos 2.4.x)
UPDATE dbo.SubPartida SET codigo = '2.5.1', idPartida = @p25 WHERE idSubPartida = 50 AND codigo = '2.4.1';
UPDATE dbo.SubPartida SET codigo = '2.5.2', idPartida = @p25 WHERE idSubPartida = 51 AND codigo = '2.4.2';
UPDATE dbo.SubPartida SET idPartida = @p41 WHERE idSubPartida = 58 AND codigo = '4.1.1' AND idPartida <> @p41;

-- 4) Las 5 nuevas
IF NOT EXISTS (SELECT 1 FROM dbo.SubPartida WHERE codigo = '2.4.1')
    INSERT INTO dbo.SubPartida (codigo, nombre, idPartida, numSprint, esCritica, esActivo, fechaCreacion)
    VALUES ('2.4.1', N'Cielos Madera', @p24, 16, 0, 1, SYSUTCDATETIME());
IF NOT EXISTS (SELECT 1 FROM dbo.SubPartida WHERE codigo = '2.4.2')
    INSERT INTO dbo.SubPartida (codigo, nombre, idPartida, numSprint, esCritica, esActivo, fechaCreacion)
    VALUES ('2.4.2', N'Fachadas Madera', @p24, 16, 0, 1, SYSUTCDATETIME());
IF NOT EXISTS (SELECT 1 FROM dbo.SubPartida WHERE codigo = '4.2.1')
    INSERT INTO dbo.SubPartida (codigo, nombre, idPartida, numSprint, esCritica, esActivo, fechaCreacion)
    VALUES ('4.2.1', N'Reparaciones Electricas', @p42, 23, 0, 1, SYSUTCDATETIME());
IF NOT EXISTS (SELECT 1 FROM dbo.SubPartida WHERE codigo = '4.2.2')
    INSERT INTO dbo.SubPartida (codigo, nombre, idPartida, numSprint, esCritica, esActivo, fechaCreacion)
    VALUES ('4.2.2', N'Reparaciones Obra Gris', @p42, 1, 0, 1, SYSUTCDATETIME());
IF NOT EXISTS (SELECT 1 FROM dbo.SubPartida WHERE codigo = '4.2.3')
    INSERT INTO dbo.SubPartida (codigo, nombre, idPartida, numSprint, esCritica, esActivo, fechaCreacion)
    VALUES ('4.2.3', N'Reparacion Acabados', @p42, 1, 0, 1, SYSUTCDATETIME());

COMMIT;
GO

-- Verificación: la etapa con sus partidas, y las 8 subpartidas tocadas.
SELECT e.id, e.codigo, e.nombre FROM dbo.Etapa e WHERE e.codigo = 'EXT';
SELECT p.idPartida, p.codigo, p.nombre, p.esPosting FROM dbo.Partida p WHERE p.codigo IN ('4.1','4.2');
SELECT sp.idSubPartida, sp.codigo, sp.nombre, p.codigo AS partida, sp.numSprint
FROM dbo.SubPartida sp JOIN dbo.Partida p ON p.idPartida = sp.idPartida
WHERE sp.idSubPartida IN (50, 51, 58) OR sp.codigo IN ('2.4.1','2.4.2','4.2.1','4.2.2','4.2.3')
ORDER BY sp.codigo;
GO
