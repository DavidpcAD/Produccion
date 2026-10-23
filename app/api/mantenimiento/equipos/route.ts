// Frontera externa: tabla Equipos. GET lista todo (la app carga todo el
// parque de equipos en memoria del navegador, como hacía con Claude), POST
// crea uno nuevo. Editar/borrar un equipo puntual vive en [id]/route.ts.

import { NextResponse } from "next/server";
import { ejecutar, type ErrorSql } from "@/lib/mantenimiento/db";
import { parsearJson } from "@/lib/mantenimiento/json";
import { requerirUsuario, requerirRol } from "@/lib/mantenimiento/auth";
import { equiposAutorizadosDe } from "@/lib/mantenimiento/autorizacionEquipos";

type FilaSql = Record<string, any>;

// Mapea una fila de SQL Server al objeto plano que espera el navegador.
// A mano y con desconfianza: NULL de la base nunca debe volverse NaN ni
// convertirse en la palabra "null" dentro de un campo de texto.
function mapearFila(fila: FilaSql) {
  return {
    codigo: String(fila.codigo ?? ""),
    nombre: String(fila.nombre ?? ""),
    tipo: fila.tipo || undefined,
    marca: String(fila.marca ?? ""),
    modelo: String(fila.modelo ?? ""),
    anio: fila.anio == null ? null : Number(fila.anio),
    numeroSerie: String(fila.numeroSerie ?? ""),
    horometroActual: Number(fila.horometroActual ?? 0),
    estado: fila.estado || "operativo",
    ubicacion: String(fila.ubicacion ?? ""),
    intervaloHorasPreventivo: Number(fila.intervaloHorasPreventivo ?? 0),
    intervaloKilometrajePreventivo: fila.intervaloKilometrajePreventivo == null ? null : Number(fila.intervaloKilometrajePreventivo),
    notas: String(fila.notas ?? ""),
    fotoId: fila.fotoId || null,
    placa: String(fila.placa ?? ""),
    revisionTecnica: String(fila.revisionTecnica ?? ""),
    fechaIngreso: String(fila.fechaIngreso ?? ""),
    kilometraje: fila.kilometraje == null ? null : Number(fila.kilometraje),
    combustible: fila.combustible || undefined,
    filtroAceite: String(fila.filtroAceite ?? ""),
    filtroDiesel: String(fila.filtroDiesel ?? ""),
    filtroAireAcondicionado: String(fila.filtroAireAcondicionado ?? ""),
    llantasDelanteras: String(fila.llantasDelanteras ?? ""),
    llantasTraseras: String(fila.llantasTraseras ?? ""),
    cilindraje: String(fila.cilindraje ?? ""),
    ultimaFechaMantenimiento: String(fila.ultimaFechaMantenimiento ?? ""),
    proximaFechaMantenimiento: String(fila.proximaFechaMantenimiento ?? ""),
    manuales: parsearJson(fila.manuales, []),
    especificaciones: parsearJson(fila.especificaciones, []),
    creadoEn: fila.creadoEn ? new Date(fila.creadoEn).toISOString() : undefined
  };
}

// especificaciones llega con la migración 2026-10-23_mantenimiento_especificaciones_equipo,
// que en producción se aplica AL ARRANCAR la app. Hasta que exista la columna
// (o si esa migración fallara) la lista de equipos no puede romperse: se pide
// sin ella. Una vez que aparece se recuerda y no se vuelve a consultar.
let hayColumnaEspecificaciones = false;
async function existeColumnaEspecificaciones(): Promise<boolean> {
  if (hayColumnaEspecificaciones) return true;
  const r = await ejecutar((request) => request.query("SELECT COL_LENGTH('mant.Equipos', 'especificaciones') AS largo"));
  hayColumnaEspecificaciones = r.recordset[0].largo != null;
  return hayColumnaEspecificaciones;
}

export async function GET() {
  const auth = await requerirUsuario();
  if (auth.error) return auth.error;

  try {
    const conEspecificaciones = await existeColumnaEspecificaciones();
    const resultado = await ejecutar((request) =>
      request.query(
        "SELECT id, codigo, nombre, tipo, marca, modelo, anio, numeroSerie, horometroActual, " +
          "estado, ubicacion, intervaloHorasPreventivo, notas, fotoId, placa, revisionTecnica, " +
          "fechaIngreso, kilometraje, combustible, filtroAceite, filtroDiesel, filtroAireAcondicionado, " +
          "llantasDelanteras, llantasTraseras, cilindraje, intervaloKilometrajePreventivo, " +
          "ultimaFechaMantenimiento, proximaFechaMantenimiento, manuales, creadoEn" +
          (conEspecificaciones ? ", especificaciones" : "") +
          " FROM mant.Equipos"
      )
    );
    let filas: Record<string, any>[] = resultado.recordset;
    if (auth.usuario.rol === "operador") {
      const permitidos = await equiposAutorizadosDe(auth.usuario.id);
      filas = filas.filter((fila: FilaSql) => permitidos.has(String(fila.id).toUpperCase()));
    }
    const docs = filas.map((fila: FilaSql) => ({ id: fila.id, data: mapearFila(fila) }));
    return NextResponse.json({ docs });
  } catch (err) {
    return NextResponse.json({ error: "No se pudieron cargar los equipos: " + (err as Error).message }, { status: 500 });
  }
}

