import { sql } from './db';
import type { Request as SqlRequest } from 'mssql';

/** Vincula los campos editables de dbo.Obra a un request mssql (create/update). */
export function bindObra(reqObj: SqlRequest, b: Record<string, unknown>): SqlRequest {
  const num = (v: unknown) => (v != null && v !== '' ? Number(v) : null);
  const str = (v: unknown) => ((v as string) || null);
  return reqObj
    .input('numeroObra', sql.NVarChar, b.numeroObra)
    .input('nombreMostrado', sql.NVarChar, str(b.nombreMostrado))
    .input('descripcion', sql.NVarChar, str(b.descripcion))
    .input('centroCosto', sql.NVarChar, str(b.centroCosto))
    .input('areaCosteo', sql.NVarChar, str(b.areaCosteo))
    .input('proyectoPadre', sql.NVarChar, str(b.proyectoPadre))
    .input('idProyecto', sql.Int, num(b.idProyecto))
    .input('areaProrrateadaM2', sql.Decimal(18, 2), num(b.areaProrrateadaM2))
    .input('gerenteProyecto', sql.NVarChar, str(b.gerenteProyecto))
    .input('idEncargado', sql.NVarChar, str(b.idEncargado))
    .input('ubicacion', sql.NVarChar, str(b.ubicacion))
    .input('estado', sql.NVarChar, str(b.estado))
    .input('fechaInicio', sql.Date, b.fechaInicio ? new Date(b.fechaInicio as string) : null)
    .input('fechaFin', sql.Date, b.fechaFin ? new Date(b.fechaFin as string) : null)
    .input('precioNormalMaquinaria', sql.Decimal(18, 2), num(b.precioNormalMaquinaria))
    .input('precioConcretoMaquinaria', sql.Decimal(18, 2), num(b.precioConcretoMaquinaria))
    .input('origenPrincipal', sql.NVarChar, str(b.origenPrincipal))
    .input('esBC', sql.Bit, b.esBC == null ? null : (b.esBC ? 1 : 0))
    .input('esProcore', sql.Bit, b.esProcore == null ? null : (b.esProcore ? 1 : 0));
}
