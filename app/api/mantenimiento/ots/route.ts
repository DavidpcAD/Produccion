// GET lista todas las OT. POST crea una OT nueva y le asigna número de forma
// atómica (ver el UPDATE...OUTPUT sobre Contadores más abajo) — dos técnicos
// creando una OT al mismo tiempo nunca chocan de número, porque SQL Server
// serializa ese UPDATE fila por fila.

import { NextResponse } from "next/server";
import { ejecutar, iniciarTransaccion, type ErrorSql } from "@/lib/mantenimiento/db";
import { parsearJson, aJsonONull } from "@/lib/mantenimiento/json";
import { requerirUsuario, requerirRol } from "@/lib/mantenimiento/auth";
import { equiposAutorizadosDe } from "@/lib/mantenimiento/autorizacionEquipos";

function mapearFila(fila: Record<string, any>) {
  return {
    numero: fila.numero,
    equipoId: fila.equipoId,
    tipo: fila.tipo,
    prioridad: fila.prioridad,
    titulo: String(fila.titulo ?? ""),
    descripcion: String(fila.descripcion ?? ""),
    fechaProgramada: fila.fechaProgramada ? new Date(fila.fechaProgramada).toISOString() : null,
    responsable: String(fila.responsable ?? ""),
    horometroApertura: Number(fila.horometroApertura ?? 0),
    horometroCierre: fila.horometroCierre == null ? undefined : Number(fila.horometroCierre),
    estado: fila.estado,
    fechaApertura: fila.fechaApertura ? new Date(fila.fechaApertura).toISOString() : undefined,
    fechaInicio: fila.fechaInicio ? new Date(fila.fechaInicio).toISOString() : undefined,
    fechaFin: fila.fechaFin ? new Date(fila.fechaFin).toISOString() : undefined,
    motivoCancelacion: fila.motivoCancelacion || undefined,
    trabajoRealizado: fila.trabajoRealizado || undefined,
    costoManoObra: Number(fila.costoManoObra ?? 0),
    planId: fila.planId || null,
    checklist: parsearJson(fila.checklist, []),
    fotos: parsearJson(fila.fotos, []),
    repuestosUsados: parsearJson(fila.repuestosUsados, []),
    firmaId: fila.firmaId || null,
    firmaResponsable: fila.firmaResponsable || null,
    firmaFecha: fila.firmaFecha ? new Date(fila.firmaFecha).toISOString() : null
  };
}

export async function GET() {
  const auth = await requerirUsuario();
  if (auth.error) return auth.error;

  try {
    const resultado = await ejecutar((request) =>
      request.query(
        "SELECT id, numero, equipoId, tipo, prioridad, titulo, descripcion, fechaProgramada, responsable, " +
          "horometroApertura, horometroCierre, estado, fechaApertura, fechaInicio, fechaFin, motivoCancelacion, " +
          "trabajoRealizado, costoManoObra, planId, checklist, fotos, repuestosUsados, firmaId, firmaResponsable, firmaFecha " +
          "FROM mant.OrdenesTrabajo"
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
    return NextResponse.json({ error: "No se pudieron cargar las OT: " + (err as Error).message }, { status: 500 });
  }
}

export async function POST(peticion: Request) {
  // Crear una OT es "reportar" (un operador puede avisar que una máquina
  // necesita atención) -- ejecutarla (iniciar/finalizar/cancelar) es cosa de
  // técnico/admin, ver esos endpoints.
  const auth = await requerirRol(["admin", "tecnico", "operador"]);
  if (auth.error) return auth.error;

  const body = await peticion.json();
  const equipoId = body.equipoId;
  const titulo = String(body.titulo || "").trim();
  if (!equipoId) return NextResponse.json({ error: "Elegí a qué equipo pertenece la OT." }, { status: 400 });
  if (!titulo) return NextResponse.json({ error: "La OT necesita un título breve." }, { status: 400 });
  if (auth.usuario.rol === "operador") {
    const permitidos = await equiposAutorizadosDe(auth.usuario.id);
    if (!permitidos.has(String(equipoId).toUpperCase())) {
      return NextResponse.json({ error: "No tenés autorización para ese equipo." }, { status: 403 });
    }
  }

  const checklist = String(body.checklistTexto || "").split("\n")
    .map((t: string) => t.trim()).filter(Boolean)
    .map((t: string) => ({ texto: t, hecho: false }));

  let transaccion;
  try {
    transaccion = await iniciarTransaccion();
    const numeroFila = await transaccion.request()
      .query("UPDATE mant.Contadores SET valor = valor + 1 OUTPUT INSERTED.valor - 1 AS anterior WHERE nombre = 'ot'");
    if (!numeroFila.recordset.length) {
      throw new Error("Falta la fila 'ot' en la tabla Contadores. Corré sql/schema.sql completo antes de usar la app.");
    }
    const numero = "OT-" + String(numeroFila.recordset[0].anterior).padStart(4, "0");

    const insercion = await transaccion.request()
      .input("numero", numero)
      .input("equipoId", equipoId)
      .input("tipo", body.tipo || "correctivo")
      .input("prioridad", body.prioridad || "media")
      .input("titulo", titulo)
      .input("descripcion", String(body.descripcion || "").trim())
      .input("fechaProgramada", body.fechaProgramada ? new Date(body.fechaProgramada) : null)
      .input("responsable", String(body.responsable || "").trim())
      .input("horometroApertura", Number(body.horometroApertura) || 0)
      .input("checklist", aJsonONull(checklist))
      .input("planId", body.planId || null)
      .query(
        "INSERT INTO mant.OrdenesTrabajo (numero, equipoId, tipo, prioridad, titulo, descripcion, fechaProgramada, " +
          "responsable, horometroApertura, estado, checklist, fotos, repuestosUsados, planId) " +
          "OUTPUT INSERTED.id " +
          "VALUES (@numero, @equipoId, @tipo, @prioridad, @titulo, @descripcion, @fechaProgramada, @responsable, " +
          "@horometroApertura, 'abierta', @checklist, '[]', '[]', @planId)"
      );

    await transaccion.commit();
    return NextResponse.json({ id: insercion.recordset[0].id, numero });
  } catch (err) {
    if (transaccion) await transaccion.rollback().catch(() => { /* si el rollback también falla, la conexión ya está rota; el error original es el que importa */ });
    const error = err as ErrorSql;
    if (error.number === 547) {
      return NextResponse.json({ error: "Ese equipo no existe. Recargá la página e intentá de nuevo." }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo crear la OT: " + error.message }, { status: 500 });
  }
}
