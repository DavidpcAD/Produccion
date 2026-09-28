/* ============================================================================
   F-MADERAS: las partidas son las 44 tareas de BC · y F-MUEBLES se queda sin las
   subpartidas espejo, porque las subpartidas las crea Luis Roberto

   POR QUÉ (WhatsApp del 28/09/2026, mismo hilo que `2026-09-28_muebles_como_bc.sql`):
     — «Ocupo que queden igual que BC.»
     — «Fabrica Muebles BC cuando lo tiene yo creo las subpartidas» / «Así. Yo creo
        las subpartidas.»
     — David: «Muebles y maderas.»
     — Y a la 1:50 p. m.: «Ya yo creé en F-Maderas las subpartidas que ellos ocupaban»
        (se ve en la base: creó la etapa ACB y las partidas ACB-01/ACB-02 con 8+8
        subpartidas de lijado y laqueo, entre las 13:39 y las 13:44 hora de acá).
   O sea: el app pone las PARTIDAS que BC tiene; las SUBPARTIDAS las pone él a mano.

   QUÉ HACE
     1. F-MADERAS: crea la etapa ACB 'Acabadao Maderas' si falta (en producción ya la
        creó él; en SBX no estaba).
     2. F-MADERAS: crea las partidas de BC que falten — 44 en total, de las cuales hoy
        solo existen 7 (ACB-01, ACB-02 y FG-01..FG-05). SIN subpartidas: las crea él.
     3. F-MUEBLES: borra las 3 subpartidas espejo `F-INST.1 / F-SM.1 / F-TAP.1` que
        creó `2026-09-28_muebles_como_bc.sql` hace un rato. Se le dejan las 3 partidas
        de BC limpias para que él cuelgue las suyas.

   LO QUE **NO** HACE, y hay que preguntarle a Luis Roberto (ver el SELECT del final):
   F-MADERAS tiene 17 partidas `<MÁQUINA>-MAQ` que BC NO tiene (las inventó
   `2026-09-17_fabrica_solo_estructura_nueva.sql`: una por máquina) y 4 máquinas que
   BC tampoco tiene (FCAN Canteadora, FREC Recanteadora, FESC Escuadradora, FCHI
   Chipeo). Por la regla de él —lo que no está en BC no llega— deberían salir, PERO
   están EN USO: las 17 subpartidas `-MAQ.1` cuelgan de la cuadrilla «Maderas y
   Muebles» y tres de ellas (FAS-MAQ.1, FFJ-MAQ.1, FLA-MAQ.1) tienen renglones
   ABIERTOS en `h4.ObraSubpartida` creados por allisonm el 25 y el 28 de septiembre.
   Borrarlas o apagarlas se lleva puesto ese trabajo, así que se deja como está hasta
   que él diga a qué tarea de BC se mueven.

   Va sobre dbo de la base PRINCIPAL (AdelantePRO en producción, AdelanteSBX en local).
   Idempotente: corrida dos veces no hace nada. NO toca BC.
   ============================================================================ */

-- ---------------------------------------------------------------------------
-- 1) La etapa ACB (capítulo "Total" de BC que faltaba en el catálogo).
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.Etapa
               WHERE tipoObra = 'FABRICA' AND bcWorksNo = 'F-MADERAS' AND codigo = 'ACB')
    INSERT INTO dbo.Etapa (codigo, nombre, activo, creado_en, tipoObra, bcTaskNo, bcWorksNo, orden)
    SELECT 'ACB', N'Acabadao Maderas', 1, SYSUTCDATETIME(), 'FABRICA', 'ACB', 'F-MADERAS',
           (SELECT ISNULL(MAX(orden), 0) + 1 FROM dbo.Etapa WHERE tipoObra = 'FABRICA' AND bcWorksNo = 'F-MADERAS');
GO

