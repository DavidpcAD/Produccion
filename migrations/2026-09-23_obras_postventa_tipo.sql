/* ============================================================================
   Las 3 obras de post venta pasan a ser del tipo POSTVENTA

   POR QUÉ: PV-BARANI, PV-ILIOS y PV-NOVARUM tienen área de costeo PRO VIVIENDA en
   Business Central, así que el app las deducía como VIVIENDA y trabajaban contra el
   catálogo COMPARTIDO de vivienda. Dos problemas: el árbol de postventa (bloque →
   casa) no tiene nada que ver con el de una casa (Obra Gris → Acabados…), y darle
   "Traer de BC" a PV-NOVARUM le metía sus ~200 partidas por casa a TODAS las
   viviendas. Con `dbo.Obra.tipoObra` lleno manda lo elegido y ya no se deduce.

   QUÉ HACE
   1. Marca `tipoObra = 'POSTVENTA'` en esas tres obras. El tipo y su catálogo se
      crean en la migración hermana `2026-09-23_tipo_obra_postventa.sql`, que va
      sobre AdelanteSBX (ahí vive pro_obc, también para producción).
   2. Da de alta PV-BARANI si falta — en AdelanteSBX no estaba y sin la fila el
      árbol muestra la obra sin nombre ("Post Venta Barani" sale de acá, no de
      pro_obc). En AdelantePRO ya existe y no hace nada.

   Idempotente. Va en LAS DOS bases, porque dbo.Obra es la del app:

     node scripts/aplicar-sql.mjs migrations/2026-09-23_obras_postventa_tipo.sql --confirm
     node scripts/aplicar-sql.mjs migrations/2026-09-23_obras_postventa_tipo.sql --destino=AdelantePRO --confirm --si-es-produccion

   DESHACER: `UPDATE dbo.Obra SET tipoObra = NULL WHERE numeroObra LIKE 'PV-%'`
   (vuelven a deducirse como vivienda por el área de costeo).
   ============================================================================ */

-- 1) Alta de la obra que falte (solo AdelanteSBX; en PRO ya están las tres).
--    idProyecto se copia de una hermana para no inventar un proyecto que no exista
--    en esta base: las tres postventas cuelgan del mismo.
IF NOT EXISTS (SELECT 1 FROM dbo.Obra WHERE numeroObra = 'PV-BARANI')
BEGIN
    INSERT INTO dbo.Obra (numeroObra, nombreMostrado, centroCosto, areaCosteo, estado,
                          idProyecto, tipoObra, fechaCreacion, creadoPor)
    SELECT 'PV-BARANI', N'Post Venta Barani', 'PV-BARANI', 'PRO VIVIENDA', 'Open',
           (SELECT TOP 1 idProyecto FROM dbo.Obra WHERE numeroObra IN ('PV-ILIOS', 'PV-NOVARUM') AND idProyecto IS NOT NULL),
           'POSTVENTA', SYSUTCDATETIME(), 'migracion-postventa';
END
GO

-- 2) El tipo de obra de las tres.
UPDATE dbo.Obra
   SET tipoObra = 'POSTVENTA',
       fechaModificacion = SYSUTCDATETIME(),
       modificadoPor = 'migracion-postventa'
WHERE numeroObra IN ('PV-BARANI', 'PV-ILIOS', 'PV-NOVARUM')
  AND ISNULL(tipoObra, '') <> 'POSTVENTA';
GO

-- Verificación: las tres, con su nombre y su tipo.
SELECT numeroObra, nombreMostrado, areaCosteo, tipoObra
FROM dbo.Obra
WHERE numeroObra LIKE 'PV-%'
ORDER BY numeroObra;
GO
