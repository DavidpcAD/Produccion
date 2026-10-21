// Renombrar, reordenar o activar/desactivar un tipo de falla. Sin DELETE: ver
// el comentario de ../route.ts.

import { NextResponse } from "next/server";
import { ejecutar, type ErrorSql } from "@/lib/mantenimiento/db";
import { requerirRol } from "@/lib/mantenimiento/auth";

export async function PATCH(peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requerirRol(["admin", "tecnico"]);
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await peticion.json();
  const cambios: { columna: string; valor: string | number | boolean }[] = [];
  if (body.nombre !== undefined) {
    const nombre = String(body.nombre || "").trim();
    if (!nombre) return NextResponse.json({ error: "El tipo de falla necesita un nombre." }, { status: 400 });
    if (nombre.length > 60) return NextResponse.json({ error: "El nombre puede tener hasta 60 caracteres." }, { status: 400 });
    cambios.push({ columna: "nombre", valor: nombre });
  }
  if (body.activo !== undefined) cambios.push({ columna: "activo", valor: !!body.activo });
  if (body.orden !== undefined) cambios.push({ columna: "orden", valor: Number(body.orden) || 0 });
  if (!cambios.length) return NextResponse.json({ ok: true });

  try {
    await ejecutar((request) => {
      request.input("id", id);
      cambios.forEach((c, i) => request.input("v" + i, c.valor));
      return request.query("UPDATE mant.TiposFalla SET " + cambios.map((c, i) => `${c.columna} = @v${i}`).join(", ") + " WHERE id = @id");
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const error = err as ErrorSql;
    if (error.number === 2627 || error.number === 2601) {
      return NextResponse.json({ error: "Ya existe otro tipo de falla con ese nombre." }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo guardar el tipo de falla: " + error.message }, { status: 500 });
  }
}
