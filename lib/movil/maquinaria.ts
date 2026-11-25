// Datos de la app móvil de maquinaria (operarios). Todo sale del esquema `mant`
// del módulo Mantenimiento de Steven, así lo que hace el operario en el teléfono
// aparece en la web de Mantenimiento sin traducir nada:
//
//   · "mis máquinas"      → mant.AsignacionesEquipo (usuario ↔ equipo)
//   · checklist           → mant.ChecklistDiarioItems (por equipo)
//   · checklist hecho     → mant.InspeccionesDiarias (+ horómetro), el mismo
//                           formato que guarda /mantenimiento/inspeccion
//                           (Bien → hecho:true · Falla → hecho:false + observación)
//   · reportar avería     → mant.OrdenesTrabajo (correctiva, abierta)
//   · solicitar material  → mant.SolicitudesMateriales
//
// El operario es un usuario de Producción (dbo.Usuario). En `mant` existe como
// fila de mant.Usuarios con el mismo `usuario` (username): es el puente que ya
// usa lib/mantenimiento/auth.ts para la web. Acá se crea con rol 'operador'.
import { getDb, sql } from '@/lib/db';
import type { SesionMovil } from './sesion';

/** Fotos que manda la app con un reporte: ids de mant.Archivos que subió antes
 *  por /api/movil/maquinaria/fotos. Se descarta lo que no parezca un id. */
export function leerFotos(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const ok = v.filter((x): x is string => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x));
  return [...new Set(ok.map((x) => x.toUpperCase()))].slice(0, 10);
}

/** Zona horaria de la operación: el "día" del checklist es el de Costa Rica. */
const OFFSET_CR = '-06:00';

export interface OperadorMant {
  id: string;
  usuario: string;
  nombre: string;
  rol: string;
}

/** Fila de mant.Usuarios del operario (la crea la primera vez). */
export async function operadorMant(sesion: SesionMovil): Promise<OperadorMant> {
  const usuario = (sesion.username || sesion.cedula || String(sesion.idUsuario)).trim();
  const nombre = (sesion.nombre || usuario).trim();
  const db = await getDb();
  // No se toca el rol de una fila que ya existe: si Steven o un técnico abren la
  // app con su usuario, siguen siendo admin/tecnico en la web.
  const r = await db.request()
    .input('usuario', sql.NVarChar(100), usuario)
    .input('nombre', sql.NVarChar(300), nombre)
    .query<OperadorMant>(`
      MERGE mant.Usuarios AS d USING (SELECT @usuario AS usuario) AS o ON d.usuario = o.usuario
      WHEN MATCHED THEN UPDATE SET nombre = @nombre
      WHEN NOT MATCHED THEN INSERT (nombre, usuario, rol, activo) VALUES (@nombre, @usuario, 'operador', 1)
      OUTPUT INSERTED.id, INSERTED.usuario, INSERTED.nombre, INSERTED.rol;`);
  const f = r.recordset[0];
  return { id: String(f.id), usuario: f.usuario, nombre: f.nombre, rol: f.rol };
}

let tieneColActivo: boolean | null = null;
/** `mant.Equipos.activo` existe en SBX y todavía no en PRO: se mira una vez. */
async function hayColumnaActivo(): Promise<boolean> {
  if (tieneColActivo !== null) return tieneColActivo;
  const db = await getDb();
  const r = await db.request().query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM sys.columns WHERE object_id = OBJECT_ID('mant.Equipos') AND name = 'activo'",
  );
  tieneColActivo = Number(r.recordset[0]?.n) > 0;
  return tieneColActivo;
}

export interface EquipoOperador {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string | null;
  marca: string | null;
  modelo: string | null;
  placa: string | null;
  estado: string;
  horometroActual: number;
  tieneFoto: boolean;
  itemsChecklist: number;
  /** Último checklist de HOY (hora de Costa Rica), o null si no lo ha hecho. */
  checklistHoy: { fecha: string; fallas: number; usuarioNombre: string } | null;
}

