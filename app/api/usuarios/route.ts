import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession, hashPassword } from '@/lib/auth';
import { enrolarEnZona, H4Error } from '@/lib/h4';

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

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await req.json();
  const str = (v: unknown) => (v != null && String(v).trim() !== '' ? String(v).trim() : null);

  // Colaborador = todos. Requeridos: cédula, nombre, primer apellido, teléfono, puesto.
  const cedula = str(body.cedula);
  const nombre = str(body.nombre);
  const primerApellido = str(body.primerApellido);
  const telefono = str(body.telefono);
  const idPuesto = body.idPuesto ? Number(body.idPuesto) : null;
  if (!cedula || !nombre || !primerApellido || !telefono || !idPuesto) {
    return NextResponse.json(
      { error: 'Cédula, nombre, primer apellido, teléfono y puesto son requeridos.' },
      { status: 400 },
    );
  }

  // Usuario (login) = solo si se le asignan roles. Ahí sí requiere username + contraseña.
  const roles: number[] = Array.isArray(body.roles) ? body.roles.map(Number).filter(Boolean) : [];
  const tiposMap: Record<string, string> = body.tipos && typeof body.tipos === 'object' ? body.tipos : {};
  const crearUsuario = roles.length > 0;
  const username = str(body.username);
  const password = typeof body.password === 'string' ? body.password : '';
  if (crearUsuario) {
    if (!username) return NextResponse.json({ error: 'El usuario (username) es requerido cuando se asignan roles.' }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 });
  }

  const db = await getDb();
  const tx = new sql.Transaction(db);
  try {
    await tx.begin();

    // 1) Colaborador (idPais = único país; calcNombreCompleto/iniciales son computados; fechaCreacion tiene default)
    const colRes = await new sql.Request(tx)
      .input('idPuesto', sql.Int, idPuesto)
      .input('cedula', sql.NVarChar, cedula)
      .input('nombre', sql.NVarChar, nombre)
      .input('primerApellido', sql.NVarChar, primerApellido)
      .input('segundoApellido', sql.NVarChar, str(body.segundoApellido))
      .input('correo', sql.NVarChar, str(body.correo))
      .input('telefono', sql.NVarChar, telefono)
      .input('genero', sql.NVarChar, str(body.sexo))
      .input('fechaIngreso', sql.Date, body.fechaIngreso ? new Date(body.fechaIngreso) : null)
      .input('direccion', sql.NVarChar, str(body.direccion))
      .input('codigoDistrito', sql.Char, str(body.codigoDistrito))
      .input('salarioMensual', sql.Decimal(18, 2), body.salarioMensual != null && String(body.salarioMensual).trim() !== '' ? Number(body.salarioMensual) : null)
      .input('horaEntrada', sql.NVarChar, str(body.horaEntrada))
      .input('horaSalida', sql.NVarChar, str(body.horaSalida))
      .input('creadoPor', sql.NVarChar, session.cedula ?? 'control-usuarios')
      .query(`
        INSERT INTO dbo.Colaborador
          (idPais, idPuesto, cedula, nombre, primerApellido, segundoApellido, correo,
           telefono, genero, fechaIngreso, direccion, codigoDistrito,
           salarioMensual, horaEntrada, horaSalida, esActivo, creadoPor)
        OUTPUT INSERTED.idColaborador
        VALUES
          ((SELECT MIN(idPais) FROM dbo.Pais), @idPuesto, @cedula, @nombre, @primerApellido,
           @segundoApellido, @correo, @telefono, @genero, @fechaIngreso, @direccion,
           @codigoDistrito, @salarioMensual, @horaEntrada, @horaSalida, 1, @creadoPor)
      `);
    const idColaborador = Number(colRes.recordset[0].idColaborador);

    // 2) Usuario + roles (solo si tiene acceso a apps)
    if (crearUsuario) {
      const passwordHash = await hashPassword(password);
      const uRes = await new sql.Request(tx)
        .input('idCol', sql.Int, idColaborador)
        .input('username', sql.NVarChar, username)
        .input('hash', sql.NVarChar, passwordHash)
        .input('telefono', sql.NVarChar, telefono)
        .input('creadoPor', sql.NVarChar, session.cedula ?? 'control-usuarios')
        .query(`
          INSERT INTO dbo.Usuario
            (idColaborador, username, passwordHash, fechaUltimoCambioContrasena, fechaCreacion, creadoPor, telefono)
          OUTPUT INSERTED.idUsuario
          VALUES (@idCol, @username, @hash, SYSUTCDATETIME(), SYSUTCDATETIME(), @creadoPor, @telefono)
        `);
      const idUsuario = Number(uRes.recordset[0].idUsuario);
      for (const idRol of roles) {
        const esTipo = (tiposMap[String(idRol)] || '').trim() || 'Indefinido';
        await new sql.Request(tx)
          .input('u', sql.Int, idUsuario)
          .input('r', sql.Int, idRol)
          .input('esTipo', sql.NVarChar, esTipo)
          .input('creadoPor', sql.NVarChar, session.cedula ?? 'control-usuarios')
          .query(`INSERT INTO dbo.UsuarioRol (idUsuario, idRol, esTipo, creadoPor)
                  VALUES (@u, @r, @esTipo, @creadoPor)`);
      }
    }

    await tx.commit();

    // Enrolamiento en zona de marca (H4) — DESPUÉS de crear el colaborador, porque
    // la API de H4 lo busca por idColaborador. Se hace fuera de la transacción: si
    // falla, el colaborador ya quedó creado y se puede reintentar el enrolamiento.
    const idZonaMarcaje = body.idZonaMarcaje != null && String(body.idZonaMarcaje).trim() !== ''
      ? Number(body.idZonaMarcaje) : null;
    let enrolamiento: { pin: string; equipos: number; conFoto: boolean } | null = null;
    let enrolamientoError: string | null = null;
    if (idZonaMarcaje) {
      try {
        enrolamiento = await enrolarEnZona(idZonaMarcaje, idColaborador, session.cedula ?? null);
      } catch (e) {
        enrolamientoError = e instanceof H4Error ? e.message : (e instanceof Error ? e.message : String(e));
        console.error('/api/usuarios enrolamiento H4 error:', e);
      }
    }

    return NextResponse.json(
      { idCol: idColaborador, usuarioCreado: crearUsuario, enrolamiento, enrolamientoError },
      { status: 201 },
    );
  } catch (err: unknown) {
    try { await tx.rollback(); } catch { /* ignorar */ }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/usuarios POST error:', err);
    if (/duplicate|UNIQUE|PRIMARY KEY/i.test(msg)) {
      if (/username/i.test(msg)) return NextResponse.json({ error: 'Ya existe un usuario con ese username.' }, { status: 409 });
      return NextResponse.json({ error: 'Ya existe un colaborador con esa cédula.' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