-- ---------------------------------------------------------------------------
-- 2) Las 44 tareas "Posting" de BC Production (leídas el 28/09/2026, versión 'NO').
--    `capitulo` es el prefijo del código, que es como BC las agrupa bajo su "Total".
--    esPosting = 0: solo el catálogo compartido de vivienda lo lleva en 1.
-- ---------------------------------------------------------------------------
DECLARE @bc TABLE (capitulo VARCHAR(50), codigo VARCHAR(50), nombre NVARCHAR(160), orden INT);
INSERT INTO @bc (capitulo, codigo, nombre, orden) VALUES
    ('ACB', 'ACB-01', N'Lijado Maderas', 1),
    ('ACB', 'ACB-02', N'Laqueado Maderas', 2),
    ('FAS', 'FAS-01', N'Aserrio', 3),
    ('FED', 'FED-01', N'Encolado Sencillo', 4),
    ('FED', 'FED-02', N'Encolado Doble', 5),
    ('FES', 'FES-01', N'Encolado Sencillo', 6),
    ('FFJ', 'FFJ-01', N'Finger Expuesto H=100mm', 7),
    ('FFJ', 'FFJ-02', N'Finger Oculto H=100mm', 8),
    ('FG', 'FG-01', N'Limpieza Fabrica', 9),
    ('FG', 'FG-02', N'Mantenimiento Maquinas', 10),
    ('FG', 'FG-03', N'Recepcion Material', 11),
    ('FG', 'FG-04', N'Complementarias', 12),
    ('FG', 'FG-05', N'Instalación de muebles', 13),
    ('FIM', 'FIM-01', N'Impregnacion R=1.8 kg', 14),
    ('FIM', 'FIM-02', N'Impregnacion R=2.4 kg', 15),
    ('FIM', 'FIM-03', N'Impregnacion R=3.2 kg', 16),
    ('FLA', 'FLA-01', N'Lijado Sencillo', 17),
    ('FLA', 'FLA-02', N'Lijado Doble Rodillo', 18),
    ('FM', 'FM-01', N'Rodapie Redondo+Rebaje Inferior', 19),
    ('FM', 'FM-02', N'Rodapie Angulo+Rebaje Inferior', 20),
    ('FM', 'FM-03', N'Rodapie Redondo+Rebaje Inferior+P.Cable', 21),
    ('FM', 'FM-04', N'Rodapie Angulo+Rebaje Inferior+P.Cable', 22),
    ('FM', 'FM-05', N'Marco Seguridad Sencillo', 23),
    ('FM', 'FM-06', N'Marco de Seguridad Borde Redondo', 24),
    ('FM', 'FM-07', N'Marco Seguridasd Borde Redondo+Ranura', 25),
    ('FM', 'FM-08', N'Moldura L Marco Seguridad', 26),
    ('FM', 'FM-09', N'Deck Borde Redondo', 27),
    ('FM', 'FM-10', N'Deck Borde Redondo Ranurado', 28),
    ('FM', 'FM-11', N'Siding Media Madera', 29),
    ('FM', 'FM-12', N'Siding Machimbre o Piso Cielo', 30),
    ('FM', 'FM-13', N'Moldura Ranurada Machimbre', 31),
    ('FM', 'FM-14', N'Moldura Ranurada Para Panel', 32),
    ('FM', 'FM-15', N'Moldura Redonda 4 Esquinas', 33),
    ('FM', 'FM-16', N'Cepillado 2 Caras', 34),
    ('FM', 'FM-17', N'Cepillado 4 Caras', 35),
    ('FM', 'FM-18', N'Corte Sierra', 36),
    ('FPC', 'FPC-01', N'Prensado Caliente', 37),
    ('FPF', 'FPF-01', N'Prensado', 38),
    ('FPP', 'FPP-01', N'Prensado 3 Hrs', 39),
    ('FPP', 'FPP-02', N'Prensado 4 Hrs', 40),
    ('FPV', 'FPV-01', N'Prensado 1 Seccion', 41),
    ('FPV', 'FPV-02', N'Prensado 2 Secciones', 42),
    ('FSM', 'FSM-01', N'Secado de Madera', 43),
    ('FTR', 'FTR-01', N'Corte', 44);

INSERT INTO dbo.Partida (codigo, nombre, idEtapa, orden, esActivo, bcTaskNo, fechaCreacion, esPosting)
SELECT b.codigo, b.nombre, e.id, b.orden, 1, b.codigo, SYSUTCDATETIME(), 0
FROM @bc b
JOIN dbo.Etapa e ON e.tipoObra = 'FABRICA' AND e.bcWorksNo = 'F-MADERAS' AND e.codigo = b.capitulo
WHERE NOT EXISTS (SELECT 1 FROM dbo.Partida p WHERE p.idEtapa = e.id AND p.codigo = b.codigo);

-- Las que no encontraron su capítulo (no debería salir ninguna).
SELECT b.codigo AS sinCapitulo, b.capitulo
FROM @bc b
WHERE NOT EXISTS (SELECT 1 FROM dbo.Etapa e
                  WHERE e.tipoObra = 'FABRICA' AND e.bcWorksNo = 'F-MADERAS' AND e.codigo = b.capitulo);
GO

