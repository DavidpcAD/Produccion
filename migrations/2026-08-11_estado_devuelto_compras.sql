/* ============================================================================
   Compras: estado "Devuelto" para pedidos (flujo Proveeduría → Ingeniería).

   El flujo de "Devolver al ingeniero" marca el pedido como devuelto, y la bandeja
   Ingeniería → Devoluciones lista los pedidos con estado = "devuelto". Pero en SQL
   NO existía la fila `dbo.Estado` "Devuelto" (módulo Compras), así que el estado
   no se podía persistir (quedaba en NULL → se leía como "borrador") y nunca
   aparecía en Devoluciones.

   Nota: `lib/compras/repo.ts::ensureEstados()` ya auto-crea (IF NOT EXISTS) los
   estados listados en NOMBRE_POR_CODIGO, así que en cada entorno se cura solo al
   primer uso tras el deploy. Esta migración lo deja explícito/idempotente.

   Idempotente. Correr sobre AdelanteSBX (y PRO al desplegar).
   ============================================================================ */

IF NOT EXISTS (SELECT 1 FROM dbo.Estado WHERE estado = 'Devuelto' AND modulo = 'Compras')
    INSERT dbo.Estado (estado, modulo, fechaCreacion, creadoPor)
    VALUES ('Devuelto', 'Compras', SYSUTCDATETIME(), 'sistema');
GO
