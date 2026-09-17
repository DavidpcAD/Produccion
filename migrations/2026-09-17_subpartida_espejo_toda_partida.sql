/* ============================================================================
   Toda partida de fábrica, infra y administrativas tiene su subpartida

   POR QUÉ: el árbol mostraba "Esta partida no tiene subpartidas" en casi todo
   lo que no es vivienda. El usuario lo pidió explícito: en esas la subpartida es
   la misma que la partida — no hay desglose abajo, igual que la máquina en
   F-MADERAS. Así el tercer nivel existe siempre y el árbol se lee parejo.

   QUÉ HACE: por cada partida ACTIVA de FABRICA / INFRA / ADMIN que no tenga
   ninguna subpartida, crea UNA con el mismo nombre y código `<partida>.1`.
   157 al 2026-09-17: ADMIN 84 · INFRA 40 · FABRICA 33.

   VIVIENDA NO ENTRA: ahí toda partida activa ya tiene su desglose real (95
   subpartidas con nombre propio). Las dos que aparecen vacías —1.8 "Excavaciones
   BORRAR" y 4.3 "Ampliaciones"— están inactivas y por eso tampoco entran.

   LOS CÓDIGOS NO CHOCAN: el app exige subpartida única por CATÁLOGO, o sea por
   (tipo_obra, bc_works_no) — ver app/api/subpartidas/route.ts. Infra repite a
   propósito los códigos de vivienda (1.2.1, 2.1.1…) y cada casa de socio repite
   los suyos (G1.1.1); son catálogos aparte y así está previsto. Verificado: 0
   choques bajo esa regla.

   En la pantalla estas subpartidas salen como "igual que la partida", que es la
   marca que ya usa el árbol cuando el hijo repite el nombre del padre.

   Idempotente: solo toca partidas que hoy no tienen ninguna subpartida.
   Aplicar sobre AdelanteSBX (donde vive pro_obc, también para producción).

   DESHACER: borrar las subpartidas cuyo código sea el de su partida + '.1' en
   esos tres tipos, creadas hoy.
   ============================================================================ */

INSERT INTO pro_obc.sub_partidas (codigo, nombre, partida_id, sprint_numero, es_critica, activo)
SELECT p.codigo + '.1', p.nombre, p.id, NULL, 0, 1
FROM pro_obc.partidas p
JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
WHERE g.tipo_obra IN ('FABRICA', 'INFRA', 'ADMIN')
  AND g.activo = 1
  AND p.activo = 1
  AND NOT EXISTS (SELECT 1 FROM pro_obc.sub_partidas s WHERE s.partida_id = p.id);
GO

-- ---------------------------------------------------------------------------
-- Verificación: no debe quedar ninguna partida activa sin subpartida en esos
-- tres tipos, y los totales por tipo.
-- ---------------------------------------------------------------------------
WITH pa AS (
    SELECT p.id, g.tipo_obra,
           CASE WHEN EXISTS (SELECT 1 FROM pro_obc.sub_partidas s WHERE s.partida_id = p.id) THEN 0 ELSE 1 END AS sin_sub
    FROM pro_obc.partidas p
    JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
    WHERE p.activo = 1 AND g.activo = 1
)
SELECT tipo_obra, COUNT(*) AS partidas_activas, SUM(sin_sub) AS sin_subpartida
FROM pa GROUP BY tipo_obra ORDER BY tipo_obra;

SELECT g.tipo_obra, COUNT(*) AS subpartidas
FROM pro_obc.sub_partidas s
JOIN pro_obc.partidas p ON p.id = s.partida_id
JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
GROUP BY g.tipo_obra ORDER BY g.tipo_obra;
GO
