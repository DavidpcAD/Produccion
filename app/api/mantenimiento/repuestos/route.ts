import { NextResponse } from "next/server";
import { ejecutar, type ErrorSql } from "@/lib/mantenimiento/db";
import { requerirUsuario, requerirRol } from "@/lib/mantenimiento/auth";
import { equiposAutorizadosDe } from "@/lib/mantenimiento/autorizacionEquipos";

function mapearFila(fila: Record<string, any>) {
  return {
    codigo: String(fila.codigo ?? ""),
    nombre: String(fila.nombre ?? ""),
    categoria: fila.categoria || undefined,
    unidad: fila.unidad || undefined,
    costoUnitario: Number(fila.costoUnitario ?? 0),
    stockActual: Number(fila.stockActual ?? 0),
    stockMinimo: Number(fila.stockMinimo ?? 0),
    ubicacionBodega: String(fila.ubicacionBodega ?? ""),
    notas: String(fila.notas ?? ""),
    equipoId: fila.equipoId || null
  };
}

export async function GET() {
  const auth = await requerirUsuario();
  if (auth.error) return auth.error;

  try {
    const resultado = await ejecutar((request) =>
      request.query("SELECT id, codigo, nombre, categoria, unidad, costoUnitario, stockActual, stockMinimo, ubicacionBodega, notas, equipoId FROM mant.Repuestos")
    );
    let filas: Record<string, any>[] = resultado.recordset;
    if (auth.usuario.rol === "operador") {
      const permitidos = await equiposAutorizadosDe(auth.usuario.id);
      filas = filas.filter((fila: Record<string, any>) => permitidos.has(String(fila.equipoId).toUpperCase()));
    }
    const docs = filas.map((fila: Record<string, any>) => ({ id: fila.id, data: mapearFila(fila) }));
    return NextResponse.json({ docs });
  } catch (err) {
    return NextResponse.json({ error: "No se pudo cargar el inventario: " + (err as Error).message }, { status: 500 });
  }
}

export async function POST(peticion: Request) {
  const auth = await requerirRol(["admin", "tecnico"]);
  if (auth.error) return auth.error;

  const body = await peticion.json();
  const codigo = String(body.codigo || "").trim();
  const nombre = String(body.nombre || "").trim();
  if (!codigo) return NextResponse.json({ error: "El repuesto necesita un código." }, { status: 400 });
  if (!nombre) return NextResponse.json({ error: "El repuesto necesita un nombre." }, { status: 400 });
  if (!body.equipoId) return NextResponse.json({ error: "Elegí a qué equipo pertenece este repuesto." }, { status: 400 });

  try {
    const resultado = await ejecutar((request) => {
      request.input("codigo", codigo);
      request.input("nombre", nombre);
      request.input("categoria", body.categoria || null);
      request.input("unidad", body.unidad || null);
      request.input("costoUnitario", Number(body.costoUnitario) || 0);
      request.input("stockActual", Number(body.stockActual) || 0);
      request.input("stockMinimo", Number(body.stockMinimo) || 0);
      request.input("ubicacionBodega", String(body.ubicacionBodega || "").trim());
      request.input("notas", String(body.notas || "").trim());
      request.input("equipoId", body.equipoId);
      return request.query(
        "INSERT INTO mant.Repuestos (codigo, nombre, categoria, unidad, costoUnitario, stockActual, stockMinimo, ubicacionBodega, notas, equipoId) " +
          "OUTPUT INSERTED.id " +
          "VALUES (@codigo, @nombre, @categoria, @unidad, @costoUnitario, @stockActual, @stockMinimo, @ubicacionBodega, @notas, @equipoId)"
      );
    });
    return NextResponse.json({ id: resultado.recordset[0].id });
  } catch (err) {
    const error = err as ErrorSql;
    if (error.number === 2627 || error.number === 2601) {
      return NextResponse.json({ error: `Ya existe un repuesto con el código "${codigo}".` }, { status: 409 });
    }
    if (error.number === 547) {
      return NextResponse.json({ error: "Ese equipo no existe. Recargá la página e intentá de nuevo." }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo guardar el repuesto: " + error.message }, { status: 500 });
  }
}
