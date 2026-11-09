import 'server-only';
import type sql from 'mssql';

/* ============================================================================
   Costo de las cuadrillas por semana y partida (pedido de Michael Thames,
   2026-11-09: "cuánto me costó la cuadrilla de losa en fundaciones", "cuánto
   me costó la cuadrilla de acero por semana").

   DE DÓNDE SALE LA PLATA
   La planilla la carga Melany en H4 (Cierre → Obra / Porcentajes) y la guarda
   en el Historial de nóminas: h4.RepartoSemana (una por guardado, semana de
   jueves a miércoles), h4.RepartoSemanaPersona (lo pagado a cada persona y sus
   horas) y h4.RepartoSemanaDetalle (cuánto le tocó a cada obra → partida →
   subpartida). Ese detalle es lo que ella pasa a la hoja ACT BC, pero no trae
   la cuadrilla.

   CÓMO SE LE PONE LA CUADRILLA
   El monto de cada subpartida se toma TAL CUAL del detalle de H4 —así la suma
   por partida cuadra al céntimo con la planilla— y se reparte entre las
   cuadrillas que trabajaron esa subpartida esa semana según lo que costaron
   sus horas: segundos de cada tramo (h4.AsignacionTramo) × costo de la hora de
   esa persona (su monto ÷ sus horas, de h4.RepartoSemanaPersona). Así, si en
   una misma subpartida trabajaron el armador y el peón, cada cuadrilla carga
   su gente a lo que le costó, no solo por horas.

   La cuadrilla de un tramo es la del tramo; si no trae, la "de casa" (la
   membresía activa más vieja), el mismo criterio de H4.

   LO QUE NO CAE EN UNA CUADRILLA
   Lo de una subpartida sin ningún tramo de gente pagada esa semana (en la
   práctica, FE-INC: feriados, vacaciones e incapacidades, que H4 no marca como
   tramo) queda en "Sin cuadrilla" para que el total siga cuadrando.

   DIFERENCIA CON H4
   H4 reparte el BRUTO de cada jornada (redondeado a media hora, sin el
   almuerzo) entre sus tramos; acá el peso es el reloj de cada tramo. Eso solo
   mueve el reparto ENTRE cuadrillas dentro de una misma subpartida, nunca el
   total de la subpartida. No se copia la regla de H4 a propósito: cambia casi
   a diario (horarios, tolerancias, descansos) y una copia se desfasaría.
   ============================================================================ */

export interface SemanaPlanilla {
  id: number;
  anio: number;
  numero: number;
  desde: string; // YYYY-MM-DD (jueves)
  hasta: string; // YYYY-MM-DD (miércoles)
  factor: number;
  guardadoPor: string;
  guardadoUtc: string;
}

export interface FilaCostoCuadrilla {
  idSemana: number;
  idCuadrilla: number | null; // null = sin cuadrilla
  cuadrilla: string;
  obra: string;
  proyecto: string;
  tipoObra: string;
  partidaCodigo: string;
  partidaNombre: string;
  subpartida: string;
  horas: number;
  monto: number; // lo de la planilla (colones)
  neto: number; // monto × factor de la planilla
}

export const SIN_CUADRILLA = 'Sin cuadrilla';

/** Reparte `total` (entero) por `pesos` sin perder ni inventar nada: piso y el sobrante a los restos más grandes (igual que H4). */
export function repartir(total: number, pesos: number[]): number[] {
  const suma = pesos.reduce((a, p) => a + p, 0);
  if (suma <= 0) return pesos.map((_, i) => (i === 0 ? total : 0));
  const crudo = pesos.map((p) => (total * p) / suma);
  const partes = crudo.map(Math.floor);
  let falta = total - partes.reduce((a, p) => a + p, 0);
  const orden = crudo.map((c, i) => ({ i, resto: c - Math.floor(c) })).sort((a, b) => b.resto - a.resto);
  for (let k = 0; falta > 0; k++, falta--) partes[orden[k % orden.length].i] += 1;
  return partes;
}