export async function POST(peticion: Request) {
  const auth = await requerirRol(["admin", "tecnico"]);
  if (auth.error) return auth.error;

  const body = await peticion.json();
  const codigo = String(body.codigo || "").trim();
  const nombre = String(body.nombre || "").trim();
  if (!codigo) return NextResponse.json({ error: "El equipo necesita un código interno." }, { status: 400 });
  if (!nombre) return NextResponse.json({ error: "El equipo necesita un nombre." }, { status: 400 });

  try {
    const resultado = await ejecutar((request) => {
      request.input("codigo", codigo);
      request.input("nombre", nombre);
      request.input("tipo", body.tipo || null);
      request.input("marca", String(body.marca || "").trim());
      request.input("modelo", String(body.modelo || "").trim());
      request.input("anio", body.anio == null ? null : Number(body.anio) || null);
      request.input("numeroSerie", String(body.numeroSerie || "").trim());
      request.input("horometroActual", Number(body.horometroActual) || 0);
      request.input("estado", body.estado || "operativo");
      request.input("ubicacion", String(body.ubicacion || "").trim());
      request.input("intervaloHorasPreventivo", Number(body.intervaloHorasPreventivo) || 0);
      request.input("intervaloKilometrajePreventivo", body.intervaloKilometrajePreventivo == null || body.intervaloKilometrajePreventivo === "" ? null : Number(body.intervaloKilometrajePreventivo));
      request.input("notas", String(body.notas || "").trim());
      request.input("fotoId", body.fotoId || null);
      request.input("placa", String(body.placa || "").trim());
      request.input("revisionTecnica", String(body.revisionTecnica || "").trim());
      request.input("fechaIngreso", String(body.fechaIngreso || "").trim());
      request.input("kilometraje", body.kilometraje == null || body.kilometraje === "" ? null : Number(body.kilometraje));
      request.input("combustible", body.combustible || null);
      request.input("filtroAceite", String(body.filtroAceite || "").trim());
      request.input("filtroDiesel", String(body.filtroDiesel || "").trim());
      request.input("filtroAireAcondicionado", String(body.filtroAireAcondicionado || "").trim());
      request.input("llantasDelanteras", String(body.llantasDelanteras || "").trim());
      request.input("llantasTraseras", String(body.llantasTraseras || "").trim());
      request.input("cilindraje", String(body.cilindraje || "").trim());
      request.input("ultimaFechaMantenimiento", String(body.ultimaFechaMantenimiento || "").trim());
      request.input("proximaFechaMantenimiento", String(body.proximaFechaMantenimiento || "").trim());
      return request.query(
        "INSERT INTO mant.Equipos (codigo, nombre, tipo, marca, modelo, anio, numeroSerie, horometroActual, " +
          "estado, ubicacion, intervaloHorasPreventivo, intervaloKilometrajePreventivo, notas, fotoId, placa, revisionTecnica, fechaIngreso, kilometraje, combustible, " +
          "filtroAceite, filtroDiesel, filtroAireAcondicionado, llantasDelanteras, llantasTraseras, cilindraje, " +
          "ultimaFechaMantenimiento, proximaFechaMantenimiento) " +
          "OUTPUT INSERTED.id " +
          "VALUES (@codigo, @nombre, @tipo, @marca, @modelo, @anio, @numeroSerie, @horometroActual, " +
          "@estado, @ubicacion, @intervaloHorasPreventivo, @intervaloKilometrajePreventivo, @notas, @fotoId, @placa, @revisionTecnica, @fechaIngreso, @kilometraje, @combustible, " +
          "@filtroAceite, @filtroDiesel, @filtroAireAcondicionado, @llantasDelanteras, @llantasTraseras, @cilindraje, " +
          "@ultimaFechaMantenimiento, @proximaFechaMantenimiento)"
      );
    });
    return NextResponse.json({ id: resultado.recordset[0].id });
  } catch (err) {
    const error = err as ErrorSql;
    // Código 2627/2601 de SQL Server = violación de índice único: acá, el código de equipo repetido.
    if (error.number === 2627 || error.number === 2601) {
      return NextResponse.json({ error: `Ya existe un equipo con el código "${codigo}". Usá otro código.` }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo guardar el equipo: " + error.message }, { status: 500 });
  }
}
