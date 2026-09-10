"use client";

import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/compras/shell";
import { Badge, Button, Card, EmptyState } from "@/components/compras/ui";
import { IconDelivery } from "@/components/compras/icons";
import { useStore } from "@/lib/compras/store";
import { useSession } from "@/hooks/useSession";
import { codigoDeItem, money, formatDate, num, numeroOrden } from "@/lib/compras/helpers";

// Detalle de UNA factura/recepción: qué se recibió EXACTAMENTE en ese registro
// (líneas, cantidad, precio facturado e importe), distinto del acumulado de la
// orden. Se llega desde "Recibidas" (bodega) y desde "Archivo" (contabilidad).
// Al pie salen las OTRAS facturas de la misma orden: una orden que llegó en tres
// viajes tiene tres facturas, y hay que poder pasar de una a otra.
export default function RecepcionDetallePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { recepciones, ordenes, proveedores, cargando } = useStore();
  const me = useSession();

  // Igual que en el detalle de orden: quien solo RECIBE no tiene las pestañas de
  // contabilidad, y se le devuelve a "Recibidas" (archivo es de contabilidad).
  const mods = me?.modules ?? [];
  const soloRecepcion = mods.includes("recepcion") && !mods.includes("ingenieria") && !mods.includes("admin");
  const shellRole = soloRecepcion ? "facturacion" : "contabilidad";
  const volverHref = soloRecepcion ? "/compras/facturacion/recibidas" : "/compras/facturacion/archivo";
  const volverLabel = soloRecepcion ? "Volver a recibidas" : "Volver a archivo y recepciones";

  const rec = recepciones.find((r) => r.id === id);
  if (!rec) {
    return (
      <AppShell role={shellRole}>
        <main className="page">
          <div className="back-link" onClick={() => router.push(volverHref)}>{volverLabel}</div>
          <Card className="mt-4"><EmptyState icon={<IconDelivery size={24} />}
            title={cargando ? "Cargando factura…" : "Factura no encontrada."}
            hint={cargando ? undefined : <>Puede que se haya eliminado, o que el enlace sea de otra base.</>} /></Card>
        </main>
      </AppShell>
    );
  }
  const orden = ordenes.find((o) => o.id === rec.ordenId);
  const provNombre = orden?.proveedorNombre ?? proveedores.find((p) => p.id === orden?.proveedorId)?.nombre;
  const cur = orden?.currencyCode;
  const enRevision = !!rec.facturaEnRevision || !rec.numeroFactura;

  // Todas las facturas de esta orden, en el orden en que se recibieron.
  const hermanas = [...recepciones.filter((r) => r.ordenId === rec.ordenId)]
    .sort((a, b) => (a.fechaRecepcion || "").localeCompare(b.fechaRecepcion || ""));
  const puesto = hermanas.findIndex((r) => r.id === rec.id) + 1;

  // Resuelve cada línea de la recepción contra su línea de orden.
  const filas = rec.lineas.map((rl) => {
    const ol = orden?.lineas.find((l) => l.id === rl.ordenLineaId);
    const precio = rl.precioFactura ?? ol?.precioUnitario ?? 0;
    const desc = ol?.descuentoPct ?? 0;
    const importe = rl.cantidadRecibida * precio * (1 - desc / 100);
    // El precio de la factura puede no ser el de la orden (ahí sale la nota de
    // crédito): se marca, porque es lo primero que se revisa al reclamar.
    const distinto = ol != null && rl.precioFactura != null && rl.precioFactura !== ol.precioUnitario;
    const esCargo = ol?.tipo === "cargo";
    return { rl, ol, precio, importe, distinto, esCargo };
  });
  const unidades = rec.lineas.reduce((s, l) => s + (Number(l.cantidadRecibida) || 0), 0);

  return (
    <AppShell role={shellRole}>
      <main className="page page--wide">
        <div className="back-link" onClick={() => router.push(volverHref)}>{volverLabel}</div>
        <div className="page__head">
          <div className="page__title">
            <div className="row gap-3 wrap">
              <h1 className="ds-heading">{enRevision ? "Recepción sin factura" : `Factura ${rec.numeroFactura}`}</h1>
              {enRevision ? <Badge tone="yellow">Factura en revisión</Badge>
                : (rec.parcial ? <Badge tone="yellow">Entrega parcial</Badge> : <Badge tone="green">Entrega completa</Badge>)}
              {hermanas.length > 1 && <Badge tone="gray">Factura {puesto} de {hermanas.length} de la orden</Badge>}
            </div>
            <p className="ds-muted">
              {provNombre ?? "—"}
              {orden && <> · orden <button type="button" className="link-btn" onClick={() => router.push(`/compras/facturacion/ver/${orden.id}`)}>{numeroOrden(orden)}</button></>}
            </p>
            <div className="row gap-4 wrap mt-2 ds-body-sm ds-muted">
              <span>Recibido en bodega: <span className="ds-strong">{formatDate(rec.fechaRecepcion)}</span></span>
              {!enRevision && <span>Fecha factura: <span className="ds-strong">{formatDate(rec.fechaFactura)}</span></span>}
              {!enRevision && <span>Registro contable: <span className="ds-strong">{formatDate(rec.fechaRegistro)}</span></span>}
              <span>Recibido por: <span className="ds-strong">{rec.recibidoPor || "—"}</span></span>
            </div>
          </div>
        </div>

        {/* Las líneas de ESTA factura, en tarjetas (bodega lo abre en la tablet
            para cotejar contra el papel del proveedor). */}
        <Card className="mt-4">
          <div className="recv-head">
            <span className="ds-label ds-muted">{filas.length} línea(s) en esta factura · {num.format(unidades)} und</span>
          </div>
          <div className="recv-list">
            {filas.length === 0 && (
              <div className="ds-body-sm ds-muted" style={{ padding: "6px 2px" }}>Esta factura no tiene líneas.</div>
            )}
            {filas.map((f) => (
              <div key={f.rl.ordenLineaId} className={`recv-card ${f.distinto ? "is-nc" : "is-full"}`}>
                <div className="recv-card__row">
                  <div className="recv-card__name">
                    {f.esCargo && <Badge tone="yellow">Cargo</Badge>} {f.ol?.descripcion ?? (f.esCargo ? "Flete / transporte" : "—")}
                    {codigoDeItem(f.ol?.articuloId) && <div className="recv-card__code">{codigoDeItem(f.ol?.articuloId)}</div>}
                    {(() => {
                      const meta = [f.ol?.pedidoNumero, f.ol?.almacen, f.ol?.proyecto && `Proy. ${f.ol.proyecto}`,
                        f.ol?.taskNo && `Tarea ${f.ol.taskNo}`, f.ol?.descuentoPct ? `−${f.ol.descuentoPct}%` : null]
                        .filter(Boolean).join(" · ");
                      return meta ? <div className="recv-card__code">{meta}</div> : null;
                    })()}
                  </div>
                </div>
                <div className="recv-card__row2">
                  <div className="recv-card__money">
                    <span className="recv-card__linetot">{money(f.importe, cur)}</span>
                    <span className="recv-card__price">
                      {num.format(f.rl.cantidadRecibida)}{f.ol?.unidad ? ` ${f.ol.unidad}` : ""} × <b>{money(f.precio, cur)}</b> c/u
                      {f.ol?.descuentoPct ? ` · −${f.ol.descuentoPct}%` : ""}
                    </span>
                    {f.distinto && (
                      <span className="ds-body-sm ds-pending-text">
                        La orden decía {money(f.ol!.precioUnitario, cur)} c/u
                      </span>
                    )}
                  </div>
                  <span className="qty-pill" title="Cantidad recibida en esta factura">
                    {num.format(f.rl.cantidadRecibida)}
                    {f.ol?.unidad && <span className="qty-pill__unit">{f.ol.unidad}</span>}
                  </span>
                </div>
                {/* Cuánto de la línea trajo ESTA factura sobre lo que pidió la orden. */}
                {f.ol && f.ol.cantidad > 0 && !f.esCargo && (
                  <div className="recv-prog">
                    <div className="recv-prog__bar" role="img"
                      aria-label={`Esta factura trajo ${num.format(f.rl.cantidadRecibida)} de ${num.format(f.ol.cantidad)}`}>
                      <span className="recv-prog__seg recv-prog__seg--done"
                        style={{ width: `${Math.min(100, (f.rl.cantidadRecibida / f.ol.cantidad) * 100)}%` }} />
                    </div>
                    <span className="recv-prog__lbl">
                      Esta factura trajo {num.format(f.rl.cantidadRecibida)} de {num.format(f.ol.cantidad)} {f.ol.unidad ?? ""} de la orden
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        <div className="row mt-6" style={{ justifyContent: "flex-end" }}>
          <div className="totals" style={{ minWidth: 320 }}>
            <div className="totals__row totals__row--grand" style={{ gridColumn: "1 / -1" }}>
              <span>{enRevision ? "Total estimado" : "Total de esta factura"}</span><span>{money(rec.total, cur)}</span>
            </div>
          </div>
        </div>

        {/* Las otras facturas de la MISMA orden: es la pregunta de "esta orden en
            cuántas facturas llegó y qué trajo cada una". */}
        {hermanas.length > 1 && (
          <>
            <h3 className="ds-subtitle mt-6" style={{ marginBottom: 12 }}>
              Las {hermanas.length} facturas de la orden {orden ? numeroOrden(orden) : ""}
            </h3>
            <div className="col gap-2">
              {hermanas.map((h, i) => {
                const esta = h.id === rec.id;
                const hRev = !!h.facturaEnRevision || !h.numeroFactura;
                return (
                  <Card key={h.id} className="rec-card" interactive={!esta}
                    onClick={esta ? undefined : () => router.push(`/compras/facturacion/recepcion/${h.id}`)}
                    style={esta ? { borderColor: "var(--ds-color-green-100)" } : undefined}>
                    <div className="row row--between wrap gap-3" style={{ alignItems: "center" }}>
                      <div className="col" style={{ gap: 2, minWidth: 0 }}>
                        <span className="ds-strong">
                          {i + 1}. {hRev ? "Sin factura (en revisión)" : `Factura ${h.numeroFactura}`}
                          {esta && <span className="ds-body-sm ds-muted" style={{ fontWeight: 400 }}> · la que estás viendo</span>}
                        </span>
                        <span className="ds-body-sm ds-muted">
                          Recibida {formatDate(h.fechaRecepcion)} · {h.lineas.length} línea(s)
                          {h.recibidoPor ? ` · ${h.recibidoPor}` : ""}
                        </span>
                      </div>
                      <div className="row gap-3" style={{ alignItems: "center" }}>
                        <span className="ds-strong" style={{ whiteSpace: "nowrap" }}>{money(h.total, cur)}</span>
                        {hRev ? <Badge tone="yellow">En revisión</Badge>
                          : (h.parcial ? <Badge tone="yellow">Parcial</Badge> : <Badge tone="green">Completa</Badge>)}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {orden && (
          <div className="row mt-6" style={{ justifyContent: "flex-start" }}>
            <Button variant="outline" onClick={() => router.push(`/compras/facturacion/ver/${orden.id}`)}>
              Ver la orden {numeroOrden(orden)} completa
            </Button>
          </div>
        )}
      </main>
    </AppShell>
  );
}
