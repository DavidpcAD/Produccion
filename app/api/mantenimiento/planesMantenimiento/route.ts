import { NextResponse } from "next/server";
import { ejecutar, type ErrorSql } from "@/lib/mantenimiento/db";
import { parsearJson, aJsonONull } from "@/lib/mantenimiento/json";
import { requerirUsuario, requerirRol } from "@/lib/mantenimiento/auth";
import { equiposAutorizadosDe } from "@/lib/mantenimiento/autorizacionEquipos";

function mapearFila(fila: Record<string, any>) {
  return {
    equipoId: fila.equipoId,
    nombre: String(fila.nombre ?? ""),
    tipoIntervalo: fila.tipoIntervalo || "horas",
    intervaloHoras: Number(fila.intervaloHoras ?? 0),
    intervaloDias: Number(fila.intervaloDias ?? 0),
    umbralAvisoHoras: Number(fila.umbralAvisoHoras ?? 0),
    umbralAvisoDias: Number(fila.umbralAvisoDias ?? 0),
    ultimaEjecucionHorometro: Number(fila.ultimaEjecucionHorometro ?? 0),
    ultimaEjecucionFecha: fila.ultimaEjecucionFecha ? new Date(fila.ultimaEjecucionFecha).toISOString() : null,
    tareas: parsearJson(fila.tareas, []),
    activo: !!fila.activo
  };
}

export async function GET() {
  const auth = await requerirUsuario();
  if (auth.error) return auth.error;

  try {
    const resultado = await ejecutar((request) =>
      request.query(
        "SELECT id, equipoId, nombre, tipoIntervalo, intervaloHoras, intervaloDias, umbralAvisoHoras, " +
          "umbralAvisoDias, ultimaEjecucionHorometro, ultimaEjecucionFecha, tareas, activo FROM mant.PlanesMantenimiento"
      )
    );
    let filas: Record<string, any>[] = resultado.recordset;
    if (auth.usuario.rol === "operador") {
      const permitidos = await equiposAutorizadosDe(auth.usuario.id);
      filas = filas.filter((fila: Record<string, any>) => permitidos.has(String(fila.equipoId).toUpperCase()));
    }
    const docs = filas.map((fila: Record<string, any>) => ({ id: fila.id, data: mapearFila(fila) }));
    return NextResponse.json({ docs });
  } catch (err) {
    return NextResponse.json({ error: "No se pudieron cargar los planes: " + (err as Error).message }, { status: 500 });
  }
}

export async function POST(peticion: Request) {
  const auth = await requerirRol(["admin", "tecnico"]);
  if (auth.error) return auth.error;

  const body = await peticion.json();
  const equipoId = body.equipoId;
  const nombre = String(body.nombre || "").trim();
  if (!equipoId) return NextResponse.json({ error: "Elegí a qué equipo aplica el plan." }, { status: 400 });
  if (!nombre) return NextResponse.json({ error: "El plan necesita un nombre." }, { status: 400 });

  try {
    const resultado = await ejecutar((request) => {
      request.input("equipoId", equipoId);
      request.input("nombre", nombre);
      request.input("tipoIntervalo", body.tipoIntervalo || "horas");
      request.input("intervaloHoras", Number(body.intervaloHoras) || 0);
      request.input("intervaloDias", Number(body.intervaloDias) || 0);
      request.input("umbralAvisoHoras", Number(body.umbralAvisoHoras) || 0);
      request.input("umbralAvisoDias", Number(body.umbralAvisoDias) || 0);
      request.input("ultimaEjecucionHorometro", Number(body.ultimaEjecucionHorometro) || 0);
      request.input("ultimaEjecucionFecha", body.ultimaEjecucionFecha ? new Date(body.ultimaEjecucionFecha) : new Date());
      request.input("tareas", aJsonONull(body.tareas || []));
      request.input("activo", body.activo !== false);
      return request.query(
        "INSERT INTO mant.PlanesMantenimiento (equipoId, nombre, tipoIntervalo, intervaloHoras, intervaloDias, " +
          "umbralAvisoHoras, umbralAvisoDias, ultimaEjecucionHorometro, ultimaEjecucionFecha, tareas, activo) " +
          "OUTPUT INSERTED.id " +
          "VALUES (@equipoId, @nombre, @tipoIntervalo, @intervaloHoras, @intervaloDias, @umbralAvisoHoras, " +
          "@umbralAvisoDias, @ultimaEjecucionHorometro, @ultimaEjecucionFecha, @tareas, @activo)"
      );
    });
    return NextResponse.json({ id: resultado.recordset[0].id });
  } catch (err) {
    const error = err as ErrorSql;
    if (error.number === 547) {
      return NextResponse.json({ error: "Ese equipo no existe. Recargá la página e intentá de nuevo." }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo guardar el plan: " + error.message }, { status: 500 });
  }
}
