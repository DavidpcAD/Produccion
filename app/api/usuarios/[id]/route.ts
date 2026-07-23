import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

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

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { id } = await params;
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';

  try {
    const body = await req.json();
    const { nombre, primerApellido, segundoApellido, correo, telefono,
            activo, fechaIngreso, fechaSalida, fechaNacimiento, sexo, direccion,
            idPuesto, codigoDistrito, idPais,
            tallaCamisa, tallaPantalon, salarioMensual, horaEntrada, horaSalida } = body;
    const s = (v: unknown) => (v != null && String(v).trim() !== '' ? String(v).trim() : null);

    const db = await getDb();

    // Estado previo (para auditoría) desde la vista
    const before = await db.request()
      .input('id', sql.Int, parseInt(id))
      .query(`SELECT calcNombreCompleto, esActivo, puesto, departamento FROM dbo.V_Colaborador WHERE idColaborador = @id`);

    // Modelo nuevo (dbo.Colaborador). calcNombreCompleto es columna CALCULADA →
    // no se actualiza. Departamento/geografía se guardan vía los FK granulares
    // idPuesto y codigoDistrito; idPais para el país.
    await db.request()
      .input('id', sql.Int, parseInt(id))
      .input('nombre', sql.NVarChar, nombre)
      .input('primerApellido', sql.NVarChar, primerApellido ?? '')
      .input('segundoApellido', sql.NVarChar, segundoApellido || null)
      .input('correo', sql.NVarChar, correo || null)
      .input('telefono', sql.NVarChar, telefono ?? '')
      .input('genero', sql.NVarChar, sexo || null)
      .input('fechaIngreso', sql.Date, fechaIngreso ? new Date(fechaIngreso) : null)
      .input('fechaSalida', sql.Date, fechaSalida ? new Date(fechaSalida) : null)
      .input('fechaNacimiento', sql.Date, fechaNacimiento ? new Date(fechaNacimiento) : null)
      .input('direccion', sql.NVarChar, direccion || null)
      .input('activo', sql.Bit, activo ? 1 : 0)
      .input('idPuesto', sql.Int, idPuesto ? Number(idPuesto) : null)
      .input('codigoDistrito', sql.Char(5), codigoDistrito || null)
      .input('idPais', sql.Int, idPais ? Number(idPais) : null)
      .input('tallaCamisa', sql.NVarChar, s(tallaCamisa))
      .input('tallaPantalon', sql.NVarChar, s(tallaPantalon))
      .input('salarioMensual', sql.Decimal(18, 2), salarioMensual != null && String(salarioMensual).trim() !== '' ? Number(salarioMensual) : null)
      .input('horaEntrada', sql.NVarChar, s(horaEntrada))
      .input('horaSalida', sql.NVarChar, s(horaSalida))
      .input('modificadoPor', sql.NVarChar, session.cedula ?? 'control-usuarios')
      .query(`
        UPDATE dbo.Colaborador SET
          nombre = @nombre, primerApellido = @primerApellido,
          segundoApellido = @segundoApellido, correo = @correo, telefono = @telefono,
          genero = @genero, fechaIngreso = @fechaIngreso, fechaSalida = @fechaSalida,
          fechaNacimiento = @fechaNacimiento,
          direccion = @direccion, esActivo = @activo,
          idPuesto = COALESCE(@idPuesto, idPuesto),
          codigoDistrito = @codigoDistrito,
          idPais = COALESCE(@idPais, idPais),
          tallaCamisa = @tallaCamisa, tallaPantalon = @tallaPantalon,
          salarioMensual = @salarioMensual,
          horaEntrada = @horaEntrada, horaSalida = @horaSalida,
          fechaModificacion = SYSUTCDATETIME(), modificadoPor = @modificadoPor
        WHERE idColaborador = @id
      `);

    await logAudit({
      idColAccion: session.idCol,
      accion: 'EDITAR_USUARIO',
      entidad: 'Colaborador',
      idEntidad: parseInt(id),
      detallePrevio: before.recordset[0],
      detalleNuevo: { nombre, primerApellido, segundoApellido, activo },
      ip,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/usuarios/[id] PUT error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Eliminar colaborador DEFINITIVAMENTE. Solo se permite si no tiene dependencias
// (no tiene login de usuario, no pertenece a ninguna cuadrilla y no es encargado
// de ninguna). Si las tiene, se bloquea y se sugiere desactivar en su lugar.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'Solo un Super Admin puede eliminar colaboradores' }, { status: 403 });
  }

  const { id } = await params;
  const idNum = parseInt(id);
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';

  try {
    const db = await getDb();

    const info = await db.request()
      .input('id', sql.Int, idNum)
      .query('SELECT idColaborador, calcNombreCompleto FROM dbo.Colaborador WHERE idColaborador = @id');
    if (info.recordset.length === 0) {
      return NextResponse.json({ error: 'Colaborador no encontrado' }, { status: 404 });
    }

    // Contar dependencias (FKs) que impiden el borrado definitivo.
    const dep = await db.request()
      .input('id', sql.Int, idNum)
      .query(`
        SELECT
          (SELECT COUNT(*) FROM dbo.Usuario         WHERE idColaborador = @id) AS Usuarios,
          (SELECT COUNT(*) FROM dbo.CuadrillaMiembro WHERE IDCol       = @id) AS Membresias,
          (SELECT COUNT(*) FROM dbo.Cuadrilla        WHERE IDEncargado  = @id) AS Encargaturas
      `);
    const d = dep.recordset[0] as { Usuarios: number; Membresias: number; Encargaturas: number };

    const bloqueos: string[] = [];
    if (d.Usuarios > 0) bloqueos.push('tiene un usuario/login con acceso a apps y roles');
    if (d.Membresias > 0) bloqueos.push(`pertenece a ${d.Membresias} cuadrilla(s)`);
    if (d.Encargaturas > 0) bloqueos.push(`es encargado de ${d.Encargaturas} cuadrilla(s)`);

    if (bloqueos.length > 0) {
      return NextResponse.json({
        error: 'No se puede eliminar porque ' + bloqueos.join(', ') + '. Desactívalo en su lugar para conservar el historial.',
        bloqueos,
        puedeDesactivar: true,
      }, { status: 409 });
    }

    const nombre = info.recordset[0].calcNombreCompleto;
    await db.request().input('id', sql.Int, idNum).query('DELETE FROM dbo.Colaborador WHERE idColaborador = @id');

    await logAudit({
      idColAccion: session.idCol,
      accion: 'ELIMINAR_USUARIO',
      entidad: 'Colaborador',
      idEntidad: idNum,
      detallePrevio: { nombre },
      detalleNuevo: null,
      ip,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/usuarios/[id] DELETE error:', err);
    // Si una FK que no contemplamos bloquea el borrado, SQL lanza error 547.
    if (/REFERENCE|FOREIGN KEY|547/i.test(msg)) {
      return NextResponse.json({
        error: 'No se puede eliminar: el colaborador está referenciado en otros registros. Desactívalo en su lugar.',
        puedeDesactivar: true,
      }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
