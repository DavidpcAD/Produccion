// Solo LECTURA. El alta/edición/baja de colaboradores se administra en
// Recursos Humanos (rh.adelante.cr); Producción únicamente consulta el padrón
// para poblar los selectores de Cuadrillas y Proyectos. Los métodos de
// escritura se eliminaron el 2026-09-14 (ver auditoría de seguridad).
import { NextRequest, NextResponse } from 'next/server';
import { jsonComprimido } from '@/lib/http/json-comprimido';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { puedeAbrirRuta, getRouteLevel } from '@/lib/permissions';

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
  // Una sola forma de armar las peticiones, para que el COUNT y la PÁGINA lleven
  // SIEMPRE los mismos parámetros. Antes `@departamento` se declaraba solo en la
  // del conteo pero el WHERE lo comparten las dos, así que `?departamento=X`
  // reventaba con «Must declare the scalar variable "@departamento"» y la ruta
  // devolvía 500.
  const conParams = () => {
    const r = db.request()
      .input('busqueda', sql.NVarChar, `%${busqueda}%`)
      .input('offset', sql.Int, offset)
      .input('porPagina', sql.Int, porPagina);
    if (departamento) r.input('departamento', sql.NVarChar, departamento);
    return r;
  };

  // Modelo nuevo: se lee de dbo.V_Colaborador (resuelve puesto/departamento/
  // geografía) + roles vía UsuarioRol/Rol. Alias PascalCase para la UI.
  const soloUsuarios = searchParams.get('soloUsuarios') === '1';
  let where = `WHERE (c.calcNombreCompleto LIKE @busqueda OR c.cedula LIKE @busqueda OR c.correo LIKE @busqueda)`;
  if (activo !== null && activo !== '') {
    where += ` AND c.esActivo = ${activo === '1' ? '1' : '0'}`;
  }
  if (departamento) {
    where += ` AND c.departamento = @departamento`;
  }
  // "Usuarios" = colaboradores con cuenta de login (acceso a apps).
  if (soloUsuarios) {
    where += ` AND c.idUsuario IS NOT NULL`;
  }

  // `?campos=basico` — lo que necesita un SELECTOR de personas (Cuadrillas,
  // Proyectos): id, nombre, cédula y puesto. Nada más.
  //
  // La consulta completa de abajo trae 13 columnas por fila y, por CADA UNA,
  // arma el JSON de sus apps con una subconsulta correlacionada más un
  // STRING_AGG sobre UsuarioRol/Rol. Para pintar un desplegable de nombres eso
  // son 105 KB y ~2 s por 342 colaboradores, y de paso le manda el correo y el
  // teléfono de toda la empresa a cualquiera que abra Cuadrillas. El modo
  // básico se salta los dos joins y la subconsulta.
  const soloBasico = searchParams.get('campos') === 'basico';

  // El padrón COMPLETO (cédula, correo, teléfono, fecha de ingreso, usuario,
  // roles y apps de los 342 colaboradores) es de quien administra gente, no de
  // cualquiera con sesión. Esta ruta está en el catálogo compartido —la abre
  // todo el mundo— porque Cuadrillas y Proyectos necesitan los NOMBRES para
  // sus selectores, y para eso está `campos=basico`.
  //
  // Hasta hoy bastaba con `nivelAdmin >= 1`, así que un usuario de Ingeniería
  // se bajaba el correo y el teléfono de toda la empresa abriendo Cuadrillas.
  // Dentro de esta app ya nadie pide la forma completa (el alta/edición de
  // gente vive en rh.adelante.cr); se deja para quien abra `/usuarios`.
  //
  // La decisión se delega en `puedeAbrirRuta`, la MISMA regla del proxy: con
  // rol de Producción mandan los módulos y el nivel no se mira. Mirarlo sería
  // inútil: `MODULE_LEVEL` le da 4 —el máximo— a ingenieria y a presupuesto,
  // así que casi todo el que tiene rol es nivel 4. El nivel solo sigue
  // decidiendo para los usuarios legacy, que no tienen módulos.
  if (!soloBasico && !puedeAbrirRuta('/usuarios', session.modules, session.nivelAdmin, getRouteLevel('/usuarios'))) {
    return NextResponse.json(
      {
        error:
          'El padrón completo (cédula, correo, teléfono, roles) es de quien administra personas. ' +
          'Para un selector de personas alcanza con campos=basico.',
      },
      { status: 403 },
    );
  }

  const selectBasico = `
      SELECT c.idColaborador AS IDCol, c.cedula AS Cedula,
             c.calcNombreCompleto AS NombreCompleto, c.puesto AS Puesto,
             c.esActivo AS Activo
      FROM dbo.V_Colaborador c
      ${where}
      ORDER BY c.esActivo DESC, c.calcNombreCompleto
      OFFSET @offset ROWS FETCH NEXT @porPagina ROWS ONLY
    `;

  const selectCompleto = `
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
    `;

  // El conteo y la página no dependen uno del otro: van juntos.
  const [countRes, dataRes] = await Promise.all([
    conParams().query(`SELECT COUNT(*) as total FROM dbo.V_Colaborador c ${where}`),
    conParams().query(soloBasico ? selectBasico : selectCompleto),
  ]);
  const total = countRes.recordset[0].total;

  // `apps` viene como string JSON (FOR JSON PATH) o null si no tiene roles.
  const data = soloBasico
    ? dataRes.recordset
    : dataRes.recordset.map((row: Record<string, unknown>) => ({
        ...row,
        EsUsuario: !!row.EsUsuario,
        apps: typeof row.apps === 'string' ? JSON.parse(row.apps as string) : [],
      }));

  // Comprimido: son 342 colaboradores y lo piden los selectores de personas.
  return jsonComprimido(req, {
    data,
    total,
    paginas: Math.ceil(total / porPagina),
    pagina,
  });
}
