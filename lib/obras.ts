import { sql } from './db';
import type { Request as SqlRequest } from 'mssql';

/** Vincula los campos editables de dbo.Obra a un request mssql (create/update). */
export function bindObra(reqObj: SqlRequest, b: Record<string, unknown>): SqlRequest {
  const num = (v: unknown) => (v != null && v !== '' ? Number(v) : null);
  const str = (v: unknown) => ((v as string) || null);
  /** La fecha VACÍA de Business Central llega como `0001-01-01`, y el driver de
   *  SQL la rechaza con «Validation failed for parameter 'fechaInicio'. Out of
   *  range.» (probado: acepta desde 1752, el año 1 no). O sea que guardar
   *  CUALQUIER obra que la tuviera daba 500 y no se guardaba nada: en producción
   *  son 206 de las 259 obras, el 80 %.
   *
   *  `0001-01-01` no es una fecha, es el centinela de "sin fecha" de BC, así que
   *  se guarda NULL — que es lo mismo pero en SQL, y es lo que ya hace el
   *  importador de BC (ver `toDate` en app/api/bc/jobs/route.ts, que descarta
   *  `0001` y `1753`). */
  const fecha = (v: unknown): Date | null => {
    if (!v) return null;
    const d = new Date(v as string);
    if (Number.isNaN(d.getTime())) return null;
    return d.getUTCFullYear() < 1753 ? null : d;
  };
  return reqObj
    .input('numeroObra', sql.NVarChar, b.numeroObra)
    .input('nombreMostrado', sql.NVarChar, str(b.nombreMostrado))
    .input('descripcion', sql.NVarChar, str(b.descripcion))
    .input('centroCosto', sql.NVarChar, str(b.centroCosto))
    .input('areaCosteo', sql.NVarChar, str(b.areaCosteo))
    // Tipo de obra elegido a mano (O/I/A/F/T). NULL = se deduce del área de costeo.
    .input('tipoObra', sql.VarChar(20), str(b.tipoObra))
    .input('proyectoPadre', sql.NVarChar, str(b.proyectoPadre))
    .input('idProyecto', sql.Int, num(b.idProyecto))
    .input('areaProrrateadaM2', sql.Decimal(18, 2), num(b.areaProrrateadaM2))
    .input('gerenteProyecto', sql.NVarChar, str(b.gerenteProyecto))
    .input('idEncargado', sql.NVarChar, str(b.idEncargado))
    .input('ubicacion', sql.NVarChar, str(b.ubicacion))
    .input('estado', sql.NVarChar, str(b.estado))
    .input('fechaInicio', sql.Date, fecha(b.fechaInicio))
    .input('fechaFin', sql.Date, fecha(b.fechaFin))
    .input('precioNormalMaquinaria', sql.Decimal(18, 2), num(b.precioNormalMaquinaria))
    .input('precioConcretoMaquinaria', sql.Decimal(18, 2), num(b.precioConcretoMaquinaria))
    .input('origenPrincipal', sql.NVarChar, str(b.origenPrincipal))
    .input('esBC', sql.Bit, b.esBC == null ? null : (b.esBC ? 1 : 0))
    .input('esProcore', sql.Bit, b.esProcore == null ? null : (b.esProcore ? 1 : 0));
}
