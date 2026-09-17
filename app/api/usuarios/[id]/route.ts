// Solo LECTURA. La edición y la baja de un colaborador se administran en
// Recursos Humanos (rh.adelante.cr). Los métodos de escritura se eliminaron el
// 2026-09-14 (ver auditoría de seguridad).
import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { id } = await params;
  const db = await getDb();

  // Modelo nuevo: se lee de dbo.V_Colaborador (resuelve puesto/departamento/
  // país/geografía). Se exponen además los FK granulares (idPuesto,
  // codigoDistrito, idPais) para precargar los dropdowns del formulario.
  const userRes = await db.request()
    .input('id', sql.Int, parseInt(id))
    .query(`
      SELECT c.idColaborador AS IDCol, c.cedula AS Cedula, c.nombre AS Nombre,
             c.primerApellido AS PrimerApellido, c.segundoApellido AS SegundoApellido,
             c.calcNombreCompleto AS NombreCompleto, c.correo AS Correo,
             c.telefono AS Telefono, c.departamento AS Departamento, c.puesto AS Puesto,
             c.esActivo AS Activo, c.fechaIngreso AS FechaIngreso, c.fechaSalida AS FechaSalida,
             c.fechaNacimiento AS FechaNacimiento, c.genero AS Sexo, c.direccion AS Direccion,
             c.provincia AS Provincia, c.canton AS Canton, c.distrito AS Distrito, c.pais AS Pais,
             c.tallaCamisa AS TallaCamisa, c.tallaPantalon AS TallaPantalon,
             c.idPuesto, c.codigoDistrito, c.idPais, c.username AS Username,
             (SELECT TOP 1 u.idUsuario FROM dbo.Usuario u WHERE u.idColaborador = c.idColaborador) AS IDUsuario
      FROM dbo.V_Colaborador c
      WHERE c.idColaborador = @id
    `);

  if (!userRes.recordset.length) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  }

  const rolesRes = await db.request()
    .input('id', sql.Int, parseInt(id))
    .query(`
      SELECT r.idRol AS IDRol, r.nombre AS NombreRol, a.nombre AS Categoria, 0 AS NivelAdmin,
             ur.esTipo AS esTipo
      FROM dbo.Usuario u
      JOIN dbo.UsuarioRol ur ON ur.idUsuario = u.idUsuario
      JOIN dbo.Rol r ON r.idRol = ur.idRol
      LEFT JOIN dbo.App a ON a.idApp = r.idApp
      WHERE u.idColaborador = @id
    `);

  const proyectosRes = await db.request()
    .input('id', sql.Int, parseInt(id))
    .query(`
      SELECT p.idProyecto AS IDProyecto, p.nombre AS Nombre,
             p.abreviatura AS CodigoBC,
             NULL AS TaskNoBC, NULL AS DescripcionTask, NULL AS NombreRol,
             NULL AS FechaAsignacion, CAST(1 AS BIT) AS Activo
      FROM dbo.Usuario u
      JOIN dbo.UsuarioProyecto up ON up.idUsuario = u.idUsuario
      JOIN dbo.Proyecto p ON p.idProyecto = up.idProyecto
      WHERE u.idColaborador = @id
    `);

  // Campos de jornada, salario y marcaje viven en la tabla base (no en la vista).
  const extraRes = await db.request()
    .input('id', sql.Int, parseInt(id))
    .query(`
      SELECT c.salarioMensual AS SalarioMensual,
             CONVERT(varchar(5), c.horaEntrada, 108) AS HoraEntrada,
             CONVERT(varchar(5), c.horaSalida, 108) AS HoraSalida,
             c.numeroMarcaje AS NumeroMarcaje,
             c.marcajeEstado AS MarcajeEstado,
             c.marcajeFechaEnrol AS MarcajeFechaEnrol,
             -- Foto capturada por el reloj (H4). Se guarda en h4.DispositivoBiometria
             -- (tipo 'foto', base64 JPEG) por PIN = cédula; tomamos la más reciente.
             (SELECT TOP 1 db.payload FROM h4.DispositivoBiometria db
              WHERE db.pin = c.cedula AND db.tipo = N'foto'
              ORDER BY db.fechaCaptura DESC) AS FotoBase64
      FROM dbo.Colaborador c WHERE c.idColaborador = @id
    `);

  return NextResponse.json({
    ...userRes.recordset[0],
    ...(extraRes.recordset[0] ?? {}),
    roles: rolesRes.recordset,
    proyectos: proyectosRes.recordset,
  });
}
