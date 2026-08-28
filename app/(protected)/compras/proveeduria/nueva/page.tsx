"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/compras/shell";
import { Badge, Button, Card, Field, Input, Modal, Select, useToast } from "@/components/compras/ui";
import { Combobox } from "@/components/compras/combobox";
import { useStore } from "@/lib/compras/store";
import { money, numeroOrden, ultimoPrecioProveedor, almacenesFisicos, pedidoLineaPendiente, precioEnUnidad, mismaMoneda, ALMACEN_GENERAL, obraDeLinea, destinoDeLinea, type UnidadItem } from "@/lib/compras/helpers";
import type { OrdenLinea } from "@/lib/compras/types";
import { coincideBusqueda } from "@/lib/utilidades/buscar";

interface Row {
  pedidoNumero: string;
  pedidoLineaId: string;
  articuloId: string;
  variantCode: string;
  descripcion: string;
  unidad: string;
  almacen: string;
  cantidad: string;
  precio: string;
  iva: string;
  descuento: string;
  proyecto: string;
  tarea: string;
}

// Cargo de producto (Item Charge) a agregar a la orden: tipo (chargeNo del catálogo
// BC), cantidad y precio. chargeNo "" = flete por defecto.
interface Cargo { chargeNo: string; descripcion: string; cantidad: string; precio: string; }

