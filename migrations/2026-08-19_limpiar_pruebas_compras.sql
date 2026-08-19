/* ============================================================================
   Limpieza de datos de prueba en los catálogos de Compras — AdelanteSBX
   Fecha: 2026-08-19
   Motivo: dejar los catálogos limpios ANTES de copiarlos a AdelantePRO.
   Idempotente. Solo toca catálogos; NO toca pedidos, órdenes ni obras.

   Verificado antes de escribir (conteos en SBX al 2026-08-19):
     - Partida 9.9 "PRUEBA CLAUDE (borrar)": 0 subpartidas, 0 clasificaciones.
     - clasificacion 11 "dfkjhbreurgbehug": 0 pedidos, 0 plantillas.
     - clasificacion  2 "prueba": 0 pedidos, pero SÍ 2 plantillas
         · 17 "asdad"                (ya estaba borrada)
         · 28 "Pedido Acero General" (ACTIVA, de laura) ← plantilla real
       Por eso primero se desvincula (idClasificacion = NULL, columna nullable)
       y después se borra la clasificación. La plantilla sobrevive; queda sin
       clasificación para que laura la vuelva a ligar a la correcta.
     - Plantillas 18 "23ee", 22 "adasdas", 56 "laura prueba", 57 "prueba 2":
       nadie las referencia. Se marcan esEliminada=1 (el mismo borrado que hace
       el botón de la app; reversible) en vez de DELETE.
   ============================================================================ */

/* ---------- 1) Plantillas de prueba → borrado suave ---------- */
UPDATE dbo.PlantillaSolicitud
   SET esEliminada = 1,
       fechaModificacion = SYSUTCDATETIME(),
       modificadoPor = N'limpieza-pre-PRO'
 WHERE esEliminada = 0
   AND idPlantillaSolicitud IN (18, 22, 56, 57);
GO

/* ---------- 2) Desvincular las plantillas de la clasificación "prueba" ---------- */
UPDATE dbo.PlantillaSolicitud
   SET idClasificacion = NULL,
       fechaModificacion = SYSUTCDATETIME(),
       modificadoPor = N'limpieza-pre-PRO'
 WHERE idClasificacion = 2;
GO

/* ---------- 3) Clasificaciones de prueba ---------- */
DELETE FROM dbo.clasificacion
 WHERE id IN (2, 11)
   AND NOT EXISTS (SELECT 1 FROM dbo.PedidoCompra       p WHERE p.idClasificacion = dbo.clasificacion.id)
   AND NOT EXISTS (SELECT 1 FROM dbo.PlantillaSolicitud s WHERE s.idClasificacion = dbo.clasificacion.id);
GO

/* ---------- 4) Partida de prueba 9.9 ---------- */
DELETE FROM dbo.Partida
 WHERE codigo = '9.9'
   AND NOT EXISTS (SELECT 1 FROM dbo.SubPartida    s WHERE s.idPartida   = dbo.Partida.idPartida)
   AND NOT EXISTS (SELECT 1 FROM dbo.clasificacion c WHERE c.partida_id  = dbo.Partida.idPartida);
GO

/* ---------- NO se toca ----------------------------------------------------
   La subpartida "4.1.1 Extras" cuelga de la partida 3.2 MECÁNICO y su código
   no calza con el de su partida. NO es dato de prueba: es una subpartida real
   mal codificada, y renumerarla es decisión de ingeniería (además el código
   viaja en los pedidos históricos). Se deja como está.
   -------------------------------------------------------------------------- */
