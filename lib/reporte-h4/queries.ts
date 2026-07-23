import 'server-only';
import { getDb, sql } from '@/lib/db';

// Consultas del Reporte H4 (Cierre del Día), portadas de h4control
// (src/app/api/cierre-dia y src/app/api/resumen-dia). Leen directo del esquema
// h4 de AdelanteSBX vía getDb(): h4.Jornada, h4.MarcajeEvento,
// h4.EventoActividad y dbo.CuadrillaMiembro. Zona horaria fija de CR (UTC-6).

const TZ = 'Central America Standard Time';

export interface CierreKpis {
  diaCompleto: number;
  totalPersonal: number;
  sinMarcaje: number;
  horasTotales: number;
}

export interface AnomaliaCierre {
  id: number;
  tipo: string;
  severidad: 'info' | 'warning' | 'critical' | string;
  titulo: string;
  code: string | null;
  ocurridoUtc: string;
}

export interface CierreDia {
  kpis: CierreKpis;
  anomalias: AnomaliaCierre[];
}

interface KpiRow {
  diaCompleto: number;
  totalPersonal: number;
  sinMarcaje: number;
  horasTotales: number | null;
}

// KPIs de la jornada + anomalías pendientes de un día. `fecha` (YYYY-MM-DD) es
// opcional; si no viene, usa el día local de CR (hoy). La ventana [desde,hasta)
// se calcula en UTC a partir del día local elegido, igual que el original.
export async function getCierreDia(fecha?: string): Promise<CierreDia> {
  const db = await getDb();

  const kpi = await db
    .request()
    .input('tz', sql.NVarChar(60), TZ)
    .input('fecha', sql.Date, fecha ?? null)
    .query<KpiRow>(`
      DECLARE @ahoraLocal DATETIME2 = CONVERT(DATETIME2, SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE @tz);
      DECLARE @hoy DATE = COALESCE(@fecha, CAST(@ahoraLocal AS DATE));
      DECLARE @desde DATETIME2 = CONVERT(DATETIME2, (CAST(@hoy AS DATETIME2) AT TIME ZONE @tz) AT TIME ZONE 'UTC');
      DECLARE @hasta DATETIME2 = CONVERT(DATETIME2, (CAST(DATEADD(DAY,1,@hoy) AS DATETIME2) AT TIME ZONE @tz) AT TIME ZONE 'UTC');

      SELECT
        (SELECT COUNT(*) FROM h4.Jornada j
           WHERE j.estado = N'Cerrada' AND j.fechaHoraEntradaUtc >= @desde AND j.fechaHoraEntradaUtc < @hasta) AS diaCompleto,
        (SELECT COUNT(DISTINCT j.idColaborador) FROM h4.Jornada j
           WHERE j.fechaHoraEntradaUtc >= @desde AND j.fechaHoraEntradaUtc < @hasta) AS totalPersonal,
        (SELECT COUNT(*) FROM (
            SELECT DISTINCT m.IDCol FROM dbo.CuadrillaMiembro m WHERE m.Activo = 1
         ) prog
         WHERE NOT EXISTS (
            SELECT 1 FROM h4.Jornada j
            WHERE j.idColaborador = prog.IDCol AND j.fechaHoraEntradaUtc >= @desde AND j.fechaHoraEntradaUtc < @hasta
         )) AS sinMarcaje,
        (SELECT CAST(ISNULL(SUM(DATEDIFF(SECOND, j.fechaHoraEntradaUtc, COALESCE(j.fechaHoraSalidaUtc, SYSUTCDATETIME()))) / 3600.0, 0) AS DECIMAL(20,2))
           FROM h4.Jornada j
           WHERE j.fechaHoraEntradaUtc >= @desde AND j.fechaHoraEntradaUtc < @hasta) AS horasTotales;
    `);

  const anom = await db
    .request()
    .input('tz', sql.NVarChar(60), TZ)
    .input('fecha', sql.Date, fecha ?? null)
    .query<AnomaliaCierre>(`
      DECLARE @ahoraLocal DATETIME2 = CONVERT(DATETIME2, SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE @tz);
      DECLARE @hoy DATE = COALESCE(@fecha, CAST(@ahoraLocal AS DATE));
      DECLARE @desde DATETIME2 = CONVERT(DATETIME2, (CAST(@hoy AS DATETIME2) AT TIME ZONE @tz) AT TIME ZONE 'UTC');
      DECLARE @hasta DATETIME2 = CONVERT(DATETIME2, (CAST(DATEADD(DAY,1,@hoy) AS DATETIME2) AT TIME ZONE @tz) AT TIME ZONE 'UTC');

      SELECT e.idEventoActividad AS id, e.tipo, e.severidad, e.titulo,
             o.numeroObra AS code, e.ocurridoUtc
      FROM h4.EventoActividad e
      LEFT JOIN dbo.Obra o ON o.idObra = e.idObra
      WHERE e.severidad <> N'info' AND e.ocurridoUtc >= @desde AND e.ocurridoUtc < @hasta
      ORDER BY CASE e.severidad WHEN N'critical' THEN 0 ELSE 1 END, e.ocurridoUtc DESC;
    `);

  const k = kpi.recordset[0] ?? { diaCompleto: 0, totalPersonal: 0, sinMarcaje: 0, horasTotales: 0 };
  return {
    kpis: {
      diaCompleto: k.diaCompleto,
      totalPersonal: k.totalPersonal,
      sinMarcaje: k.sinMarcaje,
      horasTotales: k.horasTotales ?? 0,
    },
    anomalias: anom.recordset,
  };
}

