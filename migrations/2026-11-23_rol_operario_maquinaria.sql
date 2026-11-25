/* ============================================================================
   Rol de Producción "Operario Maquinaria" — para entrar a la app móvil de
   maquinaria (checklist antes de arrancar, solicitar material, reportar avería).

   El rol da SOLO el módulo 'maquinaria' (lib/permissions.ts → modulosDeRol): no
   abre ninguna pantalla de la web ni eleva el nivel. Se matchea por NOMBRE, así
   que el idRol puede ser distinto en SBX y en PRO.

   Después de esto, a cada operario hay que:
     1. darle usuario de Producción (dbo.Usuario) con contraseña, y
     2. asignarle este rol (dbo.UsuarioRol), y
     3. asignarle sus máquinas en mant.AsignacionesEquipo (usuario de mant.Usuarios
        con el mismo username; la app lo crea sola en el primer login con rol
        'operador').

   Idempotente. Correr en AdelanteSBX y en AdelantePRO.
   DESHACER:
     DELETE ur FROM dbo.UsuarioRol ur JOIN dbo.Rol r ON r.idRol = ur.idRol
       WHERE r.idApp = 10 AND r.nombre = 'Operario Maquinaria';
     DELETE FROM dbo.Rol WHERE idApp = 10 AND nombre = 'Operario Maquinaria';
   ============================================================================ */
IF NOT EXISTS (SELECT 1 FROM dbo.Rol WHERE idApp = 10 AND nombre = 'Operario Maquinaria')
  INSERT INTO dbo.Rol (idApp, nombre, descripcion, tipo, fechaCreacion, creadoPor)
  VALUES (10, 'Operario Maquinaria',
          'App móvil de maquinaria: checklist antes de arrancar, material y averías',
          'General', SYSUTCDATETIME(), 'migracion-app-maquinaria');
GO
