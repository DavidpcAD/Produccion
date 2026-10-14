import { NextResponse } from "next/server";
import { ejecutar, type ErrorSql } from "@/lib/mantenimiento/db";
import { aJsonONull } from "@/lib/mantenimiento/json";
import { requerirRol } from "@/lib/mantenimiento/auth";

const COLUMNAS_EDITABLES = [
  "equipoId", "nombre", "tipoIntervalo", "intervaloHoras", "intervaloDias", "umbralAvisoHoras",
  "umbralAvisoDias", "ultimaEjecucionHorometro", "ultimaEjecucionFecha", "tareas", "activo"
];
const COLUMNAS_NUMERICAS = ["intervaloHoras", "intervaloDias", "umbralAvisoHoras", "umbralAvisoDias", "ultimaEjecucionHorometro"];

function valorParaColumna(nombre: string, valor: any): any {
  if (COLUMNAS_NUMERICAS.indexOf(nombre) !== -1) return Number(valor) || 0;
  if (nombre === "ultimaEjecucionFecha") return valor ? new Date(valor) : null;
  if (nombre === "tareas") return aJsonONull(valor || []);
  if (nombre === "activo") return !!valor;
  if (nombre === "nombre") return String(valor ?? "").trim();
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
      return request.query("UPDATE mant.PlanesMantenimiento SET " + asignaciones.join(", ") + " WHERE id = @id");
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "No se pudo guardar el plan: " + (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requerirRol(["admin"]);
  if (auth.error) return auth.error;

  const { id } = await params;
  try {
    await ejecutar((request) => {
      request.input("id", id);
      return request.query("DELETE FROM mant.PlanesMantenimiento WHERE id = @id");
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const error = err as ErrorSql;
    if (error.number === 547) {
      return NextResponse.json({ error: "No se puede eliminar: hay OTs generadas desde este plan." }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo eliminar: " + error.message }, { status: 500 });
  }
}
