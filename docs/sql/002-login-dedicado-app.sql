/* ============================================================================
   Login dedicado para la app (reemplaza a `davidpc` en el App Service).

   POR QUÉ
   -------
   Hoy la app entra a SQL como `davidpc`, una cuenta PERSONAL. Medido el
   2026-09-16 sobre mysqladelante.database.windows.net, esa cuenta tiene:

     AdelantePRO      db_owner                                    107 tablas
     AdelanteSBX      db_owner                                    295 tablas
     AdelanteDB       db_ddladmin + datareader + datawriter       433 tablas
     AdelanteStaging  db_owner                                     22 tablas

   Es decir, la cadena de conexión guardada en el App Service abre 857 tablas
   en cuatro bases, incluidas `dbo.HistoricoSalario`, `dbo.Pago` y `dbo.Bancos`
   de la base legacy — que la app no toca ni una vez. Y `db_owner` incluye
   ALTER ANY USER / ALTER ANY ROLE: con esa credencial se pueden crear usuarios
   nuevos y asignarles permisos, o sea fabricarse una puerta que sobrevive a
   que David cambie su contraseña.

   Cuatro problemas concretos:
     1. Le pone techo al daño de cualquier bug de la app. Un descuido en una
        consulta pasa de "control total de cuatro bases" a "los datos que la
        app ya maneja".
     2. La auditoría de SQL vuelve a servir: hoy todo dice `davidpc` y no se
        distingue la persona de la aplicación.
     3. La contraseña personal de David deja de estar en el App Service, donde
        la lee cualquiera con acceso al portal o a SCM.
     4. Deja de ser un punto único de falla: si David cambia su contraseña o su
        cuenta se desactiva, producción no se cae.

   QUÉ NECESITA LA APP (revisado en el código, no supuesto)
   -------------------------------------------------------
   Lee y escribe tablas y vistas con SQL directo. NO usa stored procedures
   (el único `EXEC` del repo está dentro de un comentario que explica que no se
   usan). NO crea ni altera tablas en runtime: el esquema lo cambian las
   migraciones, que se corren aparte y a mano.

   Por eso alcanza con db_datareader + db_datawriter. Eso deja afuera DDL
   (DROP/ALTER TABLE), la gestión de usuarios y roles, y el CONTROL de la base.

   Se conceden los roles a nivel de BASE y no esquema por esquema a propósito:
   un GRANT por esquema que omita uno rompe la app en producción sin aviso, y
   el salto de seguridad grande (perder db_owner y el DDL) ya se logra así.
   Afinar por esquema es un segundo paso, con la app andando y medido.

   CÓMO SE APLICA
   --------------
   Por partes, cada bloque en SU base (Azure SQL no permite USE entre bases).
   Recomendado: primero en AdelanteSBX para probar la app, después en PRO.

   DESPUÉS de aplicarlo hay que cambiar, en el App Service de producción:
       DB_USER     = app_produccion
       DB_PASSWORD = (la de abajo)
   y reiniciar. Sin eso no cambia nada: la app sigue entrando como davidpc.

   VOLVER ATRÁS: basta con devolver DB_USER/DB_PASSWORD a los valores viejos y
   reiniciar. El login nuevo puede quedar creado sin molestar a nadie.
   ============================================================================ */


/* ---------------------------------------------------------------------------
   PASO 1 — en la base `master` del servidor.
   Crea el login. Cambiá la contraseña por una generada al azar (32+ caracteres)
   y guardala en el gestor de contraseñas ANTES de correr esto.
   --------------------------------------------------------------------------- */

-- IF NOT EXISTS (SELECT 1 FROM sys.sql_logins WHERE name = 'app_produccion')
--     CREATE LOGIN app_produccion WITH PASSWORD = 'PONER-UNA-CONTRASEÑA-LARGA-Y-ALEATORIA';
-- GO


/* ---------------------------------------------------------------------------
   PASO 2 — en `AdelantePRO` (y repetir igual en `AdelanteSBX` para probar).
   Usuario + permisos de DATOS. Sin db_owner, sin DDL, sin gestión de usuarios.
   --------------------------------------------------------------------------- */

-- IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'app_produccion')
--     CREATE USER app_produccion FOR LOGIN app_produccion;
-- GO
-- ALTER ROLE db_datareader ADD MEMBER app_produccion;   -- SELECT en tablas y vistas
-- ALTER ROLE db_datawriter ADD MEMBER app_produccion;   -- INSERT / UPDATE / DELETE
-- GO


/* ---------------------------------------------------------------------------
   PASO 3 — en `AdelanteDB` (la base legacy).
   La app lee y escribe acá (459 SELECT / 87 INSERT / 82 UPDATE / 66 DELETE en
   el código), así que necesita los mismos dos roles. Lo que NO necesita es la
   información de salarios y pagos: se le niega explícitamente.

   DENY gana siempre sobre GRANT, así que esto manda sobre db_datareader.
   Revisá la lista antes de correrla: si alguna de estas tablas resultara estar
   en uso, la app empezaría a fallar en esa pantalla (y el error diría
   "permission denied", que es fácil de reconocer).
   --------------------------------------------------------------------------- */

-- IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'app_produccion')
--     CREATE USER app_produccion FOR LOGIN app_produccion;
-- GO
-- ALTER ROLE db_datareader ADD MEMBER app_produccion;
-- ALTER ROLE db_datawriter ADD MEMBER app_produccion;
-- GO
-- DENY SELECT, INSERT, UPDATE, DELETE ON dbo.HistoricoSalario TO app_produccion;
-- DENY SELECT, INSERT, UPDATE, DELETE ON dbo.HistoricoPago    TO app_produccion;
-- DENY SELECT, INSERT, UPDATE, DELETE ON dbo.Pago             TO app_produccion;
-- GO


/* ---------------------------------------------------------------------------
   PASO 4 — lo que NO hay que hacer.

   NO crear este usuario en AdelanteSBX ni en AdelanteStaging una vez que la
   prueba haya terminado. Que el login de PRODUCCIÓN no pueda tocar el ambiente
   de pruebas (ni al revés) es justamente la separación que hoy no existe: la
   credencial actual es db_owner en las dos, así que un DB_DATABASE mal escrito
   no choca contra ninguna pared, escribe.
   --------------------------------------------------------------------------- */


/* ---------------------------------------------------------------------------
   PASO 5 — verificación. Correr EN CADA BASE con el login nuevo ya en uso.
   Esperado: roles = db_datareader, db_datawriter · db_owner = 0 · DDL = 0.
   --------------------------------------------------------------------------- */

SELECT
    DB_NAME() AS base,
    USER_NAME() AS usuario,
    (SELECT STRING_AGG(r.name, ', ')
       FROM sys.database_role_members m
       JOIN sys.database_principals r ON r.principal_id = m.role_principal_id
       JOIN sys.database_principals u ON u.principal_id = m.member_principal_id
      WHERE u.name = USER_NAME())                                      AS roles,
    IS_ROLEMEMBER('db_owner')                                          AS es_db_owner,
    HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CONTROL')                AS puede_control,
    HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'ALTER ANY USER')         AS puede_crear_usuarios,
    HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE TABLE')           AS puede_crear_tablas;