export default function ArmarOrdenPage() {
  const { pedidos, proveedores, ordenes, almacenes, borrador, createOrden, setOrdenEstado, setBorrador } = useStore();
  const router = useRouter();
  const toast = useToast();

  const [proveedorId, setProveedorId] = useState("");
  const [currency, setCurrency] = useState("");
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [metodoAsig, setMetodoAsig] = useState("Amount"); // Amount|Weight|Volume|Equally
  const [itemCharges, setItemCharges] = useState<{ no: string; descripcion: string }[]>([]);
  const [almacen, setAlmacen] = useState("ALM-GRAL");

  // Proveedores en vivo desde Business Central (fallback al catálogo si BC falla).
  const [bcProv, setBcProv] = useState<typeof proveedores | null>(null);
  useEffect(() => {
    fetch("/api/compras/bc/vendors")
      .then((r) => (r.ok ? r.json() : { proveedores: [] }))
      .then((d) => { if (Array.isArray(d.proveedores) && d.proveedores.length) setBcProv(d.proveedores); })
      .catch(() => { /* sin BC, usa catálogo de respaldo */ });
  }, []);
  const catProv = bcProv ?? proveedores;
  const provSel = catProv.find((x) => x.id === proveedorId);

  // Catálogo de Cargos de producto (Item Charge) de BC para el selector de cargos.
  useEffect(() => {
    fetch("/api/compras/bc/itemcharges")
      .then((r) => (r.ok ? r.json() : { itemCharges: [] }))
      .then((d) => { if (Array.isArray(d.itemCharges)) setItemCharges(d.itemCharges); })
      .catch(() => { /* sin BC: el selector cae a "Flete / transporte" */ });
  }, []);
  const addCargo = () => setCargos((cs) => [...cs, { chargeNo: "", descripcion: "FLETE / TRANSPORTE", cantidad: "1", precio: "" }]);
  const setCargo = (i: number, patch: Partial<Cargo>) => setCargos((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const removeCargo = (i: number) => setCargos((cs) => cs.filter((_, idx) => idx !== i));
  const onTipoCargo = (i: number, chargeNo: string) => {
    const ic = itemCharges.find((x) => x.no === chargeNo);
    setCargo(i, { chargeNo, descripcion: ic ? ic.descripcion : "FLETE / TRANSPORTE" });
  };
  const cargoImporte = (c: Cargo) => (Number(c.cantidad) || 0) * (Number(c.precio) || 0);

  // Catálogo de items de BC para agregar líneas manualmente a la orden.
  const [itemsBc, setItemsBc] = useState<{ code: string; descripcion: string; unidad: string; precioUltimo?: number }[]>([]);
  // Almacenes reales de BC (fallback al catálogo seed si BC no responde).
  const [bcAlm, setBcAlm] = useState<typeof almacenes | null>(null);
  useEffect(() => {
    fetch("/api/compras/bc/items")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => { if (Array.isArray(d.items)) setItemsBc(d.items.map((i: any) => ({ code: i.code, descripcion: i.descripcion, unidad: i.unidad || "UND", precioUltimo: typeof i.lastDirectCost === "number" ? i.lastDirectCost : undefined }))); })
      .catch(() => { /* sin BC */ });
    fetch("/api/compras/bc/almacenes")
      .then((r) => (r.ok ? r.json() : { almacenes: [] }))
      .then((d) => {
        if (Array.isArray(d.almacenes) && d.almacenes.length) {
          setBcAlm(d.almacenes);
          if (!d.almacenes.some((a: any) => a.codigo === "ALM-GRAL")) setAlmacen(d.almacenes[0].codigo);
        }
      })
      .catch(() => { /* sin BC, usa seed */ });
  }, []);
  const catAlm = almacenesFisicos(bcAlm ?? almacenes);

  const [rows, setRows] = useState<Row[]>(() =>
    borrador.map((b) => {
      let info = { pedidoNumero: "", articuloId: "", variantCode: "", descripcion: "", unidad: "", almacen: "", proyecto: "", tarea: "" };
      for (const p of pedidos) {
        const l = p.lineas.find((x) => x.id === b.pedidoLineaId);
        // Consumo directo = la línea trae TAREA: va contra proyecto (obra) + tarea.
        // Si no, la línea entra a inventario del ALMACÉN que eligió ingeniería (tag
        // ALM / pedido de Stock); si no trae almacén (pedido viejo, donde `almacen`
        // era la obra), cae al Almacén General — nunca al almacén de la obra.
        if (l) {
          const consumo = p.tipoSolicitud === "material" && !!l.taskNo;
          info = { pedidoNumero: p.numero, articuloId: l.articuloId, variantCode: l.variantCode ?? "", descripcion: l.descripcion, unidad: l.unidad,
            // Un ACTIVO FIJO no lleva almacén (no entra a inventario): no cae al General.
            almacen: p.tipoSolicitud === "activo" ? "" : consumo ? obraDeLinea(l, p) : (l.almacen || ALMACEN_GENERAL),
            proyecto: consumo ? obraDeLinea(l, p) : "", tarea: l.taskNo ?? "" };
          break;
        }
      }
      return {
        pedidoLineaId: b.pedidoLineaId, ...info,
        cantidad: String(b.cantidad), precio: String(b.precio), iva: String(b.iva), descuento: "0",
      };
    })
  );

  useEffect(() => { if (borrador.length === 0) router.replace("/compras/proveeduria"); }, [borrador, router]);

  // Último precio de compra por BC: con proveedor trae el precio FACTURADO a ese
  // proveedor; SIN proveedor cae al último costo directo del item. Así el precio
  // del material aparece aunque todavía no se haya elegido proveedor.
  // El precio de BC viene CON la unidad a la que corresponde: el mismo artículo puede
  // valer ¢0,77 el gramo y ¢197.543 el estañón, y la línea puede ir en cualquiera de
  // las dos. Sin la unidad, el número no se puede usar.
  const [bcPrices, setBcPrices] = useState<Record<string, { precio: number; unidad: string } | null>>({});
  // Unidades (con su factor) de los artículos de la orden, para convertir el precio a
  // la unidad de CADA línea. Un artículo de una sola unidad no necesita nada.
  const [uomPorItem, setUomPorItem] = useState<Record<string, UnidadItem[]>>({});
  const itemIdsKey = [...new Set(rows.map((r) => r.articuloId).filter(Boolean))].sort().join(",");
  useEffect(() => {
    const code = provSel?.code ?? "";
    const items = itemIdsKey ? itemIdsKey.split(",") : [];
    if (!items.length) { setBcPrices({}); return; }
    let cancel = false;
    Promise.all(items.map(async (it) => {
      try {
        // OJO: la ruta es /api/compras/bc/lastprice. Estuvo apuntando a /api/bc/lastprice
        // —que no existe— así que el precio sugerido de BC nunca llegaba y el 404 se
        // tragaba en el catch: proveeduría veía solo el costo del catálogo.
        const r = await fetch(`/api/compras/bc/lastprice?item=${encodeURIComponent(it)}&vendor=${encodeURIComponent(code)}`);
        const d = await r.json();
        const val = typeof d.precio === "number" && d.precio > 0 && d.unidad ? { precio: d.precio, unidad: String(d.unidad) } : null;
        return [it, val] as const;
      } catch { return [it, null] as const; }
    })).then((pairs) => { if (!cancel) setBcPrices(Object.fromEntries(pairs)); });
    return () => { cancel = true; };
  }, [proveedorId, itemIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const items = itemIdsKey ? itemIdsKey.split(",") : [];
    // Sin líneas no hay nada que pedir; las unidades ya cacheadas se dejan estar (van
    // por artículo, no estorban).
    if (!items.length) return;
    let cancel = false;
    fetch(`/api/compras/bc/unidades?items=${encodeURIComponent(items.join(","))}`)
      .then((r) => (r.ok ? r.json() : { porItem: {} }))
      .then((d) => { if (!cancel) setUomPorItem((d?.porItem ?? {}) as Record<string, UnidadItem[]>); })
      .catch(() => { /* sin unidades: no se convierte ningún precio */ });
    return () => { cancel = true; };
  }, [itemIdsKey]);

  const setRow = (id: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.pedidoLineaId === id ? { ...r, ...patch } : r)));
  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.pedidoLineaId !== id));

  // Agregar líneas de OTRAS solicitudes ya hechas (pendientes por ordenar) a la
  // orden que se está armando, sin salir de la página.
  const [addOpen, setAddOpen] = useState(false);
  const [addF, setAddF] = useState({ pedido: "", articulo: "", destino: "" });
  const yaEnOrden = new Set(rows.map((r) => r.pedidoLineaId));
  const lineasDisponibles = pedidos
    .filter((p) => p.estado === "aprobado" || p.estado === "en_orden")
    .flatMap((p) => p.lineas
      .filter((l) => pedidoLineaPendiente(l) > 0 && !yaEnOrden.has(l.id))
      .map((l) => ({ p, l, pend: pedidoLineaPendiente(l) })));
  const inc = (v: string, q: string) => !q || coincideBusqueda(v, q);
  const lineasDispFiltradas = lineasDisponibles.filter(({ p, l }) =>
    inc(p.numero, addF.pedido) && inc(l.descripcion, addF.articulo) && inc(destinoDeLinea(l, p), addF.destino));
  function agregarDeSolicitud(p: (typeof pedidos)[number], l: (typeof pedidos)[number]["lineas"][number], pend: number) {
    // Precio inicial = último precio de compra real (BC); si no hay historial, 0
    // para que proveeduría escriba lo acordado con el proveedor.
    // El precio se propone YA en la unidad de la línea (ver precioSugerido).
    const hist = precioSugerido(l.articuloId, l.unidad) ?? 0;
    setRows((rs) => [...rs, {
      pedidoNumero: p.numero, pedidoLineaId: l.id, articuloId: l.articuloId, variantCode: l.variantCode ?? "",
      descripcion: l.descripcion, unidad: l.unidad,
      // Mismo criterio que arriba: con tarea → proyecto + tarea (almacén de la obra);
      // sin tarea → el almacén elegido en el pedido, o el General si no trae.
      almacen: p.tipoSolicitud === "activo" ? "" : p.tipoSolicitud === "material" && l.taskNo ? obraDeLinea(l, p) : (l.almacen || ALMACEN_GENERAL),
      cantidad: String(pend), precio: String(hist || 0), iva: "13", descuento: "0",
      proyecto: p.tipoSolicitud === "material" && l.taskNo ? obraDeLinea(l, p) : "", tarea: l.taskNo ?? "",
    }]);
  }

  const calcImporte = (r: Row) => Number(r.cantidad) * Number(r.precio) * (1 - (Number(r.descuento) || 0) / 100);
  const subtotal = rows.reduce((s, r) => s + calcImporte(r), 0);
  const cargosTotal = cargos.reduce((s, c) => s + cargoImporte(c), 0);
  // Reparto de cargos por línea según el método. Peso/Volumen NO se previsualizan
  // (no hay peso/volumen en la app; lo calcula BC al registrar).
  const previewReparto = metodoAsig === "Amount" || metodoAsig === "Equally";
  const fleteShare = (r: Row) => {
    if (cargosTotal <= 0) return 0;
    if (metodoAsig === "Equally") return rows.length ? cargosTotal / rows.length : 0;
    if (metodoAsig === "Amount") return subtotal > 0 ? cargosTotal * calcImporte(r) / subtotal : 0;
    return 0; // Weight / Volume → se calcula en BC
  };
  /** Último precio conocido, YA CONVERTIDO a la unidad de la línea. Cada fuente trae
   *  su propia unidad: BC factura por la unidad del documento, el costo del catálogo es
   *  SIEMPRE por unidad base, y el historial de la app es por la unidad de esa orden.
   *  Si no se puede convertir (no se sabe el factor), devuelve null: mejor "sin
   *  historial" que un precio en la unidad equivocada. */
  const precioSugerido = (articuloId: string, unidad: string): number | null => {
    const unidades = uomPorItem[articuloId] ?? [];
    const it = itemsBc.find((x) => x.code === articuloId);
    // Los precios que trae BC (última compra y costo de la ficha) están en COLONES.
    // Si la orden va en otra moneda no se propone nada: convertir moneda es otro
    // problema, y poner ¢442.434 en una orden en dólares es peor que no poner nada.
    // (La orden CP-000032 de este mismo artículo está en USD: $969,91 el estañón.)
    const enColones = mismaMoneda(currency, "CRC");
    // Las líneas viejas pueden no traer unidad (antes no se elegía): valen como si
    // fueran la base del artículo, que es lo que eran. Sin esto se quedarían sin
    // precio sugerido.
    const destino = (unidad || it?.unidad || "").trim();
    const bc = bcPrices[articuloId];
    if (enColones && bc) return precioEnUnidad(bc.precio, bc.unidad, destino, unidades);
    // El costo del catálogo (items.unitCost de BC) es por unidad BASE del artículo.
    if (enColones && it?.precioUltimo && it.unidad) return precioEnUnidad(it.precioUltimo, it.unidad, destino, unidades);
    // El historial de la app sí está en la moneda de SU orden: sirve si es la misma.
    // Si esa orden vieja no guardó unidad, se asume la misma de la línea.
    const hist = proveedorId ? ultimoPrecioProveedor(ordenes, articuloId, proveedorId) : null;
    if (hist && !mismaMoneda(hist.moneda, currency)) return null;
    return hist ? precioEnUnidad(hist.precio, hist.unidad || destino, destino, unidades) : null;
  };
  const lastPrice = (r: Row): number | null => precioSugerido(r.articuloId, r.unidad);
  // Prellenar el precio con el ÚLTIMO precio mostrado (que incluye el historial de
  // órdenes de la app al mismo proveedor), para las líneas que sigan en 0. Antes
  // solo se prellenaba desde BC/catálogo; si el ítem nunca se compró en BC (solo se
  // cotizó en la app), quedaba en 0 aunque el hint "últ. ₡…" sí lo mostraba.
  useEffect(() => {
    setRows((rs) => rs.map((r) => {
      if (Number(r.precio) > 0) return r;
      const lp = lastPrice(r);
      if (!(typeof lp === "number" && lp > 0)) return r;
      sugeridos.current.add(r.pedidoLineaId);   // lo puso la app, no la persona
      return { ...r, precio: String(lp) };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bcPrices, itemsBc, proveedorId, ordenes, uomPorItem]);
  // El IVA se aplica a los materiales Y al flete/cargo (13%), igual que en BC. Antes
  // el cargo quedaba sin IVA y el total no cuadraba con BC (faltaba el 13% del flete).
  const ivaCargos = cargosTotal * 0.13;
  const ivaTotal = rows.reduce((s, r) => s + calcImporte(r) * ((Number(r.iva) || 0) / 100), 0) + ivaCargos;
  const total = subtotal + cargosTotal + ivaTotal;
  const pedidosDistintos = [...new Set(rows.map((r) => r.pedidoNumero))];
  const puedeCrear = !!proveedorId && rows.length > 0;

  function elegirProveedor(id: string) {
    setProveedorId(id);
    const p = catProv.find((x) => x.id === id);
    const nueva = p?.currencyCode ?? "";
    // Cambiar de moneda invalida los precios que se habían propuesto: ¢442.434 no son
    // $442.434 (~456x). Se limpian los que puso la app —los sugeridos— para que el
    // prellenado vuelva a correr con la moneda nueva, o queden en 0 para teclearlos.
    if (!mismaMoneda(nueva, currency)) {
      setRows((rs) => rs.map((r) => (sugeridos.current.has(r.pedidoLineaId) ? { ...r, precio: "0" } : r)));
    }
    if (p) setCurrency(nueva);
  }

  // Líneas cuyo precio lo propuso la app (no lo tecleó el comprador): son las que se
  // pueden limpiar si cambia la moneda de la orden.
  const sugeridos = useRef<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);

  // "Guardar como abierta": solo registra la orden local como borrador/abierta.
  async function crear(aprobar: boolean) {
    if (!puedeCrear) { toast("Seleccioná un proveedor.", "error"); return; }
    // Todo cargo con importe debe tener un TIPO válido (Item Charge de BC). Sin tipo,
    // BC rechaza el cargo (404) y la orden queda lanzada SIN el flete. Se bloquea acá.
    if (cargos.some((c) => cargoImporte(c) > 0 && !c.chargeNo)) {
      toast("Elegí el tipo de cargo (transporte) antes de continuar. Sin tipo, BC no acepta el flete.", "error"); return;
    }
    // Precio obligatorio para enviar a aprobación: ninguna línea puede ir a BC en 0.
    if (aprobar) {
      const sinPrecio = rows.filter((r) => !(Number(r.precio) > 0)).length;
      if (sinPrecio) { toast(`${sinPrecio} línea(s) sin precio. Poné el precio acordado antes de enviar a aprobación.`, "error"); return; }
    }
    setGuardando(true);
    try {
    const ls: Omit<OrdenLinea, "id" | "cantidadRecibida" | "cantidadFacturada">[] = rows.map((r) => ({
      tipo: "articulo", articuloId: r.articuloId, variantCode: r.variantCode || undefined, pedidoLineaId: r.pedidoLineaId, pedidoNumero: r.pedidoNumero,
      descripcion: r.descripcion, cantidad: Number(r.cantidad), unidad: r.unidad, almacen: r.almacen,
      precioUnitario: Number(r.precio), ivaPct: Number(r.iva) || 0, descuentoPct: Number(r.descuento) || 0,
      proyecto: r.proyecto || undefined, taskNo: r.tarea || undefined,
    }));
    for (const c of cargos) {
      if (cargoImporte(c) <= 0) continue;
      ls.push({ tipo: "cargo", chargeNo: c.chargeNo || undefined, chargeMethod: metodoAsig, descripcion: c.descripcion || "CARGO",
        cantidad: Number(c.cantidad) || 1, unidad: "UND", almacen: rows[0].almacen,
        precioUnitario: Number(c.precio) || 0, ivaPct: 13 });
    }
    const orden = await createOrden({ proveedorId, proveedorNo: provSel?.code, proveedorNombre: provSel?.nombre, currencyCode: currency, almacenRecepcion: almacen, lineas: ls });
    if (aprobar) await setOrdenEstado(orden.id, "pendiente_aprobacion");
    setBorrador([]);
    toast(`Orden ${numeroOrden(orden)} ${aprobar ? "enviada a aprobación" : "guardada como abierta"}`, "success");
    router.push(`/compras/proveeduria/ordenes/${orden.id}`);
    } catch (e: any) {
      toast(String(e?.message ?? e), "error");
      setGuardando(false);
    }
  }

  return (
    <AppShell role="proveeduria">
      <main className="page page--wide" style={{ paddingBottom: 120 }}>
        <div className="back-link" onClick={() => router.push("/compras/proveeduria")}>Volver a materiales</div>
        <div className="page__head">
          <div className="page__title">
            <h1 className="ds-heading">Armar orden de compra</h1>
            <p className="ds-muted">Revisá y ajustá lo que se va a enviar al proveedor.</p>
          </div>
        </div>

        <Card>
          <h3 className="ds-subtitle" style={{ marginBottom: 16 }}>Datos de la orden</h3>
          <div className="grid-3">
            <Field label="Proveedor" help="Hereda términos y moneda">
              <Combobox items={catProv} value={proveedorId} onChange={(k) => elegirProveedor(k)}
                getKey={(p) => p.id} getLabel={(p) => `${p.code} — ${p.nombre}`}
                getSearch={(p) => `${p.code} ${p.nombre}`} placeholder="Buscar proveedor…" />
            </Field>
            <Field label="Moneda">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="">CRC (colones)</option>
                <option value="USD">USD (dólares)</option>
              </Select>
            </Field>
            <Field label="Almacén de recepción" help="Dónde entra el material en BC (por defecto el General)">
              <Select value={almacen} onChange={(e) => setAlmacen(e.target.value)}>
                {catAlm.map((a) => <option key={a.codigo} value={a.codigo}>{a.codigo} — {a.nombre}</option>)}
              </Select>
            </Field>
          </div>
          <div className="row gap-2 wrap mt-4">
            <span className="ds-muted ds-label">Solicitudes en esta orden:</span>
            {pedidosDistintos.map((n) => <Badge key={n} tone="gray">{n}</Badge>)}
          </div>
        </Card>

        {/* Cargos de producto (Item Charge): Transporte, Seguro, etc. Se distribuyen
            por importe entre los artículos al registrar en BC. */}
        <Card className="mt-4">
          <div className="row row--between wrap gap-3" style={{ alignItems: "center", marginBottom: cargos.length ? 12 : 0 }}>
            <div className="col" style={{ gap: 2 }}>
              <span className="ds-subtitle">Cargos de producto</span>
              <span className="ds-muted ds-body-sm">Transporte, seguro, etc. Se reparten entre los artículos según el método elegido.</span>
            </div>
            <div className="row gap-3 wrap" style={{ alignItems: "flex-end" }}>
              {cargos.length > 0 && (
                <div>
                  <span className="ds-label ds-muted" style={{ display: "block", marginBottom: 4 }}>Método de asignación</span>
                  <Select value={metodoAsig} onChange={(e) => setMetodoAsig(e.target.value)}>
                    <option value="Amount">Por importe</option>
                    <option value="Equally">Igualmente</option>
                    <option value="Weight">Por peso</option>
                    <option value="Volume">Por volumen</option>
                  </Select>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={addCargo}>+ Agregar cargo</Button>
            </div>
          </div>
          {/* Filas (no tabla): así el desplegable de Tipo no lo recorta el overflow. */}
          {cargos.map((c, i) => (
            <div key={i} className="row gap-3 wrap" style={{ alignItems: "flex-end", padding: "12px 0", borderTop: "1.5px solid var(--ds-color-gray-100)" }}>
              <div style={{ flex: "1 1 240px", minWidth: 200 }}>
                <span className="ds-label ds-muted" style={{ display: "block", marginBottom: 4 }}>Tipo de cargo</span>
                <Select value={c.chargeNo} onChange={(e) => onTipoCargo(i, e.target.value)}>
                  <option value="">Flete / transporte</option>
                  {itemCharges.map((ic) => <option key={ic.no} value={ic.no}>{ic.no} · {ic.descripcion}</option>)}
                </Select>
              </div>
              <div>
                <span className="ds-label ds-muted" style={{ display: "block", marginBottom: 4 }}>Cantidad</span>
                <Input type="number" min={0} value={c.cantidad} style={{ width: 96 }} onChange={(e) => setCargo(i, { cantidad: e.target.value })} />
              </div>
              <div>
                <span className="ds-label ds-muted" style={{ display: "block", marginBottom: 4 }}>Precio</span>
                <Input type="number" min={0} value={c.precio} placeholder="0" style={{ width: 130 }} onChange={(e) => setCargo(i, { precio: e.target.value })} />
              </div>
              <div style={{ minWidth: 110, textAlign: "right" }}>
                <span className="ds-label ds-muted" style={{ display: "block", marginBottom: 4 }}>Importe</span>
                <span className="ds-strong">{money(cargoImporte(c) || 0, currency)}</span>
              </div>
              <button type="button" className="icon-btn icon-btn--quitar" title="Quitar cargo" style={{ marginBottom: 2 }} onClick={() => removeCargo(i)}>×</button>
            </div>
          ))}
        </Card>

        <Card className="mt-4" style={{ padding: 0, overflow: "hidden" }}>
          {/* En una OC armada desde solicitudes SOLO se agregan líneas que alguien ya
              pidió. Material sin solicitud (limpieza, etc.) va por Compra directa. */}
          <div className="row row--between wrap gap-3" style={{ alignItems: "center", padding: "12px 16px", borderBottom: "1.5px solid var(--ds-color-gray-100)", background: "color-mix(in srgb, var(--ds-color-green-100) 6%, var(--ds-tint-base))" }}>
            <div className="col" style={{ gap: 2 }}>
              <span className="ds-strong ds-body-sm">Líneas de la orden</span>
              <span className="ds-muted ds-body-sm">Solo materiales de solicitudes ya hechas. ¿Material sin solicitud? Usá <span className="ds-strong">Compra directa</span>.</span>
            </div>
            <Button onClick={() => setAddOpen(true)} disabled={lineasDisponibles.length === 0} title="Sumar líneas pendientes de solicitudes ya hechas">+ De solicitudes{lineasDisponibles.length ? ` (${lineasDisponibles.length})` : ""}</Button>
          </div>
          <div className="ds-table-wrap" style={{ boxShadow: "none" }}>
            <table className="ds-table">
              <thead>
                <tr>
                  <th>Pedido</th><th>Artículo</th><th>Obra</th>
                  <th className="ds-num">Cantidad</th><th className="ds-num">Precio unitario</th><th className="ds-num">Desc%</th><th className="ds-num">IVA%</th>
                  <th className="ds-num">Importe</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.pedidoLineaId}>
                    <td className="ds-body-sm ds-strong">{r.pedidoNumero}</td>
                    <td><div className="ds-truncate" title={`${r.articuloId} — ${r.descripcion}`} style={{ maxWidth: 260 }}><span className="ds-strong ds-body-sm">{r.articuloId}</span> <span className="ds-muted">— {r.descripcion}</span></div></td>
                    <td className="ds-muted ds-body-sm">{r.almacen}</td>
                    <td className="ds-num">
                      <span className="row gap-1" style={{ alignItems: "center", justifyContent: "flex-end" }}>
                        <input className="ds-cell-input" type="number" min={0} value={r.cantidad} style={{ width: 70 }} onChange={(e) => setRow(r.pedidoLineaId, { cantidad: e.target.value })} />
                        {/* La unidad de la línea: la eligió ingeniería y es la que se le
                            pide al proveedor. Sin verla, "2" y "0,77" no dicen nada. */}
                        {r.unidad && <span className="ds-muted ds-label" style={{ minWidth: 24 }}>{r.unidad}</span>}
                      </span>
                    </td>
                    <td className="ds-num">
                      <input className="ds-cell-input" type="number" min={0} value={r.precio} style={{ width: 92 }} onChange={(e) => setRow(r.pedidoLineaId, { precio: e.target.value })} />
                      {(() => {
                        const lp = lastPrice(r);
                        if (lp == null) {
                          // null también es "hay precio pero no se puede usar acá": en otra
                          // moneda, o en una unidad que no se puede convertir. Se dice cuál
                          // es, sin meterlo en el campo — antes que proponer un número que
                          // está bien en otra unidad o en otra moneda.
                          const bc = bcPrices[r.articuloId];
                          if (bc && !mismaMoneda(currency, "CRC")) return (
                            <div className="ds-body-sm ds-muted" title="El precio que guarda BC está en colones y esta orden va en otra moneda">
                              últ. {money(bc.precio, "CRC")}/{bc.unidad} · esta orden va en {currency}
                            </div>
                          );
                          return <div className="ds-body-sm ds-muted">sin historial</div>;
                        }
                        const up = Number(r.precio) > lp, down = Number(r.precio) < lp;
                        const igual = !up && !down;
                        return (
                          <button type="button" className="link-btn ds-body-sm"
                            title={igual ? "Precio igual al último" : "Usar este último precio"}
                            onClick={() => setRow(r.pedidoLineaId, { precio: String(lp) })}
                            style={{ color: up ? "var(--ds-color-red-200)" : down ? "var(--ds-color-green-200)" : "var(--ds-color-gray-400)", cursor: igual ? "default" : "pointer" }}>
                            últ. {money(lp, currency)}{r.unidad ? `/${r.unidad}` : ""} {up ? "↑" : down ? "↓" : "="}
                          </button>
                        );
                      })()}
                    </td>
                    <td className="ds-num"><input className="ds-cell-input" type="number" min={0} max={100} value={r.descuento} style={{ width: 64 }} onChange={(e) => setRow(r.pedidoLineaId, { descuento: e.target.value })} /></td>
                    <td className="ds-num"><input className="ds-cell-input" type="number" min={0} value={r.iva} style={{ width: 64 }} onChange={(e) => setRow(r.pedidoLineaId, { iva: e.target.value })} /></td>
                    <td className="ds-num ds-strong">
                      {money(calcImporte(r) || 0, currency)}
                      {fleteShare(r) > 0 && <div className="ds-body-sm ds-muted" style={{ fontWeight: 400 }}>+ cargos {money(fleteShare(r), currency)}</div>}
                    </td>
                    <td className="ds-num"><button type="button" className="icon-btn" title="Quitar línea" onClick={() => removeRow(r.pedidoLineaId)}>×</button></td>
                  </tr>
                ))}
                {/* Cargos de producto también como líneas (igual que en BC). Se editan
                    arriba en "Cargos de producto"; acá se muestran junto a los artículos. */}
                {cargos.map((c, i) => cargoImporte(c) > 0 ? (
                  <tr key={`cargo-${i}`} style={{ background: "color-mix(in srgb, var(--ds-color-yellow) 7%, var(--ds-tint-base))" }}>
                    <td><Badge tone="yellow">Cargo</Badge></td>
                    <td><div className="ds-truncate" title={c.descripcion} style={{ maxWidth: 200 }}>{c.chargeNo ? `${c.chargeNo} · ` : ""}{c.descripcion}</div></td>
                    <td className="ds-muted ds-body-sm">—</td>
                    <td className="ds-num ds-body-sm">{c.cantidad}</td>
                    <td className="ds-num ds-body-sm">{money(Number(c.precio) || 0, currency)}</td>
                    <td className="ds-num ds-muted">—</td>
                    <td className="ds-num ds-body-sm">13</td>
                    <td className="ds-num ds-strong">{money(cargoImporte(c) || 0, currency)}</td>
                    <td className="ds-num"><button type="button" className="icon-btn" title="Quitar cargo" onClick={() => removeCargo(i)}>×</button></td>
                  </tr>
                ) : null)}
              </tbody>
              {cargosTotal > 0 && (
                <tfoot>
                  <tr><td colSpan={9} className="ds-body-sm ds-muted" style={{ padding: "10px 16px", borderTop: "1.5px solid var(--ds-color-gray-100)" }}>
                    Los cargos ({money(cargosTotal, currency)}) se reparten {
                      metodoAsig === "Equally" ? "en partes iguales entre las líneas"
                      : metodoAsig === "Weight" ? "por peso (lo calcula BC al registrar; no se previsualiza acá)"
                      : metodoAsig === "Volume" ? "por volumen (lo calcula BC al registrar; no se previsualiza acá)"
                      : "proporcional al importe de cada línea"
                    }{previewReparto ? " (mostrado como “+ cargos”)" : ""}.
                  </td></tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>

        <div className="row mt-6" style={{ justifyContent: "flex-end" }}>
          <div className="totals" style={{ minWidth: 340 }}>
            <div className="totals__row"><span>Subtotal (excl. IVA)</span><span>{money(subtotal, currency)}</span></div>
            <div className="totals__row"><span>Cargos</span><span>{money(cargosTotal, currency)}</span></div>
            <div className="totals__row"><span>IVA</span><span>{money(ivaTotal, currency)}</span></div>
            <div className="totals__row totals__row--grand" style={{ gridColumn: "1 / -1" }}>
              <span>Total</span><span>{money(total, currency)}</span>
            </div>
          </div>
        </div>
      </main>

      <div className="action-bar">
        <div className="action-bar__inner">
          <span className="ds-muted">{rows.length} línea(s) · {pedidosDistintos.length} pedido(s) · <span className="ds-strong">{money(total, currency)}</span></span>
          <div className="row gap-3">
            <Button variant="outline" onClick={() => crear(false)} disabled={!puedeCrear || guardando}>Guardar como abierta</Button>
            <Button onClick={() => crear(true)} disabled={!puedeCrear || guardando}>{guardando ? "Enviando…" : "Enviar a aprobación"}</Button>
          </div>
        </div>
      </div>

      {addOpen && (
        <Modal wide title="Agregar de solicitudes pendientes" onClose={() => setAddOpen(false)}
          footer={<Button variant="outline" onClick={() => setAddOpen(false)}>Cerrar</Button>}>
          <p className="ds-muted ds-body-sm" style={{ marginTop: 0 }}>Líneas pendientes por ordenar de solicitudes ya hechas. Se suman a esta orden.</p>
          {lineasDisponibles.length === 0 ? (
            <div className="empty">No hay líneas pendientes en otras solicitudes.</div>
          ) : (
            <div className="ds-table-wrap" style={{ boxShadow: "none", maxHeight: 420, overflow: "auto" }}>
              <table className="ds-table">
                <thead>
                  <tr><th>Pedido</th><th>Artículo</th><th>Destino</th><th className="ds-num">Pendiente</th><th /></tr>
                  <tr>
                    <th><input className="ds-cell-input" style={{ width: "100%" }} placeholder="Filtrar…" value={addF.pedido} onChange={(e) => setAddF((f) => ({ ...f, pedido: e.target.value }))} /></th>
                    <th><input className="ds-cell-input" style={{ width: "100%" }} placeholder="Filtrar…" value={addF.articulo} onChange={(e) => setAddF((f) => ({ ...f, articulo: e.target.value }))} /></th>
                    <th><input className="ds-cell-input" style={{ width: "100%" }} placeholder="Filtrar…" value={addF.destino} onChange={(e) => setAddF((f) => ({ ...f, destino: e.target.value }))} /></th>
                    <th /><th />
                  </tr>
                </thead>
                <tbody>
                  {lineasDispFiltradas.length === 0 && <tr><td colSpan={5}><div className="empty" style={{ padding: "20px 0" }}>Ninguna línea coincide con el filtro.</div></td></tr>}
                  {lineasDispFiltradas.map(({ p, l, pend }) => (
                    <tr key={l.id}>
                      <td className="ds-body-sm ds-strong">{p.numero}</td>
                      <td><div className="ds-truncate" style={{ maxWidth: 260 }} title={`${l.articuloId} — ${l.descripcion}`}><span className="ds-strong ds-body-sm">{l.articuloId}</span> <span className="ds-muted">— {l.descripcion}</span></div></td>
                      <td className="ds-muted ds-body-sm">{destinoDeLinea(l, p) || "—"}</td>
                      <td className="ds-num">{pend} {l.unidad}</td>
                      <td className="ds-num"><Button variant="outline" size="sm" onClick={() => agregarDeSolicitud(p, l, pend)}>Agregar</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </AppShell>
  );
}
