/* ============================================================================
   POSTVENTA: el sexto tipo de obra, con el catálogo de las 3 obras PV- de BC

   POR QUÉ: postventa es un mundo aparte y hasta hoy no tenía dónde vivir. Las tres
   obras de post venta de BC (PV-BARANI, PV-ILIOS, PV-NOVARUM) tienen área de costeo
   PRO VIVIENDA, así que caían en el catálogo COMPARTIDO de vivienda: darle "Traer
   de BC" a PV-NOVARUM le metía sus ~200 partidas por casa a TODAS las viviendas.

   QUÉ HACE
   1. Agrega el tipo POSTVENTA (letra P, nivel 1 = "Etapa", orden 6) a
      pro_obc.tipos_obra. Su catálogo es POR OBRA (grupos_partida.bc_works_no), como
      administrativas y fábrica: cada postventa tiene sus bloques y sus casas.
   2. Siembra el catálogo con lo que hoy tiene Business Central **Production**
      (workLines del API adelante/construction, versión "NO" — la única que tienen
      estas obras), con la regla que pidió el negocio:
        · línea "Total"    (Tipo tarea = Total)    → ETAPA   = el bloque
        · línea "Posting"  (Tipo tarea = Auxiliar) → PARTIDA = la casa
        · la SUBPARTIDA es la misma partida        → espejo `<partida>.1`
      PV-BARANI: 2 etapas · 3 partidas · PV-ILIOS: 13 etapas · 28 partidas · PV-NOVARUM: 13 etapas · 204 partidas
      Total: 28 etapas · 235 partidas · 235 subpartidas espejo.

   JERARQUÍA POR ORDEN: casi toda partida dice de qué bloque cuelga por su código
   (VN-C.01 → VN-C), pero PV-MAT "MATERIALES GENERALES" cuelga de PV-GEN "GENERALES
   POST VENTA" y eso solo se ve porque en BC va una debajo de la otra. El app hace
   lo mismo (lib/partidas/tipos-obra.ts → JERARQUIA_POR_ORDEN), así que "Traer de
   BC" reproduce exactamente este árbol.

   EL NOMBRE DE CADA POSTVENTA ("Post Venta Barani"…) sale de dbo.Obra, que vive en
   otra base: por eso el tipo de obra de esas tres filas se marca en la migración
   hermana `2026-09-23_obras_postventa_tipo.sql` (AdelantePRO y AdelanteSBX).

   Idempotente: solo inserta lo que falta, no borra ni mueve nada.
   Aplicar sobre AdelanteSBX (donde vive pro_obc, también para producción):

     node scripts/aplicar-sql.mjs migrations/2026-09-23_tipo_obra_postventa.sql --confirm

   DESHACER: borrar las subpartidas/partidas/grupos con tipo_obra = 'POSTVENTA' y
   la fila POSTVENTA de pro_obc.tipos_obra (en ese orden).
   ============================================================================ */

/* ---------------------------------------------------------------------------
   1) El tipo de obra
   --------------------------------------------------------------------------- */
MERGE pro_obc.tipos_obra AS d
USING (VALUES
    ('POSTVENTA', 'P', N'Postventa', N'Etapa', N'Etapas', 'F', 0, 0, 6)
) AS s (codigo, letra, nombre, termino_grupo, termino_grupo_pl, genero, usa_sprints, usa_tipos_casa, orden)
   ON d.codigo = s.codigo
WHEN MATCHED THEN UPDATE SET
    d.letra = s.letra, d.nombre = s.nombre, d.termino_grupo = s.termino_grupo,
    d.termino_grupo_pl = s.termino_grupo_pl, d.genero = s.genero, d.usa_sprints = s.usa_sprints,
    d.usa_tipos_casa = s.usa_tipos_casa, d.orden = s.orden, d.activo = 1
WHEN NOT MATCHED THEN INSERT (codigo, letra, nombre, termino_grupo, termino_grupo_pl, genero, usa_sprints, usa_tipos_casa, orden, activo)
     VALUES (s.codigo, s.letra, s.nombre, s.termino_grupo, s.termino_grupo_pl, s.genero, s.usa_sprints, s.usa_tipos_casa, s.orden, 1);
GO

/* ---------------------------------------------------------------------------
   2) La estructura tal como está en BC Production (leída el 2026-09-23)
   --------------------------------------------------------------------------- */
