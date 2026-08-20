/* ============================================================================
   Rol "Bodega" de Producción (idApp 10) + asignación a Jerson.

   POR QUÉ: bodega hace pedidos al stock de bodega, pero no existía un rol de
   Producción para eso. Jerson solo tenía "Digitacion general" (app Digitación)
   y "Bodeguero · Jefe" (app Boletas) — ningún rol de idApp 10 —, así que en
   Producción quedaba en nivel 1 y /compras exigía nivel 4 (solo Super Admin).

   El rol NO eleva el nivel del usuario: en lib/permissions.ts el módulo
   'bodega' vale nivel 1 y el acceso a Órdenes de Compra pasó a resolverse por
   MÓDULO (ver proxy.ts). Con esto Jerson entra solo a crear y ver pedidos; no a
   proveeduría, facturación, aprobación, ni a las herramientas del ingeniero
   (matriz, clasificaciones, plantillas, inventarios, seguimiento).

   Identidad: usuarios y roles se administran en rh.adelante.cr. Esto es la
   semilla mínima del rol nuevo para que el módulo funcione; altas y bajas
   siguientes van por RH.

   Idempotente: keyed por (idApp, nombre, tipo) y por (idUsuario, idRol).
   Aplicar sobre AdelanteSBX y AdelantePRO.
   ============================================================================ */

-- 1) El rol. Nombre 'Bodega' + tipo 'General' (mismo patrón que Presupuestista).
--    lib/permissions.ts lo reconoce por NOMBRE, no por idRol (los ids no
--    coinciden entre bases).
IF NOT EXISTS (SELECT 1 FROM dbo.Rol WHERE idApp = 10 AND nombre = N'Bodega' AND ISNULL(tipo, N'') = N'General')
BEGIN
    INSERT INTO dbo.Rol (idApp, nombre, descripcion, tipo, fechaCreacion, creadoPor)
    VALUES (10, N'Bodega', N'Hace pedidos al stock de bodega', N'General', SYSUTCDATETIME(), N'migracion-rol-bodega');
END
GO

-- 2) Asignarlo a Jerson (usuario `jerson`). Se resuelve por USERNAME, no por id.
INSERT INTO dbo.UsuarioRol (idUsuario, idRol, esTipo, fechaCreacion, creadoPor)
SELECT u.idUsuario, r.idRol, N'Indefinido', SYSUTCDATETIME(), N'migracion-rol-bodega'
FROM dbo.Usuario u
CROSS JOIN dbo.Rol r
WHERE u.username = N'jerson'
  AND r.idApp = 10 AND r.nombre = N'Bodega' AND ISNULL(r.tipo, N'') = N'General'
  AND NOT EXISTS (
      SELECT 1 FROM dbo.UsuarioRol ur
      WHERE ur.idUsuario = u.idUsuario AND ur.idRol = r.idRol
  );
GO

-- 3) Verificación: los roles con los que queda Jerson.
SELECT u.username, r.idRol, r.nombre AS rol, r.tipo, r.idApp
FROM dbo.Usuario u
JOIN dbo.UsuarioRol ur ON ur.idUsuario = u.idUsuario
JOIN dbo.Rol r ON r.idRol = ur.idRol
WHERE u.username = N'jerson'
ORDER BY r.idApp, r.nombre;
GO
