/* ============================================================================
   Mantenimiento — datos sacados de las FICHAS TÉCNICAS (2026-10-23).

   7 fichas de la carpeta "Fichas Tecnicas" de Steven: EXC-02, EXC-03, RETRO-01, MEZC-01, MEZC-02, COMP-02, MONT-02.
   Generado por script; decisiones confirmadas por Steven el 2026-10-23.

   Qué hace, por equipo (buscado por CÓDIGO):
   - Llena campos que hoy están VACÍOS (cilindraje, combustible, llantas, marca,
     modelo). Nunca pisa un valor cargado.
   - Correcciones puntuales: solo si el valor actual es EXACTAMENTE el viejo
     (si alguien ya lo cambió a mano, no se toca).
   - Especificaciones (columna de 2026-10-23_mantenimiento_especificaciones_equipo):
     solo si el equipo todavía no tiene ninguna.

   No borra filas. Idempotente (una segunda corrida no cambia nada).
   Un solo lote, en una transacción.
   Los PDF de las fichas NO van acá: se suben desde la app (Documentos).
   ============================================================================ */
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
BEGIN TRANSACTION;

-- EXC-02 — ficha: Hidromek HMK 140 LC H4 (abril 2024)
UPDATE mant.Equipos SET
    cilindraje = CASE WHEN ISNULL(LTRIM(RTRIM(cilindraje)), N'') = N'' THEN N'2999 cc' ELSE cilindraje END,
    combustible = CASE WHEN ISNULL(LTRIM(RTRIM(combustible)), N'') = N'' THEN N'Diesel' ELSE combustible END
WHERE codigo = N'EXC-02';
UPDATE mant.Equipos SET modelo = N'HMK 140 LC H4' WHERE codigo = N'EXC-02' AND modelo = N'HMK 140LC';
UPDATE mant.Equipos SET especificaciones = N'[{"nombre":"Motor","valor":"Isuzu AJ-4JJ1X, 4 cilindros diésel turbo intercooler"},{"nombre":"Potencia","valor":"98 HP (73 kW) bruta / 95 HP neta a 2.000 rpm"},{"nombre":"Par máximo","valor":"385 Nm a 1.600 rpm"},{"nombre":"Emisiones","valor":"Stage IIIA / Tier 3"},{"nombre":"Peso operativo","valor":"14.650 kg"},{"nombre":"Tanque de combustible","valor":"280 L"},{"nombre":"Aceite de motor","valor":"17 L"},{"nombre":"Tanque hidráulico","valor":"115 L"},{"nombre":"Sistema hidráulico (total)","valor":"210 L"},{"nombre":"Sistema de refrigeración","valor":"20 L"},{"nombre":"Sistema eléctrico","valor":"24 V — 2 baterías de 12 V 100 Ah"},{"nombre":"Alternador / arranque","valor":"24 V 50 A / 24 V 4 kW"},{"nombre":"Bomba hidráulica","valor":"Doble en tándem, 2 × 129 L/min"},{"nombre":"Presión de trabajo","valor":"350 kgf/cm² (372 con forzudo)"},{"nombre":"Capacidad del cucharón","valor":"0,6 m³"},{"nombre":"Orugas","valor":"Tejas de triple nervio 500 mm, 2 × 46; rodillos 2 × 7 inferiores y 2 × 2 superiores"},{"nombre":"Velocidad de traslación","valor":"3,3 / 5,6 km/h"},{"nombre":"Profundidad máx. de excavación","valor":"5.360 mm (balancín 2,3 m)"},{"nombre":"Dimensiones de transporte","valor":"7.890 × 2.490 × 2.830 mm (largo × ancho × alto)"},{"nombre":"Lubricación","valor":"Centralizada en pluma y balancín"}]'
WHERE codigo = N'EXC-02' AND ISNULL(LTRIM(RTRIM(especificaciones)), N'') IN (N'', N'[]');

-- EXC-03 — ficha: Hidromek HMK 230 LC H4 (julio 2024)
UPDATE mant.Equipos SET
    cilindraje = CASE WHEN ISNULL(LTRIM(RTRIM(cilindraje)), N'') = N'' THEN N'5193 cc' ELSE cilindraje END,
    combustible = CASE WHEN ISNULL(LTRIM(RTRIM(combustible)), N'') = N'' THEN N'Diesel' ELSE combustible END