-- ---------------------------------------------------------------------------
-- 3) F-MUEBLES sin las espejo: las subpartidas las crea él.
--    Solo si nadie las tocó todavía (cuadrilla, pedido, H4...).
-- ---------------------------------------------------------------------------
DELETE s
FROM dbo.SubPartida s
JOIN dbo.Partida p ON p.idPartida = s.idPartida
JOIN dbo.Etapa e ON e.id = p.idEtapa
WHERE e.tipoObra = 'FABRICA' AND e.bcWorksNo = 'F-MUEBLES'
  AND s.codigo IN ('F-INST.1', 'F-SM.1', 'F-TAP.1')
  AND s.nombre = p.nombre
  AND NOT EXISTS (SELECT 1 FROM dbo.Cuadrilla x           WHERE x.idSubPartida = s.idSubPartida)
  AND NOT EXISTS (SELECT 1 FROM dbo.CuadrillaSubPartida x WHERE x.idSubPartida = s.idSubPartida)
  AND NOT EXISTS (SELECT 1 FROM dbo.EncargadoPartida x    WHERE x.idSubPartida = s.idSubPartida)
  AND NOT EXISTS (SELECT 1 FROM dbo.PedidoCompra x        WHERE x.idSubPartida = s.idSubPartida)
  AND NOT EXISTS (SELECT 1 FROM dbo.PlantillaSolicitud x  WHERE x.idSubPartida = s.idSubPartida)
  AND NOT EXISTS (SELECT 1 FROM dbo.SubPartidaTipoCasa x  WHERE x.idSubPartida = s.idSubPartida)
  AND NOT EXISTS (SELECT 1 FROM h4.ObraSubpartida x       WHERE x.idSubpartida = s.idSubPartida)
  AND NOT EXISTS (SELECT 1 FROM dbo.clasificacion x       WHERE x.sub_partida_id = s.idSubPartida);
GO

-- ---------------------------------------------------------------------------
-- Verificación 1: F-MADERAS y F-MUEBLES contra BC.
--   F-MADERAS  → 15 etapas de BC + 4 sin BC · 44 partidas de BC + 17 `-MAQ`
--   F-MUEBLES  →  1 etapa · 3 partidas · 0 subpartidas
-- ---------------------------------------------------------------------------
SELECT e.bcWorksNo AS obra,
       COUNT(DISTINCT e.id) AS etapas,
       SUM(CASE WHEN p.bcTaskNo IS NOT NULL THEN 1 ELSE 0 END) AS partidasDeBC,
       SUM(CASE WHEN p.idPartida IS NOT NULL AND p.bcTaskNo IS NULL THEN 1 ELSE 0 END) AS partidasSinBC,
       (SELECT COUNT(*) FROM dbo.SubPartida s
        JOIN dbo.Partida p2 ON p2.idPartida = s.idPartida
        JOIN dbo.Etapa e2 ON e2.id = p2.idEtapa
        WHERE e2.bcWorksNo = e.bcWorksNo) AS subpartidas
FROM dbo.Etapa e
LEFT JOIN dbo.Partida p ON p.idEtapa = e.id
WHERE e.tipoObra = 'FABRICA' AND e.bcWorksNo IN ('F-MADERAS', 'F-MUEBLES')
GROUP BY e.bcWorksNo;
GO

-- ---------------------------------------------------------------------------
-- Verificación 2: LO QUE QUEDA FUERA DE BC EN F-MADERAS, con lo que le cuelga.
-- Esta es la lista para preguntarle a Luis Roberto.
-- ---------------------------------------------------------------------------
SELECT e.codigo AS maquina,
       CASE WHEN e.bcTaskNo IS NULL THEN 'la máquina tampoco está en BC' ELSE '' END AS nota,
       p.codigo AS partidaSinBC, s.codigo AS subpartida,
       (SELECT COUNT(*) FROM dbo.CuadrillaSubPartida x WHERE x.idSubPartida = s.idSubPartida) AS cuadrillas,
       (SELECT COUNT(*) FROM h4.ObraSubpartida x WHERE x.idSubpartida = s.idSubPartida) AS renglonesH4
FROM dbo.Partida p
JOIN dbo.Etapa e ON e.id = p.idEtapa
LEFT JOIN dbo.SubPartida s ON s.idPartida = p.idPartida
WHERE e.tipoObra = 'FABRICA' AND e.bcWorksNo = 'F-MADERAS' AND p.bcTaskNo IS NULL
ORDER BY e.codigo, p.codigo;
GO