export async function equiposDelOperador(usuarioId: string): Promise<EquipoOperador[]> {
  const db = await getDb();
  const filtroActivo = (await hayColumnaActivo()) ? 'AND e.activo = 1' : '';
  const r = await db.request()
    .input('usuarioId', sql.UniqueIdentifier, usuarioId)
    .query(`
      DECLARE @hoy date = CAST(SWITCHOFFSET(SYSDATETIMEOFFSET(), '${OFFSET_CR}') AS date);
      SELECT e.id, e.codigo, e.nombre, e.tipo, e.marca, e.modelo, e.placa, e.estado, e.horometroActual,
             CASE WHEN e.fotoId IS NULL THEN 0 ELSE 1 END AS tieneFoto,
             (SELECT COUNT(*) FROM mant.ChecklistDiarioItems c WHERE c.equipoId = e.id) AS itemsChecklist,
             hoy.fecha AS chkFecha, hoy.checklist AS chkJson, hoy.usuarioNombre AS chkUsuario
      FROM mant.AsignacionesEquipo a
      JOIN mant.Equipos e ON e.id = a.equipoId
      OUTER APPLY (
        SELECT TOP 1 i.fecha, i.checklist, u.nombre AS usuarioNombre
        FROM mant.InspeccionesDiarias i JOIN mant.Usuarios u ON u.id = i.usuarioId
        WHERE i.equipoId = e.id
          AND CAST(SWITCHOFFSET(TODATETIMEOFFSET(i.fecha, '+00:00'), '${OFFSET_CR}') AS date) = @hoy
        ORDER BY i.fecha DESC
      ) hoy
      WHERE a.usuarioId = @usuarioId ${filtroActivo}
      ORDER BY e.nombre`);
  return r.recordset.map((f) => {
    let fallas = 0;
    if (f.chkJson) {
      try {
        const arr = JSON.parse(f.chkJson) as Array<{ hecho?: boolean }>;
        fallas = arr.filter((x) => x && x.hecho === false).length;
      } catch { /* checklist ilegible: se cuenta como sin fallas */ }
    }
    return {
      id: String(f.id).toUpperCase(),
      codigo: f.codigo,
      nombre: f.nombre,
      tipo: f.tipo ?? null,
      marca: f.marca ?? null,
      modelo: f.modelo ?? null,
      placa: f.placa ?? null,
      estado: f.estado,
      horometroActual: Number(f.horometroActual ?? 0),
      tieneFoto: !!f.tieneFoto,
      itemsChecklist: Number(f.itemsChecklist ?? 0),
      checklistHoy: f.chkFecha
        ? { fecha: new Date(f.chkFecha).toISOString(), fallas, usuarioNombre: String(f.chkUsuario ?? '') }
        : null,
    };
  });
}

/** ¿El equipo está asignado a este operario? Es la autorización de cada POST. */
export async function equipoAsignado(usuarioId: string, equipoId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(equipoId)) return false;
  const db = await getDb();
  const r = await db.request()
    .input('usuarioId', sql.UniqueIdentifier, usuarioId)
    .input('equipoId', sql.UniqueIdentifier, equipoId)
    .query('SELECT 1 AS ok FROM mant.AsignacionesEquipo WHERE usuarioId = @usuarioId AND equipoId = @equipoId');
  return r.recordset.length > 0;
}

export interface ItemChecklist {
  id: string;
  orden: number;
  titulo: string;
  detalle: string | null;
}

export async function checklistDelEquipo(equipoId: string): Promise<ItemChecklist[]> {
  const db = await getDb();
  const r = await db.request()
    .input('equipoId', sql.UniqueIdentifier, equipoId)
    .query('SELECT id, orden, titulo, detalle FROM mant.ChecklistDiarioItems WHERE equipoId = @equipoId ORDER BY orden, titulo');
  return r.recordset.map((f) => ({
    id: String(f.id).toUpperCase(),
    orden: Number(f.orden ?? 0),
    titulo: String(f.titulo ?? ''),
    detalle: f.detalle ? String(f.detalle) : null,
  }));
}

export interface RespuestaItem {
  itemId: string;
  titulo: string;
  hecho: boolean;
  observacion?: string;
}

/**
 * Guarda el checklist de una máquina: la inspección y, si viene, el horómetro
 * (lectura + horómetro del equipo), todo en una transacción. Mismo formato que
 * /api/mantenimiento/inspeccionesDiarias, así la web lo lee igual.
 */