/** La cédula como la compara H4 (sin guiones ni ceros a la izquierda). */
function normalizarId(v: string | null | undefined): string {
  if (!v) return '';
  const s = v.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (!/\d/.test(s)) return '';
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, '') : s;
}

/** "2.4.1" + "Cielos" → "2.4.1 Cielos": la misma etiqueta que guarda H4 en el detalle. */
const etiqueta = (codigo: string | null, nombre: string | null) =>
  [codigo, nombre].map((x) => (x ?? '').trim()).filter(Boolean).join(' ');

const clave = (idSemana: number, obra: string, partidaCodigo: string, subpartida: string) =>
  `${idSemana}|${obra}|${partidaCodigo}|${subpartida}`;

/** La última planilla guardada de cada semana (si Melany la guardó dos veces, vale la última, como en H4). */
export async function getSemanasPlanilla(db: sql.ConnectionPool): Promise<SemanaPlanilla[]> {
  const r = await db.request().query<{
    id: number; anio: number; numero: number; desde: string; hasta: string; factor: number; guardadoPor: string; guardadoUtc: Date;
  }>(`
    SELECT id, anio, numero, desde, hasta, factor, guardadoPor, guardadoUtc
    FROM (
      SELECT idRepartoSemana AS id, anio, numeroSemana AS numero,
             CONVERT(char(10), desde, 23) AS desde, CONVERT(char(10), hasta, 23) AS hasta,
             CAST(factor AS float) AS factor, creadoPor AS guardadoPor, fechaCreacion AS guardadoUtc,
             ROW_NUMBER() OVER (PARTITION BY desde, hasta ORDER BY fechaCreacion DESC, idRepartoSemana DESC) AS rn
      FROM h4.RepartoSemana
    ) x
    WHERE rn = 1
    ORDER BY desde DESC`);
  return r.recordset.map((s) => ({ ...s, guardadoUtc: new Date(s.guardadoUtc).toISOString() }));
}

