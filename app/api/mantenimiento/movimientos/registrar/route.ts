// Entrada o salida manual de bodega (conteo físico, compra a proveedor,
// ajuste). Actualiza Repuestos.stockActual y agrega la fila en
// MovimientosRepuestos dentro de una sola transacción, con el mismo candado
// de fila que usa el cierre de OT (ver ots/[id]/finalizar) para que dos
// movimientos simultáneos sobre el mismo repuesto no se pisen.

import { NextResponse } from "next/server";
import { iniciarTransaccion } from "@/lib/mantenimiento/db";
import { requerirRol } from "@/lib/mantenimiento/auth";

export async function POST(peticion: Request) {
  const auth = await requerirRol(["admin", "tecnico"]);
  if (auth.error) return auth.error;

  const body = await peticion.json();
  const repuestoId = body.repuestoId;
  const tipo = body.tipo === "entrada" ? "entrada" : body.tipo === "salida" ? "salida" : null;
  const cantidad = Number(body.cantidad);
  if (!repuestoId) return NextResponse.json({ error: "Elegí un repuesto." }, { status: 400 });
  if (!tipo) return NextResponse.json({ error: "El tipo de movimiento tiene que ser entrada o salida." }, { status: 400 });
  if (!cantidad || cantidad <= 0) return NextResponse.json({ error: "La cantidad debe ser mayor a cero." }, { status: 400 });

  let transaccion;
  try {
    transaccion = await iniciarTransaccion();
    const repFila = await transaccion.request().input("id", repuestoId)
      .query("SELECT nombre, unidad, stockActual FROM mant.Repuestos WITH (UPDLOCK, ROWLOCK) WHERE id = @id");
    if (!repFila.recordset.length) {
      await transaccion.rollback();
      return NextResponse.json({ error: "Ese repuesto ya no existe. Recargá la página." }, { status: 404 });
    }
    const rep = repFila.recordset[0];
    const stockActual = Number(rep.stockActual || 0);
    if (tipo === "salida" && cantidad > stockActual) {
      await transaccion.rollback();
      return NextResponse.json({ error: "No hay suficiente stock (" + stockActual + " " + (rep.unidad || "") + " disponibles)." }, { status: 400 });
    }
    const nuevoStock = tipo === "entrada" ? stockActual + cantidad : stockActual - cantidad;

    await transaccion.request().input("id", repuestoId).input("stock", nuevoStock)
      .query("UPDATE mant.Repuestos SET stockActual = @stock WHERE id = @id");

    await transaccion.request()
      .input("repuestoId", repuestoId).input("tipo", tipo).input("cantidad", cantidad)
      .input("motivo", String(body.motivo || "").trim())
      .input("fecha", body.fecha ? new Date(body.fecha) : new Date())
      .query(
        "INSERT INTO mant.MovimientosRepuestos (repuestoId, tipo, cantidad, motivo, fecha) " +
          "VALUES (@repuestoId, @tipo, @cantidad, @motivo, @fecha)"
      );

    await transaccion.commit();
    return NextResponse.json({ ok: true, stockActual: nuevoStock });
  } catch (err) {
    if (transaccion) await transaccion.rollback().catch(() => {});
    return NextResponse.json({ error: "No se pudo registrar el movimiento: " + (err as Error).message }, { status: 500 });
  }
}
