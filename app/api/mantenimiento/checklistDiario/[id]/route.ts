import { NextResponse } from "next/server";
import { ejecutar } from "@/lib/mantenimiento/db";
import { requerirRol } from "@/lib/mantenimiento/auth";

const COLUMNAS_EDITABLES = ["titulo", "detalle", "orden"];

function valorParaColumna(nombre: string, valor: any): any {
  if (nombre === "orden") return Number(valor) || 0;
  if (nombre === "titulo") return String(valor ?? "").trim();
  if (nombre === "detalle") return String(valor ?? "").trim() || null;
  return valor;
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
      return request.query("UPDATE mant.ChecklistDiarioItems SET " + asignaciones.join(", ") + " WHERE id = @id");
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "No se pudo guardar la actividad: " + (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requerirRol(["admin", "tecnico"]);
  if (auth.error) return auth.error;

  const { id } = await params;
  try {
    await ejecutar((request) => request.input("id", id).query("DELETE FROM mant.ChecklistDiarioItems WHERE id = @id"));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "No se pudo eliminar: " + (err as Error).message }, { status: 500 });
  }
}
