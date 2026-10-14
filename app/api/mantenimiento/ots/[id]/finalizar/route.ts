// Cerrar una OT. Es la operación más delicada de toda la app: en un solo
// commit deja la OT finalizada, actualiza el horómetro y el estado del
// equipo, descuenta cada repuesto usado de la bodega con su movimiento de
// salida en la bitácora, y si la OT viene de un plan preventivo actualiza
// cuándo fue su última ejecución. Así fue como se pensó siempre esta
// pantalla (ver el comentario "La OT se guardó parcialmente..." que traía el
// código de la versión anterior) — acá esa preocupación se resuelve de
// verdad con una transacción de SQL Server en vez de quedar como una
// advertencia en un catch: o se cierra todo, o no se cierra nada.
//
// El stock se vuelve a validar acá adentro (no alcanza con lo que ya validó
// el navegador): con WITH (UPDLOCK, ROWLOCK) sobre Repuestos, si dos
// técnicos finalizan al mismo tiempo dos OTs que usan el mismo repuesto, la
// segunda espera a que termine la primera y ve el stock ya descontado, en
// vez de que las dos lean el mismo stock viejo y lo dejen en negativo.

import { NextResponse } from "next/server";
import { iniciarTransaccion } from "@/lib/mantenimiento/db";
import { aJsonONull } from "@/lib/mantenimiento/json";
import { requerirRol } from "@/lib/mantenimiento/auth";

interface LineaRepuestoUsado {
  repuestoId?: string;
  nombre?: string;
  cantidad?: number | string;
  costoUnitario?: number | string;
}

export async function POST(peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requerirRol(["admin", "tecnico"]);
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await peticion.json();

  const horometroCierre = Number(body.horometroCierre);
  if (isNaN(horometroCierre)) {
    return NextResponse.json({ error: "Ingresá un horómetro de cierre válido." }, { status: 400 });
  }
  const repuestosUsados: LineaRepuestoUsado[] = Array.isArray(body.repuestosUsados)
    ? body.repuestosUsados.filter((l: LineaRepuestoUsado) => l && l.repuestoId)
    : [];
  for (let i = 0; i < repuestosUsados.length; i++) {
    if (!repuestosUsados[i].cantidad || Number(repuestosUsados[i].cantidad) <= 0) {
      return NextResponse.json({ error: 'Revisá la cantidad de "' + (repuestosUsados[i].nombre || "un repuesto") + '": tiene que ser mayor a cero.' }, { status: 400 });
    }
  }

  let transaccion;
  try {
    transaccion = await iniciarTransaccion();
    const otFila = await transaccion.request().input("id", id)
      .query("SELECT estado, equipoId, tipo, planId, horometroApertura, numero FROM mant.OrdenesTrabajo WHERE id = @id");
    if (!otFila.recordset.length) {
      await transaccion.rollback();
      return NextResponse.json({ error: "Esa OT ya no existe. Recargá la página." }, { status: 404 });
    }
    const ot = otFila.recordset[0];
    if (ot.estado === "finalizada" || ot.estado === "cancelada") {
      await transaccion.rollback();
      return NextResponse.json({ error: "Esta OT ya está cerrada." }, { status: 409 });
    }
    if (horometroCierre < Number(ot.horometroApertura || 0)) {
      await transaccion.rollback();
      return NextResponse.json({ error: "El horómetro de cierre no puede ser menor al de apertura (" + ot.horometroApertura + " h)." }, { status: 400 });
    }

    // Validar y descontar stock, con el candado de fila para que dos cierres simultáneos no se pisen.
    for (const linea of repuestosUsados) {
      const repFila = await transaccion.request().input("id", linea.repuestoId)
        .query("SELECT nombre, stockActual FROM mant.Repuestos WITH (UPDLOCK, ROWLOCK) WHERE id = @id");
      if (!repFila.recordset.length) {
        throw new Error("Uno de los repuestos usados ya no existe en el inventario.");
      }
      const rep = repFila.recordset[0];
      const cantidad = Number(linea.cantidad);
      if (cantidad > Number(rep.stockActual || 0)) {
        throw new Error("No hay suficiente stock de " + rep.nombre + " (disponible: " + rep.stockActual + ").");
      }
      await transaccion.request().input("id", linea.repuestoId).input("cantidad", cantidad)
        .query("UPDATE mant.Repuestos SET stockActual = stockActual - @cantidad WHERE id = @id");
      await transaccion.request()
        .input("repuestoId", linea.repuestoId).input("cantidad", cantidad)
        .input("motivo", "OT " + ot.numero).input("otId", id)
        .input("responsable", String(body.responsable || "").trim() || null)
        .query(
          "INSERT INTO mant.MovimientosRepuestos (repuestoId, tipo, cantidad, motivo, otId, responsable) " +
            "VALUES (@repuestoId, 'salida', @cantidad, @motivo, @otId, @responsable)"
        );
    }

    const repuestosParaGuardar = repuestosUsados.map((l) => ({
      repuestoId: l.repuestoId,
      nombre: String(l.nombre || ""),
      cantidad: Number(l.cantidad),
      costoUnitario: Number(l.costoUnitario) || 0
    }));

    await transaccion.request()
      .input("id", id)
      .input("trabajoRealizado", String(body.trabajoRealizado || "").trim())
      .input("horometroCierre", horometroCierre)
      .input("costoManoObra", Number(body.costoManoObra) || 0)
      .input("repuestosUsados", aJsonONull(repuestosParaGuardar))
      .input("checklist", aJsonONull(body.checklist || []))
      .input("fotos", aJsonONull(body.fotos || []))
      .input("firmaId", body.firmaId || null)
      .input("firmaResponsable", body.firmaId ? (String(body.firmaResponsable || "").trim() || null) : null)
      .query(
        "UPDATE mant.OrdenesTrabajo SET estado = 'finalizada', fechaFin = SYSUTCDATETIME(), trabajoRealizado = @trabajoRealizado, " +
          "horometroCierre = @horometroCierre, costoManoObra = @costoManoObra, repuestosUsados = @repuestosUsados, " +
          "checklist = @checklist, fotos = @fotos, firmaId = @firmaId, firmaResponsable = @firmaResponsable, " +
          "firmaFecha = " + (body.firmaId ? "SYSUTCDATETIME()" : "NULL") + " WHERE id = @id"
      );

    const equipoFila = await transaccion.request().input("equipoId", ot.equipoId)
      .query("SELECT horometroActual, estado FROM mant.Equipos WHERE id = @equipoId");
    if (equipoFila.recordset.length) {
      const eq = equipoFila.recordset[0];
      const nuevoHorometro = Math.max(Number(eq.horometroActual || 0), horometroCierre);
      const nuevoEstado = eq.estado === "mantenimiento" ? "operativo" : eq.estado;
      await transaccion.request().input("equipoId", ot.equipoId).input("horometro", nuevoHorometro).input("estado", nuevoEstado)
        .query("UPDATE mant.Equipos SET horometroActual = @horometro, estado = @estado WHERE id = @equipoId");
    }

    if (ot.tipo === "preventivo" && ot.planId) {
      await transaccion.request().input("planId", ot.planId).input("horometro", horometroCierre)
        .query("UPDATE mant.PlanesMantenimiento SET ultimaEjecucionHorometro = @horometro, ultimaEjecucionFecha = SYSUTCDATETIME() WHERE id = @planId");
    }

    await transaccion.commit();
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (transaccion) await transaccion.rollback().catch(() => {});
    return NextResponse.json({ error: "No se pudo finalizar la OT: " + (err as Error).message }, { status: 500 });
  }
}