WHERE codigo = N'EXC-03';
UPDATE mant.Equipos SET modelo = N'HMK 230 LC H4' WHERE codigo = N'EXC-03' AND modelo = N'HMK 230LC';
UPDATE mant.Equipos SET especificaciones = N'[{"nombre":"Motor","valor":"Isuzu GI-4HK1X, 4 cilindros diésel turbo intercooler"},{"nombre":"Potencia","valor":"161 HP (120 kW) bruta / 151 HP neta a 2.000 rpm"},{"nombre":"Par máximo","valor":"657 Nm a 1.500 rpm"},{"nombre":"Emisiones","valor":"Stage IIIA"},{"nombre":"Peso operativo","valor":"23.400 kg"},{"nombre":"Tanque de combustible","valor":"405 L"},{"nombre":"Aceite de motor","valor":"20 L"},{"nombre":"Tanque hidráulico","valor":"152 L"},{"nombre":"Sistema hidráulico (total)","valor":"285 L"},{"nombre":"Sistema de refrigeración","valor":"33 L"},{"nombre":"Sistema eléctrico","valor":"24 V — 2 baterías de 12 V 100 Ah"},{"nombre":"Alternador / arranque","valor":"24 V 50 A / 24 V 5 kW"},{"nombre":"Bomba hidráulica","valor":"Doble en tándem, 2 × 221 L/min"},{"nombre":"Presión de trabajo","valor":"350 kgf/cm² (370 con forzudo)"},{"nombre":"Capacidad del cucharón","valor":"1,10 m³"},{"nombre":"Orugas","valor":"Tejas de triple nervio 600 mm, 2 × 49; rodillos 2 × 9 inferiores y 2 × 2 superiores"},{"nombre":"Velocidad de traslación","valor":"3,8 / 5,8 km/h"},{"nombre":"Profundidad máx. de excavación","valor":"6.730 mm (balancín 2,92 m)"},{"nombre":"Dimensiones de transporte","valor":"9.680 × 2.990 × 3.120 mm (largo × ancho × alto)"},{"nombre":"Lubricación","valor":"Centralizada en pluma y balancín"}]'
WHERE codigo = N'EXC-03' AND ISNULL(LTRIM(RTRIM(especificaciones)), N'') IN (N'', N'[]');

-- RETRO-01 — ficha: Hidromek HMK 62SS (julio 2025)
UPDATE mant.Equipos SET
    cilindraje = CASE WHEN ISNULL(LTRIM(RTRIM(cilindraje)), N'') = N'' THEN N'2434 cc' ELSE cilindraje END
WHERE codigo = N'RETRO-01';
UPDATE mant.Equipos SET llantasDelanteras = N'10 x 16,5 10PR' WHERE codigo = N'RETRO-01' AND llantasDelanteras = N'10/15/5';
UPDATE mant.Equipos SET llantasTraseras = N'10 x 16,5 10PR' WHERE codigo = N'RETRO-01' AND llantasTraseras = N'10/15/5';
UPDATE mant.Equipos SET especificaciones = N'[{"nombre":"Motor","valor":"Kubota V2403-M-T-EU4, 4 cilindros diésel turbo, enfriado por agua"},{"nombre":"Potencia","valor":"59 HP (44 kW) a 2.700 rpm"},{"nombre":"Par máximo","valor":"165 Nm a 1.800 rpm"},{"nombre":"Emisiones","valor":"Stage IIIA / Interim Tier 4"},{"nombre":"Peso operativo","valor":"3.875 kg (con brazo telescópico)"},{"nombre":"Bomba hidráulica","valor":"En tándem, 60 L/min a 2.700 rpm"},{"nombre":"Presión de trabajo","valor":"220 bar"},{"nombre":"Velocidad de traslación","valor":"0–12 km/h adelante y atrás"},{"nombre":"Neumáticos","valor":"10 x 16,5 10PR delanteros y traseros"},{"nombre":"Cucharón cargador (4 en 1)","valor":"0,35 m³"},{"nombre":"Cucharón retro","valor":"0,06 m³"},{"nombre":"Profundidad máx. de excavación","valor":"2.751 mm"},{"nombre":"Elevación a altura máxima","valor":"885 kg cargador / 488 kg retro"},{"nombre":"Cabina","valor":"ROPS y FOPS con aire acondicionado"}]'
WHERE codigo = N'RETRO-01' AND ISNULL(LTRIM(RTRIM(especificaciones)), N'') IN (N'', N'[]');

-- MEZC-01 — ficha: Fiori DB 460 (R.19, 10/2023) — versión Stage V
UPDATE mant.Equipos SET
    cilindraje = CASE WHEN ISNULL(LTRIM(RTRIM(cilindraje)), N'') = N'' THEN N'3600 cc' ELSE cilindraje END,
    combustible = CASE WHEN ISNULL(LTRIM(RTRIM(combustible)), N'') = N'' THEN N'Diesel' ELSE combustible END,
    llantasDelanteras = CASE WHEN ISNULL(LTRIM(RTRIM(llantasDelanteras)), N'') = N'' THEN N'18-19.5 16PR' ELSE llantasDelanteras END,
    llantasTraseras = CASE WHEN ISNULL(LTRIM(RTRIM(llantasTraseras)), N'') = N'' THEN N'18-19.5 16PR' ELSE llantasTraseras END
