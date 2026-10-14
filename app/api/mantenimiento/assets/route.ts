// Subida de fotos (equipos, evidencia de OT) y firmas de cierre. Se guardan
// como bytes adentro de Azure SQL (tabla Archivos, columna VARBINARY(MAX)) —
// ver la nota en sql/schema.sql sobre por qué, y sobre cómo migrar a Azure
// Blob Storage más adelante si el volumen de fotos lo justifica.

import { NextResponse } from "next/server";
import { ejecutar, sql } from "@/lib/mantenimiento/db";
import { requerirUsuario } from "@/lib/mantenimiento/auth";

const TAMANO_MAXIMO_BYTES = 20 * 1024 * 1024; // mismo límite que tenía la versión standalone con multer

export async function POST(peticion: Request) {
  const auth = await requerirUsuario();
  if (auth.error) return auth.error;

  let formulario;
  try {
    formulario = await peticion.formData();
  } catch (e) {
    return NextResponse.json({ error: "No se pudo leer el archivo subido." }, { status: 400 });
  }
  const archivo = formulario.get("file");
  if (!archivo || typeof archivo === "string") {
    return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
  }
  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    return NextResponse.json({ error: "El archivo pesa más de 20 MB." }, { status: 400 });
  }
  // El navegador manda el tipo real en "contentType" (blob.type a veces llega
  // vacío, sobre todo con archivos generados desde un canvas, como la firma).
  const contentType = String(formulario.get("contentType") || archivo.type || "application/octet-stream");
  const bytes = Buffer.from(await archivo.arrayBuffer());

  try {
    const resultado = await ejecutar((request) => {
      request.input("contentType", contentType);
      request.input("sizeBytes", bytes.length);
      // Explícito como VarBinary(MAX): sin esto, node-mssql puede inferir un
      // largo fijo a partir del primer archivo que suba y truncar los que
      // vengan más grandes después.
      request.input("datos", sql.VarBinary(sql.MAX), bytes);
      return request.query(
        "INSERT INTO mant.Archivos (contentType, sizeBytes, datos) OUTPUT INSERTED.id VALUES (@contentType, @sizeBytes, @datos)"
      );
    });
    const id = resultado.recordset[0].id;
    return NextResponse.json({ id, url: "/api/mantenimiento/blob/" + id, sizeBytes: bytes.length, contentType });
  } catch (err) {
    return NextResponse.json({ error: "No se pudo guardar el archivo: " + (err as Error).message }, { status: 500 });
  }
}