DECLARE @src TABLE (
    obra       varchar(20)  NOT NULL,
    cap_cod    varchar(50)  NOT NULL,
    cap_nom    nvarchar(200) NOT NULL,
    cap_orden  smallint     NOT NULL,
    part_cod   varchar(50)  NOT NULL,
    part_nom   nvarchar(200) NOT NULL,
    part_orden smallint     NOT NULL
);

INSERT INTO @src (obra, cap_cod, cap_nom, cap_orden, part_cod, part_nom, part_orden) VALUES
  ('PV-BARANI', 'VB-1', N'BLOQUE 1', 1, 'VB-1.01', N'VB-1.01', 1),
  ('PV-BARANI', 'VB-6', N'BLOQUE 6', 2, 'VB-6.03', N'VB-6.03', 1),
  ('PV-BARANI', 'VB-6', N'BLOQUE 6', 2, 'VB-6.07', N'VB-6.07', 2),
  ('PV-ILIOS', 'PV-GEN', N'GENERALES POST VENTA', 1, 'PV-MAT', N'MATERIALES GENERALES', 1),
  ('PV-ILIOS', 'VI-2', N'VI-2', 2, 'VI-2.07', N'VI-2.07', 1),
  ('PV-ILIOS', 'VI-3', N'BLOQUE 3', 3, 'VI-3.15', N'VI-3.15', 1),
  ('PV-ILIOS', 'VI-4', N'BLOQUE 4', 4, 'VI-4.09', N'VI-4.09', 1),
  ('PV-ILIOS', 'VI-4', N'BLOQUE 4', 4, 'VI-4.10', N'VI-4.10', 2),
  ('PV-ILIOS', 'VI-4', N'BLOQUE 4', 4, 'VI-4.11', N'VI-4.11', 3),
  ('PV-ILIOS', 'VI-4', N'BLOQUE 4', 4, 'VI-4.12', N'VI-4.12', 4),
  ('PV-ILIOS', 'VI-4', N'BLOQUE 4', 4, 'VI-4.13', N'VI-4.13', 5),
  ('PV-ILIOS', 'VI-4', N'BLOQUE 4', 4, 'VI-4.15', N'VI-4.15', 6),
  ('PV-ILIOS', 'VI-4', N'BLOQUE 4', 4, 'VI-4.18', N'VI-4.18', 7),
  ('PV-ILIOS', 'VI-4', N'BLOQUE 4', 4, 'VI-4.20', N'VI-4.20', 8),
  ('PV-ILIOS', 'VI-5', N'BLOQUE 5', 5, 'VI-5.11', N'VI-5.11', 1),
  ('PV-ILIOS', 'VI-6', N'BLOQUE 6', 6, 'VI-6.29', N'VI-6.29', 1),
  ('PV-ILIOS', 'VI-8', N'BLOQUE 8', 7, 'VI-8.20', N'VI-8.20', 1),
  ('PV-ILIOS', 'VI-8', N'BLOQUE 8', 7, 'VI-8.22', N'VI-8.22', 2),
  ('PV-ILIOS', 'VI-8', N'BLOQUE 8', 7, 'VI-8.24', N'VI-8.24', 3),
  ('PV-ILIOS', 'VI-10', N'BLOQUE 10', 8, 'VI-10.21', N'VI-10.21', 1),
  ('PV-ILIOS', 'VI-12', N'BLOQUE 12', 9, 'VI-12.07', N'VI-12.07', 1),
  ('PV-ILIOS', 'VI-13', N'BLOQUE 13', 10, 'VI-13.06', N'VI-13.06', 1),
  ('PV-ILIOS', 'VI-13', N'BLOQUE 13', 10, 'VI-13.19', N'VI-13.19', 2),
  ('PV-ILIOS', 'VI-13', N'BLOQUE 13', 10, 'VI-13.49', N'VI-13.49', 3),
  ('PV-ILIOS', 'VI-13', N'BLOQUE 13', 10, 'VI-13.50', N'VI-13.50', 4),
  ('PV-ILIOS', 'VI-14', N'BLOQUE 14', 11, 'VI-14.11', N'VI-14.11', 1),
  ('PV-ILIOS', 'VI-14', N'BLOQUE 14', 11, 'VI-14.24', N'VI-14.24', 2),
  ('PV-ILIOS', 'VI-14', N'BLOQUE 14', 11, 'VI-14.37', N'VI-14.37', 3),
  ('PV-ILIOS', 'VI-15', N'BLOQUE 15', 12, 'VI-15.25', N'VI-15.25', 1),
  ('PV-ILIOS', 'VI-15', N'BLOQUE 15', 12, 'VI-15.27', N'VI-15.27', 2),
  ('PV-ILIOS', 'VI-16', N'BLOQUE 16', 13, 'VI-16.02', N'VI-16.02', 1),
  ('PV-NOVARUM', 'PV-GEN', N'GENERALES POST VENTA', 1, 'PV-MAT', N'MATERIALES GENERALES', 1),
  ('PV-NOVARUM', 'VN-A', N'BLOQUE A', 2, 'VN-A.02', N'VN-A.02', 1),
  ('PV-NOVARUM', 'VN-B', N'BLOQUE B', 3, 'VN-B.23', N'VN-B.23', 1),
  ('PV-NOVARUM', 'VN-B', N'BLOQUE B', 3, 'VN-B.24', N'VN-B.24', 2),
  ('PV-NOVARUM', 'VN-B', N'BLOQUE B', 3, 'VN-B.25', N'VN-B.25', 3),
  ('PV-NOVARUM', 'VN-B', N'BLOQUE B', 3, 'VN-B.26', N'VN-B.26', 4),
  ('PV-NOVARUM', 'VN-B', N'BLOQUE B', 3, 'VN-B.27', N'VN-B.27', 5),
  ('PV-NOVARUM', 'VN-B', N'BLOQUE B', 3, 'VN-B.29', N'VN-B.29', 6),
  ('PV-NOVARUM', 'VN-B', N'BLOQUE B', 3, 'VN-B.30', N'VN-B.30', 7),
  ('PV-NOVARUM', 'VN-B', N'BLOQUE B', 3, 'VN-B.31', N'VN-B.31', 8),
  ('PV-NOVARUM', 'VN-B', N'BLOQUE B', 3, 'VN-B.32', N'VN-B.32', 9),
  ('PV-NOVARUM', 'VN-B', N'BLOQUE B', 3, 'VN-B.33', N'VN-B.33', 10),
  ('PV-NOVARUM', 'VN-B', N'BLOQUE B', 3, 'VN-B.34', N'VN-B.34', 11),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.01', N'VN-C.01', 1),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.02', N'VN-C.02', 2),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.03', N'VN-C.03', 3),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.04', N'VN-C.04', 4),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.05', N'VN-C.05', 5),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.06', N'VN-C.06', 6),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.07', N'VN-C.07', 7),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.08', N'VN-C.08', 8),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.09', N'VN-C.09', 9),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.10', N'VN-C.10', 10),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.11', N'VN-C.11', 11),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.12', N'VN-C.12', 12),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.13', N'VN-C.13', 13),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.14', N'VN-C.14', 14),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.15', N'VN-C.15', 15),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.16', N'VN-C.16', 16),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.17', N'VN-C.17', 17),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.18', N'VN-C.18', 18),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.19', N'VN-C.19', 19),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.20', N'VN-C.20', 20),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.21', N'VN-C.21', 21),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.22', N'VN-C.22', 22),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.23', N'VN-C.23', 23),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.24', N'VN-C.24', 24),
  ('PV-NOVARUM', 'VN-C', N'BLOQUE C', 4, 'VN-C.25', N'VN-C.25', 25),
  ('PV-NOVARUM', 'VN-D', N'BLOQUE D', 5, 'VN-D.01', N'VN-D.01', 1),
  ('PV-NOVARUM', 'VN-D', N'BLOQUE D', 5, 'VN-D.04', N'VN-D.04', 2),
  ('PV-NOVARUM', 'VN-D', N'BLOQUE D', 5, 'VN-D.05', N'VN-D.05', 3),
  ('PV-NOVARUM', 'VN-D', N'BLOQUE D', 5, 'VN-D.06', N'VN-D.06', 4),
  ('PV-NOVARUM', 'VN-D', N'BLOQUE D', 5, 'VN-D.07', N'VN-D.07', 5),
  ('PV-NOVARUM', 'VN-D', N'BLOQUE D', 5, 'VN-D.08', N'VN-D.08', 6),
  ('PV-NOVARUM', 'VN-D', N'BLOQUE D', 5, 'VN-D.09', N'VN-D.09', 7),
  ('PV-NOVARUM', 'VN-D', N'BLOQUE D', 5, 'VN-D.10', N'VN-D.10', 8),
  ('PV-NOVARUM', 'VN-D', N'BLOQUE D', 5, 'VN-D.11', N'VN-D.11', 9),
  ('PV-NOVARUM', 'VN-D', N'BLOQUE D', 5, 'VN-D.13', N'VN-D.13', 10),
  ('PV-NOVARUM', 'VN-D', N'BLOQUE D', 5, 'VN-D.15', N'VN-D.15', 11),
  ('PV-NOVARUM', 'VN-D', N'BLOQUE D', 5, 'VN-D.16', N'VN-D.16', 12),
  ('PV-NOVARUM', 'VN-D', N'BLOQUE D', 5, 'VN-D.17', N'VN-D.17', 13),
  ('PV-NOVARUM', 'VN-D', N'BLOQUE D', 5, 'VN-D.18', N'VN-D.18', 14),
  ('PV-NOVARUM', 'VN-D', N'BLOQUE D', 5, 'VN-D.19', N'VN-D.19', 15),
  ('PV-NOVARUM', 'VN-D', N'BLOQUE D', 5, 'VN-D.20', N'VN-D.20', 16),
  ('PV-NOVARUM', 'VN-D', N'BLOQUE D', 5, 'VN-D.22', N'VN-D.22', 17),
  ('PV-NOVARUM', 'VN-D', N'BLOQUE D', 5, 'VN-D.23', N'VN-D.23', 18),
  ('PV-NOVARUM', 'VN-E', N'BLOQUE E', 6, 'VN-E.01', N'VN-E.01', 1),
  ('PV-NOVARUM', 'VN-E', N'BLOQUE E', 6, 'VN-E.04', N'VN-E.04', 2),
  ('PV-NOVARUM', 'VN-E', N'BLOQUE E', 6, 'VN-E.06', N'VN-E.06', 3),
  ('PV-NOVARUM', 'VN-E', N'BLOQUE E', 6, 'VN-E.07', N'VN-E.07', 4),
  ('PV-NOVARUM', 'VN-E', N'BLOQUE E', 6, 'VN-E.08', N'VN-E.08', 5),
  ('PV-NOVARUM', 'VN-F', N'BLOQUE F', 7, 'VN-F.01', N'VN-F.01', 1),
  ('PV-NOVARUM', 'VN-F', N'BLOQUE F', 7, 'VN-F.02', N'VN-F.02', 2),
  ('PV-NOVARUM', 'VN-F', N'BLOQUE F', 7, 'VN-F.04', N'VN-F.04', 3),
  ('PV-NOVARUM', 'VN-F', N'BLOQUE F', 7, 'VN-F.06', N'VN-F.06', 4),
  ('PV-NOVARUM', 'VN-F', N'BLOQUE F', 7, 'VN-F.10', N'VN-F.10', 5),
  ('PV-NOVARUM', 'VN-F', N'BLOQUE F', 7, 'VN-F.11', N'VN-F.11', 6),
  ('PV-NOVARUM', 'VN-F', N'BLOQUE F', 7, 'VN-F.12', N'VN-F.12', 7),
  ('PV-NOVARUM', 'VN-F', N'BLOQUE F', 7, 'VN-F.13', N'VN-F.13', 8),
  ('PV-NOVARUM', 'VN-F', N'BLOQUE F', 7, 'VN-F.14', N'VN-F.14', 9),
  ('PV-NOVARUM', 'VN-F', N'BLOQUE F', 7, 'VN-F.17', N'VN-F.17', 10),
  ('PV-NOVARUM', 'VN-F', N'BLOQUE F', 7, 'VN-F.19', N'VN-F.19', 11),
  ('PV-NOVARUM', 'VN-F', N'BLOQUE F', 7, 'VN-F.20', N'VN-F.20', 12),
  ('PV-NOVARUM', 'VN-F', N'BLOQUE F', 7, 'VN-F.21', N'VN-F.21', 13),
  ('PV-NOVARUM', 'VN-F', N'BLOQUE F', 7, 'VN-F.22', N'VN-F.22', 14),
  ('PV-NOVARUM', 'VN-F', N'BLOQUE F', 7, 'VN-F.26', N'VN-F.26', 15),
  ('PV-NOVARUM', 'VN-F', N'BLOQUE F', 7, 'VN-F.29', N'VN-F.29', 16),
  ('PV-NOVARUM', 'VN-F', N'BLOQUE F', 7, 'VN-F.30', N'VN-F.30', 17),
  ('PV-NOVARUM', 'VN-G', N'BLOQUE G', 8, 'VN-G.06', N'VN-G.06', 1),
  ('PV-NOVARUM', 'VN-G', N'BLOQUE G', 8, 'VN-G.10', N'VN-G.10', 2),
  ('PV-NOVARUM', 'VN-G', N'BLOQUE G', 8, 'VN-G.12', N'VN-G.12', 3),
  ('PV-NOVARUM', 'VN-G', N'BLOQUE G', 8, 'VN-G.19', N'VN-G.19', 4),
  ('PV-NOVARUM', 'VN-G', N'BLOQUE G', 8, 'VN-G.28', N'VN-G.28', 5),
  ('PV-NOVARUM', 'VN-G', N'BLOQUE G', 8, 'VN-G.29', N'VN-G.29', 6),
  ('PV-NOVARUM', 'VN-G', N'BLOQUE G', 8, 'VN-G.38', N'VN-G.38', 7),
  ('PV-NOVARUM', 'VN-G', N'BLOQUE G', 8, 'VN-G.43', N'VN-G.43', 8),
  ('PV-NOVARUM', 'VN-G', N'BLOQUE G', 8, 'VN-G.47', N'VN-G.47', 9),
  ('PV-NOVARUM', 'VN-G', N'BLOQUE G', 8, 'VN-G.50', N'VN-G.50', 10),
  ('PV-NOVARUM', 'VN-H', N'BLOQUE H', 9, 'VN-H.01', N'VN-H.01', 1);

