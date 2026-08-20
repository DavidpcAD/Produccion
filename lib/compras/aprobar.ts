// Aprobar y lanzar una orden en Business Central — fuente de verdad ÚNICA para
// la lista y el detalle de Aprobación. Regla clave: la orden solo pasa a "lanzado"
// si BC realmente la creó CON líneas y la lanzó (released=true). Si BC falla o
// rechaza las líneas, la orden queda como estaba (pendiente) y se devuelve el
// motivo real, para que el estado en SQL/UI nunca mienta respecto a BC.
import type { Orden } from "./types";
import { ALMACEN_GENERAL } from "./helpers";

type SetOrdenEstado = (
  id: string,
  estado: Orden["estado"],
  extra?: { bcNumber?: string; bcDeepLink?: string },
) => Promise<void>;

export async function aprobarYLanzar(
  orden: Orden,
  setOrdenEstado: SetOrdenEstado,
): Promise<{ ok: boolean; message: string; tone: "success" | "error" }> {
  const lineasBc = orden.lineas
    .filter((l) => l.tipo === "articulo" && l.articuloId && l.cantidad > 0)
    // El discriminante es la TAREA, no el proyecto: consumo inmediato = proyecto +
    // tarea (BC exige los dos para consumir contra el Job); cualquier otra línea va a
    // ALMACÉN (locationCode). Antes bastaba con que hubiera proyecto para NO mandar
    // almacén, y una línea con obra pero sin tarea terminaba sin job y sin almacén
    // (caía en el almacén por defecto de BC).
    .map((l) => {
      const consumo = !!(l.proyecto && l.taskNo);
      // Obra SIN tarea = material de obra que entra a inventario: va SIEMPRE al Almacén
      // General, nunca al almacén de la obra. (La línea de pedido guarda la obra en
      // `almacen`, y la app de proveeduría la copia tal cual a la orden; sin esto el
      // material se recibe en el almacén de la obra.)
      const materialABodega = !!l.proyecto && !l.taskNo;
      // Almacén REAL de la línea: el que eligió el pedido (tag ALM / Stock: Almacén
      // General, Agregados, Herramienta…). Si viene el código de la OBRA (pedidos
      // viejos, donde la obra viajaba en el almacén) no sirve como almacén de
      // recepción → se descarta y cae al General.
      const almacenReal = l.almacen && l.almacen !== l.proyecto ? l.almacen : "";
      return {
        itemNo: l.articuloId!, cantidad: l.cantidad, precio: l.precioUnitario || 0,
        descripcion: l.descripcion, variantCode: l.variantCode,
        jobNo: consumo ? l.proyecto : undefined,
        jobTaskNo: consumo ? l.taskNo : undefined,
        // Consumo inmediato: el almacén de la OBRA (en BC tiene el mismo código que el
        // proyecto). BC lo exige en las líneas de artículo y no impide el consumo.
        locationCode: consumo ? l.proyecto : (materialABodega ? (almacenReal || ALMACEN_GENERAL) : (almacenReal || undefined)),
      };
    });
  // Cargos de producto (Item Charge): TODAS las líneas tipo "cargo" con precio, cada
  // una con su tipo (chargeNo). El codeunit las distribuye por importe entre los
  // artículos al registrar.
  const cargos = orden.lineas
    .filter((l) => l.tipo === "cargo" && (l.precioUnitario || 0) > 0)
    .map((l) => ({ chargeNo: l.chargeNo, descripcion: l.descripcion, cantidad: l.cantidad || 1, precio: l.precioUnitario || 0 }));
  // Método de asignación del cargo (Amount|Weight|Volume|Equally). Uno por orden.
  const metodoCargo = orden.lineas.find((l) => l.tipo === "cargo")?.chargeMethod || "Amount";

  // Sin proveedor de BC o sin líneas: no hay nada que enviar a BC; se lanza local.
  if (!orden.proveedorNo || !lineasBc.length) {
    await setOrdenEstado(orden.id, "lanzado");
    return { ok: true, tone: "success", message: `${orden.numero} aprobada y lanzada (sin envío a BC)` };
  }

  // Nota: el TIPO del cargo (Item Charge) lo resuelve el servidor — por el chargeNo del
  // cliente o, si falta, deducido por la descripción contra el catálogo de BC. Si no se
  // puede determinar, el servidor aborta SIN crear nada en BC y la orden queda pendiente.

  // Precio obligatorio: ninguna línea puede ir a BC en 0 (BC la deja sin costo).
  const sinPrecio = lineasBc.filter((l) => !(l.precio > 0));
  if (sinPrecio.length) {
    return { ok: false, tone: "error", message: `La orden tiene ${sinPrecio.length} línea(s) sin precio; no se envía a BC. Poné el precio en proveeduría antes de lanzar.` };
  }

  // Si la orden YA se creó en BC en un intento previo (tiene bcNumber pero el
  // release falló), NO se crea otra: solo se REINTENTA el release de ese pedido.
  // Así no se acumulan pedidos duplicados en BC en cada reintento.
  if (orden.bcNumber) {
    let res: Response;
    let d: any = {};
    try {
      // Re-sincroniza las líneas (precio + variante) del pedido YA creado en BC y
      // luego lanza. Así, si la orden se corrigió en la app después de crearse en
      // BC, esas correcciones viajan a BC en vez de relanzar la versión vieja.
      res = await fetch("/api/compras/bc/relanzar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNo: orden.bcNumber, lineas: lineasBc, cargos, metodo: metodoCargo }),
      });
      d = await res.json().catch(() => ({}));
    } catch (e: any) {
      return { ok: false, tone: "error", message: `No se pudo contactar BC: ${String(e?.message ?? e)}. La orden queda pendiente.` };
    }
    if (!(res.ok && d.ok)) {
      // El pedido ya no existe en BC (lo registraron, lo eliminaron o lo archivaron):
      // soltamos el bcNumber para que el próximo intento CREE uno nuevo en vez de
      // relanzar para siempre un pedido fantasma. Un pedido de compra archivado no se
      // puede restaurar en BC, así que crear de nuevo es la única salida.
      if (d.bcInexistente) {
        await setOrdenEstado(orden.id, orden.estado, { bcNumber: "" });
        return { ok: false, tone: "error", message: `${d.error} Ya desligamos ${orden.bcNumber} de esta orden: dale "Aprobar y lanzar" otra vez y se crea de nuevo en BC.` };
      }
      return { ok: false, tone: "error", message: `No se lanzó ${orden.bcNumber} en BC: ${d.error || `HTTP ${res.status}`}. La orden queda pendiente.` };
    }
    await setOrdenEstado(orden.id, "lanzado", { bcNumber: orden.bcNumber });
    // Ya estaba lanzada en BC (la liberaron a mano): la app se pone al día en vez de
    // dejarla pendiente para siempre.
    if (d.yaRegistrado) return { ok: true, tone: "success", message: `${orden.bcNumber} ya se registró en Business Central (tiene recepción); la orden queda como lanzada.` };
    if (d.yaLanzado) return { ok: true, tone: "success", message: `${orden.bcNumber} ya estaba lanzada en Business Central; la orden queda como lanzada.` };
    const avisoCargoRe = d.cargoError ? ` · ⚠️ el cargo NO se agregó a BC: ${d.cargoError}` : "";
    const avisoJobRe = d.jobError ? ` · ⚠️ la actividad/almacén NO se aplicó en BC: ${d.jobError}` : "";
    return { ok: !d.cargoError && !d.jobError, tone: (d.cargoError || d.jobError) ? "error" : "success", message: `${orden.bcNumber} aprobada y lanzada en BC${avisoCargoRe}${avisoJobRe}` };
  }

  // Primer intento: crear el pedido en BC y lanzarlo.
  let res: Response;
  let d: any = {};
  try {
    res = await fetch("/api/compras/bc/lanzar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorNo: orden.proveedorNo, currencyCode: orden.currencyCode, locationCode: orden.almacenRecepcion || "ALM-GRAL", lineas: lineasBc, cargos, metodo: metodoCargo }),
    });
    d = await res.json().catch(() => ({}));
  } catch (e: any) {
    return { ok: false, tone: "error", message: `No se pudo contactar BC: ${String(e?.message ?? e)}. La orden queda pendiente.` };
  }

  // Si el pedido se CREÓ en BC (aunque el release falle), guardamos su número:
  // el próximo intento solo relanzará ese mismo pedido en vez de crear otro.
  if (res.ok && d.number) {
    if (d.released === true) {
      const avisoLineas = Array.isArray(d.omitidas) && d.omitidas.length
        ? ` · ojo: BC omitió ${d.omitidas.length} línea(s): ${d.omitidas.join(", ")}`
        : "";
      // El cargo de producto (flete) se crea por la API estándar; si BC lo rechaza,
      // NO tumbamos el lanzamiento pero AVISAMOS con el motivo real (antes se tragaba).
      const avisoCargo = d.cargoError ? ` · ⚠️ el cargo NO se agregó a BC: ${d.cargoError}` : "";
      const avisoJob = d.jobError ? ` · ⚠️ la actividad/almacén NO se aplicó en BC: ${d.jobError}` : "";
      await setOrdenEstado(orden.id, "lanzado", { bcNumber: d.number, bcDeepLink: d.deepLink || undefined });
      return { ok: true, tone: (d.cargoError || d.jobError) ? "error" : "success", message: `${d.number} aprobada y lanzada en BC${avisoLineas}${avisoCargo}${avisoJob}` };
    }
    // Creado pero no lanzado: persistimos el bcNumber sin cambiar el estado real.
    await setOrdenEstado(orden.id, orden.estado, { bcNumber: d.number, bcDeepLink: d.deepLink || undefined });
    return { ok: false, tone: "error", message: `${d.number} se creó en BC pero no se lanzó: ${d.releaseError || "sin detalle"}. Reintentá "Aprobar y lanzar" (no se creará otro).` };
  }

  // Ni siquiera se creó el pedido en BC.
  const motivo = d.lineError || d.error || `HTTP ${res.status}`;
  return { ok: false, tone: "error", message: `No se creó en BC: ${motivo}. La orden queda pendiente.` };
}
