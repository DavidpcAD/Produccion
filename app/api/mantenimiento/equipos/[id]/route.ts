// Editar y borrar un equipo puntual. PATCH solo toca los campos que vienen
// en el body (así es como la app arma sus updates), nunca pisa el resto con
// NULL.

import { NextResponse } from "next/server";
import { ejecutar, type ErrorSql } from "@/lib/mantenimiento/db";
import { aJsonONull } from "@/lib/mantenimiento/json";
import { requerirUsuario, requerirRol } from "@/lib/mantenimiento/auth";
import { equiposAutorizadosDe } from "@/lib/mantenimiento/autorizacionEquipos";
import { CAMPOS_EQUIPO_SOLO_ADMIN } from "@/lib/mantenimiento/permisos";

const COLUMNAS_EDITABLES = [
  "codigo", "nombre", "tipo", "marca", "modelo", "anio", "numeroSerie",
  "horometroActual", "estado", "ubicacion", "intervaloHorasPreventivo", "intervaloKilometrajePreventivo", "notas", "fotoId",
  "placa", "revisionTecnica", "fechaIngreso", "kilometraje", "combustible", "manuales",
  "filtroAceite", "filtroDiesel", "filtroAireAcondicionado", "llantasDelanteras", "llantasTraseras", "cilindraje",
  "ultimaFechaMantenimiento", "proximaFechaMantenimiento"
];

function valorParaColumna(nombre: string, valor: any): any {
  if (["anio", "horometroActual", "intervaloHorasPreventivo"].indexOf(nombre) !== -1) {
    return valor == null ? null : Number(valor) || 0;
  }
  if (nombre === "kilometraje" || nombre === "intervaloKilometrajePreventivo") {
    return valor == null || valor === "" ? null : Number(valor) || 0;
  }
  if (nombre === "manuales") {
    return aJsonONull(valor || []);
  }
  if (["codigo", "nombre", "marca", "modelo", "numeroSerie", "ubicacion", "notas", "placa", "revisionTecnica", "fechaIngreso", "filtroAceite", "filtroDiesel", "filtroAireAcondicionado", "llantasDelanteras", "llantasTraseras", "cilindraje", "ultimaFechaMantenimiento", "proximaFechaMantenimiento"].indexOf(nombre) !== -1) {
    return String(valor ?? "").trim();
  }
  return valor == null ? null : valor;
}

export async function PATCH(peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requerirUsuario();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await peticion.json();
  let campos = Object.keys(body).filter((k) => COLUMNAS_EDITABLES.indexOf(k) !== -1);
  if (auth.usuario.rol === "operador") {
    // Un operador no tiene equipos.editar (ver lib/permisos.ts) -- la única
    // excepción es "Registrar lectura de horómetro", que pasa por acá mismo
    // (ver registrarLectura en lib/store.tsx). Cualquier otro campo que
    // venga en el body se ignora en silencio, igual que si no hubiera venido.
    campos = campos.filter((k) => k === "horometroActual");
    const permitidos = await equiposAutorizadosDe(auth.usuario.id);
    if (!permitidos.has(id.toUpperCase())) {
      return NextResponse.json({ error: "No tenés autorización para ese equipo." }, { status: 403 });
    }
  } else if (auth.usuario.rol !== "admin") {
    // Placa / revisión técnica / N° de serie son dato "legal" del equipo —
    // solo admin los puede corregir, aunque un técnico pueda editar el resto.
    campos = campos.filter((k) => !(CAMPOS_EQUIPO_SOLO_ADMIN as readonly string[]).includes(k));
  }
  if (!campos.length) return NextResponse.json({ ok: true }); // nada que actualizar, no es un error

  try {
    await ejecutar((request) => {
      request.input("id", id);
      const asignaciones = campos.map((campo, i) => {
        const parametro = "v" + i;
        request.input(parametro, valorParaColumna(campo, body[campo]));
        return campo + " = @" + parametro;
      });
      return request.query("UPDATE mant.Equipos SET " + asignaciones.join(", ") + " WHERE id = @id");
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const error = err as ErrorSql;
    if (error.number === 2627 || error.number === 2601) {
      return NextResponse.json({ error: "Ya existe otro equipo con ese código." }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo guardar el equipo: " + error.message }, { status: 500 });
  }
}

export async function DELETE(peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requerirRol(["admin"]);
  if (auth.error) return auth.error;

  const { id } = await params;
  try {
    await ejecutar((request) => {
      request.input("id", id);
      return request.query("DELETE FROM mant.Equipos WHERE id = @id");
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const error = err as ErrorSql;
    // 547 = choque de llave foránea: el equipo tiene OTs, planes o lecturas que lo referencian.
    if (error.number === 547) {
      return NextResponse.json({ error: "No se puede eliminar: este equipo tiene OTs, planes, repuestos o lecturas de horómetro asociadas." }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo eliminar: " + error.message }, { status: 500 });
  }
}