WHERE codigo = N'MEZC-01';
UPDATE mant.Equipos SET especificaciones = N'[{"nombre":"Motor","valor":"Perkins serie 904J-E36TA, 4 cilindros, turbo intercooler, common rail"},{"nombre":"Potencia","valor":"90 kW (122 hp) a 2.400 rpm"},{"nombre":"Par máximo","valor":"500 Nm a 1.500 rpm"},{"nombre":"Emisiones / postratamiento","valor":"Stage V — EGR + DOC + DPF + SCR (requiere AdBlue/DEF)"},{"nombre":"Alternador","valor":"12 V 120 A"},{"nombre":"Batería","valor":"12 V 135 Ah (850 A)"},{"nombre":"Concreto por carga","valor":"4,0 m³ (clase S1)"},{"nombre":"Tambor","valor":"5.050 L, 22 rpm, giro 245°"},{"nombre":"Tanque de agua","valor":"870 L (2 depósitos); bomba 250 L/min"},{"nombre":"Pala de carga","valor":"560 L (9–10 paladas por carga)"},{"nombre":"Tanque de combustible","valor":"90 L"},{"nombre":"Sistema hidráulico (total)","valor":"110 L"},{"nombre":"Aceite de motor","valor":"8 kg"},{"nombre":"Neumáticos","valor":"18-19.5 16PR"},{"nombre":"Masa operativa / máxima","valor":"7.300 kg / 16.500 kg"},{"nombre":"Tracción y dirección","valor":"4x4 hidrostática; dirección en 2 o 4 ruedas o de cangrejo"},{"nombre":"Velocidad máxima","valor":"25 km/h"},{"nombre":"Frenos","valor":"Discos en baño de aceite en las 4 ruedas"}]'
WHERE codigo = N'MEZC-01' AND ISNULL(LTRIM(RTRIM(especificaciones)), N'') IN (N'', N'[]');

-- MEZC-02 — ficha: Fiori DB 180 (01/2016)
UPDATE mant.Equipos SET
    cilindraje = CASE WHEN ISNULL(LTRIM(RTRIM(cilindraje)), N'') = N'' THEN N'2190 cc' ELSE cilindraje END,
    combustible = CASE WHEN ISNULL(LTRIM(RTRIM(combustible)), N'') = N'' THEN N'Diesel' ELSE combustible END,
    llantasDelanteras = CASE WHEN ISNULL(LTRIM(RTRIM(llantasDelanteras)), N'') = N'' THEN N'12,0/75-18 12PR' ELSE llantasDelanteras END,
    llantasTraseras = CASE WHEN ISNULL(LTRIM(RTRIM(llantasTraseras)), N'') = N'' THEN N'12,0/75-18 12PR' ELSE llantasTraseras END
WHERE codigo = N'MEZC-02';
UPDATE mant.Equipos SET especificaciones = N'[{"nombre":"Motor","valor":"Yanmar 4TNV88, 4 cilindros diésel aspirado, inyección directa"},{"nombre":"Potencia","valor":"36,9 kW (49 hp) máx.; 32 kW (44 hp) a 2.600 rpm"},{"nombre":"Par máximo","valor":"139 Nm a 1.200 rpm"},{"nombre":"Emisiones","valor":"Stage IIIA"},{"nombre":"Alternador","valor":"12 V 40 A"},{"nombre":"Batería","valor":"12 V 80 Ah (400 A)"},{"nombre":"Concreto por carga","valor":"1,8 m³ (clase S1)"},{"nombre":"Tambor","valor":"2.560 L, 20 rpm"},{"nombre":"Tanque de agua","valor":"240 L; bomba 140 L/min"},{"nombre":"Pala de carga","valor":"470 L (5–6 paladas por carga)"},{"nombre":"Tanque de combustible","valor":"46 L"},{"nombre":"Sistema hidráulico (total)","valor":"67 L"},{"nombre":"Aceite de motor","valor":"7,07 kg"},{"nombre":"Neumáticos","valor":"12,0/75-18 12PR"},{"nombre":"Masa operativa / máxima","valor":"3.700 kg / 8.400 kg"},{"nombre":"Tracción y dirección","valor":"4x4 hidrostática, chasis articulado"},{"nombre":"Velocidad máxima","valor":"20,2 km/h"},{"nombre":"Frenos","valor":"Discos en baño de aceite en las 4 ruedas; estacionamiento de tambor"}]'
WHERE codigo = N'MEZC-02' AND ISNULL(LTRIM(RTRIM(especificaciones)), N'') IN (N'', N'[]');

-- COMP-02 — ficha: Ammann Rammax 1575 / 1585 (02/2015) — datos del 1585
UPDATE mant.Equipos SET
    combustible = CASE WHEN ISNULL(LTRIM(RTRIM(combustible)), N'') = N'' THEN N'Diesel' ELSE combustible END