INSERT INTO @src (obra, cap_cod, cap_nom, cap_orden, part_cod, part_nom, part_orden) VALUES
  ('PV-NOVARUM', 'VN-H', N'BLOQUE H', 9, 'VN-H.03', N'VN-H.03', 2),
  ('PV-NOVARUM', 'VN-H', N'BLOQUE H', 9, 'VN-H.07', N'VN-H.07', 3),
  ('PV-NOVARUM', 'VN-H', N'BLOQUE H', 9, 'VN-H.09', N'VN-H.09', 4),
  ('PV-NOVARUM', 'VN-H', N'BLOQUE H', 9, 'VN-H.11', N'VN-H.11', 5),
  ('PV-NOVARUM', 'VN-H', N'BLOQUE H', 9, 'VN-H.13', N'VN-H.13', 6),
  ('PV-NOVARUM', 'VN-H', N'BLOQUE H', 9, 'VN-H.16', N'VN-H.16', 7),
  ('PV-NOVARUM', 'VN-H', N'BLOQUE H', 9, 'VN-H.20', N'VN-H.20', 8),
  ('PV-NOVARUM', 'VN-H', N'BLOQUE H', 9, 'VN-H.21', N'VN-H.21', 9),
  ('PV-NOVARUM', 'VN-H', N'BLOQUE H', 9, 'VN-H.23', N'VN-H.23', 10),
  ('PV-NOVARUM', 'VN-H', N'BLOQUE H', 9, 'VN-H.30', N'VN-H.30', 11),
  ('PV-NOVARUM', 'VN-H', N'BLOQUE H', 9, 'VN-H.31', N'VN-H.31', 12),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.01', N'VN-I.01', 1),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.02', N'VN-I.02', 2),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.03', N'VN-I.03', 3),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.04', N'VN-I.04', 4),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.05', N'VN-I.05', 5),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.06', N'VN-I.06', 6),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.07', N'VN-I.07', 7),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.09', N'VN-I.09', 8),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.10', N'VN-I.10', 9),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.11', N'VN-I.11', 10),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.12', N'VN-I.12', 11),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.14', N'VN-I.14', 12),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.15', N'VN-I.15', 13),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.16', N'VN-I.16', 14),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.17', N'VN-I.17', 15),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.18', N'VN-I.18', 16),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.19', N'VN-I.19', 17),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.20', N'VN-I.20', 18),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.23', N'VN-I.23', 19),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.24', N'VN-I.24', 20),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.25', N'VN-I.25', 21),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.26', N'VN-I.26', 22),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.27', N'VN-I.27', 23),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.28', N'VN-I.28', 24),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.29', N'VN-I.29', 25),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.30', N'VN-I.30', 26),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.31', N'VN-I.31', 27),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.32', N'VN-I.32', 28),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.34', N'VN-I.34', 29),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.35', N'VN-I.35', 30),
  ('PV-NOVARUM', 'VN-I', N'BLOQUE I', 10, 'VN-I.40', N'VN-I.40', 31),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.01', N'VN-J.01', 1),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.02', N'VN-J.02', 2),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.03', N'VN-J.03', 3),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.04', N'VN-J.04', 4),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.07', N'VN-J.07', 5),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.09', N'VN-J.09', 6),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.13', N'VN-J.13', 7),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.14', N'VN-J.14', 8),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.15', N'VN-J.15', 9),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.16', N'VN-J.16', 10),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.17', N'VN-J.17', 11),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.19', N'VN-J.19', 12),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.20', N'VN-J.20', 13),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.21', N'VN-J.21', 14),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.22', N'VN-J.22', 15),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.23', N'VN-J.23', 16),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.24', N'VN-J.24', 17),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.25', N'VN-J.25', 18),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.26', N'VN-J.26', 19),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.27', N'VN-J.27', 20),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.31', N'VN-J.31', 21),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.32', N'VN-J.32', 22),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.33', N'VN-J.33', 23),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.34', N'VN-J.34', 24),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.36', N'VN-J.36', 25),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.37', N'VN-J.37', 26),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.38', N'VN-J.38', 27),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.39', N'VN-J.39', 28),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.40', N'VN-J.40', 29),
  ('PV-NOVARUM', 'VN-J', N'BLOQUE J', 11, 'VN-J.41', N'VN-J.41', 30),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-K.02', N'VN-K.02', 1),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-K.03', N'VN-K.03', 2),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-K.05', N'VN-K.05', 3),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-K.06', N'VN-K.06', 4),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-K.07', N'VN-K.07', 5),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-K.08', N'VN-K.08', 6),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-K.09', N'VN-K.09', 7),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-K.10', N'VN-K.10', 8),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-K.11', N'VN-K.11', 9),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-K.12', N'VN-K.12', 10),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-K.13', N'VN-K.13', 11),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-K.14', N'VN-K.14', 12),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-K.15', N'VN-K.15', 13),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-K.18', N'VN-K.18', 14),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-K.21', N'VN-K.21', 15),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-K.22', N'VN-K.22', 16),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-K.23', N'VN-K.23', 17),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-K.24', N'VN-K.24', 18),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-K.25', N'VN-K.25', 19),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-K.26', N'VN-K.26', 20),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-K.27', N'VN-K.27', 21),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-L.05', N'VN-L.05', 22),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-L.15', N'VN-L.15', 23),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-L.33', N'VN-L.33', 24),
  ('PV-NOVARUM', 'VN-K', N'BLOQUE K', 12, 'VN-L.52', N'VN-L.52', 25),
  ('PV-NOVARUM', 'VN-M', N'BLOQUE M', 13, 'VN-M.03', N'VN-M.03', 1),
  ('PV-NOVARUM', 'VN-M', N'BLOQUE M', 13, 'VN-M.05', N'VN-M.05', 2),
  ('PV-NOVARUM', 'VN-M', N'BLOQUE M', 13, 'VN-M.06', N'VN-M.06', 3),
  ('PV-NOVARUM', 'VN-M', N'BLOQUE M', 13, 'VN-M.07', N'VN-M.07', 4),
  ('PV-NOVARUM', 'VN-M', N'BLOQUE M', 13, 'VN-M.08', N'VN-M.08', 5),
  ('PV-NOVARUM', 'VN-M', N'BLOQUE M', 13, 'VN-M.10', N'VN-M.10', 6),
  ('PV-NOVARUM', 'VN-M', N'BLOQUE M', 13, 'VN-M.11', N'VN-M.11', 7),
  ('PV-NOVARUM', 'VN-M', N'BLOQUE M', 13, 'VN-M.12', N'VN-M.12', 8),
  ('PV-NOVARUM', 'VN-M', N'BLOQUE M', 13, 'VN-M.13', N'VN-M.13', 9),
  ('PV-NOVARUM', 'VN-M', N'BLOQUE M', 13, 'VN-M.14', N'VN-M.14', 10),
  ('PV-NOVARUM', 'VN-M', N'BLOQUE M', 13, 'VN-M.15', N'VN-M.15', 11),
  ('PV-NOVARUM', 'VN-M', N'BLOQUE M', 13, 'VN-M.16', N'VN-M.16', 12),
  ('PV-NOVARUM', 'VN-M', N'BLOQUE M', 13, 'VN-M.17', N'VN-M.17', 13),
  ('PV-NOVARUM', 'VN-M', N'BLOQUE M', 13, 'VN-M.21', N'VN-M.21', 14),
  ('PV-NOVARUM', 'VN-M', N'BLOQUE M', 13, 'VN-M.22', N'VN-M.22', 15),
  ('PV-NOVARUM', 'VN-M', N'BLOQUE M', 13, 'VN-M.23', N'VN-M.23', 16),
  ('PV-NOVARUM', 'VN-M', N'BLOQUE M', 13, 'VN-M.24', N'VN-M.24', 17),
  ('PV-NOVARUM', 'VN-M', N'BLOQUE M', 13, 'VN-M.26', N'VN-M.26', 18);

