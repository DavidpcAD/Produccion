/* ============================================================================
   Rehace dbo.EncargadoPartida con el modelo DEFINITIVO:

   - La asignación es SIEMPRE a nivel de SUBPARTIDA.
   - Cada subpartida tiene UN solo encargado (exclusiva / se bloquea): índice
     único sobre idSubPartida.
   - Un encargado puede tomar VARIAS subpartidas (varias filas con el mismo
     idColaborador, distinta idSubPartida).
   - Este tab ("Encargados por partida") es la única fuente; ya no se deriva
     nada de las cuadrillas.

   La tabla estaba vacía (0 filas), así que se recrea limpia.
   Correr UNA sola vez sobre la base AdelanteSBX (NO AdelantePRO).
   ============================================================================ */

IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'EncargadoPartida' AND schema_id = SCHEMA_ID('dbo'))
    DROP TABLE dbo.EncargadoPartida;
GO

CREATE TABLE dbo.EncargadoPartida (
    idEncargadoPartida INT IDENTITY(1,1) NOT NULL
        CONSTRAINT pk_EncargadoPartida PRIMARY KEY,
    idColaborador INT NOT NULL,
    idSubPartida  INT NOT NULL,
    creadoPor     INT NULL,
    fechaCreacion DATETIME2(0) NOT NULL
        CONSTRAINT df_EncargadoPartida_fecha DEFAULT SYSUTCDATETIME(),

    CONSTRAINT fk_EncargadoPartida_colaborador
        FOREIGN KEY (idColaborador) REFERENCES dbo.Colaborador (idColaborador),
    CONSTRAINT fk_EncargadoPartida_subpartida
        FOREIGN KEY (idSubPartida) REFERENCES dbo.SubPartida (idSubPartida)
);
GO

-- Exclusividad: una subpartida tiene UN solo encargado.
CREATE UNIQUE INDEX ux_EncargadoPartida_subpartida
    ON dbo.EncargadoPartida (idSubPartida);
GO
