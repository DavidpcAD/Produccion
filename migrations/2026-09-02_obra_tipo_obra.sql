/* ============================================================================
   TIPO DE OBRA en la obra (dbo.Obra.tipoObra)

   POR QUÉ: el tipo de obra (O Obra Vivienda · I Infraestructura · A
   Administrativa · F Fábrica · T Torres) se venía DEDUCIENDO del área de costeo
   de BC (`pro_obc.tipo_obra_area_costeo`). Eso alcanza para lo que ya existe,
   pero al CREAR una obra en el app no había forma de decir de qué tipo es, y hay
   casos que la deducción no puede resolver:
     · Torres no tiene área de costeo propia en BC todavía → toda obra de torres
       caería en administrativa.
     · Hay áreas que mienten: VB-5.13 está como 'PRO LOTES' en AdelantePRO y es
       una casa.

   QUÉ HACE: agrega `tipoObra varchar(20) NULL` a dbo.Obra.
     · con valor → MANDA sobre el área de costeo (es lo que eligió la gente).
     · NULL      → se sigue deduciendo del área de costeo, como hasta hoy.
   No se rellena nada: las obras existentes quedan en NULL y siguen deduciéndose,
   así que nada cambia de comportamiento por aplicar esto.

   Sin FK a `pro_obc.tipos_obra` a propósito: esa tabla vive en AdelanteSBX y
   dbo.Obra en la base del app (AdelantePRO en producción) — son bases distintas y
   Azure SQL no permite FK cross-database. La validación de los 5 códigos la hace
   /api/obras contra pro_obc.tipos_obra.

   Idempotente. Aplicar en LAS DOS bases del app:
     node scripts/aplicar-sql.mjs migrations/2026-09-02_obra_tipo_obra.sql --confirm
     node scripts/aplicar-sql.mjs migrations/2026-09-02_obra_tipo_obra.sql --destino=AdelantePRO --confirm --si-es-produccion
   ============================================================================ */

IF COL_LENGTH('dbo.Obra', 'tipoObra') IS NULL
    ALTER TABLE dbo.Obra ADD tipoObra varchar(20) NULL;
GO

-- Verificación: la columna existe y nadie quedó con un tipo raro (todas NULL
-- recién aplicado = todo se sigue deduciendo del área de costeo).
SELECT
    (SELECT COUNT(*) FROM sys.columns
      WHERE object_id = OBJECT_ID('dbo.Obra') AND name = 'tipoObra') AS columna_existe,
    (SELECT COUNT(*) FROM dbo.Obra) AS obras,
    (SELECT COUNT(*) FROM dbo.Obra WHERE tipoObra IS NULL) AS sin_tipo_explicito;
GO

SELECT ISNULL(tipoObra, '(deducido del área de costeo)') AS tipo_obra, COUNT(*) AS obras
FROM dbo.Obra
GROUP BY tipoObra
ORDER BY obras DESC;
GO
