// Nota: stockActual se excluye a propósito de los campos editables acá. El
// formulario de "editar repuesto" de la app nunca lo manda (solo lo manda al
// crear uno nuevo, que pasa por POST /api/repuestos), y cualquier cambio de
// stock después de creado debe pasar por /api/movimientos/registrar o por el
// cierre de una OT, para que quede su bitácora en MovimientosRepuestos.

import { NextResponse } from "next/server";
import { ejecutar, type ErrorSql } from "@/lib/mantenimiento/db";
import { requerirRol } from "@/lib/mantenimiento/auth";

const COLUMNAS_EDITABLES = ["codigo", "nombre", "categoria", "unidad", "costoUnitario", "stockMinimo", "ubicacionBodega", "notas", "equipoId"];

function valorParaColumna(nombre: string, valor: any): any {
  if (nombre === "costoUnitario" || nombre === "stockMinimo") return Number(valor) || 0;
  if (["codigo", "nombre", "ubicacionBodega", "notas"].indexOf(nombre) !== -1) return String(valor ?? "").trim();
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
      return request.query("UPDATE mant.Repuestos SET " + asignaciones.join(", ") + " WHERE id = @id");
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const error = err as ErrorSql;
    if (error.number === 2627 || error.number === 2601) {
      return NextResponse.json({ error: "Ya existe otro repuesto con ese código." }, { status: 409 });
    }
    if (error.number === 547) {
      return NextResponse.json({ error: "Ese equipo no existe. Recargá la página e intentá de nuevo." }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo guardar el repuesto: " + error.message }, { status: 500 });
  }
}

export async function DELETE(peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requerirRol(["admin"]);
  if (auth.error) return auth.error;

  const { id } = await params;
  try {
    await ejecutar((request) => {
      request.input("id", id);
      return request.query("DELETE FROM mant.Repuestos WHERE id = @id");
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const error = err as ErrorSql;
    if (error.number === 547) {
      return NextResponse.json({ error: "No se puede eliminar: este repuesto tiene movimientos de bodega registrados." }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo eliminar: " + error.message }, { status: 500 });
  }
}