-- 2.1) Etapas (las líneas "Total" de BC), una por obra.
INSERT INTO pro_obc.grupos_partida (codigo, nombre, tipo_obra, orden, activo, creado_en, bc_works_no, bc_task_no)
SELECT DISTINCT s.cap_cod, s.cap_nom, 'POSTVENTA', s.cap_orden, 1, SYSUTCDATETIME(), s.obra, s.cap_cod
FROM @src s
WHERE NOT EXISTS (
    SELECT 1 FROM pro_obc.grupos_partida g
    WHERE g.tipo_obra = 'POSTVENTA' AND g.bc_works_no = s.obra AND g.codigo = s.cap_cod);

-- 2.2) Partidas (las líneas "Auxiliar"/Posting): cada casa dentro de su bloque.
INSERT INTO pro_obc.partidas (codigo, nombre, grupo_id, orden, activo, bc_task_no, creado_en)
SELECT s.part_cod, s.part_nom, g.id, s.part_orden, 1, s.part_cod, SYSUTCDATETIME()
FROM @src s
JOIN pro_obc.grupos_partida g
  ON g.tipo_obra = 'POSTVENTA' AND g.bc_works_no = s.obra AND g.codigo = s.cap_cod
WHERE NOT EXISTS (SELECT 1 FROM pro_obc.partidas p WHERE p.grupo_id = g.id AND p.codigo = s.part_cod);