export interface PersonaResumen {
  cedula: string;
  nombre: string | null;
  idColaborador: number | null;
  primeraEntradaUtc: string | null;
  ultimaSalidaUtc: string | null;
  ultimaMarcaUtc: string;
  entradas: number;
  salidas: number;
  totalMarcas: number;
  estado: 'activo' | 'salio';
}

export interface ResumenDia {
  personas: PersonaResumen[];
  activos: number;
  salieron: number;
}

// Resumen del día por persona (una fila por cédula) con las marcas de HOY.
// Portado de src/app/api/resumen-dia. Colapsa cualquier cantidad de marcas en
// un estado: "activo" (su última marca es ENTRADA) o "salio" (última es SALIDA).
export async function getResumenDia(): Promise<ResumenDia> {
  const db = await getDb();
  const r = await db.request().query<PersonaResumen>(`
    SELECT
      m.cedula,
      MAX(c.calcNombreCompleto)                                              AS nombre,
      MAX(c.idColaborador)                                                   AS idColaborador,
      MIN(CASE WHEN m.tipoEvento = N'ENTRADA' THEN m.fechaHoraUtc END)       AS primeraEntradaUtc,
      MAX(CASE WHEN m.tipoEvento = N'SALIDA'  THEN m.fechaHoraUtc END)       AS ultimaSalidaUtc,
      MAX(m.fechaHoraUtc)                                                    AS ultimaMarcaUtc,
      SUM(CASE WHEN m.tipoEvento = N'ENTRADA' THEN 1 ELSE 0 END)             AS entradas,
      SUM(CASE WHEN m.tipoEvento = N'SALIDA'  THEN 1 ELSE 0 END)             AS salidas,
      COUNT(*)                                                               AS totalMarcas,
      CASE
        WHEN MAX(CASE WHEN m.tipoEvento = N'SALIDA' THEN m.fechaHoraUtc END) = MAX(m.fechaHoraUtc)
        THEN N'salio' ELSE N'activo'
      END                                                                    AS estado
    FROM h4.MarcajeEvento m
    LEFT JOIN dbo.Colaborador c ON c.idColaborador = m.idColaborador
    WHERE CAST(m.fechaHoraUtc AS date) = CAST(SYSUTCDATETIME() AS date)
    GROUP BY m.cedula
    ORDER BY MAX(m.fechaHoraUtc) DESC
  `);

  const personas = r.recordset;
  return {
    personas,
    activos: personas.filter((p) => p.estado === 'activo').length,
    salieron: personas.filter((p) => p.estado === 'salio').length,
  };
}
