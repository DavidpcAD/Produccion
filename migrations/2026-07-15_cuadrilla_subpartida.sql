/* ============================================================================
   Relaciona cada Cuadrilla con una SubPartida de Business Central (FK real).
   La partida se obtiene a través de SubPartida.idPartida, así que NO se necesita
   una FK adicional a Partida en Cuadrilla.

   Correr UNA sola vez sobre la base AdelanteSBX.
   ============================================================================ */

-- 1) Nueva columna FK (nullable para no romper filas existentes sin mapeo).
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.Cuadrilla') AND name = 'idSubPartida'
)
BEGIN
    ALTER TABLE dbo.Cuadrilla ADD idSubPartida INT NULL;
END
GO

-- 2) Llave foránea Cuadrilla.idSubPartida -> SubPartida.idSubPartida.
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'fk_cuadrilla_subpartida'
)
BEGIN
    ALTER TABLE dbo.Cuadrilla WITH CHECK
        ADD CONSTRAINT fk_cuadrilla_subpartida
        FOREIGN KEY (idSubPartida) REFERENCES dbo.SubPartida (idSubPartida);
END
GO

-- 3) Backfill: mapear las cuadrillas existentes usando el código guardado en
--    TaskNoBC (ej. '1.1.3') contra SubPartida.codigo.
UPDATE c
SET c.idSubPartida = sp.idSubPartida
FROM dbo.Cuadrilla c
JOIN dbo.SubPartida sp ON sp.codigo = c.TaskNoBC
WHERE c.idSubPartida IS NULL;
GO
