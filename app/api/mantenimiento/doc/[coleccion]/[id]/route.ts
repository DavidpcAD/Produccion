// Compatibilidad con window.claude.use("db").doc("config/contadores"), que
// claude-shim.js traduce a /api/doc/config/contadores. En la práctica, desde
// que crear una OT pasa por POST /api/ots (que asigna el número de forma
// atómica dentro de su propia transacción — ver ese archivo), la app ya no
// necesita este endpoint para nada. Se deja implementado igual, mapeado a la
// tabla Contadores, por si algún código nuevo vuelve a necesitar un
// "documento suelto" más adelante.

import { NextResponse } from "next/server";
import { ejecutar } from "@/lib/mantenimiento/db";
import { requerirUsuario, requerirRol } from "@/lib/mantenimiento/auth";

function nombreContador(coleccion: string, id: string): string | null {
  if (coleccion === "config" && id === "contadores") return "ot";
  return null; // ninguna otra ruta "doc" está soportada hoy
}

export async function GET(peticion: Request, { params }: { params: Promise<{ coleccion: string; id: string }> }) {
  const auth = await requerirUsuario();
  if (auth.error) return auth.error;

  const { coleccion, id } = await params;
  const nombre = nombreContador(coleccion, id);
  if (!nombre) return NextResponse.json({ error: "Documento no soportado." }, { status: 404 });

  try {
    const resultado = await ejecutar((request) =>
      request.input("nombre", nombre).query("SELECT valor FROM mant.Contadores WHERE nombre = @nombre")
    );
    if (!resultado.recordset.length) return NextResponse.json({ exists: false, id, data: null });
    return NextResponse.json({ exists: true, id, data: { siguienteOt: Number(resultado.recordset[0].valor) } });
  } catch (err) {
    return NextResponse.json({ error: "No se pudo leer: " + (err as Error).message }, { status: 500 });
  }
}

export async function PUT(peticion: Request, { params }: { params: Promise<{ coleccion: string; id: string }> }) {
  const auth = await requerirRol(["admin", "tecnico"]);
  if (auth.error) return auth.error;

  const { coleccion, id } = await params;
  const nombre = nombreContador(coleccion, id);
  if (!nombre) return NextResponse.json({ error: "Documento no soportado." }, { status: 404 });
  const body = await peticion.json();
  const valor = Number(body.siguienteOt) || 1;

  try {
    await ejecutar((request) =>
      request.input("nombre", nombre).input("valor", valor).query(
        "MERGE mant.Contadores AS destino USING (SELECT @nombre AS nombre) AS origen ON destino.nombre = origen.nombre " +
          "WHEN MATCHED THEN UPDATE SET valor = @valor " +
          "WHEN NOT MATCHED THEN INSERT (nombre, valor) VALUES (@nombre, @valor);"
      )
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "No se pudo guardar: " + (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(peticion: Request, { params }: { params: Promise<{ coleccion: string; id: string }> }) {
  return PUT(peticion, { params });
}
