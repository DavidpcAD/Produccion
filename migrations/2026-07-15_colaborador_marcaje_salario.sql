/* ============================================================================
   Agrega a dbo.Colaborador los datos de jornada, salario y enrolamiento en el
   dispositivo de marcaje (control de entrada/salida biométrico).

   La biometría en sí la captura el dispositivo físico; aquí solo guardamos el
   horario, el salario y el estado de enrolamiento para saber si el colaborador
   ya fue dado de alta en el reloj marcador.

   Correr UNA sola vez sobre AdelanteSBX. Es idempotente.
   ============================================================================ */

-- Salario mensual (colón/CRC).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Colaborador') AND name = 'salarioMensual')
    ALTER TABLE dbo.Colaborador ADD salarioMensual DECIMAL(18,2) NULL;
GO

-- Jornada: hora de entrada y salida.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Colaborador') AND name = 'horaEntrada')
    ALTER TABLE dbo.Colaborador ADD horaEntrada TIME(0) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Colaborador') AND name = 'horaSalida')
    ALTER TABLE dbo.Colaborador ADD horaSalida TIME(0) NULL;
GO

-- Dispositivo de marcaje.
--   marcajeEstado : 'Pendiente' (aún no enrolado) | 'Enrolado' (ya marca en el dispositivo)
--   numeroMarcaje : identificador del colaborador dentro del reloj marcador
--   marcajeFechaEnrol : cuándo quedó enrolado
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Colaborador') AND name = 'marcajeEstado')
    ALTER TABLE dbo.Colaborador ADD marcajeEstado NVARCHAR(20) NOT NULL CONSTRAINT df_Colaborador_marcajeEstado DEFAULT ('Pendiente');
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Colaborador') AND name = 'numeroMarcaje')
    ALTER TABLE dbo.Colaborador ADD numeroMarcaje NVARCHAR(40) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Colaborador') AND name = 'marcajeFechaEnrol')
    ALTER TABLE dbo.Colaborador ADD marcajeFechaEnrol DATETIME2(7) NULL;
GO

-- Restringe los valores válidos de marcajeEstado.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_Colaborador_marcajeEstado')
    ALTER TABLE dbo.Colaborador WITH CHECK
        ADD CONSTRAINT ck_Colaborador_marcajeEstado
        CHECK (marcajeEstado IN ('Pendiente', 'Enrolado'));
GO
