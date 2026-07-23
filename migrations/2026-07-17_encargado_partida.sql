/* ============================================================================
   Asignación DIRECTA de encargados a partidas y/o subpartidas, INDEPENDIENTE
   de las cuadrillas.

   - Un encargado se puede asignar a una PARTIDA completa (idPartida) o a una
     SUBPARTIDA puntual (idSubPartida) — exactamente uno de los dos por fila.
   - Varios encargados por partida/subpartida (varias filas).
   - Convive con lo que ya se deriva de las cuadrillas (vista V_EncargadoPartida):
     esta tabla es solo la asignación manual.

   Correr UNA sola vez sobre la base AdelanteSBX (NO AdelantePRO).
   ============================================================================ */

IF NOT EXISTS (
    SELECT 1 FROM sys.tables WHERE name = 'EncargadoPartida' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
    CREATE TABLE dbo.EncargadoPartida (
        idEncargadoPartida INT IDENTITY(1,1) NOT NULL
            CONSTRAINT pk_EncargadoPartida PRIMARY KEY,
        idColaborador INT NOT NULL,
        idPartida     INT NULL,
        idSubPartida  INT NULL,
        creadoPor     INT NULL,
        fechaCreacion DATETIME2(0) NOT NULL
            CONSTRAINT df_EncargadoPartida_fecha DEFAULT SYSUTCDATETIME(),

        CONSTRAINT fk_EncargadoPartida_colaborador
            FOREIGN KEY (idColaborador) REFERENCES dbo.Colaborador (idColaborador),
        CONSTRAINT fk_EncargadoPartida_partida
            FOREIGN KEY (idPartida) REFERENCES dbo.Partida (idPartida),
        CONSTRAINT fk_EncargadoPartida_subpartida
            FOREIGN KEY (idSubPartida) REFERENCES dbo.SubPartida (idSubPartida),

        -- Exactamente uno de los dos niveles debe venir informado.
        CONSTRAINT ck_EncargadoPartida_nivel CHECK (
            (idPartida IS NOT NULL AND idSubPartida IS NULL) OR
            (idPartida IS NULL AND idSubPartida IS NOT NULL)
        )
    );
END
GO

-- Sin duplicados: un colaborador no se asigna dos veces a la misma partida…
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_EncargadoPartida_partida')
    CREATE UNIQUE INDEX ux_EncargadoPartida_partida
        ON dbo.EncargadoPartida (idColaborador, idPartida)
        WHERE idPartida IS NOT NULL;
GO

-- … ni a la misma subpartida.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ux_EncargadoPartida_subpartida')
    CREATE UNIQUE INDEX ux_EncargadoPartida_subpartida
        ON dbo.EncargadoPartida (idColaborador, idSubPartida)
        WHERE idSubPartida IS NOT NULL;
GO
