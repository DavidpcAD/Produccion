// Puente de autenticación: el repo de Steven traía su propio login (tablas
// mant.Usuarios/mant.Sesiones, cookie sesion_id). Dentro de Produccion ESO NO se
// usa — la sesión la maneja Produccion (JWT) y el acceso al módulo lo gatea el
// rol "Mantenimiento" en proxy.ts. Acá se reimplementan `requerirUsuario` /
// `requerirRol` / `obtenerUsuarioActual` con la MISMA firma que esperaban las
// rutas, pero resolviendo el usuario desde la sesión de Produccion.
//
// Además se ASEGURA una fila en mant.Usuarios para ese usuario (puente), porque
// algunas tablas apuntan ahí por FK (ej. InspeccionesDiarias.usuarioId). Así el
// usuario de Produccion "existe" dentro del dominio de Mantenimiento sin que
// nadie tenga que crearlo a mano.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ejecutar } from "./db";
import type { Rol, Usuario } from "./types";

type FilaUsuario = { id: string; nombre: string; usuario: string; rol: string };

async function usuarioDesdeProduccion(): Promise<Usuario | null> {
  const s = await getSession();
  if (!s) return null;
  // El módulo lo abre el rol de Producción "Mantenimiento" (o Super Admin).
  const habilitado = s.nivelAdmin >= 4 || !!s.modules?.includes("mantenimiento");
  if (!habilitado) return null;

  const usuario = (s.username || s.cedula || String(s.idUsuario || "")).trim() || "desconocido";
  const nombre = (s.nombre || usuario).trim();

  // Upsert idempotente por `usuario`. Devuelve el id real de mant.Usuarios para
  // que las FKs del módulo tengan a quién apuntar. rol 'admin': dentro del módulo
  // el usuario de Mantenimiento tiene acceso pleno (el gateo real ya pasó afuera).
  const res = await ejecutar((r) =>
    r
      .input("usuario", usuario)
      .input("nombre", nombre)
      .query<FilaUsuario>(
        "MERGE mant.Usuarios AS d USING (SELECT @usuario AS usuario) AS o ON d.usuario = o.usuario " +
          "WHEN MATCHED THEN UPDATE SET nombre = @nombre " +
          "WHEN NOT MATCHED THEN INSERT (nombre, usuario, rol, activo) VALUES (@nombre, @usuario, 'admin', 1) " +
          "OUTPUT INSERTED.id, INSERTED.nombre, INSERTED.usuario, INSERTED.rol;",
      ),
  );
  const fila = res.recordset[0];
  if (!fila) return null;
  return { id: fila.id, nombre: fila.nombre, usuario: fila.usuario, rol: fila.rol as Rol };
}

export async function obtenerUsuarioActual(): Promise<Usuario | null> {
  return usuarioDesdeProduccion();
}

type ResultadoAuth = { usuario: Usuario; error?: undefined } | { usuario?: undefined; error: NextResponse };

export async function requerirUsuario(): Promise<ResultadoAuth> {
  const usuario = await usuarioDesdeProduccion();
  if (!usuario) {
    return { error: NextResponse.json({ error: "No hay sesión activa. Entrá de nuevo." }, { status: 401 }) };
  }
  return { usuario };
}

// Dentro del módulo no se restringe por sub-rol (admin/tecnico/operador): el
// gateo por rol de Producción ya ocurrió en el proxy, y el usuario de
// Mantenimiento tiene acceso pleno. Se mantiene la firma por compatibilidad.
export async function requerirRol(_roles: Rol[]): Promise<ResultadoAuth> {
  return requerirUsuario();
}
