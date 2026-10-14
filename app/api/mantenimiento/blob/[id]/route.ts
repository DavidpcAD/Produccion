// Sirve el contenido de una foto o firma guardada en Archivos. La app pide
// esto como "/api/mantenimiento/blob/<id>" (ver urlFoto() en public/app.html); next.config.js
// tiene una reescritura que manda esa URL para acá, porque Next.js no deja
// crear rutas dentro de una carpeta que empieza con "_" en app/.

import { ejecutar } from "@/lib/mantenimiento/db";
import { requerirUsuario } from "@/lib/mantenimiento/auth";

export async function GET(peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requerirUsuario();
  if (auth.error) return auth.error;

  const { id } = await params;
  try {
    const resultado = await ejecutar((request) =>
      request.input("id", id).query("SELECT contentType, datos FROM mant.Archivos WHERE id = @id")
    );
    if (!resultado.recordset.length) {
      return new Response("No encontrado", { status: 404 });
    }
    const fila = resultado.recordset[0];
    return new Response(fila.datos, {
      status: 200,
      headers: {
        "Content-Type": fila.contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    });
  } catch (err) {
    return new Response("No se pudo leer el archivo: " + (err as Error).message, { status: 500 });
  }
}
