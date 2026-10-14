// Registro de cada inspección diaria: horómetro + checklist + fotos, todo
// junto. POST es transaccional (mismo estilo que ots/[id]/finalizar): en un
// solo commit deja la lectura de horómetro, el horómetro del equipo y la
// inspección misma -- o no se guarda nada.

import { NextResponse } from "next/server";
import { ejecutar, iniciarTransaccion, type ErrorSql } from "@/lib/mantenimiento/db";
import { parsearJson, aJsonONull } from "@/lib/mantenimiento/json";
import { requerirUsuario, requerirRol } from "@/lib/mantenimiento/auth";
import { equiposAutorizadosDe } from "@/lib/mantenimiento/autorizacionEquipos";

interface RespuestaItemBody {
  itemId?: string;
  titulo?: string;
  hecho?: boolean;
  observacion?: string;
}

function mapearFila(fila: Record<string, any>) {
  return {
    equipoId: fila.equipoId,
    usuarioId: fila.usuarioId,
    usuarioNombre: String(fila.usuarioNombre ?? ""),
    horometro: fila.horometro == null ? null : Number(fila.horometro),
    checklist: parsearJson(fila.checklist, []),
    fotos: parsearJson(fila.fotos, []),
    fecha: fila.fecha ? new Date(fila.fecha).toISOString() : undefined
  };
}

export async function GET(peticion: Request) {
  const auth = await requerirUsuario();
  if (auth.error) return auth.error;

  const equipoId = new URL(peticion.url).searchParams.get("equipoId");

  try {
    const resultado = await ejecutar((request) => {
      const base =
        "SELECT i.id, i.equipoId, i.usuarioId, u.nombre AS usuarioNombre, i.horometro, i.checklist, i.fotos, i.fecha " +
        "FROM mant.InspeccionesDiarias i JOIN mant.Usuarios u ON u.id = i.usuarioId";
      if (equipoId) {
        return request.input("equipoId", equipoId).query(base + " WHERE i.equipoId = @equipoId ORDER BY i.fecha DESC");
      }
      return request.query(base + " ORDER BY i.fecha DESC");
    });
    let filas: Record<string, any>[] = resultado.recordset;
    if (auth.usuario.rol === "operador") {
      const permitidos = await equiposAutorizadosDe(auth.usuario.id);
      filas = filas.filter((fila: Record<string, any>) => permitidos.has(String(fila.equipoId).toUpperCase()));
    }
    const docs = filas.map((fila: Record<string, any>) => ({ id: fila.id, data: mapearFila(fila) }));
    return NextResponse.json({ docs });
  } catch (err) {
    return NextResponse.json({ error: "No se pudieron cargar las inspecciones: " + (err as Error).message }, { status: 500 });
  }
}

export async function POST(peticion: Request) {
  const auth = await requerirRol(["admin", "tecnico", "operador"]);
  if (auth.error) return auth.error;

  const body = await peticion.json();
  const equipoId = body.equipoId;
  if (!equipoId) return NextResponse.json({ error: "Elegí un equipo." }, { status: 400 });

  if (auth.usuario.rol === "operador") {
    const permitidos = await equiposAutorizadosDe(auth.usuario.id);
    if (!permitidos.has(String(equipoId).toUpperCase())) {
      return NextResponse.json({ error: "No tenés autorización para ese equipo." }, { status: 403 });
    }
  }

  const checklist: RespuestaItemBody[] = Array.isArray(body.checklist) ? body.checklist : [];
  const checklistParaGuardar = checklist.map((item) => ({
    itemId: item.itemId || null,
    titulo: String(item.titulo || ""),
    hecho: !!item.hecho,
    observacion: String(item.observacion || "").trim() || undefined
  }));
  const fotos = Array.isArray(body.fotos) ? body.fotos : [];
  const horometro = body.horometro == null || body.horometro === "" ? null : Number(body.horometro);

  let transaccion;
  try {
    transaccion = await iniciarTransaccion();

    if (horometro != null) {
      await transaccion
        .request()
        .input("equipoId", equipoId)
        .input("horometro", horometro)
        .input("fuente", "inspeccion")
        .input("fecha", new Date())
        .query("INSERT INTO mant.LecturasHorometro (equipoId, horometro, fuente, fecha) VALUES (@equipoId, @horometro, @fuente, @fecha)");

      await transaccion
        .request()
        .input("equipoId", equipoId)
        .input("horometro", horometro)
        .query("UPDATE mant.Equipos SET horometroActual = @horometro WHERE id = @equipoId");
    }

    const insercion = await transaccion
      .request()
      .input("equipoId", equipoId)
      .input("usuarioId", auth.usuario.id)
      .input("horometro", horometro)
      .input("checklist", aJsonONull(checklistParaGuardar))
      .input("fotos", aJsonONull(fotos))
      .query(
        "INSERT INTO mant.InspeccionesDiarias (equipoId, usuarioId, horometro, checklist, fotos) " +
          "OUTPUT INSERTED.id VALUES (@equipoId, @usuarioId, @horometro, @checklist, @fotos)"
      );

    await transaccion.commit();
    return NextResponse.json({ id: insercion.recordset[0].id });
  } catch (err) {
    if (transaccion) await transaccion.rollback().catch(() => {});
    const error = err as ErrorSql;
    if (error.number === 547) {
      return NextResponse.json({ error: "Ese equipo no existe. Recargá la página e intentá de nuevo." }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo guardar la inspección: " + error.message }, { status: 500 });
  }
}
