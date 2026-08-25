// Aprobar y lanzar una orden en Business Central — fuente de verdad ÚNICA para
// la lista y el detalle de Aprobación. Regla clave: la orden solo pasa a "lanzado"
// si BC realmente la creó CON líneas y la lanzó (released=true). Si BC falla o
// rechaza las líneas, la orden queda como estaba (pendiente) y se devuelve el
// motivo real, para que el estado en SQL/UI nunca mienta respecto a BC.
import type { Orden } from "./types";
import { ALMACEN_GENERAL, numeroOrden } from "./helpers";

type SetOrdenEstado = (
  id: string,
  estado: Orden["estado"],
  extra?: { bcNumber?: string; bcDeepLink?: string; motivo?: string; tipoMovimiento?: string },
) => Promise<void>;

/** Tipo de movimiento con el que se registra un lanzamiento fallido en el historial. */
const MOV_FALLO = "lanzamiento_fallido";

/**
 * Deja el MOTIVO en el historial de la orden y devuelve el error para el toast.
 * Antes el porqué solo vivía en el toast: se perdía al cerrarlo y en el servidor no
 * quedaba nada (los logs del App Service ni se estaban guardando hasta el 21/08/2026).
 * No cambia el estado de la orden: se manda el que ya tiene.
 */
async function fallo(
  orden: Orden,
  setOrdenEstado: SetOrdenEstado,
  message: string,
  extra?: { bcNumber?: string; bcDeepLink?: string },
): Promise<{ ok: false; message: string; tone: "error" }> {
  // Si no se puede registrar, igual hay que devolverle el error al usuario.
  try { await setOrdenEstado(orden.id, orden.estado, { ...extra, motivo: message, tipoMovimiento: MOV_FALLO }); }
  catch (e) { console.warn("No se pudo registrar el fallo en el historial:", e); }
  return { ok: false, tone: "error", message };
}

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
        // El N.º de línea viaja para poder emparejar con BC sin adivinar por artículo.
        lineNo: l.lineNo,
        itemNo: l.articuloId!, cantidad: l.cantidad, precio: l.precioUnitario || 0,
        descripcion: l.descripcion, variantCode: l.variantCode,
        // Unidad con la que se pidió (EST, PQT…). Hasta ahora se quedaba en SQL y BC
        // ponía la suya; sin esto, pedir 2 PQT termina comprando 2 UND.
        unidad: l.unidad,
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

  // Líneas que van contra la obra (proyecto + tarea): lo que hay que asegurarse de
  // que BC tenga puesto antes de lanzar.
  const consumoDirecto = lineasBc
    .filter((l) => l.jobNo && l.jobTaskNo)
    .map((l) => ({ lineNo: l.lineNo, itemNo: l.itemNo, jobNo: l.jobNo!, jobTaskNo: l.jobTaskNo! }));

  // Sin proveedor de BC o sin líneas: no hay nada que enviar a BC; se lanza local.
  if (!orden.proveedorNo || !lineasBc.length) {
    await setOrdenEstado(orden.id, "lanzado");
    return { ok: true, tone: "success", message: `${numeroOrden(orden)} aprobada y lanzada (sin envío a BC)` };
  }

  // Nota: el TIPO del cargo (Item Charge) lo resuelve el servidor — por el chargeNo del
  // cliente o, si falta, deducido por la descripción contra el catálogo de BC. Si no se
  // puede determinar, el servidor aborta SIN crear nada en BC y la orden queda pendiente.

  // Precio obligatorio: ninguna línea puede ir a BC en 0 (BC la deja sin costo).
  const sinPrecio = lineasBc.filter((l) => !(l.precio > 0));
  if (sinPrecio.length) {
    return fallo(orden, setOrdenEstado, `La orden tiene ${sinPrecio.length} línea(s) sin precio; no se envía a BC. Poné el precio en proveeduría antes de lanzar.`);
  }

  // El pedido YA EXISTE en BC (Proveeduría lo crea ABIERTO al enviar la orden a
  // aprobación). Acá solo se LANZA: no se crea nada y no se le tocan las líneas.
  //
  // Antes esta rama re-sincronizaba las líneas antes del release, porque el pedido
  // lo creaba esta app y las correcciones posteriores no viajaban solas. Ya no:
  // Proveeduría es la dueña del contenido del pedido y lo empuja ella (al editar y
  // al reenviar). Volver a escribirlas desde acá era pisarle lo que acaba de poner
  // — sobre todo el ALMACÉN: la regla de "obra sin tarea va al Almacén General"
  // (más arriba) mandaba el material a ALM-GRAL aunque en Proveeduría se hubiera
  // elegido otro centro de costo. Aprobar es lanzar, no reescribir.
  if (orden.bcNumber) {
    let res: Response;
    let d: any = {};
    try {
      // Sin `lineas` ni `cargos` el endpoint va derecho al Release, pero conserva su
      // lectura del estado real de BC cuando falla (ya lanzado / ya registrado /
      // eliminado / en aprobación), que es lo que evita que la orden se quede
      // colgada en "pendiente" para siempre.
      //
      // `consumoDirecto` sí viaja: son las líneas que van contra obra + tarea. El
      // servidor le completa a BC la TAREA que Proveeduría no copia (sin tocar el
      // almacén). Sin esto BC rechaza el Release y la salida a mano —borrarle el
      // proyecto a la línea— manda el material a inventario en vez de a la obra.
      res = await fetch("/api/compras/bc/relanzar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNo: orden.bcNumber, consumoDirecto }),
      });
      d = await res.json().catch(() => ({}));
    } catch (e: any) {
      return fallo(orden, setOrdenEstado, `No se pudo contactar BC: ${String(e?.message ?? e)}. La orden queda pendiente.`);
    }
    if (!(res.ok && d.ok)) {
      // El pedido ya no existe en BC (lo registraron, lo eliminaron o lo archivaron):
      // soltamos el bcNumber para que el próximo intento CREE uno nuevo en vez de
      // relanzar para siempre un pedido fantasma. Un pedido de compra archivado no se
      // puede restaurar en BC, así que crear de nuevo es la única salida.
      if (d.bcInexistente) {
        // Se desliga el bcNumber Y se deja el motivo, en una sola escritura.
        return fallo(orden, setOrdenEstado, `${d.error} Ya desligamos ${orden.bcNumber} de esta orden: dale "Aprobar y lanzar" otra vez y se crea de nuevo en BC.`, { bcNumber: "" });
      }
      return fallo(orden, setOrdenEstado, `No se lanzó ${orden.bcNumber} en BC: ${d.error || `HTTP ${res.status}`}. La orden queda pendiente.`);
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

  // Sin pedido en BC: o la orden es vieja (de antes de que Proveeduría lo creara al
  // enviar), o allá está apagada la creación (BC_CREAR_AL_ENVIAR=0). Se crea y se
  // lanza acá, como siempre — incluyendo la aplicación de obra/tarea/almacén, que en
  // este camino sí es responsabilidad de esta app.
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
    return fallo(orden, setOrdenEstado, `No se pudo contactar BC: ${String(e?.message ?? e)}. La orden queda pendiente.`);
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
    // Creado pero no lanzado: se persiste el bcNumber y el motivo, sin cambiar el estado.
    return fallo(orden, setOrdenEstado, `${d.number} se creó en BC pero no se lanzó: ${d.releaseError || "sin detalle"}. Reintentá "Aprobar y lanzar" (no se creará otro).`, { bcNumber: d.number, bcDeepLink: d.deepLink || undefined });
  }

  // Ni siquiera se creó el pedido en BC.
  const motivo = d.lineError || d.error || `HTTP ${res.status}`;
  return fallo(orden, setOrdenEstado, `No se creó en BC: ${motivo}. La orden queda pendiente.`);
}
