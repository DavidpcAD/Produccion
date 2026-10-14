// Cancelar una OT. Si el equipo estaba en mantenimiento por esta OT, lo
// vuelve a operativo — mismo motivo que iniciar/route.ts: las dos escrituras
// van juntas o ninguna.

import { NextResponse } from "next/server";
import { iniciarTransaccion } from "@/lib/mantenimiento/db";
import { requerirRol } from "@/lib/mantenimiento/auth";

export async function POST(peticion: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requerirRol(["admin", "tecnico"]);
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await peticion.json().catch(() => ({}));
  const motivo = String(body.motivo || "").trim();

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
    if (ot.estado === "finalizada" || ot.estado === "cancelada") {
      await transaccion.rollback();
      return NextResponse.json({ error: "Esta OT ya está cerrada." }, { status: 409 });
    }

    await transaccion.request().input("id", id).input("motivo", motivo)
      .query("UPDATE mant.OrdenesTrabajo SET estado = 'cancelada', motivoCancelacion = @motivo, fechaFin = SYSUTCDATETIME() WHERE id = @id");

    const equipoFila = await transaccion.request().input("equipoId", ot.equipoId)
      .query("SELECT estado FROM mant.Equipos WHERE id = @equipoId");
    if (equipoFila.recordset.length && equipoFila.recordset[0].estado === "mantenimiento") {
      await transaccion.request().input("equipoId", ot.equipoId)
        .query("UPDATE mant.Equipos SET estado = 'operativo' WHERE id = @equipoId");
    }

    await transaccion.commit();
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (transaccion) await transaccion.rollback().catch(() => {});
    return NextResponse.json({ error: "No se pudo cancelar la OT: " + (err as Error).message }, { status: 500 });
  }
}
