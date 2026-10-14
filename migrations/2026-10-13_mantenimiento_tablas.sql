/* ============================================================================
   Módulo Mantenimiento (Control de Reparaciones) — PASAR EL ESQUEMA `mant` A PROD.

   Las tablas YA EXISTEN en AdelanteSBX (dev), en el esquema `mant`. Hay que
   crearlas igual en AdelantePRO (prod). El esquema tiene 15 tablas:
     Archivos, AsignacionesEquipo, ChecklistDiarioItems, ClaveOperadores,
     Contadores, Equipos, InspeccionesDiarias, LecturasHorometro,
     MovimientosRepuestos, OrdenesTrabajo, PlanesMantenimiento, Repuestos,
     Sesiones, SolicitudesMateriales, Usuarios.

   ── CÓMO HACERLO (forma exacta y recomendada) ──────────────────────────────
   En SSMS o Azure Data Studio, conectado a AdelanteSBX:
     1. Botón derecho sobre la base AdelanteSBX → Tasks → Generate Scripts…
        (en ADS: "Generate SQL Script" sobre el esquema).
     2. En "Choose Objects" elegí SOLO el esquema `mant` (sus 15 tablas; también
        marcá "Schema" para que incluya el CREATE SCHEMA mant).
     3. En "Scripting Options" → Advanced:
          · Script Indexes = True
          · Script Foreign Keys = True
          · Script Check Constraints = True
          · Script DRI Primary/Unique/Defaults = True
          · Types of data to script = "Schema only"
     4. Guardá el .sql y corré ESE archivo en AdelantePRO (NO en master).

   Eso replica la estructura EXACTA de SBX en PROD —columnas, defaults, llaves,
   índices y checks— sin riesgo de que un script a mano se quede corto. Estas
   tablas las consume el módulo Mantenimiento (Control de Reparaciones) que se
   PORTÓ dentro de Produccion: sus rutas viven en app/api/mantenimiento/* y
   consultan el esquema `mant` con el getDb() de Produccion (misma base). Reusa la
   conexión de Produccion, así que NO hace falta un usuario SQL aparte.

   ── SEMILLA DEL CONTADOR DE OT ─────────────────────────────────────────────
   Después de crear las tablas en PROD, dejá sembrada la fila que numera las OT
   (OT-0001, OT-0002, …). Sin esto, crear la primera OT falla:
   ----------------------------------------------------------------------------
   IF NOT EXISTS (SELECT 1 FROM mant.Contadores WHERE nombre = 'ot')
     INSERT INTO mant.Contadores (nombre, valor) VALUES ('ot', 1);
   GO
   ----------------------------------------------------------------------------
   (En SBX el contador 'ot' va en 6 y existe también 'solicitud' en 8 —esos son
   DATOS de dev, no estructura—. En PROD arrancan de cero.)

   NOTA: Produccion NO corre migraciones solo; David corre este paso en PROD a mano
   antes de publicar el módulo. El código del módulo ya apunta a mant.* (ver
   lib/mantenimiento/db.ts y app/api/mantenimiento/*).
   ============================================================================ */