export async function getCostoCuadrillas(
  db: sql.ConnectionPool,
  semanas: SemanaPlanilla[],
): Promise<FilaCostoCuadrilla[]> {
  if (semanas.length === 0) return [];
  const ids = semanas.map((s) => s.id);
  const jsonSemanas = JSON.stringify(semanas.map((s) => ({ id: s.id, desde: s.desde, hasta: s.hasta })));
  const enIds = ids.map((_, i) => `@s${i}`).join(', ');
  const conIds = (req: sql.Request) => {
    ids.forEach((id, i) => req.input(`s${i}`, id));
    return req;
  };

  const [detalle, personas, tramos] = await Promise.all([
    // Lo que H4 le repartió a cada obra → partida → subpartida.
    conIds(db.request()).query<{
      idSemana: number; obra: string; tipoObra: string | null; tipoObraNombre: string | null;
      partidaCodigo: string | null; partidaNombre: string | null; subpartida: string | null;
      horas: number; monto: number; neto: number;
    }>(`
      SELECT d.idRepartoSemana AS idSemana, d.numeroObra AS obra, d.tipoObra, d.tipoObraNombre,
             d.partidaCodigo, d.partidaNombre, d.subpartida,
             CAST(d.horas AS float) AS horas, CAST(d.monto AS float) AS monto, CAST(d.neto AS float) AS neto
      FROM h4.RepartoSemanaDetalle d
      WHERE d.idRepartoSemana IN (${enIds})`),
    // Lo pagado a cada persona y sus horas: solo para el costo de su hora. No sale de acá.
    conIds(db.request()).query<{ idSemana: number; cedula: string | null; monto: number; horas: number }>(`
      SELECT p.idRepartoSemana AS idSemana, p.cedula, CAST(p.monto AS float) AS monto, CAST(p.horas AS float) AS horas
      FROM h4.RepartoSemanaPersona p
      WHERE p.idRepartoSemana IN (${enIds}) AND p.cedula IS NOT NULL AND p.monto > 0 AND p.horas > 0`),
    // Segundos de cada persona por cuadrilla y subpartida, en el mismo universo de
    // jornadas que H4 (cerradas, no anuladas, por el día local de la entrada; CR = UTC-6).
    db.request()
      .input('semanas', jsonSemanas)
      .input('primerDia', semanas.reduce((m, s) => (s.desde < m ? s.desde : m), semanas[0].desde))
      .input('ultimoDia', semanas.reduce((m, s) => (s.hasta > m ? s.hasta : m), semanas[0].hasta))
      .query<{
        idSemana: number; cedula: string | null; idCuadrilla: number | null; cuadrilla: string | null;
        obra: string; partidaCodigo: string | null; subCodigo: string | null; subNombre: string | null; seg: number;
      }>(`
      ;WITH sem AS (
        SELECT id, desde, hasta
        FROM OPENJSON(@semanas) WITH (id int '$.id', desde date '$.desde', hasta date '$.hasta')
      ), j AS (
        SELECT s.id AS idSemana, j.idJornada, j.idColaborador,
               j.fechaHoraEntradaUtc AS ent, j.fechaHoraSalidaUtc AS sal
        FROM h4.Jornada j
        JOIN sem s ON CAST(DATEADD(HOUR, -6, j.fechaHoraEntradaUtc) AS date) BETWEEN s.desde AND s.hasta
        WHERE j.fechaHoraSalidaUtc IS NOT NULL AND j.estado <> N'Anomalia'
          -- Rango en UTC sobre la columna desnuda, para que el filtro use índice.
          AND j.fechaHoraEntradaUtc >= DATEADD(HOUR, 6, CAST(@primerDia AS datetime2))
          AND j.fechaHoraEntradaUtc <  DATEADD(HOUR, 6, DATEADD(DAY, 1, CAST(@ultimoDia AS datetime2)))
      ), t AS (
        SELECT j.idSemana, c.cedula, COALESCE(t.idCuadrilla, cm.IDCuadrilla) AS idCuadrilla,
               o.numeroObra AS obra, pa.codigo AS partidaCodigo, sp.codigo AS subCodigo, sp.nombre AS subNombre,
               -- El tramo recortado a su jornada; un tramo abierto termina con la salida.
               DATEDIFF(SECOND,
                 IIF(t.horaInicioUtc > j.ent, t.horaInicioUtc, j.ent),
                 IIF(COALESCE(t.horaFinUtc, j.sal) < j.sal, COALESCE(t.horaFinUtc, j.sal), j.sal)) AS seg
        FROM j
        JOIN dbo.Colaborador c          ON c.idColaborador = j.idColaborador
        JOIN h4.AsignacionTramo t       ON t.idJornada = j.idJornada
        JOIN h4.ObraSubpartida os       ON os.idObraSubpartida = t.idObraSubpartida
        JOIN dbo.Obra o                 ON o.idObra = os.idObra
        LEFT JOIN dbo.SubPartida sp     ON sp.idSubPartida = os.idSubpartida
        LEFT JOIN dbo.Partida pa        ON pa.idPartida = sp.idPartida
        OUTER APPLY (
          SELECT TOP 1 m.IDCuadrilla
          FROM dbo.CuadrillaMiembro m
          WHERE m.IDCol = c.idColaborador AND m.Activo = 1 AND m.FechaSalida IS NULL
          ORDER BY m.FechaIngreso ASC, m.IDCuadMiembro ASC
        ) cm
      )
      SELECT t.idSemana, t.cedula, t.idCuadrilla, cu.Nombre AS cuadrilla,
             t.obra, t.partidaCodigo, t.subCodigo, t.subNombre, SUM(CAST(t.seg AS bigint)) AS seg
      FROM t
      LEFT JOIN dbo.Cuadrilla cu ON cu.IDCuadrilla = t.idCuadrilla
      WHERE t.seg > 0
      GROUP BY t.idSemana, t.cedula, t.idCuadrilla, cu.Nombre, t.obra, t.partidaCodigo, t.subCodigo, t.subNombre`),
  ]);

  // Costo de la hora de cada persona, por semana.
  const costoHora = new Map<string, number>();
  for (const p of personas.recordset) {
    const id = normalizarId(p.cedula);
    if (id) costoHora.set(`${p.idSemana}|${id}`, p.monto / p.horas);
  }

  // Peso de cada cuadrilla en cada subpartida: segundos × costo de la hora de quien los trabajó.
  interface Peso { idCuadrilla: number | null; cuadrilla: string; peso: number; seg: number }
  const pesos = new Map<string, Map<string, Peso>>();
  for (const t of tramos.recordset) {
    const ch = costoHora.get(`${t.idSemana}|${normalizarId(t.cedula)}`);
    if (!ch) continue; // no viene en la planilla: sus horas no tienen costo (igual que en H4)
    const k = clave(t.idSemana, t.obra, (t.partidaCodigo ?? '').trim(), etiqueta(t.subCodigo, t.subNombre));
    let porCuadrilla = pesos.get(k);
    if (!porCuadrilla) pesos.set(k, (porCuadrilla = new Map()));
    const kc = String(t.idCuadrilla ?? '');
    const p = porCuadrilla.get(kc) ?? { idCuadrilla: t.idCuadrilla, cuadrilla: t.cuadrilla?.trim() || SIN_CUADRILLA, peso: 0, seg: 0 };
    p.peso += Number(t.seg) * ch;
    p.seg += Number(t.seg);
    porCuadrilla.set(kc, p);
  }

  // Proyecto de cada obra, para filtrar.
  const obras = [...new Set(detalle.recordset.map((d) => d.obra))];
  const proyectoDe = new Map<string, string>();
  if (obras.length) {
    const req = db.request();
    obras.forEach((o, i) => req.input(`o${i}`, o));
    const r = await req.query<{ obra: string; proyecto: string | null }>(`
      SELECT o.numeroObra AS obra, MIN(p.nombre) AS proyecto
      FROM dbo.Obra o LEFT JOIN dbo.Proyecto p ON p.idProyecto = o.idProyecto
      WHERE o.numeroObra IN (${obras.map((_, i) => `@o${i}`).join(', ')})
      GROUP BY o.numeroObra`);
    for (const x of r.recordset) if (x.proyecto) proyectoDe.set(x.obra, x.proyecto.trim());
  }

  const filas: FilaCostoCuadrilla[] = [];
  for (const d of detalle.recordset) {
    const partidaCodigo = (d.partidaCodigo ?? '').trim();
    const subpartida = (d.subpartida ?? '').trim();
    const base = {
      idSemana: d.idSemana,
      obra: d.obra,
      proyecto: proyectoDe.get(d.obra) ?? (d.tipoObraNombre?.trim() || d.tipoObra?.trim() || 'Sin proyecto'),
      tipoObra: d.tipoObra?.trim() ?? '',
      partidaCodigo,
      partidaNombre: (d.partidaNombre ?? '').trim(),
      subpartida,
    };
    const montoC = Math.round(d.monto * 100);
    const netoC = Math.round(d.neto * 100);
    const horasC = Math.round(d.horas * 100);
    const grupo = [...(pesos.get(clave(d.idSemana, d.obra, partidaCodigo, subpartida))?.values() ?? [])].filter((p) => p.peso > 0);
    if (grupo.length === 0) {
      filas.push({ ...base, idCuadrilla: null, cuadrilla: SIN_CUADRILLA, horas: horasC / 100, monto: montoC / 100, neto: netoC / 100 });
      continue;
    }
    const w = grupo.map((p) => p.peso);
    const montos = repartir(montoC, w);
    const netos = repartir(netoC, w);
    const horas = repartir(horasC, grupo.map((p) => p.seg));
    grupo.forEach((p, i) =>
      filas.push({
        ...base,
        idCuadrilla: p.idCuadrilla,
        cuadrilla: p.cuadrilla,
        horas: horas[i] / 100,
        monto: montos[i] / 100,
        neto: netos[i] / 100,
      }),
    );
  }
  return filas;
}