export async function guardarInspeccion(args: {
  equipoId: string;
  usuarioId: string;
  horometro: number | null;
  checklist: RespuestaItem[];
  fotos: string[];
}): Promise<string> {
  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    if (args.horometro != null) {
      await tx.request()
        .input('equipoId', sql.UniqueIdentifier, args.equipoId)
        .input('horometro', sql.Decimal(18, 2), args.horometro)
        .query(`
          INSERT INTO mant.LecturasHorometro (equipoId, horometro, fuente, fecha) VALUES (@equipoId, @horometro, 'inspeccion', SYSUTCDATETIME());
          UPDATE mant.Equipos SET horometroActual = @horometro WHERE id = @equipoId;`);
    }
    const ins = await tx.request()
      .input('equipoId', sql.UniqueIdentifier, args.equipoId)
      .input('usuarioId', sql.UniqueIdentifier, args.usuarioId)
      .input('horometro', sql.Decimal(18, 2), args.horometro)
      .input('checklist', sql.NVarChar(sql.MAX), JSON.stringify(args.checklist))
      .input('fotos', sql.NVarChar(sql.MAX), JSON.stringify(args.fotos))
      .query(`
        INSERT INTO mant.InspeccionesDiarias (equipoId, usuarioId, horometro, checklist, fotos)
        OUTPUT INSERTED.id VALUES (@equipoId, @usuarioId, @horometro, @checklist, @fotos)`);
    await tx.commit();
    return String(ins.recordset[0].id);
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

/** Siguiente número de un contador de mant.Contadores ('ot', 'solicitud'); si
 *  la fila no existe la crea (en PRO solo está la de 'ot'). */
async function siguienteNumero(tx: sql.Transaction, nombre: string): Promise<number> {
  const r = await tx.request()
    .input('nombre', sql.NVarChar(50), nombre)
    .query<{ anterior: number }>(`
      IF NOT EXISTS (SELECT 1 FROM mant.Contadores WITH (UPDLOCK, HOLDLOCK) WHERE nombre = @nombre)
        INSERT INTO mant.Contadores (nombre, valor) VALUES (@nombre, 1);
      UPDATE mant.Contadores SET valor = valor + 1 OUTPUT INSERTED.valor - 1 AS anterior WHERE nombre = @nombre;`);
  return Number(r.recordset[0].anterior);
}

/** Reportar avería = abrir una OT correctiva, la misma que ve Mantenimiento en Órdenes. */
export async function reportarAveria(args: {
  equipoId: string;
  operador: OperadorMant;
  titulo: string;
  descripcion: string;
  prioridad: 'baja' | 'media' | 'alta' | 'urgente';
  fotos: string[];
}): Promise<{ id: string; numero: string }> {
  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const n = await siguienteNumero(tx, 'ot');
    const numero = 'OT-' + String(n).padStart(4, '0');
    const descripcion = `${args.descripcion}\n\nReportado desde la app de maquinaria por ${args.operador.nombre}.`.trim();
    const ins = await tx.request()
      .input('numero', sql.VarChar(20), numero)
      .input('equipoId', sql.UniqueIdentifier, args.equipoId)
      .input('prioridad', sql.NVarChar(40), args.prioridad)
      .input('titulo', sql.NVarChar(400), args.titulo)
      .input('descripcion', sql.NVarChar(sql.MAX), descripcion)
      .input('responsable', sql.NVarChar(300), '')
      .input('fotos', sql.NVarChar(sql.MAX), JSON.stringify(args.fotos))
      .query(`
        INSERT INTO mant.OrdenesTrabajo (numero, equipoId, tipo, prioridad, titulo, descripcion, responsable,
          horometroApertura, estado, checklist, fotos, repuestosUsados)
        OUTPUT INSERTED.id
        SELECT @numero, @equipoId, 'correctivo', @prioridad, @titulo, @descripcion, @responsable,
          e.horometroActual, 'abierta', '[]', @fotos, '[]'
        FROM mant.Equipos e WHERE e.id = @equipoId`);
    await tx.commit();
    return { id: String(ins.recordset[0].id), numero };
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

export interface LineaMaterial {
  nombre: string;
  cantidad: number;
  unidad: string;
}

export async function solicitarMaterial(args: {
  equipoId: string;
  operador: OperadorMant;
  items: LineaMaterial[];
  notas: string;
  fotos: string[];
}): Promise<{ id: string; numero: string }> {
  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const n = await siguienteNumero(tx, 'solicitud');
    const numero = 'SM-' + String(n).padStart(4, '0');
    const items = args.items.map((i) => ({ repuestoId: null, nombre: i.nombre, cantidad: i.cantidad, unidad: i.unidad }));
    const ins = await tx.request()
      .input('numero', sql.VarChar(20), numero)
      .input('solicitante', sql.NVarChar(300), args.operador.nombre)
      .input('equipoId', sql.UniqueIdentifier, args.equipoId)
      .input('items', sql.NVarChar(sql.MAX), JSON.stringify(items))
      .input('notas', sql.NVarChar(1000), args.notas || null)
      .input('fotos', sql.NVarChar(sql.MAX), JSON.stringify(args.fotos))
      .query(`
        INSERT INTO mant.SolicitudesMateriales (numero, solicitante, equipoId, items, notas, fotos)
        OUTPUT INSERTED.id VALUES (@numero, @solicitante, @equipoId, @items, @notas, @fotos)`);
    await tx.commit();
    return { id: String(ins.recordset[0].id), numero };
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

/** Lo último que el operario reportó de una máquina (averías y material), para
 *  que vea en la app que su reporte llegó y en qué va. */
export async function reportesRecientes(equipoId: string) {
  const db = await getDb();
  const r = await db.request()
    .input('equipoId', sql.UniqueIdentifier, equipoId)
    .query(`
      SELECT TOP 10 * FROM (
        SELECT 'averia' AS clase, o.numero, o.titulo AS texto, o.estado, o.fechaApertura AS fecha
        FROM mant.OrdenesTrabajo o WHERE o.equipoId = @equipoId AND o.tipo = 'correctivo'
        UNION ALL
        SELECT 'material', s.numero, s.items, NULL, s.fecha FROM mant.SolicitudesMateriales s WHERE s.equipoId = @equipoId
      ) x ORDER BY fecha DESC`);
  return r.recordset.map((f) => {
    let texto = String(f.texto ?? '');
    if (f.clase === 'material') {
      try {
        const arr = JSON.parse(texto) as LineaMaterial[];
        texto = arr.map((i) => `${i.cantidad} ${i.unidad} ${i.nombre}`).join(', ');
      } catch { /* deja el texto crudo */ }
    }
    return {
      clase: f.clase as 'averia' | 'material',
      numero: String(f.numero),
      texto,
      estado: f.estado ? String(f.estado) : null,
      fecha: new Date(f.fecha).toISOString(),
    };
  });
}
