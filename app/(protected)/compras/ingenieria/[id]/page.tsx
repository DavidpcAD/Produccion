"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/compras/shell";
import { Badge, Button, Card, useToast } from "@/components/compras/ui";
import { Timeline } from "@/components/compras/timeline";
import { NuevaSolicitudSheet, type NuevaSolicitudSeed } from "@/components/compras/nueva-solicitud-sheet";
import { useStore } from "@/lib/compras/store";
import { ALMACEN_GENERAL, destinoLabel, esConsumoInmediato, esSubcontrato, formatDate, money, montoDeLineaSubcontrato, num, numeroOrden, obraDeLinea, ordenesDePedido, pedidoBadge, pedidoLineaDadaDeBaja, pedidoLineaPorRecibir, recibidoDeLineaPedido, tipoSolicitudBadge } from "@/lib/compras/helpers";

export default function PedidoDetallePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { pedidos, ordenes, setPedidoEstado, deletePedido, cargando } = useStore();
  const [copiarOpen, setCopiarOpen] = useState(false);
  const [editarOpen, setEditarOpen] = useState(false);

  const pedido = pedidos.find((p) => p.id === id);
  if (!pedido) {
    return (
      <AppShell role="ingenieria">
        <main className="page"><div className="empty">{cargando ? "Cargando pedido…" : "Pedido no encontrado."}</div></main>
      </AppShell>
    );
  }
  const b = pedidoBadge(pedido.estado);
  const t = tipoSolicitudBadge(pedido.tipoSolicitud);
  const ordenado = pedido.lineas.some((l) => l.cantidadOrdenada > 0 || l.enOrden);
  // Proveeduría devolvió alguna línea puntual para corregir (código de material
  // equivocado, etc.): el resto del pedido sigue su curso normal, así que el pedido
  // puede estar "aprobado" (no "devuelto") y aun así tener algo para editar.
  const hayLineasDevueltas = pedido.lineas.some((l) => l.devuelta);
  // Devueltas que NO se pueden corregir porque una orden ya las referencia.
  const lineasDevueltasTrabadas = pedido.lineas.filter((l) => l.devuelta && l.enOrden);
  // SUBCONTRATO: el proveedor y los montos viven en la orden que se creó junto con la
  // solicitud (la tabla del pedido no tiene precio).
  const esSub = esSubcontrato(pedido);
  // Líneas que TODAVÍA se pueden tocar: sin nada ordenado y sin orden de compra viva.
  // Mientras quede alguna, el pedido se puede corregir aunque ya esté en Proveeduría
  // (el repo preserva las que sí tienen orden y solo reemplaza estas). Antes había que
  // devolverlo a borrador para editarlo, y si Proveeduría ya había ordenado una línea
  // no había forma de arreglar el resto.
  const lineasEditables = pedido.lineas.filter((l) => l.cantidadOrdenada === 0 && !l.enOrden);
  const esBorrador = pedido.estado === "borrador" || pedido.estado === "devuelto";
  // Consumo directo: el material no entra al inventario, se consume contra la obra Y su
  // ACTIVIDAD (Job Task) en BC. La tarea la eligió el ingeniero al crear el pedido, así
  // que la tabla la muestra: sin ella no se ve contra qué se va a consumir. Si el pedido
  // no es consumo directo no hay tarea (va al almacén general) y la columna no aparece.
  const conTarea = pedido.lineas.some((l) => !!l.taskNo);
  const ordenSub = esSub ? ordenesDePedido(ordenes, pedido)[0] : undefined;
  const monedaSub = ordenSub?.currencyCode ?? "";
  const totalSub = esSub ? pedido.lineas.reduce((t, l) => t + montoDeLineaSubcontrato(ordenes, l.id), 0) : 0;
  // Precio UNITARIO de la línea en la orden (lo que se teclea en el panel). Ojo:
  // `montoDeLineaSubcontrato` devuelve el total de la línea (cantidad × precio).
  const precioSub = (pedidoLineaId: string) => ordenSub?.lineas.find((ol) => ol.pedidoLineaId === pedidoLineaId)?.precioUnitario ?? 0;
  // Un SUBCONTRATO se edita mientras su orden siga siendo de esta app: sin pedido en
  // Business Central, sin lanzar y sin que nadie haya recibido o facturado. Después
  // manda BC y tocarlo acá no cambiaría nada allá.
  const subEditable = !!ordenSub && !ordenSub.bcNumber
    && ordenSub.estado !== "lanzado" && ordenSub.estado !== "completado"
    && ordenSub.lineas.every((l) => !l.cantidadRecibida && !l.cantidadFacturada);
  // Material / stock / repuesto / activo: se edita mientras quede alguna línea libre.
  const editable = pedido.estado !== "cerrado" && (esSub ? subEditable : lineasEditables.length > 0);
  // Ya salió de Ingeniería (está en la cola de Proveeduría / de Aprobación) pero
  // todavía se puede tocar.
  const editableEnviado = editable && !esBorrador;

  // Semilla del pedido: la usa "Copiar" (crea uno nuevo con las mismas líneas) y
  // "Editar" (el MISMO drawer, guardando sobre este pedido). La pantalla completa
  // vieja ya no existe.
  const lineaASeed = (l: (typeof pedido.lineas)[number]) => ({
    code: l.articuloId, cantidad: l.cantidad,
    obraCodigo: (pedido.tipoSolicitud === "material" || esSub) ? (obraDeLinea(l, pedido) || undefined) : undefined,
    variantCode: l.variantCode, descripcion: l.descripcion, unidad: l.unidad,
    // La actividad (tarea) del consumo directo viaja con la línea.
    taskNo: l.taskNo, taskDescr: l.taskDescr,
    // SUBCONTRATO: el alcance escrito (que es la descripción de la línea) y el monto
    // unitario, que vive en la orden. Sin esto el panel abría el subcontrato vacío de
    // plata y el ingeniero tenía que volver a teclear todo.
    detalle: esSub ? l.descripcion : undefined,
    monto: esSub ? precioSub(l.id) : undefined,
  });
  const seedBase = {
    tipo: pedido.tipoSolicitud,
    prioridad: pedido.prioridad,
    notas: pedido.notas,
    // Consumo directo (CD) = las líneas traían tarea (Job Task) de la obra.
    consumo: pedido.lineas.some((l) => !!l.taskNo),
    destino: pedido.tipoSolicitud === "repuesto" ? pedido.maquinaNo : undefined,
    // Almacén elegido (tag ALM / pedido de Stock): se copia tal cual.
    almacen: pedido.lineas.find((l) => !!l.almacen && !l.taskNo)?.almacen || undefined,
    idClasificacion: pedido.idClasificacion ?? null,
    // Subcontrato: subcontratista y moneda son de la orden.
    proveedorId: ordenSub?.proveedorNo ?? ordenSub?.proveedorId,
    currency: ordenSub?.currencyCode,
  };
  // "Copiar" arranca un pedido nuevo: lleva TODAS las líneas, incluidas las que ya
  // tienen orden de compra (son solo la semilla de un pedido distinto).
  const seedPedido: NuevaSolicitudSeed = { ...seedBase, lineas: pedido.lineas.map(lineaASeed) };
  // "Editar" sigue siendo ESTE pedido: las líneas con orden de compra quedan
  // bloqueadas (el repo las preserva tal cual) y no se ofrecen para editar; solo
  // entran las que faltan por ordenar (pendientes o devueltas por Proveeduría).
  // El SUBCONTRATO es la excepción: todas sus líneas están en la orden desde que nace,
  // así que se editan todas juntas (pedido + orden se rehacen a la vez).
  const seedEdicion: NuevaSolicitudSeed = esSub
    ? { ...seedBase, lineas: pedido.lineas.map(lineaASeed) }
    : { ...seedBase, lineas: pedido.lineas.filter((l) => l.cantidadOrdenada === 0 && !l.enOrden).map(lineaASeed) };

  return (
    <AppShell role="ingenieria">
      <NuevaSolicitudSheet open={copiarOpen} setOpen={setCopiarOpen} seed={seedPedido} />
      {/* Editar = el mismo drawer, sobre este pedido. */}
      <NuevaSolicitudSheet open={editarOpen} setOpen={setEditarOpen}
        editar={{ id: pedido.id, numero: pedido.numero, seed: seedEdicion }} />
      <main className="page">
        <div className="back-link" onClick={() => router.push("/compras/ingenieria")}>Volver a pedidos</div>
        <div className="page__head">
          <div className="page__title">
            <div className="row gap-3">
              <h1 className="ds-heading">{pedido.numero}</h1>
              <Badge tone={t.tone}>{t.label}</Badge>
              {esSub && ordenSub && <Badge tone="ink">{ordenSub.proveedorNombre ?? ordenSub.proveedorNo ?? "Subcontratista"}</Badge>}
              {pedido.tipoSolicitud !== "stock" && !esSub && (
                <Badge tone={esConsumoInmediato(pedido) ? "green" : "gray"}>
                  {esConsumoInmediato(pedido)
                    ? "CD · consumo directo"
                    : `ALM · ${pedido.lineas.find((l) => !!l.almacen)?.almacen || "ALM-GRAL"}`}
                </Badge>
              )}
              <Badge tone={b.tone}>{b.label}</Badge>
            </div>
            <p className="ds-muted">{destinoLabel(pedido)} · {pedido.solicitante} · {formatDate(pedido.fecha)}</p>
          </div>
          <div className="row gap-3">
            {!esSub && (
              <Button variant="outline" title="Crear una solicitud nueva con las mismas líneas" onClick={() => setCopiarOpen(true)}>
                ⧉ Copiar
              </Button>
            )}
            {/* Subcontrato en borrador = su orden no se llegó a crear (falló el envío).
                No se puede "mandar a proveeduría" ni editar sin los montos: se elimina y
                se vuelve a crear (el panel recupera lo que se había tecleado). */}
            {esSub && (pedido.estado === "borrador" || pedido.estado === "devuelto") && (
              <>
                <span className="ds-muted ds-label" style={{ alignSelf: "center", maxWidth: 320 }}>
                  Este subcontrato quedó sin orden de compra. Eliminalo y volvé a crearlo desde “Nuevo pedido”.
                </span>
                <Button variant="outline" onClick={async () => { await deletePedido(pedido.id); toast("Subcontrato eliminado"); router.push("/compras/ingenieria"); }}>
                  Eliminar
                </Button>
              </>
            )}
            {!esSub && esBorrador && (
              <Button variant="outline" onClick={async () => { await deletePedido(pedido.id); toast("Pedido eliminado"); router.push("/compras/ingenieria"); }}>
                Eliminar
              </Button>
            )}
            {/* Volver a borrador = sacarlo de la cola de Proveeduría. Solo tiene sentido
                mientras nadie lo haya tocado: con algo ordenado o devuelto, el camino es
                editar las líneas que siguen libres. */}
            {pedido.estado === "aprobado" && !ordenado && !hayLineasDevueltas && (
              <Button variant="outline" onClick={async () => { await setPedidoEstado(pedido.id, "borrador"); toast("Pedido reabierto como borrador"); }}>
                Volver a borrador
              </Button>
            )}
            {/* Editar vale también con el pedido YA enviado: el editor solo ofrece las
                líneas que Proveeduría todavía no ordenó. */}
            {editable && (
              <Button variant="outline" onClick={() => setEditarOpen(true)}>
                {hayLineasDevueltas ? "Corregir línea(s) devuelta(s)" : "Editar"}
              </Button>
            )}
            {!esSub && esBorrador && (
              <Button onClick={async () => { await setPedidoEstado(pedido.id, "aprobado"); toast(`${pedido.numero} enviado a proveeduría`, "success"); }}>
                Enviar a proveeduría
              </Button>
            )}
            {!esBorrador && !editable && (
              <span className="ds-muted ds-label" style={{ alignSelf: "center" }}>
                {esSub
                  ? (ordenSub?.bcNumber
                      ? `La orden ya existe en Business Central (${ordenSub.bcNumber}) · se corrige allá`
                      : "La orden ya se lanzó o se recibió · no editable")
                  : "Proveeduría ya generó orden de compra · no editable"}
              </span>
            )}
          </div>
        </div>

        {hayLineasDevueltas && (
          <Card flat className="mt-2" style={{ background: "color-mix(in srgb, var(--ds-color-red-100) 10%, var(--ds-tint-base))" }}>
            <span className="ds-label ds-muted">Proveeduría devolvió {pedido.lineas.filter((l) => l.devuelta).length} línea(s) para corregir</span>
            <p style={{ margin: "4px 0 0" }}>Revisá el motivo en el historial y corregilas con “Corregir línea(s) devuelta(s)”.</p>
            {/* Una línea devuelta que ADEMÁS quedó metida en una orden no se puede
                corregir acá: la orden la referencia. Sin este aviso el editor se abría
                sin esa línea y no se entendía por qué. */}
            {lineasDevueltasTrabadas.length > 0 && (
              <p className="ds-body-sm" style={{ margin: "6px 0 0" }}>
                <span className="ds-strong">{lineasDevueltasTrabadas.map((l) => l.descripcion).join(", ")}</span>
                {lineasDevueltasTrabadas.length === 1 ? " ya está" : " ya están"} en una orden de compra, así que no
                {lineasDevueltasTrabadas.length === 1 ? " aparece" : " aparecen"} en el editor. Pedile a Proveeduría que
                {lineasDevueltasTrabadas.length === 1 ? " la quite" : " las quite"} de la orden y volvé a intentar.
              </p>
            )}
          </Card>
        )}

        {pedido.notas && (
          <Card flat className="mt-2"><span className="ds-muted ds-label">Notas:</span> {pedido.notas}</Card>
        )}

        {/* SUBCONTRATO: no hay cantidades ni almacén que mostrar — hay ALCANCE y MONTO.
            El servicio se recibe completo, así que la última columna es sí/no. */}
        {esSub ? (
        <Card className="mt-4" style={{ padding: 0, overflow: "hidden" }}>
          <div className="ds-table-wrap" style={{ boxShadow: "none" }}>
            <table className="ds-table ds-table--center-num">
              <thead>
                <tr>
                  <th>Servicio</th><th>Obra</th><th>Actividad</th>
                  <th className="ds-num">Cantidad</th><th className="ds-num">Monto</th><th className="ds-num">Recibido</th>
                </tr>
              </thead>
              <tbody>
                {pedido.lineas.map((l) => {
                  const recibido = recibidoDeLineaPedido(ordenes, l.id) > 0;
                  return (
                    <tr key={l.id}>
                      <td>{l.descripcion}</td>
                      <td className="ds-muted">{obraDeLinea(l, pedido) || pedido.obraCodigo || "—"}</td>
                      <td className="ds-muted">{l.taskNo ? `${l.taskNo}${l.taskDescr ? ` — ${l.taskDescr}` : ""}` : "—"}</td>
                      <td className="ds-num">{num.format(l.cantidad)} {l.unidad}</td>
                      <td className="ds-num ds-strong">{money(montoDeLineaSubcontrato(ordenes, l.id), monedaSub)}</td>
                      <td className="ds-num">{recibido ? <Badge tone="green">Sí</Badge> : <span className="ds-pending-text">Pendiente</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="ds-strong">Total del subcontrato</td>
                  <td className="ds-num ds-strong">{money(totalSub, monedaSub)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
        ) : (
        <Card className="mt-4" style={{ padding: 0, overflow: "hidden" }}>
          <div className="ds-table-wrap" style={{ boxShadow: "none" }}>
            <table className="ds-table ds-table--center-num">
              <thead>
                <tr>
                  <th>Artículo</th>
                  {pedido.tipoSolicitud === "material" && <th>Obra</th>}
                  {conTarea && <th>Actividad</th>}
                  <th>Almacén</th><th className="ds-num">Solicitado</th>
                  <th className="ds-num">En orden</th><th className="ds-num">Recibido</th><th className="ds-num">Por recibir</th>
                </tr>
              </thead>
              <tbody>
                {pedido.lineas.map((l) => {
                  const recibido = recibidoDeLineaPedido(ordenes, l.id);
                  // En una solicitud ARCHIVADA solo falta por llegar lo que ya está en una
                  // orden: lo que nunca se ordenó se dio de baja y no va a llegar nunca
                  // (antes se quedaba en rojo para siempre). Lo solicitado no se toca.
                  const porRecibir = pedidoLineaPorRecibir(l, pedido, recibido);
                  const baja = pedidoLineaDadaDeBaja(l, pedido);
                  return (
                    <tr key={l.id}>
                      <td>
                        <div className="row gap-2" style={{ alignItems: "center" }}>
                          <div className="ds-truncate" style={{ maxWidth: 220 }}>{l.descripcion}</div>
                          {l.devuelta && <Badge tone="red">Devuelta</Badge>}
                          {baja > 0 && <Badge tone="gray" title={`Se archivó la solicitud: ${num.format(baja)} ${l.unidad} nunca se ordenaron y ya no se van a comprar.`}>Ya no se compra</Badge>}
                        </div>
                      </td>
                      {pedido.tipoSolicitud === "material" && <td className="ds-muted">{obraDeLinea(l, pedido) || "—"}</td>}
                      {conTarea && <td className="ds-muted">{l.taskNo ? `${l.taskNo}${l.taskDescr ? ` — ${l.taskDescr}` : ""}` : "—"}</td>}
                      {/* Almacén de destino, igual que lo resuelve Proveeduría al armar la orden:
                          consumo directo → el almacén de la obra (mismo código que el proyecto en
                          BC); si no es consumo directo el material entra al almacén general. */}
                      <td className="ds-muted">{l.almacen || (l.taskNo ? obraDeLinea(l, pedido) : ALMACEN_GENERAL)}</td>
                      <td className="ds-num">{num.format(l.cantidad)} {l.unidad}</td>
                      <td className="ds-num">{num.format(l.cantidadOrdenada)}</td>
                      <td className="ds-num ds-strong">{num.format(recibido)}</td>
                      <td className="ds-num">
                        {porRecibir > 0 ? <span className="ds-pending-text">{num.format(porRecibir)}</span> : <span className="ds-muted">{baja > 0 ? "—" : "0"}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        )}

        {!esSub && pedido.estado === "aprobado" && !ordenado && (
          <p className="ds-muted ds-label mt-4">Este pedido está aprobado. Proveeduría puede convertirlo en una orden de compra.</p>
        )}
        {/* Ya enviado pero todavía corregible: hay que decir qué se puede tocar, porque
            el editor abre solo con las líneas libres y si no se entiende parece que
            "se perdieron" las que ya están en una orden. */}
        {!esSub && editableEnviado && !hayLineasDevueltas && (
          <p className="ds-muted ds-label mt-2">
            {ordenado
              ? <>Proveeduría ya ordenó parte del pedido: esas líneas quedan fijas. Con «Editar» podés corregir {lineasEditables.length === 1 ? "la línea que falta" : `las ${lineasEditables.length} líneas que faltan`}.</>
              : <>Mientras Proveeduría no lo ordene podés corregirlo con «Editar» — sigue en su cola, no hay que volver a enviarlo.</>}
          </p>
        )}
        {esSub && ordenSub && (
          <p className="ds-muted ds-label mt-4">
            {ordenSub.estado === "pendiente_aprobacion"
              ? <>Orden <strong>{numeroOrden(ordenSub)}</strong> pendiente de aprobación. Al aprobarse se crea el pedido de compra en Business Central.</>
              : ordenSub.estado === "rechazado"
                ? <>Orden <strong>{numeroOrden(ordenSub)}</strong> rechazada{ordenSub.motivoRechazo ? `: ${ordenSub.motivoRechazo}` : ""}.</>
                : <>Orden <strong>{numeroOrden(ordenSub)}</strong>. Falta recibir la factura del servicio.</>}
          </p>
        )}
        {esSub && editableEnviado && (
          <p className="ds-muted ds-label mt-2">
            Podés corregirlo con «Editar» (alcance, montos o subcontratista) mientras no se apruebe: al guardar vuelve a quedar pendiente de aprobación.
          </p>
        )}

        <h3 className="ds-subtitle mt-6" style={{ marginBottom: 12 }}>Historial</h3>
        <Card><Timeline entidad="pedido" idEntidad={pedido.id} traza /></Card>
      </main>
    </AppShell>
  );
}
