// Actividades del checklist diario "antes de usar el equipo" -- una fila
// por actividad por equipo (no una plantilla compartida, ver sql/014).
// GET es de lectura libre para cualquier usuario autenticado: no es dato
// sensible, y el front solo pide equipos que ya le son visibles a su rol.
// POST (crear una actividad) es admin/técnico, mismo permiso que gobierna
// el resto del formulario de Equipo (equipos.editar en lib/permisos.ts).

import { NextResponse } from "next/server";
import { ejecutar } from "@/lib/mantenimiento/db";
import { requerirUsuario, requerirRol } from "@/lib/mantenimiento/auth";

function mapearFila(fila: Record<string, any>) {
  return {
    equipoId: fila.equipoId,
    orden: Number(fila.orden ?? 0),
    titulo: String(fila.titulo ?? ""),
    detalle: fila.detalle || undefined
  };
}

export async function GET(peticion: Request) {
  const auth = await requerirUsuario();
  if (auth.error) return auth.error;

  const equipoId = new URL(peticion.url).searchParams.get("equipoId");
  if (!equipoId) return NextResponse.json({ error: "Falta equipoId." }, { status: 400 });

  try {
    const resultado = await ejecutar((request) =>
      request
        .input("equipoId", equipoId)
        .query("SELECT id, equipoId, orden, titulo, detalle FROM mant.ChecklistDiarioItems WHERE equipoId = @equipoId ORDER BY orden, titulo")
    );
    const docs = resultado.recordset.map((fila: Record<string, any>) => ({ id: fila.id, data: mapearFila(fila) }));
    return NextResponse.json({ docs });
  } catch (err) {
    return NextResponse.json({ error: "No se pudo cargar el checklist: " + (err as Error).message }, { status: 500 });
  }
}

export async function POST(peticion: Request) {
  const auth = await requerirRol(["admin", "tecnico"]);
  if (auth.error) return auth.error;

  const body = await peticion.json();
  const equipoId = body.equipoId;
  const titulo = String(body.titulo || "").trim();
  if (!equipoId) return NextResponse.json({ error: "Falta el equipo." }, { status: 400 });
  if (!titulo) return NextResponse.json({ error: "La actividad necesita un título." }, { status: 400 });

  try {
    const existentes = await ejecutar((request) =>
      request.input("equipoId", equipoId).query("SELECT COUNT(*) AS n FROM mant.ChecklistDiarioItems WHERE equipoId = @equipoId")
    );
    const orden = Number(existentes.recordset[0].n) || 0;

    const resultado = await ejecutar((request) => {
      request.input("equipoId", equipoId);
      request.input("orden", orden);
      request.input("titulo", titulo);
      request.input("detalle", String(body.detalle || "").trim() || null);
      return request.query(
        "INSERT INTO mant.ChecklistDiarioItems (equipoId, orden, titulo, detalle) OUTPUT INSERTED.id VALUES (@equipoId, @orden, @titulo, @detalle)"
      );
    });
    return NextResponse.json({ id: resultado.recordset[0].id });
  } catch (err) {
    return NextResponse.json({ error: "No se pudo crear la actividad: " + (err as Error).message }, { status: 500 });
  }
}
