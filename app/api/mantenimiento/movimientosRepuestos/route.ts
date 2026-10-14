// Solo lectura desde la app: la pantalla de Repuestos carga esta lista para
// mostrar el historial de bodega. Para REGISTRAR un movimiento (entrada o
// salida manual) la app usa POST /api/movimientos/registrar, que además
// actualiza el stock del repuesto en la misma transacción — ver ese archivo.

import { NextResponse } from "next/server";
import { ejecutar } from "@/lib/mantenimiento/db";
import { requerirUsuario } from "@/lib/mantenimiento/auth";
import { equiposAutorizadosDe, repuestosDeEquipos } from "@/lib/mantenimiento/autorizacionEquipos";

function mapearFila(fila: Record<string, any>) {
  return {
    repuestoId: fila.repuestoId,
    tipo: fila.tipo,
    cantidad: Number(fila.cantidad ?? 0),
    motivo: String(fila.motivo ?? ""),
    otId: fila.otId || null,
    responsable: String(fila.responsable ?? ""),
    fecha: fila.fecha ? new Date(fila.fecha).toISOString() : undefined
  };
}

export async function GET() {
  const auth = await requerirUsuario();
  if (auth.error) return auth.error;

  try {
    const resultado = await ejecutar((request) =>
      request.query("SELECT id, repuestoId, tipo, cantidad, motivo, otId, responsable, fecha FROM mant.MovimientosRepuestos")
    );
    let filas: Record<string, any>[] = resultado.recordset;
    if (auth.usuario.rol === "operador") {
      const equipos = await equiposAutorizadosDe(auth.usuario.id);
      const repuestosPermitidos = await repuestosDeEquipos(equipos);
      filas = filas.filter((fila: Record<string, any>) => repuestosPermitidos.has(String(fila.repuestoId).toUpperCase()));
    }
    const docs = filas.map((fila: Record<string, any>) => ({ id: fila.id, data: mapearFila(fila) }));
    return NextResponse.json({ docs });
  } catch (err) {
    return NextResponse.json({ error: "No se pudieron cargar los movimientos: " + (err as Error).message }, { status: 500 });
  }
}
