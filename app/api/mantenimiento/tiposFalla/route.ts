// Tipos de falla (Motor, Sistema hidráulico, ...) para clasificar las OTs en
// el historial de fallas. GET: cualquier usuario autenticado (incluye los
// desactivados, para poder mostrar el nombre en OTs viejas). POST: admin y
// técnico, mismo permiso que editar equipos. No hay DELETE a propósito: un
// tipo se desactiva (PATCH activo=false) para no dejar OTs sin nombre.

import { NextResponse } from "next/server";
import { ejecutar, type ErrorSql } from "@/lib/mantenimiento/db";
import { requerirUsuario, requerirRol } from "@/lib/mantenimiento/auth";

function mapearFila(fila: Record<string, unknown>) {
  return {
    nombre: String(fila.nombre ?? ""),
    orden: Number(fila.orden ?? 0),
    activo: !!fila.activo
  };
}

export async function GET() {
  const auth = await requerirUsuario();
  if (auth.error) return auth.error;

  try {
    const resultado = await ejecutar((request) => request.query("SELECT id, nombre, orden, activo FROM mant.TiposFalla ORDER BY orden, nombre"));
    const docs = resultado.recordset.map((fila: Record<string, unknown>) => ({ id: fila.id, data: mapearFila(fila) }));
    return NextResponse.json({ docs });
  } catch (err) {
    return NextResponse.json({ error: "No se pudieron cargar los tipos de falla: " + (err as Error).message }, { status: 500 });
  }
}

export async function POST(peticion: Request) {
  const auth = await requerirRol(["admin", "tecnico"]);
  if (auth.error) return auth.error;

  const body = await peticion.json();
  const nombre = String(body.nombre || "").trim();
  if (!nombre) return NextResponse.json({ error: "El tipo de falla necesita un nombre." }, { status: 400 });
  if (nombre.length > 60) return NextResponse.json({ error: "El nombre puede tener hasta 60 caracteres." }, { status: 400 });

  try {
    const resultado = await ejecutar((request) =>
      request
        .input("nombre", nombre)
        .query(
          "INSERT INTO mant.TiposFalla (nombre, orden) OUTPUT INSERTED.id " +
            "VALUES (@nombre, (SELECT ISNULL(MAX(orden), -1) + 1 FROM mant.TiposFalla))"
        )
    );
    return NextResponse.json({ id: resultado.recordset[0].id });
  } catch (err) {
    const error = err as ErrorSql;
    if (error.number === 2627 || error.number === 2601) {
      return NextResponse.json({ error: `Ya existe un tipo de falla llamado "${nombre}".` }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo crear el tipo de falla: " + error.message }, { status: 500 });
  }
}