WHERE codigo = N'COMP-02';
UPDATE mant.Equipos SET modelo = N'Rammax 1585' WHERE codigo = N'COMP-02' AND modelo = N'RAMMAX 1585 (prob.)';
UPDATE mant.Equipos SET notas = N'' WHERE codigo = N'COMP-02' AND notas LIKE N'El codigo interno sugiere%';
UPDATE mant.Equipos SET especificaciones = N'[{"nombre":"Tipo","valor":"Rodillo de zanja (pata de cabra) con dirección por patinaje"},{"nombre":"Motor","valor":"Hatz 2G40, 2 cilindros diésel enfriado por aire"},{"nombre":"Potencia","valor":"13,4 kW (18,5 PS) a 2.600 rpm"},{"nombre":"Peso operativo","valor":"1.410 kg (rodillo 63 cm) / 1.480 kg (rodillo 85 cm)"},{"nombre":"Ancho de trabajo","valor":"630 u 850 mm"},{"nombre":"Fuerza centrífuga","valor":"86 kN"},{"nombre":"Amplitud / frecuencia","valor":"2,4 mm / 30 Hz"},{"nombre":"Tanque de combustible","valor":"22 L"},{"nombre":"Aceite hidráulico","valor":"60 L"},{"nombre":"Velocidad de trabajo / traslado","valor":"0–16 / 0–35 m/min"},{"nombre":"Pendiente superable","valor":"45 % con vibración / 55 % sin vibración"},{"nombre":"Control","valor":"Manual, por cable o infrarrojo según versión (M / MC / MI / MCI)"},{"nombre":"Garantía de fábrica","valor":"5 años en motores de tambor y rodamientos de vibración"}]'
WHERE codigo = N'COMP-02' AND ISNULL(LTRIM(RTRIM(especificaciones)), N'') IN (N'', N'[]');

-- MONT-02 — ficha: Manitou MI-X 25 G (mayo 2025)
UPDATE mant.Equipos SET
    marca = CASE WHEN ISNULL(LTRIM(RTRIM(marca)), N'') = N'' THEN N'Manitou' ELSE marca END,
    modelo = CASE WHEN ISNULL(LTRIM(RTRIM(modelo)), N'') = N'' THEN N'MI-X 25 G' ELSE modelo END,
    cilindraje = CASE WHEN ISNULL(LTRIM(RTRIM(cilindraje)), N'') = N'' THEN N'2488 cc' ELSE cilindraje END,
    combustible = CASE WHEN ISNULL(LTRIM(RTRIM(combustible)), N'') = N'' THEN N'LPG (gas)' ELSE combustible END,
    llantasDelanteras = CASE WHEN ISNULL(LTRIM(RTRIM(llantasDelanteras)), N'') = N'' THEN N'7.00-12 12PR' ELSE llantasDelanteras END,
    llantasTraseras = CASE WHEN ISNULL(LTRIM(RTRIM(llantasTraseras)), N'') = N'' THEN N'6.00-9 10PR' ELSE llantasTraseras END
WHERE codigo = N'MONT-02';
UPDATE mant.Equipos SET notas = N'' WHERE codigo = N'MONT-02' AND notas = N'Marca/modelo sin identificar.';
UPDATE mant.Equipos SET especificaciones = N'[{"nombre":"Capacidad de carga","valor":"2.500 kg con centro de carga a 500 mm"},{"nombre":"Motor","valor":"GCT (ex-Nissan) K25, 4 cilindros, 2.488 cm³, a gas LPG"},{"nombre":"Potencia","valor":"35 kW a 2.400 rpm"},{"nombre":"Peso de servicio","valor":"3.895 kg"},{"nombre":"Transmisión","valor":"Convertidor de par"},{"nombre":"Neumáticos","valor":"Delanteros 7.00-12 12PR; traseros 6.00-9 10PR (inflables)"},{"nombre":"Velocidad","valor":"19,4 km/h con carga / 19,7 km/h en vacío"},{"nombre":"Velocidad de elevación","valor":"0,47 m/s con carga / 0,55 m/s en vacío"},{"nombre":"Horquillas","valor":"40 × 122 × 1.150 mm; tablero clase 2A"},{"nombre":"Radio de giro","valor":"2.265 mm"},{"nombre":"Distancia entre ejes","valor":"1.600 mm"},{"nombre":"Hidráulica para accesorios","valor":"160 bar, 72 L/min"},{"nombre":"Altura de elevación","valor":"Según mástil: 3.000 a 6.500 mm"},{"nombre":"Frenos de servicio","valor":"Hidráulicos"}]'
WHERE codigo = N'MONT-02' AND ISNULL(LTRIM(RTRIM(especificaciones)), N'') IN (N'', N'[]');

COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
