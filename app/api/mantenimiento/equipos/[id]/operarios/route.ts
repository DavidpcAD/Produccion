// Operarios de un equipo: quién lo ve en la app móvil de maquinaria
// (mant.AsignacionesEquipo, usuario de mant.Usuarios ↔ equipo).
//
//   GET    → los asignados y los que se pueden asignar (usuarios de Producción
//            con el rol "Operario Maquinaria").
//   POST   { idUsuario }  → lo asigna. Si el operario nunca entró a la app, se
//            le crea su fila en mant.Usuarios con el mismo username que usa el
//            login de la app (lib/movil/maquinaria.ts → operadorMant), así el
//            equipo ya le aparece en su primer login.
//   DELETE ?usuarioId=…  → lo quita (usuarioId de mant.Usuarios).
import { NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { requerirUsuario } from "@/lib/mantenimiento/auth";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Usuarios de Producción con el rol de la app (por NOMBRE, como lib/permissions.ts:
// el idRol cambia entre SBX y PRO). `clave` es lo mismo que guarda mant.Usuarios.usuario.
const SQL_OPERARIOS = `
  SELECT DISTINCT u.idUsuario, LTRIM(RTRIM(COALESCE(NULLIF(u.username, ''), c.cedula))) AS clave,
         LTRIM(RTRIM(c.calcNombreCompleto)) AS nombre, c.cedula
  FROM dbo.Usuario u
  JOIN dbo.Colaborador c ON c.idColaborador = u.idColaborador
  JOIN dbo.UsuarioRol ur ON ur.idUsuario = u.idUsuario
  JOIN dbo.Rol r ON r.idRol = ur.idRol
  WHERE r.idApp = 10 AND r.nombre = 'Operario Maquinaria' AND c.esActivo = 1`;

function noValido(mensaje: string) {
  return NextResponse.json({ error: mensaje }, { status: 400 });
}

async function equipoExiste(id: string): Promise<boolean> {
  const db = await getDb();
  const r = await db.request().input("id", sql.UniqueIdentifier, id).query("SELECT 1 AS ok FROM mant.Equipos WHERE id = @id");
  return r.recordset.length > 0;
}

export async function GET(_peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requerirUsuario();
  if (auth.error) return auth.error;
  const { id } = await params;
  if (!GUID.test(id)) return noValido("Equipo inválido.");

  try {
    const db = await getDb();
    const r = await db.request().input("equipoId", sql.UniqueIdentifier, id).query(`
      WITH ops AS (${SQL_OPERARIOS})
      SELECT u.id AS usuarioId, u.nombre, u.usuario, a.creadoEn,
             CASE WHEN EXISTS (SELECT 1 FROM ops WHERE ops.clave = u.usuario) THEN 1 ELSE 0 END AS tieneRol
      FROM mant.AsignacionesEquipo a
      JOIN mant.Usuarios u ON u.id = a.usuarioId
      WHERE a.equipoId = @equipoId
      ORDER BY u.nombre;

      ${SQL_OPERARIOS}
      ORDER BY nombre;`);
    const [asignados, operarios] = r.recordsets as unknown as [
      Array<{ usuarioId: string; nombre: string; usuario: string; creadoEn: Date; tieneRol: number }>,
      Array<{ idUsuario: number; clave: string; nombre: string; cedula: string | null }>,
    ];
    const yaEstan = new Set(asignados.map((a) => a.usuario));
    return NextResponse.json({
      asignados: asignados.map((a) => ({
        usuarioId: String(a.usuarioId).toUpperCase(),
        nombre: a.nombre,
        usuario: a.usuario,
        desde: a.creadoEn,
        tieneRol: !!a.tieneRol,
      })),
      disponibles: operarios
        .filter((o) => o.clave && !yaEstan.has(o.clave))
        .map((o) => ({ idUsuario: o.idUsuario, nombre: o.nombre || o.clave, usuario: o.clave, cedula: o.cedula })),
    });
  } catch (err) {
    console.error("GET operarios del equipo:", err);
    return NextResponse.json({ error: "No se pudieron leer los operarios del equipo." }, { status: 500 });
  }
}

export async function POST(peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requerirUsuario();
  if (auth.error) return auth.error;
  const { id } = await params;
  if (!GUID.test(id)) return noValido("Equipo inválido.");
  const body = await peticion.json().catch(() => null);
  const idUsuario = Number(body?.idUsuario);
  if (!Number.isInteger(idUsuario) || idUsuario <= 0) return noValido("Elegí un operario.");

  try {
    if (!(await equipoExiste(id))) return NextResponse.json({ error: "Ese equipo ya no existe." }, { status: 404 });
    const db = await getDb();
    const op = await db.request().input("idUsuario", sql.Int, idUsuario)
      .query<{ clave: string; nombre: string }>(`SELECT clave, nombre FROM (${SQL_OPERARIOS}) o WHERE o.idUsuario = @idUsuario`);
    const fila = op.recordset[0];
    if (!fila?.clave) {
      return NextResponse.json({ error: "Esa persona no tiene el rol Operario Maquinaria." }, { status: 409 });
    }
    // Mismo MERGE que operadorMant: si la fila ya existe (Steven, un técnico) no se le toca el rol.
    await db.request()
      .input("usuario", sql.NVarChar(100), fila.clave)
      .input("nombre", sql.NVarChar(300), fila.nombre || fila.clave)
      .input("equipoId", sql.UniqueIdentifier, id)
      .query(`
        DECLARE @u TABLE (id uniqueidentifier);
        MERGE mant.Usuarios AS d USING (SELECT @usuario AS usuario) AS o ON d.usuario = o.usuario
        WHEN MATCHED THEN UPDATE SET nombre = @nombre
        WHEN NOT MATCHED THEN INSERT (nombre, usuario, rol, activo) VALUES (@nombre, @usuario, 'operador', 1)
        OUTPUT INSERTED.id INTO @u;
        INSERT INTO mant.AsignacionesEquipo (usuarioId, equipoId)
        SELECT u.id, @equipoId FROM @u u
        WHERE NOT EXISTS (SELECT 1 FROM mant.AsignacionesEquipo a WHERE a.usuarioId = u.id AND a.equipoId = @equipoId);`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST operario del equipo:", err);
    return NextResponse.json({ error: "No se pudo asignar el operario." }, { status: 500 });
  }
}

export async function DELETE(peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requerirUsuario();
  if (auth.error) return auth.error;
  const { id } = await params;
  if (!GUID.test(id)) return noValido("Equipo inválido.");
  const usuarioId = new URL(peticion.url).searchParams.get("usuarioId") ?? "";
  if (!GUID.test(usuarioId)) return noValido("Operario inválido.");

  try {
    const db = await getDb();
    await db.request()
      .input("equipoId", sql.UniqueIdentifier, id)
      .input("usuarioId", sql.UniqueIdentifier, usuarioId)
      .query("DELETE FROM mant.AsignacionesEquipo WHERE equipoId = @equipoId AND usuarioId = @usuarioId");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE operario del equipo:", err);
    return NextResponse.json({ error: "No se pudo quitar el operario." }, { status: 500 });
  }
}
