/* ============================================================================
   Compras: backfill del estado del PEDIDO a "En orden".

   Bug: repo.createOrden actualizaba las cantidades ordenadas de las líneas del
   pedido pero NO avanzaba el estado del pedido en SQL (el modo demo sí lo hacía).
   Resultado: pedidos totalmente ordenados quedaban en "Aprobado" y en
   "mis solicitudes" / la matriz nunca reflejaban que ya estaban en orden.

   El código ya se corrigió (createOrden pone "En orden" cuando todas las líneas
   quedan ordenadas). Esta migración cura los pedidos YA existentes que quedaron
   atascados en "Aprobado" estando totalmente ordenados.

   Solo toca "Aprobado" (no pisa "Devuelto"/"Cerrado"/"Borrador"). Idempotente.
   Correr sobre AdelanteSBX (y PRO al desplegar).
   ============================================================================ */

UPDATE pc
SET pc.idEstado = (SELECT TOP 1 idEstado FROM dbo.Estado WHERE modulo = 'Compras' AND estado = 'En orden'),
    pc.fechaModificacion = getdate()
FROM dbo.PedidoCompra pc
JOIN dbo.Estado e ON e.idEstado = pc.idEstado
WHERE pc.esEliminada = 0
  AND e.estado = 'Aprobado'
  AND EXISTS (SELECT 1 FROM dbo.PedidoCompraDet d WHERE d.idPedidoCompra = pc.idPedidoCompra)
  AND NOT EXISTS (
    SELECT 1 FROM dbo.PedidoCompraDet d
    WHERE d.idPedidoCompra = pc.idPedidoCompra
      AND ISNULL(d.quantityOrdenado, 0) < d.quantitySolicitado - 0.0001
  );
GO
