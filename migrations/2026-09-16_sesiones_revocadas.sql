/* ============================================================================
   Revocación de sesiones: que "cerrar sesión" invalide el token de verdad.

   POR QUÉ: la sesión es un JWT de 8 h y /api/auth/logout solo borraba la
   cookie. El token seguía siendo válido hasta vencer: quien lo hubiera copiado
   (de otra máquina, de un log, de una computadora compartida que "cerró
   sesión") entraba igual. No había forma de echar a nadie antes de las 8 h.

   CÓMO: el token ahora lleva un id de sesión (jti). Esta tabla lista los que ya
   no valen. Dos formas de revocar:
     - jti puntual          -> muere ESA sesión (logout de este dispositivo).
     - jti NULL + idUsuario -> mueren TODAS las sesiones de esa persona emitidas
       antes de revocadoEn (contraseña cambiada, cuenta comprometida, salida).

   Coste: ningún viaje extra a la base. getSession() ya consultaba los roles en
   cada request; la verificación va en ESA misma consulta (ver lib/sesiones.ts).

   Idempotente. Aplicar sobre AdelanteSBX y AdelantePRO.
   ============================================================================ */

IF OBJECT_ID('dbo.SesionRevocada', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SesionRevocada (
        idRevocacion  INT IDENTITY(1,1) NOT NULL,
        -- id de sesión (claim jti del JWT). NULL = todas las del usuario.
        jti           NVARCHAR(64)   NULL,
        idUsuario     INT            NOT NULL,
        -- Momento del corte: un token emitido ANTES de esto no vale. Se compara
        -- contra el `iat` del JWT, por eso va en UTC igual que iat.
        revocadoEn    DATETIME2(7)   NOT NULL CONSTRAINT DF_SesionRevocada_revocadoEn DEFAULT (SYSUTCDATETIME()),
        -- Cuándo se puede borrar la fila: pasada la expiración del token ya no
        -- hace falta recordarlo (el propio JWT queda vencido).
        expiraEn      DATETIME2(7)   NOT NULL,
        motivo        NVARCHAR(50)   NULL,
        CONSTRAINT PK_SesionRevocada PRIMARY KEY (idRevocacion)
    );
END;
GO

-- Búsqueda del caso normal: "¿este jti está revocado?" en cada lectura de sesión.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SesionRevocada_jti' AND object_id = OBJECT_ID('dbo.SesionRevocada'))
    CREATE INDEX IX_SesionRevocada_jti ON dbo.SesionRevocada (jti) WHERE jti IS NOT NULL;
GO

-- Búsqueda del corte por usuario ("cerrar sesión en todos lados").
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SesionRevocada_usuario' AND object_id = OBJECT_ID('dbo.SesionRevocada'))
    CREATE INDEX IX_SesionRevocada_usuario ON dbo.SesionRevocada (idUsuario, revocadoEn);
GO

-- Para el barrido de filas vencidas.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SesionRevocada_expira' AND object_id = OBJECT_ID('dbo.SesionRevocada'))
    CREATE INDEX IX_SesionRevocada_expira ON dbo.SesionRevocada (expiraEn);
GO

SELECT
    (SELECT COUNT(*) FROM sys.tables  WHERE name = 'SesionRevocada')                                          AS tabla_creada,
    (SELECT COUNT(*) FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.SesionRevocada') AND name IS NOT NULL) AS indices,
    (SELECT COUNT(*) FROM dbo.SesionRevocada)                                                                 AS filas;
