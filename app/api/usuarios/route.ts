// Solo LECTURA. El alta/edición/baja de colaboradores se administra en
// Recursos Humanos (rh.adelante.cr); Producción únicamente consulta el padrón
// para poblar los selectores de Cuadrillas y Proyectos. Los métodos de
// escritura se eliminaron el 2026-09-14 (ver auditoría de seguridad).
import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const busqueda = searchParams.get('q') ?? '';
  const pagina = parseInt(searchParams.get('pagina') ?? '1');
  const porPagina = parseInt(searchParams.get('porPagina') ?? '20');
  const activo = searchParams.get('activo');
  const departamento = searchParams.get('departamento');
  const offset = (pagina - 1) * porPagina;

  const db = await getDb();
  const request = db.request()
    .input('busqueda', sql.NVarChar, `%${busqueda}%`)
    .input('offset', sql.Int, offset)
    .input('porPagina', sql.Int, porPagina);

  // Modelo nuevo: se lee de dbo.V_Colaborador (resuelve puesto/departamento/
  // geografía) + roles vía UsuarioRol/Rol. Alias PascalCase para la UI.
  const soloUsuarios = searchParams.get('soloUsuarios') === '1';
  let where = `WHERE (c.calcNombreCompleto LIKE @busqueda OR c.cedula LIKE @busqueda OR c.correo LIKE @busqueda)`;
  if (activo !== null && activo !== '') {
    where += ` AND c.esActivo = ${activo === '1' ? '1' : '0'}`;
  }
  if (departamento) {
    request.input('departamento', sql.NVarChar, departamento);
    where += ` AND c.departamento = @departamento`;
  }
  // "Usuarios" = colaboradores con cuenta de login (acceso a apps).
  if (soloUsuarios) {
    where += ` AND c.idUsuario IS NOT NULL`;
  }

  const countRes = await request.query(`
    SELECT COUNT(*) as total FROM dbo.V_Colaborador c ${where}
  `);
  const total = countRes.recordset[0].total;

  const dataRes = await db.request()
    .input('busqueda', sql.NVarChar, `%${busqueda}%`)
    .input('offset', sql.Int, offset)
    .input('porPagina', sql.Int, porPagina)
    .query(`
      SELECT c.idColaborador AS IDCol, c.cedula AS Cedula,
             c.calcNombreCompleto AS NombreCompleto, c.correo AS Correo,
             c.telefono AS Telefono, c.departamento AS Departamento, c.puesto AS Puesto,
             c.esActivo AS Activo, c.fechaIngreso AS FechaIngreso,
             c.username AS Username,
             CASE WHEN c.idUsuario IS NOT NULL THEN 1 ELSE 0 END AS EsUsuario,
             STRING_AGG(r.nombre, ', ') AS Roles,
             (SELECT a.idApp,
                     ISNULL(a.nombre, 'Sin app') AS app,
                     a.codigo AS appCodigo,
                     STRING_AGG(r2.nombre, ', ') AS roles
              FROM dbo.UsuarioRol ur2
              JOIN dbo.Rol r2 ON r2.idRol = ur2.idRol
              LEFT JOIN dbo.App a ON a.idApp = r2.idApp
              WHERE ur2.idUsuario = c.idUsuario
              GROUP BY a.idApp, a.nombre, a.codigo
              ORDER BY ISNULL(a.nombre, 'Sin app')
              FOR JSON PATH) AS apps
      FROM dbo.V_Colaborador c
      LEFT JOIN dbo.UsuarioRol ur ON ur.idUsuario = c.idUsuario
      LEFT JOIN dbo.Rol r ON r.idRol = ur.idRol
      ${where}
      GROUP BY c.idColaborador, c.cedula, c.calcNombreCompleto, c.correo,
               c.telefono, c.departamento, c.puesto, c.esActivo, c.fechaIngreso,
               c.username, c.idUsuario
      ORDER BY c.esActivo DESC, c.calcNombreCompleto
      OFFSET @offset ROWS FETCH NEXT @porPagina ROWS ONLY
    `);

  // `apps` viene como string JSON (FOR JSON PATH) o null si no tiene roles.
  const data = dataRes.recordset.map((row: Record<string, unknown>) => ({
    ...row,
    EsUsuario: !!row.EsUsuario,
    apps: typeof row.apps === 'string' ? JSON.parse(row.apps as string) : [],
  }));

  return NextResponse.json({
    data,
    total,
    paginas: Math.ceil(total / porPagina),
    pagina,
  });
}
