// Historial de lecturas manuales de horómetro. La app guarda una lectura
// nueva y actualiza Equipos.horometroActual con dos llamadas separadas (así
// lo hacía también contra Claude) — el riesgo de que una de las dos falle es
// bajo y el dato es solo informativo, así que no se justifica una
// transacción combinada acá como sí la tiene el cierre de OT.

import { NextResponse } from "next/server";
import { ejecutar } from "@/lib/mantenimiento/db";
import { requerirUsuario, requerirRol } from "@/lib/mantenimiento/auth";
import { equiposAutorizadosDe } from "@/lib/mantenimiento/autorizacionEquipos";

function mapearFila(fila: Record<string, any>) {
  return {
    equipoId: fila.equipoId,
    horometro: Number(fila.horometro ?? 0),
    fecha: fila.fecha ? new Date(fila.fecha).toISOString() : undefined,
    fuente: fila.fuente || "manual",
    nota: String(fila.nota ?? ""),
    otId: fila.otId || null,
    creadoEn: fila.creadoEn ? new Date(fila.creadoEn).toISOString() : undefined
  };
}

export async function GET() {
  const auth = await requerirUsuario();
  if (auth.error) return auth.error;

  try {
    const resultado = await ejecutar((request) =>
      request.query("SELECT id, equipoId, horometro, fecha, fuente, nota, otId, creadoEn FROM mant.LecturasHorometro")
    );
    let filas: Record<string, any>[] = resultado.recordset;
    if (auth.usuario.rol === "operador") {
      const permitidos = await equiposAutorizadosDe(auth.usuario.id);
      filas = filas.filter((fila: Record<string, any>) => permitidos.has(String(fila.equipoId).toUpperCase()));
    }
    const docs = filas.map((fila: Record<string, any>) => ({ id: fila.id, data: mapearFila(fila) }));
    return NextResponse.json({ docs });
  } catch (err) {
    return NextResponse.json({ error: "No se pudieron cargar las lecturas: " + (err as Error).message }, { status: 500 });
  }
}

export async function POST(peticion: Request) {
  // Admin/técnico/operador -- registrar el horómetro es tarea diaria del
  // operador de la máquina, no solo de quien mantiene el equipo.
  const auth = await requerirRol(["admin", "tecnico", "operador"]);
  if (auth.error) return auth.error;

  const body = await peticion.json();
  if (!body.equipoId) return NextResponse.json({ error: "Falta el equipo de la lectura." }, { status: 400 });
  if (auth.usuario.rol === "operador") {
    const permitidos = await equiposAutorizadosDe(auth.usuario.id);
    if (!permitidos.has(String(body.equipoId).toUpperCase())) {
      return NextResponse.json({ error: "No tenés autorización para operar ese equipo." }, { status: 403 });
    }
  }
  try {
    const resultado = await ejecutar((request) => {
      request.input("equipoId", body.equipoId);
      request.input("horometro", Number(body.horometro) || 0);
      request.input("fecha", body.fecha ? new Date(body.fecha) : new Date());
      request.input("fuente", body.fuente || "manual");
      request.input("nota", String(body.nota || "").trim());
      request.input("otId", body.otId || null);
      return request.query(
        "INSERT INTO mant.LecturasHorometro (equipoId, horometro, fecha, fuente, nota, otId) " +
          "OUTPUT INSERTED.id VALUES (@equipoId, @horometro, @fecha, @fuente, @nota, @otId)"
      );
    });
    return NextResponse.json({ id: resultado.recordset[0].id });
  } catch (err) {
    return NextResponse.json({ error: "No se pudo registrar la lectura: " + (err as Error).message }, { status: 500 });
  }
}
