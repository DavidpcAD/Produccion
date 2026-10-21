// PATCH acá es solo para las ediciones "simples" de una OT ya abierta:
// título, descripción, prioridad, fecha programada, responsable, guardar
// el checklist mientras se lo va tildando, y clasificar la falla
// (tipoFallaId, también en OTs ya finalizadas). A propósito NO se puede cambiar
// el estado, los repuestos usados, las fotos ni la firma por acá — esos
// cambios de estado tienen cada uno su propio endpoint transaccional
// (iniciar / cancelar / finalizar), porque tocan más de una tabla a la vez.

import { NextResponse } from "next/server";
import { ejecutar, type ErrorSql } from "@/lib/mantenimiento/db";
import { aJsonONull } from "@/lib/mantenimiento/json";
import { requerirRol } from "@/lib/mantenimiento/auth";

const COLUMNAS_EDITABLES = ["prioridad", "titulo", "descripcion", "fechaProgramada", "responsable", "checklist", "tipoFallaId"];

function valorParaColumna(nombre: string, valor: any): any {
  if (nombre === "fechaProgramada") return valor ? new Date(valor) : null;
  if (nombre === "tipoFallaId") return valor ? String(valor) : null; // "" o null = sin clasificar
  if (nombre === "checklist") return aJsonONull(valor || []);
  if (nombre === "titulo" || nombre === "descripcion" || nombre === "responsable") return String(valor ?? "").trim();
  return valor == null ? null : valor;
}

export async function PATCH(peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requerirRol(["admin", "tecnico"]);
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await peticion.json();
  const campos = Object.keys(body).filter((k) => COLUMNAS_EDITABLES.indexOf(k) !== -1);
  if (!campos.length) return NextResponse.json({ ok: true });

  try {
    await ejecutar((request) => {
      request.input("id", id);
      const asignaciones = campos.map((campo, i) => {
        const parametro = "v" + i;
        request.input(parametro, valorParaColumna(campo, body[campo]));
        return campo + " = @" + parametro;
      });
      return request.query("UPDATE mant.OrdenesTrabajo SET " + asignaciones.join(", ") + " WHERE id = @id");
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // 547 = violación de FK: el único campo editable con FK es tipoFallaId.
    if ((err as ErrorSql).number === 547) {
      return NextResponse.json({ error: "Ese tipo de falla no existe. Recargá la página e intentá de nuevo." }, { status: 400 });
    }
    return NextResponse.json({ error: "No se pudo guardar: " + (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requerirRol(["admin"]);
  if (auth.error) return auth.error;

  const { id } = await params;
  try {
    await ejecutar((request) => {
      request.input("id", id);
      return request.query("DELETE FROM mant.OrdenesTrabajo WHERE id = @id");
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const error = err as ErrorSql;
    if (error.number === 547) {
      return NextResponse.json({ error: "No se puede eliminar: esta OT tiene movimientos de repuestos asociados." }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo eliminar: " + error.message }, { status: 500 });
  }
}