-- 2.3) La subpartida ES la partida: espejo `<partida>.1` con el mismo nombre.
INSERT INTO pro_obc.sub_partidas (codigo, nombre, partida_id, sprint_numero, es_critica, activo)
SELECT p.codigo + '.1', p.nombre, p.id, NULL, 0, 1
FROM pro_obc.partidas p
JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
WHERE g.tipo_obra = 'POSTVENTA' AND g.activo = 1 AND p.activo = 1
  AND NOT EXISTS (SELECT 1 FROM pro_obc.sub_partidas sp WHERE sp.partida_id = p.id);
GO

/* ---------------------------------------------------------------------------
   3) Verificación: el árbol por obra y que no quede partida sin subpartida
   --------------------------------------------------------------------------- */
SELECT g.bc_works_no AS obra,
       COUNT(DISTINCT g.id)  AS etapas,
       COUNT(DISTINCT p.id)  AS partidas,
       COUNT(DISTINCT sp.id) AS subpartidas
FROM pro_obc.grupos_partida g
LEFT JOIN pro_obc.partidas p      ON p.grupo_id = g.id AND p.activo = 1
LEFT JOIN pro_obc.sub_partidas sp ON sp.partida_id = p.id AND sp.activo = 1
WHERE g.tipo_obra = 'POSTVENTA' AND g.activo = 1
GROUP BY g.bc_works_no
ORDER BY obra;

SELECT COUNT(*) AS partidas_sin_subpartida
FROM pro_obc.partidas p
JOIN pro_obc.grupos_partida g ON g.id = p.grupo_id
WHERE g.tipo_obra = 'POSTVENTA' AND p.activo = 1
  AND NOT EXISTS (SELECT 1 FROM pro_obc.sub_partidas sp WHERE sp.partida_id = p.id);
GO
