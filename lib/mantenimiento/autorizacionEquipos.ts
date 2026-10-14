// Qué equipos puede operar un operador puntual -- admin/técnico nunca pasan
// por acá (ver cada app/api/**/route.ts: solo se llama cuando
// auth.usuario.rol === "operador"). Un operador sin ninguna fila en
// AsignacionesEquipo no ve ningún equipo todavía: hay que asignarle al
// menos uno desde la matriz en /usuarios.

import { ejecutar } from "./db";

export async function equiposAutorizadosDe(usuarioId: string): Promise<Set<string>> {
  const resultado = await ejecutar((request) =>
    request.input("usuarioId", usuarioId).query("SELECT equipoId FROM AsignacionesEquipo WHERE usuarioId = @usuarioId")
  );
  return new Set(resultado.recordset.map((f: Record<string, any>) => String(f.equipoId).toUpperCase()));
}

// Repuestos pertenecen a un equipo (Repuestos.equipoId), pero
// MovimientosRepuestos solo guarda repuestoId -- para filtrar movimientos
// por equipo autorizado hay que pasar primero por esta tabla.
export async function repuestosDeEquipos(equipoIds: Set<string>): Promise<Set<string>> {
  if (!equipoIds.size) return new Set();
  const resultado = await ejecutar((request) => {
    const ids = [...equipoIds];
    ids.forEach((id, i) => request.input("e" + i, id));
    const placeholders = ids.map((_, i) => "@e" + i).join(",");
    return request.query("SELECT id FROM Repuestos WHERE equipoId IN (" + placeholders + ")");
  });
  return new Set(resultado.recordset.map((f: Record<string, any>) => String(f.id).toUpperCase()));
}
