// Pasar una OT a "en_proceso". Si el equipo estaba operativo, lo marca en
// mantenimiento — las dos cosas en una sola transacción, para que nunca
// quede una OT en proceso con su equipo todavía marcado como operativo (o al
// revés) por un fallo de red a mitad de camino.

import { NextResponse } from "next/server";
import { iniciarTransaccion } from "@/lib/mantenimiento/db";
import { requerirRol } from "@/lib/mantenimiento/auth";

export async function POST(peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requerirRol(["admin", "tecnico"]);
  if (auth.error) return auth.error;

  const { id } = await params;
  let transaccion;
  try {
    transaccion = await iniciarTransaccion();
    const otFila = await transaccion.request().input("id", id)
      .query("SELECT estado, equipoId FROM mant.OrdenesTrabajo WHERE id = @id");
    if (!otFila.recordset.length) {
      await transaccion.rollback();
      return NextResponse.json({ error: "Esa OT ya no existe. Recargá la página." }, { status: 404 });
    }
    const ot = otFila.recordset[0];
    if (ot.estado !== "abierta") {
      await transaccion.rollback();
      return NextResponse.json({ error: "Esta OT ya no está abierta — alguien más la actualizó. Recargá la página." }, { status: 409 });
    }

    await transaccion.request().input("id", id)
      .query("UPDATE mant.OrdenesTrabajo SET estado = 'en_proceso', fechaInicio = SYSUTCDATETIME() WHERE id = @id");

    const equipoFila = await transaccion.request().input("equipoId", ot.equipoId)
      .query("SELECT estado FROM mant.Equipos WHERE id = @equipoId");
    if (equipoFila.recordset.length && equipoFila.recordset[0].estado === "operativo") {
      await transaccion.request().input("equipoId", ot.equipoId)
        .query("UPDATE mant.Equipos SET estado = 'mantenimiento' WHERE id = @equipoId");
    }

    await transaccion.commit();
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (transaccion) await transaccion.rollback().catch(() => {});
    return NextResponse.json({ error: "No se pudo iniciar la OT: " + (err as Error).message }, { status: 500 });
  }
}
