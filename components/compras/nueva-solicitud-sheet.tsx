"use client";

/**
 * NuevaSolicitudSheet — PROTOTIPO (local) del nuevo flujo "crear pedido".
 *
 * Drawer lateral DERECHO (PC). Paso 1 (datos) → Paso 2 (vista previa) → "Pedir".
 * - Dropdowns estilo DS SelectionDropdown: se escribe en la MISMA caja y las
 *   opciones se despliegan con resorte (springs.expanding, "tortillo") como chips.
 * - Materiales con variante: se pide la variante ANTES de agregar la línea.
 * - Cada fila tiene menú "⋮": Cambiar obra / Duplicar / Eliminar.
 * - Obra por línea con atajo "Aplicar a todos".
 * - Datos REALES de Business Central (items/obras/almacenes/variantes).
 *
 * Wiring: addPedido(input) => borrador; + setPedidoEstado(id,"aprobado") => enviado.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { ToggleCards } from "@/components/ds/ToggleCards/ToggleCards";
import { Icon } from "@/components/ds/Icon/Icon";
import { Button, Field, Textarea, useToast } from "@/components/compras/ui";
import { useStore, type NewPedidoInput } from "@/lib/compras/store";
import type { Almacen, Articulo, Maquina, Obra, Pedido, TipoSolicitud } from "@/lib/compras/types";
import { ALMACEN_GENERAL, ALMACEN_MAQUINARIA, OBRA_MAQUINARIA, TAREA_PARQUE_MAQUINARIA, cantidadEntreUnidades, conversionFiel, equivalenciaUnidad, esAlmacenDeBodega, etiquetaTipoArticulo, money, num, numeroOrden, redondearCantidad, saltarCantidad, separarVariantePegada, unidadPorDefecto, unidadesOfrecidas, type UnidadItem } from "@/lib/compras/helpers";
import { buscarOrdenado } from "@/lib/utilidades/buscar";

type Variante = { code: string; descripcion: string };
// Una obra dentro del pedido = una TARJETA con sus materiales. El pedido puede tener
// varias obras (varias tarjetas). Para repuesto/bodega se usa un único grupo (SOLO).
type Grupo = { key: string; obraCodigo?: string; obraNombre?: string; taskNo?: string; taskNombre?: string };
type Row = { key: string; grupoKey: string; articuloId: string; variantCode?: string; variantNombre?: string; cantidad: number; obraCodigo?: string; obraNombre?: string; notas?: string; requerido?: number; autoPedir?: boolean;
  /** Unidad con la que se le va a pedir al proveedor (EST, PQT…). `undefined` = todavía
   *  no se resolvió; al cargar las unidades del artículo se pone la que corresponde. */
  unidad?: string;
  /** SUBCONTRATO: alcance en texto libre. Viaja como DESCRIPCIÓN de la línea (a la
   *  orden y a BC); si va vacío queda la descripción del servicio del catálogo. */
  detalle?: string;
  /** SUBCONTRATO: monto global de la línea. No hay precio en la tabla del pedido:
   *  el monto vive en la ORDEN (precio unitario, cantidad 1), que el subcontrato
   *  crea de una vez. */
  monto?: number };
type PlantillaLinea = { code: string; cantidad: number; obraCodigo?: string; variantCode?: string; variantNombre?: string; descripcion?: string; unidad?: string;
  // Tarea de la obra (consumo directo). Viaja al copiar/editar un pedido para no
  // perder la actividad; en las plantillas guardadas no existe.
  taskNo?: string; taskDescr?: string };
type Plantilla = { id: number; nombre: string; tipo?: "general" | "bodega"; idClasificacion?: number | null; lineas: PlantillaLinea[]; creadoPor?: string };
// Semilla para "Copiar pedido": abre el drawer ya cargado con las líneas de un
// pedido existente. Las líneas usan el MISMO shape que una plantilla (code/obra/
// variante/cantidad), por eso se reusa el mismo armado de grupos+filas.
export type NuevaSolicitudSeed = {
  tipo: TipoSolicitud;
  prioridad?: Pedido["prioridad"];
  notas?: string;
  destino?: string;          // repuesto → máquina
  /** almacén real del pedido copiado (tag ALM / pedido de Stock). */
  almacen?: string;
  /** true = el pedido copiado era de consumo directo (sus líneas traían tarea). */
  consumo?: boolean;
  /** clasificación WBS del pedido (celda de la Matriz), para no perder el amarre. */
  idClasificacion?: number | null;
  lineas: PlantillaLinea[];
};

/** Editar un pedido existente con este mismo drawer (en vez del formulario viejo). */
export type NuevaSolicitudEdicion = { id: string; numero: string; seed: NuevaSolicitudSeed };
/** Contexto de la Matriz: obra fija + clasificación a la que se liga el pedido. */
export type NuevaSolicitudPreset = { obraCodigo?: string; idClasificacion?: number };
type FTipo = "todas" | "mias" | "general" | "bodega";
// tag = etiqueta chica a la derecha (ej. "Servicio"): el buscador ofrece TODO el
// catálogo de BC (inventario, servicio y no inventariable) y el tag dice qué es.
type Item = { id: string; title: string; sub?: string; tag?: string };

// ─── Borrador automático del pedido que se está armando ──────────────────────────
// Mismo pedido de Roger Solano que en plantillas: si la página se recarga o el usuario
// se devuelve, no se pierde lo tecleado. Solo aplica al pedido NUEVO en blanco — si el
// drawer viene con semilla (copiar/editar) o desde la Matriz, manda esa carga.
// Ojo: es distinto de "Guardar borrador", que sí crea el pedido en la base.
const CLAVE_BORRADOR_PEDIDO = "adelante_oc_pedido_borrador";
type BorradorPedido = {
  tipo: TipoSolicitud; destinoMat: DestinoMat; almacenSel: string; destino: string;
  prioridad: Pedido["prioridad"]; notas: string; grupos: Grupo[]; lineas: Row[]; ts: number;
  /** Subcontrato: proveedor y moneda elegidos (sin esto se perderían al recargar). */
  proveedorId?: string; currency?: string;
};
function leerBorradorPedido(): BorradorPedido | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CLAVE_BORRADOR_PEDIDO);
    if (!raw) return null;
    const b = JSON.parse(raw) as BorradorPedido;
    // Sin líneas no hay nada que recuperar (y así no molesta con un pedido vacío).
    return b && Array.isArray(b.lineas) && b.lineas.length ? b : null;
  } catch { return null; }
}
function borrarBorradorPedido() {
  try { window.localStorage.removeItem(CLAVE_BORRADOR_PEDIDO); } catch { /* modo privado */ }
}

const uid = () => Math.random().toString(36).slice(2, 9);
const SOLO = "solo"; // grupo único para repuesto/bodega (sin obra)

// Dentro de UNA obra (grupo), dos líneas son el MISMO material si coinciden
// artículo + variante. El mismo material sí se puede pedir en OTRA obra (otro
// grupo); mismo material + misma obra = duplicado y no se permite.
const dupKey = (grupoKey: string, articuloId: string, variantCode?: string) =>
  `${grupoKey}|${articuloId}|${variantCode ?? ""}`;

// Colapsa líneas duplicadas (mismo material dentro de la misma obra) sumando
// cantidades, conservando el orden de la primera aparición. Devuelve cuántas se
// unificaron.
function mergeDedup(rows: Row[]): { rows: Row[]; merged: number } {
  const byKey = new Map<string, Row>();
  let merged = 0;
  for (const r of rows) {
    // La UNIDAD entra en la clave: 1 EST y 100 GR del mismo material no se pueden
    // sumar (darían 101 de algo). Si difieren, quedan como dos líneas.
    const k = `${dupKey(r.grupoKey, r.articuloId, r.variantCode)}|${(r.unidad ?? "").toUpperCase()}`;
    const prev = byKey.get(k);
    if (prev) { prev.cantidad += r.cantidad; merged++; }
    else byKey.set(k, { ...r });
  }
  return { rows: [...byKey.values()], merged };
}
// Tipos REALES de solicitud. Ojo: "Consumo inmediato" NO es un tipo, es el DESTINO
// del material dentro de un pedido de obra (ver DESTINOS): el ingeniero pide material
// para una obra y ese material o entra al Almacén General (inventario, se consume
// después) o se consume de una vez contra el proyecto + la tarea de la obra.
const TIPOS: { v: TipoSolicitud; label: string; destino: string }[] = [
  { v: "material", label: "Material (obra)", destino: "Obra" },
  { v: "repuesto", label: "Repuesto", destino: "Máquina" },
  { v: "stock", label: "Stock", destino: "Almacén" },
  { v: "subcontrato", label: "Subcontrato", destino: "Obra" },
  { v: "activo", label: "Activo fijo", destino: "Activo" },
];
// TAG del pedido (chiquito, al lado del tipo): ALM = entra a inventario del almacén
// REAL elegido · CD = consumo directo, no entra a inventario. Stock siempre es a un
// almacén (es justamente la compra para inventario), así que no lleva tag.
type DestinoMat = "almacen" | "consumo";
const DESTINOS: { v: DestinoMat; label: string }[] = [
  { v: "almacen", label: "ALM" },
  { v: "consumo", label: "CD" },
];
const ayudaDestino = (tipo: TipoSolicitud, d: DestinoMat) =>
  d === "almacen"
    ? "ALM: entra a inventario del almacén elegido; se consume después."
    : tipo === "repuesto"
      ? "CD (consumo directo): se lo lleva la máquina. En BC la línea va al almacén MAQ y se consume contra el proyecto MAQUINARIA (MAQ) · tarea PARQUE MAQUINARIA (CMAQ), con el N.º de máquina en la línea."
      : "CD (consumo directo): se consume de una vez contra el proyecto y la tarea de la obra.";
// Almacén de inventario al que entra el material que no es de consumo inmediato.
const ALM_GENERAL = ALMACEN_GENERAL;
const PRIORIDADES: { v: Pedido["prioridad"]; label: string }[] = [
  { v: "normal", label: "Normal" }, { v: "alta", label: "Alta" }, { v: "urgente", label: "Urgente" },
];
const F_TIPOS: { v: FTipo; label: string }[] = [
  { v: "todas", label: "Todas" }, { v: "mias", label: "Mías" }, { v: "general", label: "General" }, { v: "bodega", label: "Bodega" },
];
// Busca por palabras y ORDENA por relevancia: "tubo 3\"" encuentra «TUBO PVC … 3"»,
// y "servicio" trae primero los artículos que EMPIEZAN con la palabra (los de tipo
// servicio) y no los materiales que solo la llevan en medio del nombre. Sin el
// orden por relevancia, el tope de resultados dejaba fuera los servicios.
const ordenarMatches = (items: Item[], q: string) => buscarOrdenado(items, q, (i) => [i.title, i.sub ?? ""]);
const filtrar = (items: Item[], q: string, max = 40) => ordenarMatches(items, q).slice(0, max);
const MAX_MAT = 60; // resultados visibles del buscador de materiales
// A partir de cuántas variantes se muestra el buscador dentro del selector.
const MIN_BUSCAR_VAR = 6;
// Ningún TIPO se queda fuera de la ventana visible: si entre los primeros MAX no
// entró ningún servicio (o ningún no inventariable) pero sí hay coincidencias de
// ese tipo, se agregan las mejores al final. Pasaba con términos muy cortos ("s"),
// donde los ~2.700 materiales que coinciden tapaban a los servicios.
const CUPO_TIPO = 5;
function conTodosLosTipos(ordenados: Item[], max: number): Item[] {
  const visibles = ordenados.slice(0, max);
  if (visibles.length === ordenados.length) return visibles;
  const tagsVisibles = new Set(visibles.map((i) => i.tag ?? ""));
  const extra: Item[] = [];
  for (const tag of new Set(ordenados.map((i) => i.tag ?? ""))) {
    if (tagsVisibles.has(tag)) continue;
    extra.push(...ordenados.filter((i) => (i.tag ?? "") === tag).slice(0, CUPO_TIPO));
  }
  return extra.length ? [...visibles, ...extra] : visibles;
}

// ─── Popover flotante: se muestra encima (portal + fixed), no empuja ni recorta ─
function Popover({ anchorRef, open, onClose, children, minWidth }: {
  anchorRef: React.RefObject<HTMLDivElement | null>; open: boolean; onClose: () => void; children: React.ReactNode;
  // minWidth: ancho mínimo del menú (para anclas angostas, ej. el botón de variante,
  // así el texto largo se lee completo). Se ajusta para no salirse de la pantalla.
  minWidth?: number;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) { setRect(null); return; }
    const measure = () => { if (anchorRef.current) setRect(anchorRef.current.getBoundingClientRect()); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, anchorRef]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || listRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, anchorRef, onClose]);
  if (!open || !rect) return null;
  const spaceBelow = window.innerHeight - rect.bottom;
  const openUp = spaceBelow < 300 && rect.top > spaceBelow;
  const pos: React.CSSProperties = openUp ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 };
  // Ancho del menú: por defecto el del ancla; si se pide minWidth, se usa ese
  // (sin pasarse del borde derecho de la pantalla).
  const menuW = Math.min(Math.max(rect.width, minWidth ?? 0), window.innerWidth - 16);
  const menuLeft = Math.min(rect.left, window.innerWidth - menuW - 8);
  return createPortal(
    // Envuelto en .oc-scope para que el CSS de Compras (tokens + hover de los ítems)
    // aplique dentro del portal (vive en <body>, fuera del árbol de .oc-scope).
    <div className="oc-scope">
      <motion.div ref={listRef}
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        transition={{ height: { type: "spring", stiffness: 100, damping: 19, mass: 1.1 }, opacity: { duration: 0.3, ease: "easeOut" } }}
        // El redondeo + la sombra van AQUÍ (el contenedor que recorta con overflow:hidden),
        // así las esquinas quedan redondeadas y la sombra no se recorta en cuadrado.
        style={{ position: "fixed", left: menuLeft, width: menuW, ...pos, zIndex: 2000, overflow: "hidden", borderRadius: 18, background: "var(--ds-color-white)", boxShadow: "0 18px 44px rgba(15,18,20,.20)" }}>
        {children}
      </motion.div>
    </div>,
    document.body,
  );
}

// ─── Segmented (chips negro/gris) ───────────────────────────────────────────────
function Segmented<T extends string>({ value, options, onChange, size = "md", variant = "box" }: {
  value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; size?: "sm" | "md"; variant?: "box" | "pill";
}) {
  if (variant === "pill") {
    // Pill full-width: las opciones se reparten el ancho; la activa es un pill negro grande.
    return (
      <div className="row gap-0" style={{ width: "100%", border: "1.5px solid var(--ds-color-gray-200)", borderRadius: 999, padding: 4, background: "var(--ds-color-white)", boxShadow: "var(--ds-shadow-01)" }}>
        {options.map((o) => {
          const active = o.v === value;
          return (
            <button key={o.v} type="button" onClick={() => onChange(o.v)} aria-pressed={active} className="ds-body-sm ds-strong"
              style={{ flex: 1, padding: "11px 12px", borderRadius: 999, cursor: "pointer", border: 0, background: active ? "var(--ds-color-black)" : "transparent", color: active ? "var(--ds-color-white)" : "var(--ds-color-gray-500)", transition: "background .15s ease, color .15s ease" }}>
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }
  const pad = size === "sm" ? "5px 10px" : "8px 14px";
  return (
    <div className="row gap-0" style={{ border: "1.5px solid var(--ds-color-gray-100)", borderRadius: 10, overflow: "hidden", width: "fit-content", maxWidth: "100%", flexWrap: "wrap" }}>
      {options.map((o) => {
        const active = o.v === value;
        return (
          <button key={o.v} type="button" onClick={() => onChange(o.v)} aria-pressed={active} className={size === "sm" ? "ds-label ds-strong" : "ds-body-sm ds-strong"}
            style={{ padding: pad, cursor: "pointer", border: 0, background: active ? "var(--ds-color-black)" : "transparent", color: active ? "var(--ds-color-white)" : "var(--ds-color-gray-400)" }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Dropdown estilo DS: se escribe en la misma caja; las opciones se despliegan
//     con resorte como chips negros (SelectionDropdown / springs.expanding). ─────
function Dropdown({ placeholder, items, value, onPick, mode = "select", small, warn, filterNode, noToggle, onClear, badgeSub }: {
  placeholder: string; items: Item[]; value?: string; onPick: (id: string) => void;
  mode?: "select" | "add"; small?: boolean; warn?: boolean; filterNode?: React.ReactNode;
  // noToggle: sin el botón negro de abrir; el campo entero abre la lista al hacer click (más limpio).
  noToggle?: boolean;
  // onClear: si hay valor elegido, en vez del botón de abrir muestra una X para quitarlo.
  onClear?: () => void;
  // badgeSub: muestra el `sub` del elegido como badge (ej. tipo de plantilla: General/Bodega).
  badgeSub?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const sel = mode === "select" ? items.find((i) => i.id === value) : undefined;
  const matches = useMemo(() => filtrar(items, q), [q, items]);
  const borderColor = warn && !sel ? "var(--ds-color-yellow)" : open ? "var(--ds-color-gray-300)" : "var(--ds-color-gray-100)";
  const toggle = () => { setOpen((o) => !o); if (!open) inputRef.current?.focus(); };
  return (
    <div style={{ width: "100%" }}>
      {/* Header card: input + toggle DS (efecto giratorio) */}
      <div ref={boxRef} onClick={noToggle ? () => { if (!open) { setOpen(true); inputRef.current?.focus(); } } : undefined}
        style={{ display: "flex", alignItems: "center", gap: 6, minHeight: small ? 44 : 62, paddingLeft: small ? 14 : 18, paddingRight: noToggle ? (small ? 12 : 16) : (small ? 5 : 8), background: "var(--ds-color-white)", borderRadius: 999, boxShadow: "var(--ds-shadow-01)", border: `1.5px solid ${borderColor}`, cursor: noToggle ? "pointer" : "default" }}>
        <input ref={inputRef} value={open || mode === "add" ? q : (sel ? sel.title : "")} placeholder={placeholder}
          onFocus={() => { setOpen(true); if (mode === "select") setQ(""); }} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          style={{ flex: 1, minWidth: 0, border: 0, background: "transparent", outline: "none", fontSize: small ? 13 : 15, fontWeight: sel && !open ? 600 : 400, color: sel && !open ? "var(--ds-color-ink)" : "var(--ds-color-gray-500)", cursor: noToggle ? "pointer" : "text" }} />
        {badgeSub && sel && !open && sel.sub && (
          <span className={`nsl-typebadge ${/bodega/i.test(sel.sub) ? "nsl-typebadge--bodega" : "nsl-typebadge--general"}`}>{sel.sub}</span>
        )}
        {onClear && sel ? (
          <button type="button" aria-label="Quitar" className="nsl-clear"
            onClick={(e) => { e.stopPropagation(); setOpen(false); setQ(""); onClear(); }}>
            <svg width={small ? 15 : 17} height={small ? 15 : 17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        ) : noToggle ? (
          <svg width={small ? 16 : 18} height={small ? 16 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
            style={{ flexShrink: 0, color: "var(--ds-color-gray-400)", transition: "transform .15s ease", transform: open ? "rotate(180deg)" : "none" }}><path d="M6 9l6 6 6-6" /></svg>
        ) : (
          <span style={{ flexShrink: 0, transform: `scale(${small ? 0.6 : 0.76})`, transformOrigin: "center", display: "inline-flex" }}>
            <ToggleCards size="small" visibility={open ? "open" : "close"} onClick={toggle} ariaLabel={open ? "Cerrar" : "Abrir"} />
          </span>
        )}
      </div>
      {/* Lista FLOTANTE (portal): se muestra encima, no empuja la fila */}
      <Popover anchorRef={boxRef} open={open} onClose={() => setOpen(false)}>
        <div style={{ width: "100%", padding: 8, display: "flex", flexDirection: "column" }}>
          {filterNode && <div style={{ display: "flex", justifyContent: "center", paddingBottom: 8 }}>{filterNode}</div>}
          <div className="nsl-list" style={{ display: "flex", flexDirection: "column", gap: 2, overflowY: "auto", maxHeight: 300 }}>
            {matches.length === 0 && <div className="ds-muted ds-body-sm" style={{ padding: 12, textAlign: "center" }}>Sin resultados.</div>}
            {matches.map((i) => (
              <button key={i.id} type="button" onClick={() => { onPick(i.id); setOpen(false); setQ(""); }}
                className={`nsl-opt col${i.id === value ? " is-active" : ""}`} style={{ gap: 2, alignItems: "flex-start", width: "100%", textAlign: "left", padding: "11px 14px", border: 0, borderRadius: 12, cursor: "pointer", background: "transparent" }}>
                <span className="ds-body-sm ds-strong">{i.title}</span>
                {i.sub && <span className="ds-muted ds-label">{i.sub}</span>}
              </button>
            ))}
          </div>
        </div>
      </Popover>
    </div>
  );
}

// ─── Botón de variante (NO se ve como dropdown): abre la lista al hacer click, y
//     se puede volver a abrir para CAMBIAR la variante si se eligió mal. ────────────
// ─── UNIDAD de la línea ─────────────────────────────────────────────────────────
// Con una sola unidad ofrecible (el 99% de los materiales) se ve exactamente igual que
// antes: el código, en gris, al lado de la cantidad. Cuando el artículo tiene varias
// —el adhesivo que se consume en gramos y se compra por estañón— se vuelve un selector
// que ADEMÁS convierte la cantidad, porque cambiar solo la etiqueta es justo el error
// que se quiere evitar (1 estañón ≠ 1 gramo).
function UnidadBtn({ unidades, value, base, onPick }: {
  unidades: UnidadItem[]; value: string; base: string; onPick: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sel = unidades.find((u) => u.code.toUpperCase() === (value ?? "").toUpperCase());
  const equiv = equivalenciaUnidad(sel, base);
  if (unidades.length <= 1) {
    return <span className="ds-muted ds-label" style={{ minWidth: 26 }}>{value || base}</span>;
  }
  return (
    <div ref={wrapRef} style={{ display: "inline-flex", flexShrink: 0 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} title={equiv || `Unidad: ${value}`}
        aria-label={`Unidad de la línea: ${value}`}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 40, minWidth: 62, padding: "0 8px", borderRadius: 8, border: "1.5px solid var(--ds-color-gray-200)", background: "var(--ds-color-white)", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "var(--ds-color-ink)" }}>
        <span>{value || base}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s ease" }}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <Popover anchorRef={wrapRef} open={open} onClose={() => setOpen(false)} minWidth={230}>
        <div style={{ width: "100%", padding: 8 }}>
          <span className="ds-muted ds-label" style={{ display: "block", padding: "4px 10px 8px" }}>
            Unidad con la que se le pide al proveedor
          </span>
          <div className="nsl-list" style={{ display: "flex", flexDirection: "column", gap: 2, overflowY: "auto", maxHeight: 260 }}>
            {unidades.map((u) => {
              const eq = equivalenciaUnidad(u, base);
              return (
                <button key={u.code} type="button" onClick={() => { onPick(u.code); setOpen(false); }}
                  className={`nsl-opt${u.code.toUpperCase() === (value ?? "").toUpperCase() ? " is-active" : ""}`}
                  style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, width: "100%", textAlign: "left", padding: "9px 14px", border: 0, borderRadius: 12, cursor: "pointer", background: "transparent", fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
                  <span>{u.code}</span>
                  {eq && <span className="ds-muted ds-label">{eq}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </Popover>
    </div>
  );
}

function VarianteBtn({ variantes, value, onPick }: {
  variantes: Variante[]; value?: string; onPick: (code: string, nombre?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  const sel = variantes.find((v) => v.code === value);
  const label = sel ? (sel.descripcion || sel.code) : "Agregar variante";
  // Con muchas variantes, buscar por texto (pedido de Ana Gómez): no hay que recorrer
  // toda la lista a mano. Con pocas no vale la pena el campo.
  const conBuscador = variantes.length > MIN_BUSCAR_VAR;
  const lista = useMemo(() => buscarOrdenado(variantes, q, (v) => [v.descripcion || "", v.code]), [variantes, q]);
  return (
    <div ref={wrapRef} style={{ display: "inline-flex", width: "100%", minWidth: 0 }}>
      <button type="button" className="nsl-varbtn" data-warn={value ? undefined : "1"} title={label} onClick={() => setOpen((o) => !o)}>
        <span className="nsl-varbtn__label">{label}</span>
        <svg className="nsl-varbtn__chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s ease" }}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <Popover anchorRef={wrapRef} open={open} onClose={() => { setOpen(false); setQ(""); }} minWidth={260}>
        <div style={{ width: "100%", padding: 8 }}>
          {conBuscador && (
            <input ref={buscaRef} value={q} autoFocus placeholder="Buscar variante…" onChange={(e) => setQ(e.target.value)}
              style={{ width: "100%", margin: "2px 0 8px", height: 38, borderRadius: 999, border: "1.5px solid var(--ds-color-gray-200)", background: "var(--ds-color-white)", padding: "0 14px", fontSize: 14, outline: "none" }} />
          )}
          <div className="nsl-list" style={{ display: "flex", flexDirection: "column", gap: 2, overflowY: "auto", maxHeight: 260 }}>
            {variantes.length === 0 && <div className="ds-muted ds-body-sm" style={{ padding: 12, textAlign: "center" }}>Sin variantes.</div>}
            {variantes.length > 0 && lista.length === 0 && <div className="ds-muted ds-body-sm" style={{ padding: 12, textAlign: "center" }}>Ninguna variante coincide con “{q}”.</div>}
            {lista.map((v) => (
              <button key={v.code} type="button" onClick={() => { onPick(v.code, v.descripcion); setOpen(false); setQ(""); }}
                className={`nsl-opt${v.code === value ? " is-active" : ""}`} style={{ display: "flex", alignItems: "center", width: "100%", textAlign: "left", padding: "10px 14px", border: 0, borderRadius: 12, cursor: "pointer", background: "transparent", fontSize: 13, fontWeight: 500, lineHeight: 1.35 }}>
                {v.descripcion || v.code}
              </button>
            ))}
          </div>
        </div>
      </Popover>
    </div>
  );
}

// ─── Cantidad: entera o con DECIMALES (2, 1.5, 0,25) ────────────────────────────
// Antes el campo borraba todo lo que no fuera dígito, así que no se podía ni teclear
// el separador: media unidad era imposible. La base ya guarda decimal(18,4), el que
// no dejaba era el input.
// Se maneja como TEXTO mientras se escribe (si fuera número, al teclear "1." el punto
// desaparece y no se puede seguir) y sale como número. Coma o punto valen igual —acá
// se escribe con coma— y se aceptan hasta 4 decimales, lo que guarda la base.
const MAX_DEC = 4;
function limpiarCantidad(s: string): string {
  let t = s.replace(/[^\d.,]/g, "").replace(/,/g, ".");
  const i = t.indexOf(".");
  if (i >= 0) t = t.slice(0, i + 1) + t.slice(i + 1).replace(/\./g, ""); // un solo separador
  const [ent, dec] = t.split(".");
  return dec === undefined ? ent : `${ent}.${dec.slice(0, MAX_DEC)}`;
}
const textoDeCantidad = (n: number) =>
  Number.isFinite(n) ? String(Math.round(n * 10 ** MAX_DEC) / 10 ** MAX_DEC) : "";

function Cantidad({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  // `null` = mostrar el valor de afuera (plantilla, o "pedir = plantilla − stock").
  // En cuanto se teclea, manda el texto tecleado; al salir del campo vuelve a mandar
  // el valor real, ya normalizado. Así no hace falta sincronizar con un efecto.
  const [txt, setTxt] = useState<string | null>(null);
  // Si el valor cambia DESDE AFUERA sin pasar por el teclado —cambiar la unidad
  // convierte la cantidad (510.000 GR → 2 EST)— lo tecleado deja de valer: si no, el
  // campo seguiría mostrando 510.000 al lado de EST, que es justo el error de 255.000×
  // que esto viene a evitar.
  const [visto, setVisto] = useState(value);
  if (value !== visto) { setVisto(value); if (txt !== null) setTxt(null); }
  return (
    <input inputMode="decimal" value={txt ?? textoDeCantidad(value)} aria-label="Cantidad" data-cant="1"
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={saltarCantidad}
      onChange={(e) => { const t = limpiarCantidad(e.target.value); setTxt(t); onChange(Math.max(0, Number(t) || 0)); }}
      onBlur={() => setTxt(null)}
      style={{ width: 86, textAlign: "center", height: 40, borderRadius: 8, border: "1.5px solid var(--ds-color-gray-200)", background: "var(--ds-color-white)", color: "var(--ds-color-yellow)", fontVariantNumeric: "tabular-nums", fontWeight: 700 }} />
  );
}

// ─── MONTO de una línea de SUBCONTRATO ──────────────────────────────────────────
// El servicio se contrata por un monto global, no por cantidad × precio. Se teclea
// libre y al salir del campo se muestra con separador de miles, para que un monto de
// siete cifras se pueda leer de un vistazo.
function Monto({ value, onChange, currency }: { value?: number; onChange: (n: number) => void; currency: string }) {
  // Con el campo ENFOCADO se ven los dígitos pelados (editables); al salir se ve con
  // separador de miles. Ojo: no se puede mostrar "1.500.000" mientras se teclea, porque
  // el punto es también el separador decimal y el valor se leería como 1,5.
  const [txt, setTxt] = useState<string | null>(null);
  const fmt = value && value > 0 ? num.format(value) : "";
  return (
    <div className="row gap-1" style={{ alignItems: "center", flexShrink: 0 }}>
      <span className="ds-muted ds-label" style={{ fontWeight: 700 }}>{currency === "USD" ? "$" : "₡"}</span>
      <input inputMode="decimal" value={txt ?? fmt} aria-label="Monto del subcontrato" placeholder="0"
        onFocus={(e) => { setTxt(value && value > 0 ? textoDeCantidad(value) : ""); e.currentTarget.select(); }}
        onChange={(e) => { const t = limpiarCantidad(e.target.value); setTxt(t); onChange(Math.max(0, Number(t) || 0)); }}
        onBlur={() => setTxt(null)}
        style={{ width: 130, textAlign: "right", height: 40, borderRadius: 8, border: `1.5px solid ${value && value > 0 ? "var(--ds-color-gray-200)" : "var(--ds-color-yellow)"}`, background: "var(--ds-color-white)", color: "var(--ds-color-ink)", fontVariantNumeric: "tabular-nums", fontWeight: 700, padding: "0 10px" }} />
    </div>
  );
}

// ─── Columnas de STOCK de la línea: existencias en el almacén elegido y cuánto
//     pide la plantilla. Van pegadas a la cantidad (grupo anclado a la derecha), así
//     quedan alineadas como columnas en todas las filas. ────────────────────────────
const W_COL = 58;
function StockCols({ stock, ready, requerido }: { stock: number; ready: boolean; requerido?: number }) {
  return (
    <>
      <span className="ds-muted ds-label" style={{ width: W_COL, textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}
        title="Existencias en el almacén elegido">
        {ready ? stock.toLocaleString("es-CR") : <span className="nsl-skel" style={{ width: 30, display: "inline-block" }} role="status" aria-label="Cargando stock" />}
      </span>
      <span className="ds-muted ds-label" style={{ width: W_COL, textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}
        title="Cuánto pide la plantilla">
        {requerido != null ? requerido.toLocaleString("es-CR") : "—"}
      </span>
    </>
  );
}
// Encabezado de esas columnas. `inset` = la lista son tarjetas con borde (repuesto/
// stock) y hay que compensar el padding para que calce con las filas.
function StockHead({ inset }: { inset?: boolean }) {
  return (
    <div className="row gap-3" style={{ alignItems: "center", padding: inset ? "2px 14px" : "6px 12px" }}>
      <span className="ds-muted ds-label" style={{ flex: "1 1 60px", minWidth: 0 }}>Material</span>
      <div className="row gap-2" style={{ alignItems: "center", flexShrink: 0, marginLeft: "auto" }}>
        <span className="ds-muted ds-label" style={{ width: W_COL, textAlign: "right" }}>En stock</span>
        <span className="ds-muted ds-label" style={{ width: W_COL, textAlign: "right" }}>Plantilla</span>
        <span className="ds-muted ds-label" style={{ width: 72, textAlign: "center" }}>Pedir</span>
        <span style={{ minWidth: 26 }} aria-hidden />
        <span style={{ width: 29 }} aria-hidden />
      </div>
    </div>
  );
}

// ─── Buscar material: dropdown para elegir el artículo (la variante se elige en la línea) ─
function MaterialSearch({ items, onAdd, compact }: {
  items: Item[]; onAdd: (id: string, vc?: string, vn?: string) => void; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // El catálogo de BC son ~5.000 artículos de TODOS los tipos (inventario, servicio,
  // no inventariable): se ordenan por relevancia y se muestran los primeros 60, con
  // el conteo de cuántos quedaron fuera para que se siga filtrando.
  const ordenados = useMemo(() => ordenarMatches(items, q), [q, items]);
  const matches = useMemo(() => conTodosLosTipos(ordenados, MAX_MAT), [ordenados]);
  function reset() { setOpen(false); setQ(""); }
  const toggle = () => { if (open) { reset(); } else { setOpen(true); inputRef.current?.focus(); } };
  function clickItem(id: string) {
    // Se agrega el material directo. Si tiene variantes, se elige/cambia en el
    // botón de variante de la LÍNEA (no acá), para no llenar el buscador de pasos.
    onAdd(id); reset();
  }
  const placeholder = "Buscar material para agregar…";
  // Inline (compact): al montar (tras tocar el +) abre el dropdown y enfoca de una vez.
  // Sin chevron ni botón extra; se cierra solo al agregar un material.
  useEffect(() => { if (compact) { setOpen(true); const t = setTimeout(() => inputRef.current?.focus(), 30); return () => clearTimeout(t); } }, [compact]);
  return (
    <div style={{ width: "100%" }}>
      <div ref={boxRef} style={{ display: "flex", alignItems: "center", gap: 6, minHeight: compact ? 46 : 62, paddingLeft: compact ? 16 : 18, paddingRight: compact ? 16 : 8, background: "var(--ds-color-white)", borderRadius: 999, boxShadow: "var(--ds-shadow-01)", border: `1.5px solid ${open ? "var(--ds-color-gray-300)" : "var(--ds-color-gray-100)"}` }}>
        <input ref={inputRef} value={q} placeholder={placeholder} onFocus={() => { if (compact || q.trim()) setOpen(true); }} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          style={{ flex: 1, minWidth: 0, border: 0, background: "transparent", outline: "none", fontSize: compact ? 14 : 15, color: "var(--ds-color-gray-500)" }} />
        {!compact && (
          <span style={{ flexShrink: 0, transform: "scale(0.76)", transformOrigin: "center", display: "inline-flex" }}>
            <ToggleCards size="small" visibility={open ? "open" : "close"} onClick={toggle} ariaLabel={open ? "Cerrar" : "Abrir"} />
          </span>
        )}
      </div>
      <Popover anchorRef={boxRef} open={open} onClose={reset}>
        <div style={{ width: "100%", padding: 8, display: "flex", flexDirection: "column" }}>
          <div className="nsl-list" style={{ display: "flex", flexDirection: "column", gap: 2, overflowY: "auto", maxHeight: 300 }}>
            {matches.length === 0 && <div className="ds-muted ds-body-sm" style={{ padding: 12, textAlign: "center" }}>Sin resultados.</div>}
            {matches.map((i) => (
              <button key={i.id} type="button" onClick={() => clickItem(i.id)}
                className="nsl-opt row row--between" style={{ gap: 8, alignItems: "center", width: "100%", textAlign: "left", padding: "11px 14px", border: 0, borderRadius: 12, cursor: "pointer", background: "transparent" }}>
                <span className="col" style={{ gap: 2, minWidth: 0 }}>
                  <span className="ds-body-sm ds-strong">{i.title}</span>
                  <span className="row gap-2" style={{ alignItems: "center" }}>
                    {i.sub && <span className="ds-muted ds-label">{i.sub}</span>}
                    {/* Servicio / no inventariable: se piden igual, solo se avisa qué son. */}
                    {i.tag && <span className="nsl-tipotag">{i.tag}</span>}
                  </span>
                </span>
                <Icon name="plus" size="sm" color="var(--ds-color-green-200)" />
              </button>
            ))}
            {ordenados.length > matches.length && (
              <div className="ds-muted ds-label" style={{ padding: "8px 14px", textAlign: "center" }}>
                Mostrando {matches.length} de {ordenados.length} · seguí escribiendo para filtrar
              </div>
            )}
          </div>
        </div>
      </Popover>
    </div>
  );
}

// ─── Actividad (Job Task) de la obra — para Consumo inmediato. Trae las tareas de
//     POSTEO del proyecto (jobNo = código de obra) desde BC. ──────────────────────
function TareaPicker({ obra, value, valueNombre, onPick }: {
  obra?: string; value?: string; valueNombre?: string; onPick: (taskNo: string, nombre: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [tasks, setTasks] = useState<{ jobTaskNo: string; descripcion: string }[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!obra) { setTasks([]); return; }
    let cancel = false;
    setLoading(true);
    fetch(`/api/compras/bc/jobtasks?jobNo=${encodeURIComponent(obra)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancel) return;
        const rows = (d?.jobTasks ?? []) as { jobTaskNo: string; descripcion: string; tipo: string }[];
        setTasks(rows.filter((t) => t.tipo === "Posting").map((t) => ({ jobTaskNo: t.jobTaskNo, descripcion: t.descripcion })));
      })
      .catch(() => { if (!cancel) setTasks([]); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [obra]);
  const has = !!value;
  return (
    <div ref={ref} style={{ display: "inline-flex", minWidth: 0, flex: 1 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="ds-body-sm"
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: 40, padding: "0 12px", borderRadius: 10, cursor: "pointer",
          background: "var(--ds-color-white)", border: `1.5px solid ${has ? "var(--ds-color-green-100)" : "var(--ds-color-gray-200)"}`, color: has ? "var(--ds-color-ink)" : "var(--ds-color-gray-400)", textAlign: "left" }}>
        <Icon name="calculator" size="sm" color="currentColor" />
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {has ? `${value} · ${valueNombre ?? ""}` : "Elegí actividad (tarea)…"}
        </span>
      </button>
      <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)} minWidth={320}>
        <div className="nsl-list" style={{ display: "flex", flexDirection: "column", gap: 2, overflowY: "auto", maxHeight: 300, padding: 6 }}>
          {loading && <div className="ds-muted ds-body-sm" style={{ padding: 12, textAlign: "center" }}>Cargando actividades…</div>}
          {!loading && tasks.length === 0 && <div className="ds-muted ds-body-sm" style={{ padding: 12, textAlign: "center" }}>Sin actividades para esta obra.</div>}
          {!loading && tasks.map((t) => (
            <button key={t.jobTaskNo} type="button" onClick={() => { onPick(t.jobTaskNo, t.descripcion); setOpen(false); }}
              className="nsl-opt row" style={{ gap: 10, alignItems: "center", width: "100%", textAlign: "left", padding: "10px 12px", border: 0, borderRadius: 10, cursor: "pointer", background: t.jobTaskNo === value ? "var(--ds-color-gray-100)" : "transparent" }}>
              <span className="ds-label ds-strong" style={{ minWidth: 36, flexShrink: 0 }}>{t.jobTaskNo}</span>
              <span className="ds-body-sm">{t.descripcion}</span>
            </button>
          ))}
        </div>
      </Popover>
    </div>
  );
}

// ─── Chip de OBRA: colapsado muestra SOLO el código (corto, ej. VN-B.24). Al pasar
//     el mouse se abre un panel con el detalle (nombre). Click abre el buscador. Se
//     ve DISTINTO al buscador de materiales; amarillo mientras no se elige. ─────────
function ObraChip({ obras, value, nombre, onPick }: {
  obras: Item[]; value?: string; nombre?: string; onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => filtrar(obras, q), [q, obras]);
  const has = !!value;
  const label = has ? value! : "Elegí obra"; // colapsado = código
  return (
    <div ref={wrapRef} style={{ display: "inline-flex", maxWidth: "100%" }}>
      {/* Colapsado = código. Al pasar el mouse, el nombre se despliega A LA DERECHA en
          la misma línea (expansión inline con transición CSS, sin panel flotante). */}
      <button type="button" className="nsl-obrachip" data-empty={has ? undefined : "1"} aria-label={nombre || label}
        onClick={() => { const n = !open; setOpen(n); if (n) setTimeout(() => inputRef.current?.focus(), 0); }}>
        {has ? (
          <>
            <span className="nsl-obrachip__label">{value}</span>
            {nombre && <span className="nsl-obrachip__more"><span className="nsl-obrachip__moreinner">{nombre}</span></span>}
          </>
        ) : (
          <>
            <span className="nsl-obrachip__label">OBRA</span>
            <svg className="nsl-obrachip__plus" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
          </>
        )}
      </button>
      <Popover anchorRef={wrapRef} open={open} onClose={() => { setOpen(false); setQ(""); }} minWidth={320}>
        <div style={{ width: "100%", padding: 8, display: "flex", flexDirection: "column" }}>
          <input ref={inputRef} value={q} placeholder="Buscar obra…" onChange={(e) => setQ(e.target.value)}
            style={{ margin: "2px 4px 8px", height: 40, borderRadius: 999, border: "1.5px solid var(--ds-color-gray-200)", background: "var(--ds-color-white)", padding: "0 14px", fontSize: 14, outline: "none" }} />
          <div className="nsl-list" style={{ display: "flex", flexDirection: "column", gap: 2, overflowY: "auto", maxHeight: 280 }}>
            {matches.length === 0 && <div className="ds-muted ds-body-sm" style={{ padding: 12, textAlign: "center" }}>Sin resultados.</div>}
            {matches.map((o) => (
              <button key={o.id} type="button" onClick={() => { onPick(o.id); setOpen(false); setQ(""); }}
                className={`nsl-opt col${o.id === value ? " is-active" : ""}`} style={{ gap: 2, alignItems: "flex-start", width: "100%", textAlign: "left", padding: "10px 14px", border: 0, borderRadius: 12, cursor: "pointer", background: "transparent" }}>
                <span className="ds-body-sm ds-strong">{o.title}</span>
                {o.sub && <span className="ds-muted ds-label">{o.sub}</span>}
              </button>
            ))}
          </div>
        </div>
      </Popover>
    </div>
  );
}

// ─── Prioridad como BOTÓN de ícono (bandera con color) que abre sus opciones ──────
function PrioridadBtn({ value, onChange }: { value: Pedido["prioridad"]; onChange: (v: Pedido["prioridad"]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const colorOf = (v: Pedido["prioridad"]) => (v === "urgente" ? "var(--ds-color-red-200)" : v === "alta" ? "var(--ds-color-yellow)" : "var(--ds-color-gray-300)");
  const sel = PRIORIDADES.find((p) => p.v === value)!;
  return (
    <div ref={ref} style={{ display: "inline-flex" }}>
      <button type="button" className="nsl-toolbtn" data-tip="Prioridad" data-active={value !== "normal" ? "1" : undefined} onClick={() => setOpen((o) => !o)} aria-label={`Prioridad: ${sel.label}`}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={colorOf(value)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 21V4h13l-2 4 2 4H4" /></svg>
      </button>
      <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)} minWidth={190}>
        <div style={{ padding: 6, display: "flex", flexDirection: "column", gap: 2 }}>
          {PRIORIDADES.map((p) => (
            <button key={p.v} type="button" onClick={() => { onChange(p.v); setOpen(false); }}
              className={`nsl-opt row${p.v === value ? " is-active" : ""}`} style={{ gap: 10, alignItems: "center", width: "100%", textAlign: "left", padding: "10px 12px", border: 0, borderRadius: 10, cursor: "pointer", background: "transparent" }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: colorOf(p.v), flexShrink: 0 }} />
              <span className="ds-body-sm ds-strong">{p.label}</span>
            </button>
          ))}
        </div>
      </Popover>
    </div>
  );
}

// ─── Comentario como BOTÓN de mensaje que abre el campo (popover). Activo si hay nota ─
// `para` = quién va a leer el comentario. En un pedido normal lo lee proveeduría; en
// un subcontrato no pasa por ahí, lo lee quien aprueba.
function ComentarioBtn({ value, onChange, required, para }: { value: string; onChange: (v: string) => void; required?: boolean; para?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const has = !!value.trim();
  const falta = !!required && !has; // obligatorio y aún vacío
  const label = falta ? "Comentario (obligatorio)" : "Comentario";
  return (
    <div ref={ref} style={{ display: "inline-flex", position: "relative" }}>
      <button type="button" className="nsl-toolbtn" data-tip={label} data-active={has ? "1" : undefined} onClick={() => setOpen((o) => !o)} aria-label={label}
        style={falta ? { boxShadow: "0 0 0 2px var(--ds-color-red-200)" } : undefined}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
        {falta && <span aria-hidden style={{ position: "absolute", top: -2, right: -2, width: 9, height: 9, borderRadius: "50%", background: "var(--ds-color-red-200)", border: "1.5px solid var(--ds-color-white)" }} />}
      </button>
      <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)} minWidth={400}>
        <div style={{ padding: 14, width: "100%" }}>
          <span className="ds-form-field__label" style={{ display: "block", marginBottom: 8 }}>Comentario para {para ?? "proveeduría"}{required ? " (obligatorio)" : ""}</span>
          <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={5} placeholder="Escribí una nota…"
            style={{ display: "block", width: "100%", minWidth: 372, height: 128, resize: "vertical", padding: "12px 14px", borderRadius: 12, border: "1.5px solid var(--ds-color-gray-200)", outline: "none", fontSize: 14, lineHeight: 1.5, boxSizing: "border-box", background: "var(--ds-color-white)", color: "var(--ds-color-ink)" }} />
        </div>
      </Popover>
    </div>
  );
}

// ─── Comentario POR LÍNEA: ícono de nota en cada material; abre un popover para
//     escribir una nota específica de esa línea (además del comentario del pedido). ──
// Comentario de UNA línea. Con texto se muestra el comentario en la fila (antes solo
// vivía en el tooltip del ícono y se leía a medias); vacío queda solo el ícono.
function LineaComentarioBtn({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const has = !!value.trim();
  const ico = (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
  );
  return (
    <div ref={ref} style={has
      ? { display: "flex", flex: "1 1 150px", minWidth: 0 }
      : { display: "inline-flex", flex: "0 0 auto" }}>
      {has ? (
        <button type="button" className="nsl-linenota" onClick={() => setOpen((o) => !o)}
          aria-label="Editar comentario de la línea">
          {ico}
          <span className="nsl-linenota__txt">{value.trim()}</span>
        </button>
      ) : (
      <button type="button" onClick={() => setOpen((o) => !o)} title="Comentario de la línea"
        aria-label="Agregar comentario a la línea"
        style={{ background: "none", border: 0, cursor: "pointer", color: "var(--ds-color-gray-400)", display: "grid", placeItems: "center", padding: 6, borderRadius: 8 }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
      </button>
      )}
      <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)} minWidth={300}>
        <div style={{ padding: 12, width: "100%" }}>
          <span className="ds-form-field__label" style={{ display: "block", marginBottom: 6 }}>Comentario de la línea</span>
          <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder="Nota para esta línea…"
            style={{ display: "block", width: "100%", minWidth: 276, height: 84, resize: "vertical", padding: "10px 12px", borderRadius: 10, border: "1.5px solid var(--ds-color-gray-200)", outline: "none", fontSize: 14, lineHeight: 1.5, boxSizing: "border-box", background: "var(--ds-color-white)", color: "var(--ds-color-ink)" }} />
        </div>
      </Popover>
    </div>
  );
}

// ─── "USAR PLANTILLA": BOTÓN (verde pálido vacío / gris con borde verde con
//     materiales) que abre el selector de plantillas. Igual que la referencia. ──────
function UsarPlantillaBtn({ items, value, onPick, onClear, filterNode, hasMateriales }: {
  items: Item[]; value?: string; onPick: (id: string) => void; onClear: () => void; filterNode?: React.ReactNode; hasMateriales?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => filtrar(items, q), [q, items]);
  return (
    <div ref={ref} style={{ width: "100%" }}>
      <button type="button" className="nsl-plantbtn" data-has={hasMateriales ? "1" : undefined}
        onClick={() => { const n = !open; setOpen(n); if (n) setTimeout(() => inputRef.current?.focus(), 0); }}>
        <span className="nsl-plantbtn__label">Usar plantilla</span>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
      </button>
      <Popover anchorRef={ref} open={open} onClose={() => { setOpen(false); setQ(""); }}>
        <div style={{ width: "100%", padding: 8, display: "flex", flexDirection: "column" }}>
          {filterNode && <div style={{ display: "flex", justifyContent: "center", paddingBottom: 8 }}>{filterNode}</div>}
          <input ref={inputRef} value={q} placeholder="Buscar plantilla…" onChange={(e) => setQ(e.target.value)}
            style={{ margin: "2px 4px 8px", height: 40, borderRadius: 999, border: "1.5px solid var(--ds-color-gray-200)", background: "var(--ds-color-white)", padding: "0 14px", fontSize: 14, outline: "none" }} />
          <div className="nsl-list" style={{ display: "flex", flexDirection: "column", gap: 2, overflowY: "auto", maxHeight: 280 }}>
            {value && <button type="button" onClick={() => { onClear(); setOpen(false); setQ(""); }} className="nsl-opt" style={{ textAlign: "left", padding: "10px 14px", border: 0, borderRadius: 12, cursor: "pointer", background: "transparent", color: "var(--ds-color-red-100)", fontWeight: 700 }}>Quitar plantilla</button>}
            {matches.length === 0 && <div className="ds-muted ds-body-sm" style={{ padding: 12, textAlign: "center" }}>Sin resultados.</div>}
            {matches.map((i) => (
              <button key={i.id} type="button" onClick={() => { onPick(i.id); setOpen(false); setQ(""); }}
                className={`nsl-opt col${i.id === value ? " is-active" : ""}`} style={{ gap: 2, alignItems: "flex-start", width: "100%", textAlign: "left", padding: "10px 14px", border: 0, borderRadius: 12, cursor: "pointer", background: "transparent" }}>
                <span className="ds-body-sm ds-strong">{i.title}</span>
                {i.sub && <span className="ds-muted ds-label">{i.sub}</span>}
              </button>
            ))}
          </div>
        </div>
      </Popover>
    </div>
  );
}

export function NuevaSolicitudSheet({ open, setOpen, seed, editar, preset, onGuardado }: {
  open: boolean; setOpen: (v: boolean) => void;
  /** "Copiar pedido": arranca con las líneas de otro pedido, pero crea uno nuevo. */
  seed?: NuevaSolicitudSeed | null;
  /** "Editar": el mismo drawer edita un pedido existente (guarda con editPedido). */
  editar?: NuevaSolicitudEdicion | null;
  /** Matriz: obra fija + clasificación de la celda. */
  preset?: NuevaSolicitudPreset | null;
  /** Aviso al crear/enviar/guardar (la Matriz marca la celda con esto). */
  onGuardado?: (info: { numero: string; enviado: boolean }) => void;
}) {
  const { articulos, obras, almacenes, proveedores, usuario, addPedido, editPedido, setPedidoEstado, createOrden, setOrdenEstado } = useStore();
  const toast = useToast();

  // Catálogo REAL de Business Central (respaldo al store si BC no responde).
  const [bcArt, setBcArt] = useState<Articulo[] | null>(null);
  const [bcObras, setBcObras] = useState<Obra[] | null>(null);
  const [bcAlm, setBcAlm] = useState<Almacen[] | null>(null);
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const ri = await fetch("/api/compras/bc/items");
        // TODO el catálogo, tal cual viene de BC: inventario, servicio y no
        // inventariable. El tipo solo se guarda para etiquetarlo en el buscador.
        const items: Articulo[] = ri.ok ? (((await ri.json()).items ?? []).map((i: any) => ({
          id: i.id, code: i.code, descripcion: i.descripcion, unidad: i.unidad || "UND", unidadCompra: i.unidadCompra || undefined, almacenDefault: "", precioReferencia: 0,
          tipo: (i.tipo === "servicio" || i.tipo === "no-inventario" ? i.tipo : "inventario") as Articulo["tipo"],
        }))) : [];
        const [ro, ra] = await Promise.all([fetch("/api/compras/bc/obras"), fetch("/api/compras/bc/almacenes")]);
        const obrasBc: Obra[] = ro.ok ? ((await ro.json()).obras ?? []) : [];
        const almBc: Almacen[] = ra.ok ? ((await ra.json()).almacenes ?? []) : [];
        if (cancel) return;
        if (items.length) setBcArt(items);
        if (obrasBc.length) setBcObras(obrasBc);
        if (almBc.length) setBcAlm(almBc);
      } catch { /* respaldo del store */ }
    })();
    return () => { cancel = true; };
  }, []);
  // Materiales sintetizados desde una plantilla cuando su código NO está en el
  // catálogo cargado (ej. BC no devolvió el catálogo completo). Así la plantilla
  // agrega sus líneas igual, usando la info que ella misma trae.
  const [extraArt, setExtraArt] = useState<Articulo[]>([]);
  // ACTIVOS FIJOS (AF-0001…). Son otro catálogo de BC, no artículos, así que se cargan
  // aparte y solo cuando se elige el tipo "Activo fijo". Se representan con la misma
  // forma que un Articulo —con id = code = el N.º del activo— para que el resto de la
  // pantalla (buscador, líneas, guardado) funcione sin ramificaciones.
  const [bcActivos, setBcActivos] = useState<Articulo[] | null>(null);
  // ACTIVIDADES (tareas de posteo) del proyecto MAQ. Son las mismas 5 para todos los
  // repuestos (CMAQ, MACT, FOR, POL, CERTIF), así que se piden junto con las máquinas.
  const [bcTareasMaq, setBcTareasMaq] = useState<{ jobTaskNo: string; descripcion: string }[] | null>(null);
  // MÁQUINAS del parque de maquinaria (MAQ00005 "TRACTOR MASSEY FERGUSON MF6711"…).
  // Salen de BC (tabla GomEqp Machine, la misma lista que se ve en la línea de un
  // pedido de compra), no del store: las del store son datos de demo. Se piden la
  // primera vez que se elige "Repuesto".
  const [bcMaq, setBcMaq] = useState<Maquina[] | null>(null);
  const catArticulos = useMemo(() => {
    const base = [...(bcArt ?? articulos), ...(bcActivos ?? [])];
    if (!extraArt.length) return base;
    const codes = new Set(base.map((a) => a.code));
    return [...base, ...extraArt.filter((e) => !codes.has(e.code))];
  }, [bcArt, articulos, extraArt, bcActivos]);
  const catObras = bcObras ?? obras;
  const catAlm = bcAlm ?? almacenes;
  // Proveedores (subcontratistas) desde BC. Solo hace falta en Subcontrato, así que
  // se pide la primera vez que se elige ese tipo (y no en cada apertura del drawer).
  const [bcProv, setBcProv] = useState<typeof proveedores | null>(null);
  const pidiendoProv = useRef(false);
  async function cargarProveedores() {
    if (pidiendoProv.current || bcProv) return;
    pidiendoProv.current = true;
    try {
      const r = await fetch("/api/compras/bc/vendors");
      const d = r.ok ? await r.json() : { proveedores: [] };
      if (Array.isArray(d.proveedores) && d.proveedores.length) setBcProv(d.proveedores);
    } catch { /* respaldo del store */ }
  }
  const catProv = bcProv ?? proveedores;

  const [tipo, setTipo] = useState<TipoSolicitud>("material");
  // Tag del pedido: ALM (a inventario de un almacén real) o CD (consumo directo).
  const [destinoMat, setDestinoMat] = useState<DestinoMat>("almacen");
  // Almacén REAL de BC elegido (ALM-GRAL, Agregados, Herramienta, Maquinaria…).
  // Se usa con el tag ALM (material/repuesto) y en el pedido de Stock.
  const [almacenSel, setAlmacenSel] = useState<string>(ALM_GENERAL);
  const [destino, setDestino] = useState(""); // repuesto → máquina
  // REPUESTO en CD: el PROYECTO siempre es MAQ (MAQUINARIA), pero la ACTIVIDAD se
  // elige entre las tareas de ese proyecto en BC (CMAQ, MACT, FOR, POL, CERTIF).
  // Arranca en CMAQ (PARQUE MAQUINARIA COSTES), que es donde van los repuestos.
  const [tareaMaq, setTareaMaq] = useState(TAREA_PARQUE_MAQUINARIA);
  const [tareaMaqNombre, setTareaMaqNombre] = useState("PARQUE MAQUINARIA COSTES");
  // SUBCONTRATO: proveedor (subcontratista) y moneda de la orden.
  const [proveedorId, setProveedorId] = useState("");
  const [currency, setCurrency] = useState("");
  const [prioridad, setPrioridad] = useState<Pedido["prioridad"]>("normal");
  const [lineas, setLineas] = useState<Row[]>([]);
  // Tarjetas de obra (material). Arranca con una vacía para elegir obra + materiales.
  // Vacío al inicio (solo se ve "Agregar obra"). Con obra de contexto (Matriz) se
  // arranca con SU tarjeta, así el pedido ya viene apuntado a esa obra.
  const [grupos, setGrupos] = useState<Grupo[]>(() => (preset?.obraCodigo ? [{ key: uid(), obraCodigo: preset.obraCodigo }] : []));
  const [openMat, setOpenMat] = useState<string[]>([]); // grupos con el buscador de material abierto (independiente por tarjeta)
  const [cardMenuKey, setCardMenuKey] = useState<string | null>(null); // menú ⋮ de una tarjeta de obra
  const [flashKey, setFlashKey] = useState<string | null>(null); // resalta una línea ya existente
  const [guardarPlantOpen, setGuardarPlantOpen] = useState(false);
  const [nombrePlant, setNombrePlant] = useState("");
  const [savingPlant, setSavingPlant] = useState(false);
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [confirmPedir, setConfirmPedir] = useState(false); // confirmación antes de enviar
  const varCache = useRef<Record<string, Variante[]>>({});
  const uomCache = useRef<Record<string, UnidadItem[]>>({});
  const seedApplied = useRef(false); // copiar/editar: aplicar la semilla una sola vez por apertura
  const plantAuto = useRef(false);   // Matriz: cargar la plantilla de la clasificación una sola vez
  // Editando un pedido existente (mismo drawer, botón "Guardar cambios").
  const editandoId = editar?.id ?? null;
  const semilla = editar?.seed ?? seed ?? null;
  // Clasificación WBS (celda de la Matriz): del preset o del pedido que se edita/copia.
  const idClasificacion = preset?.idClasificacion ?? semilla?.idClasificacion ?? null;
  const obraPreset = preset?.obraCodigo ?? undefined;
  const [varMap, setVarMap] = useState<Record<string, Variante[]>>({});
  const [uomMap, setUomMap] = useState<Record<string, UnidadItem[]>>({});
  const [fTipoPl, setFTipoPl] = useState<FTipo>("todas");
  const [plantillaSel, setPlantillaSel] = useState("");                          // plantilla elegida (para mostrarla en el campo)

  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  useEffect(() => {
    (async () => { try { const r = await fetch("/api/compras/plantillas"); if (r.ok) setPlantillas(((await r.json()).plantillas ?? []) as Plantilla[]); } catch { /* prototipo */ } })();
  }, []);

  async function getVariantes(code: string): Promise<Variante[]> {
    if (!code) return [];
    if (varCache.current[code]) return varCache.current[code];
    try {
      const r = await fetch(`/api/compras/bc/variants?item=${encodeURIComponent(code)}`);
      const vs = (r.ok ? (await r.json()).variantes ?? [] : []) as Variante[];
      varCache.current[code] = vs; setVarMap((m) => ({ ...m, [code]: vs })); return vs;
    } catch { return []; }
  }
  // Variantes Y unidades del artículo de cada línea, en la misma pasada.
  useEffect(() => {
    for (const l of lineas) {
      const a = catArticulos.find((x) => x.id === l.articuloId);
      if (!a?.code) continue;
      getVariantes(a.code);
      getUnidades(a.code);
    }
  }, [lineas, catArticulos]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── UNIDADES del artículo (mismo patrón que las variantes) ────────────────────
  // Un material se consume en una unidad y se compra en otra: la solicitud tiene que
  // ir en la unidad con la que se le pide al proveedor. Las unidades y su factor
  // salen de BC por artículo, se cachean y se piden al agregar la línea.
  async function getUnidades(code: string): Promise<UnidadItem[]> {
    if (!code) return [];
    if (uomCache.current[code]) return uomCache.current[code];
    try {
      const r = await fetch(`/api/compras/bc/unidades?item=${encodeURIComponent(code)}`);
      const us = (r.ok ? (await r.json()).unidades ?? [] : []) as UnidadItem[];
      uomCache.current[code] = us; setUomMap((m) => ({ ...m, [code]: us })); return us;
    } catch { return []; }
  }
  // Unidades OFRECIBLES de una línea (sin HRS, con la base garantizada) y la elegida.
  const unidadesDe = (l: Row): UnidadItem[] => {
    const a = catArticulos.find((x) => x.id === l.articuloId);
    if (!a) return [];
    return unidadesOfrecidas(uomMap[a.code] ?? [], a.unidad, a.tipo);
  };
  /** ¿Ya contestó BC con las unidades de este artículo? Mientras no conteste, el factor
   *  es 1 por defecto y cualquier conversión daría un número plausible y equivocado —
   *  que es exactamente el patrón del error que esto viene a evitar. */
  const unidadesListas = (l: Row): boolean => {
    const a = catArticulos.find((x) => x.id === l.articuloId);
    return !!a && uomMap[a.code] !== undefined;
  };
  const unidadDe = (l: Row): string => {
    if (l.unidad) return l.unidad;                       // la que eligió la persona
    const a = catArticulos.find((x) => x.id === l.articuloId);
    if (!a) return "";
    const us = uomMap[a.code];
    // Mientras BC no conteste, la base: es lo que se venía mandando siempre.
    return us ? unidadPorDefecto(us, a.unidad, a.unidadCompra, a.tipo) : a.unidad;
  };
  const factorDe = (l: Row, code?: string): number => {
    const c = (code ?? unidadDe(l)).toUpperCase();
    return unidadesDe(l).find((u) => u.code.toUpperCase() === c)?.factor ?? 1;
  };


  // ── Stock del Almacén General, para sugerir cuánto pedir ──────────────────────
  // Aplica al material de obra que va a inventario (no al de consumo inmediato):
  // existencias del almacén (una llamada), sumadas por artículo (itemNo = código).
  const [stockPorCode, setStockPorCode] = useState<Record<string, number>>({});
  const [stockReady, setStockReady] = useState(false);
  // Con almacén (tag ALM o pedido de Stock) se muestran las columnas de existencias
  // del almacén ELEGIDO; en consumo directo no hay inventario que mirar.
  const usaAlmacen = tipo === "stock" || (tipo !== "subcontrato" && tipo !== "activo" && destinoMat === "almacen");
  const verStock = usaAlmacen && !!almacenSel;
  useEffect(() => {
    if (!verStock) { setStockReady(false); setStockPorCode({}); return; }
    let cancel = false;
    setStockReady(false);
    fetch(`/api/compras/bc/existencias?locationCode=${encodeURIComponent(almacenSel)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancel) return;
        const map: Record<string, number> = {};
        for (const e of (d?.existencias ?? []) as { itemNo: string; cantidad: number }[]) {
          map[e.itemNo] = (map[e.itemNo] ?? 0) + (Number(e.cantidad) || 0);
        }
        setStockPorCode(map);
        setStockReady(true);
      })
      .catch(() => { if (!cancel) { setStockPorCode({}); setStockReady(true); } });
    return () => { cancel = true; };
  }, [verStock, almacenSel]);

  // Con el stock listo, prellenar "pedir" = max(0, requerido − stock) en las líneas de
  // Bodega que vienen de plantilla. Una sola vez por línea (autoPedir → false al aplicar),
  // así no pisa lo que el usuario ajuste después.
  useEffect(() => {
    if (!verStock || !stockReady) return;
    setLineas((ls) => {
      let changed = false;
      const next = ls.map((l) => {
        if (!l.autoPedir || l.requerido == null) return l;
        // Sin las unidades del artículo el factor sería 1 y "plantilla − stock" restaría
        // gramos a estañones: la línea quedaría en 0 y NUNCA se recalcularía (autoPedir
        // se apaga). Se espera; el efecto vuelve a correr cuando llegan.
        if (!unidadesListas(l)) return l;
        changed = true;
        const stock = stockEnUnidad(l);
        return { ...l, cantidad: Math.max(0, l.requerido - stock), autoPedir: false };
      });
      return changed ? next : ls;
    });
  }, [verStock, stockReady, stockPorCode, lineas, catArticulos, uomMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // Las máquinas se piden la primera vez que se elige "Repuesto" (igual que los
  // activos: es otro catálogo de BC y la mayoría de los pedidos no lo usa).
  useEffect(() => {
    if (tipo !== "repuesto" || bcMaq) return;
    let cancel = false;
    fetch("/api/compras/bc/maquinas")
      .then((r) => (r.ok ? r.json() : { maquinas: [] }))
      .then((d) => {
        if (cancel) return;
        setBcMaq(((d.maquinas ?? []) as any[]).map((m) => ({
          id: m.no, no: m.no, nombre: m.nombre || m.no, placa: m.placa || undefined,
        })));
      })
      .catch(() => { /* sin catálogo: el selector queda vacío y no se puede pedir CD */ });
    return () => { cancel = true; };
  }, [tipo, bcMaq]);

  // Las actividades del proyecto MAQ, junto con las máquinas (mismo tipo de pedido).
  useEffect(() => {
    if (tipo !== "repuesto" || bcTareasMaq) return;
    let cancel = false;
    fetch(`/api/compras/bc/jobtasks?jobNo=${encodeURIComponent(OBRA_MAQUINARIA)}`)
      .then((r) => (r.ok ? r.json() : { jobTasks: [] }))
      .then((d) => {
        if (cancel) return;
        const rows = (d.jobTasks ?? []) as { jobTaskNo: string; descripcion: string; tipo: string }[];
        setBcTareasMaq(rows.filter((t) => t.tipo === "Posting").map((t) => ({ jobTaskNo: t.jobTaskNo, descripcion: t.descripcion })));
      })
      .catch(() => { /* si BC no contesta queda la de por defecto (CMAQ) */ });
    return () => { cancel = true; };
  }, [tipo, bcTareasMaq]);

  // El catálogo de activos se pide la primera vez que se elige el tipo "Activo fijo"
  // (no en el montaje: es otro catálogo y la mayoría de los pedidos no lo usan).
  useEffect(() => {
    if (tipo !== "activo" || bcActivos) return;
    let cancel = false;
    fetch("/api/compras/bc/activos")
      .then((r) => (r.ok ? r.json() : { activos: [] }))
      .then((d) => {
        if (cancel) return;
        setBcActivos(((d.activos ?? []) as any[]).map((a) => ({
          // id = code = el N.º del activo: es lo que se guarda en la línea y lo que
          // viaja a BC como N.º de la línea tipo "Activo fijo".
          id: a.no, code: a.no, descripcion: a.descripcion || a.no,
          unidad: "UND", almacenDefault: a.clase ?? "", precioReferencia: 0,
          tipo: "no-inventario" as Articulo["tipo"],
        })));
      })
      .catch(() => { /* sin catálogo: el buscador queda vacío y no se puede pedir */ });
    return () => { cancel = true; };
  }, [tipo, bcActivos]);

  const tipoMeta = TIPOS.find((t) => t.v === tipo)!;
  const esMaterial = tipo === "material";
  const esRepuesto = tipo === "repuesto";
  const esStock = tipo === "stock";
  // SUBCONTRATO: servicio contratado contra la obra. El ingeniero arma la solicitud
  // Y la orden de compra (proveedor + montos), que nace pendiente de aprobación.
  const esSub = tipo === "subcontrato";
  // ACTIVO FIJO: se compra un activo de BC (AF-0001). No lleva obra ni almacén —no
  // entra a inventario ni se consume contra un proyecto— y no usa plantillas.
  const esActivoTipo = tipo === "activo";
  // Repuesto, Stock y Activo no llevan obra: una sola lista (grupo SOLO).
  const sinObra = esRepuesto || esStock || esActivoTipo;
  // Consumo directo de material: se consume contra proyecto + tarea de la obra.
  const esConsumo = esMaterial && destinoMat === "consumo";
  // Consumo directo de REPUESTO: se lo lleva una máquina. No hay obra ni tarea que
  // elegir —siempre es el proyecto MAQ (MAQUINARIA) · tarea CMAQ (PARQUE MAQUINARIA)
  // y el almacén MAQ—, lo único que se elige es la MÁQUINA, el material y la cantidad.
  // Con el tag ALM el repuesto entra a inventario del almacén elegido y no lleva máquina.
  const esRepuestoCD = esRepuesto && destinoMat === "consumo";
  // Las obras BLOQUEADAS en BC no se ofrecen: BC no les deja cargar material, así que
  // el pedido nacería condenado a no poder lanzarse (caso VN-K.26 / CP-005132). Si la
  // obra ya venía elegida (copiar/editar/Matriz) igual se muestra, marcada.
  const obraItems: Item[] = useMemo(
    () => catObras.filter((o) => !o.bloqueada).map((o) => ({ id: o.codigo, title: o.nombre, sub: o.codigo })),
    [catObras],
  );
  const obrasBloqueadas = useMemo(() => new Set(catObras.filter((o) => o.bloqueada).map((o) => o.codigo)), [catObras]);
  const catMaquinas = useMemo(() => bcMaq ?? [], [bcMaq]);
  const tareaMaqItems: Item[] = useMemo(() => {
    const items = (bcTareasMaq ?? []).map((t) => ({ id: t.jobTaskNo, title: t.descripcion, sub: t.jobTaskNo }));
    // Mientras BC no responde, la elegida (CMAQ por defecto) igual se lee en el campo.
    if (tareaMaq && !items.some((i) => i.id === tareaMaq)) items.unshift({ id: tareaMaq, title: tareaMaqNombre || tareaMaq, sub: tareaMaq });
    return items;
  }, [bcTareasMaq, tareaMaq, tareaMaqNombre]);
  const destinoItems: Item[] = useMemo(() => {
    if (esRepuesto) return catMaquinas.map((m) => ({ id: m.no, title: m.nombre, sub: m.placa ? `${m.no} · ${m.placa}` : m.no }));
    return obraItems;
  }, [esRepuesto, obraItems, catMaquinas]);
  // Almacenes de BC donde se puede pedir: por defecto SOLO las bodegas (Almacén
  // General, Agregados, Maderas, Herramienta, Maquinaria, Generales…), que es lo que
  // se compra. Con "Ver todos" salen también las ubicaciones de obra/casa, por si
  // alguna vez hace falta una. Los ALM-* van primero.
  const [verTodosAlm, setVerTodosAlm] = useState(false);
  const almacenItems: Item[] = useMemo(() => {
    const orden = (c: string) => (c.toUpperCase().startsWith("ALM-") ? 0 : 1);
    return [...catAlm]
      .filter((a) => verTodosAlm || esAlmacenDeBodega(a.codigo) || a.codigo === almacenSel)
      .sort((a, b) => orden(a.codigo) - orden(b.codigo) || a.codigo.localeCompare(b.codigo))
      .map((a) => ({ id: a.codigo, title: (a.nombre ?? "").trim() || a.codigo, sub: a.codigo }));
  }, [catAlm, verTodosAlm, almacenSel]);
  // Filtro arriba de la lista del dropdown de almacenes.
  const filtroAlm = (
    <Segmented size="sm" value={verTodosAlm ? "todos" : "bodegas"}
      options={[{ v: "bodegas", label: "Bodegas" }, { v: "todos", label: "Todos" }]}
      onChange={(v: string) => setVerTodosAlm(v === "todos")} />
  );
  const almacenNombre = almacenItems.find((a) => a.id === almacenSel)?.title ?? almacenSel;
  // La unidad NO va en la lista de búsqueda (solo el código); la unidad se muestra
  // en la línea ya agregada, junto a la cantidad.
  const articuloItems: Item[] = useMemo(() => catArticulos.map((a) => ({ id: a.id, title: a.descripcion, sub: a.code, tag: etiquetaTipoArticulo(a.tipo) || undefined })), [catArticulos]);
  // SUBCONTRATO: solo artículos de tipo SERVICIO (los SUB_* de BC: eléctrico, tapias,
  // ventanería, cerámica…). Son los que en BC van sin almacén y se consumen contra el
  // proyecto + la tarea. Si BC no devolvió el tipo de los artículos (el enriquecido de
  // la API estándar falló), se ofrece el catálogo completo para no dejar el buscador
  // vacío. El TAG del tipo no se muestra: acá todos son servicios.
  const servicioItems: Item[] = useMemo(() => {
    const servicios = catArticulos.filter((a) => a.tipo === "servicio");
    const base = servicios.length ? servicios : catArticulos;
    return base.map((a) => ({ id: a.id, title: a.descripcion, sub: a.code }));
  }, [catArticulos]);
  // El buscador de un pedido de activos lista los ACTIVOS de BC con su clase
  // (HERR / MAQ / VEH), que es como se reconocen en la lista de BC.
  const activoItems: Item[] = useMemo(
    () => (bcActivos ?? []).map((a) => ({ id: a.id, title: a.descripcion, sub: a.almacenDefault ? `${a.code} · ${a.almacenDefault}` : a.code })),
    [bcActivos],
  );
  const itemsBuscador = esSub ? servicioItems : esActivoTipo ? activoItems : articuloItems;
  const provItems: Item[] = useMemo(() => catProv.map((p) => ({ id: p.id, title: p.nombre, sub: p.code })), [catProv]);
  const provSel = catProv.find((p) => p.id === proveedorId);
  const destinoNombre = destinoItems.find((d) => d.id === destino)?.title ?? "";
  const obraNombreDe = (code: string) => catObras.find((o) => o.codigo === code)?.nombre ?? code;

  const esBodega = (p: Plantilla) => p.tipo === "bodega" || (!p.tipo && p.idClasificacion == null);
  const plantillaItems: Item[] = useMemo(() => plantillas
    // En contexto de una clasificación (Matriz), SOLO las plantillas de esa celda.
    .filter((p) => idClasificacion == null || Number(p.idClasificacion) === Number(idClasificacion))
    .filter((p) => fTipoPl === "mias" ? (p.creadoPor ?? "") === (usuario ?? "")
      : fTipoPl === "bodega" ? esBodega(p)
      : fTipoPl === "general" ? !esBodega(p) : true)
    .map((p) => ({ id: String(p.id), title: p.nombre, sub: esBodega(p) ? "Bodega" : "General" })), [plantillas, fTipoPl, usuario, idClasificacion]);

  const validLines = lineas.filter((l) => l.articuloId && l.cantidad > 0);
  // Para la vista previa (material): materiales agrupados por obra (una sección por obra).
  const gruposPreview = grupos.map((g) => ({ g, filas: validLines.filter((l) => l.grupoKey === g.key) })).filter((x) => x.filas.length > 0);
  // Disclosure progresivo: al inicio solo Tipo + Plantilla + "Agregar obra". Prioridad y
  // Comentario aparecen recién cuando hay materiales. La Plantilla se esconde apenas el
  // usuario empieza a armar obras/materiales a mano (salvo que haya una elegida).
  const hayMateriales = lineas.length > 0;
  const hasData = validLines.length > 0 || !!destino || notas.trim().length > 0;
  const variantesDe = (l: Row) => { const a = catArticulos.find((x) => x.id === l.articuloId); return a ? (varMap[a.code] ?? []) : []; };
  const necesitaVariante = (l: Row) => { const vs = variantesDe(l); return vs.length > 0 && !l.variantCode; };
  // Material: cada línea debe tener obra (su tarjeta debe tener obra elegida).
  // Repuesto: máquina. Stock: almacén.
  const destinoOk = (esMaterial || esSub) ? (validLines.length > 0 && validLines.every((l) => !!l.obraCodigo))
    // Un activo ES su propio destino: no hay obra, máquina ni almacén que elegir.
    : esActivoTipo ? validLines.length > 0
    // Repuesto: con CD hace falta la MÁQUINA; con ALM basta el almacén (almacenOk).
    : esRepuesto ? (!esRepuestoCD || !!destino) : !!almacenSel;
  // Subcontrato: proveedor obligatorio (es quien va a facturar) y todas las líneas
  // con monto. Sin monto la orden no se puede lanzar a BC (línea sin precio).
  const proveedorOk = !esSub || !!proveedorId;
  const montosOk = !esSub || validLines.every((l) => (l.monto ?? 0) > 0);
  // Con tag ALM (o en Stock) hace falta el almacén real elegido.
  const almacenOk = !usaAlmacen || !!almacenSel;
  const comentarioOk = notas.trim().length > 0; // comentario para proveeduría OBLIGATORIO al solicitar
  // Consumo inmediato: sin tarea BC no puede consumir contra el proyecto, así que la
  // actividad es obligatoria en cada obra que tenga líneas.
  const tareasOk = (!esConsumo && !esSub) || grupos.every((g) => !lineas.some((l) => l.grupoKey === g.key) || !!g.taskNo);
  // Repuesto en CD: sin actividad BC no consume la línea contra el parque de maquinaria.
  const tareaMaqOk = !esRepuestoCD || !!tareaMaq;
  // Obra bloqueada en BC: puede llegar por copiar/editar un pedido viejo, por plantilla
  // o desde la Matriz. No se puede pedir contra ella (BC rechaza la línea), así que se
  // avisa y no se deja seguir — mejor acá que con el pedido ya creado en BC.
  const obrasChocadas = useMemo(
    () => [...new Set(grupos.map((g) => g.obraCodigo).filter((c): c is string => !!c && obrasBloqueadas.has(c)))],
    [grupos, obrasBloqueadas],
  );
  const canContinue = validLines.length > 0 && destinoOk && almacenOk && comentarioOk && tareasOk && tareaMaqOk
    && proveedorOk && montosOk
    && obrasChocadas.length === 0 && validLines.every((l) => !necesitaVariante(l));
  // Total del subcontrato (para la confirmación y el pie del panel).
  const totalSub = useMemo(() => validLines.reduce((t, l) => t + l.cantidad * (l.monto ?? 0), 0), [validLines]);

  function reset() {
    setTipo("material"); setDestinoMat("almacen"); setAlmacenSel(ALM_GENERAL); setDestino(""); setPrioridad("normal");
    setTareaMaq(TAREA_PARQUE_MAQUINARIA); setTareaMaqNombre("PARQUE MAQUINARIA COSTES");
    setProveedorId(""); setCurrency("");
    setLineas([]); setGrupos([]); setNotas(""); setSaving(false); setFTipoPl("todas");
    setCardMenuKey(null); setOpenMat([]); setPlantillaSel(""); setExtraArt([]); setConfirmPedir(false);
    setBorradorRecuperado(false);
    plantAuto.current = false;
  }
  /** El pedido ya quedó guardado en la base: el borrador local sobra. */
  function limpiarBorradorLocal() { borrarBorradorPedido(); setBorradorRecuperado(false); }
  function close() { setConfirmExit(false); setConfirmPedir(false); setOpen(false); setTimeout(reset, 260); }
  function requestDismiss() { if (hasData && !saving) setConfirmExit(true); else close(); }

  // Cambiar el almacén re-arma el sugerido de las líneas que vienen de plantilla:
  // "pedir" vuelve a ser plantilla − stock, pero del almacén NUEVO.
  function cambiarAlmacen(code: string) {
    if (code === almacenSel) return;
    setAlmacenSel(code);
    // stockReady=false ACÁ (no solo en el fetch): si no, el prellenado corre en el
    // mismo commit con las existencias del almacén VIEJO y se quema el autoPedir.
    setStockReady(false);
    setLineas((ls) => ls.map((l) => (l.requerido != null ? { ...l, autoPedir: true } : l)));
  }

  // Cambia el tipo de solicitud y limpia lo dependiente (obra/almacén/materiales).
  function cambiarTipo(v: TipoSolicitud) {
    setTipo(v); setDestino(""); setPlantillaSel("");
    setProveedorId(""); setCurrency("");
    // Subcontrato: una sola obra (una tarjeta) y hace falta el catálogo de proveedores.
    if (v === "subcontrato") cargarProveedores();
    // Cambiar de tipo arranca de nuevo: destino ALM (a inventario). Stock ADEMÁS es
    // siempre a un almacén y sus plantillas son las de Bodega → el filtro del
    // selector arranca ahí.
    setDestinoMat("almacen");
    setFTipoPl(v === "stock" ? "bodega" : "todas");
    setLineas([]); setOpenMat([]); setCardMenuKey(null);
    // El subcontrato arranca con su tarjeta de obra ya puesta (siempre es una sola).
    setGrupos(v === "subcontrato" ? [{ key: uid() }] : []);
  }

  // Convierte una lista de líneas (código/obra/variante/cantidad) en el modelo del
  // drawer: una tarjeta (grupo) por obra + sus filas. Bodega/repuesto → grupo único
  // (SOLO), sin obra. Los materiales que no estén en el catálogo cargado se sintetizan
  // con su código/descr/unidad para no perder la línea. Reutilizado por plantillas y
  // por "Copiar pedido".
  function armarGruposFilas(lineasIn: PlantillaLinea[], bodega: boolean): { grupos: Grupo[]; rows: Row[]; extras: Articulo[] } {
    const extras: Articulo[] = [];
    const rows: Row[] = [];
    const nuevosGrupos: Grupo[] = [];
    const porObra = new Map<string, string>(); // obraCodigo ("" = sin obra) -> grupoKey
    for (const pl2 of lineasIn) {
      if (!pl2.code) continue;
      let a = catArticulos.find((x) => x.code === pl2.code) ?? extras.find((x) => x.code === pl2.code);
      // Código con la VARIANTE PEGADA ("M11-0066 -VAR 01"): así quedaron 12 líneas de las
      // plantillas de Bodega. Se separa y se busca el artículo REAL, así la línea nace con
      // su unidad de BC (GAL, CUBETA…) en vez del "UND" de relleno, con precio, y con la
      // variante en su campo — que además es lo que BC exige para poder lanzarla.
      let variantePegada: string | undefined;
      if (!a) {
        const sep = separarVariantePegada(pl2.code);
        if (sep.variantCode) {
          const base = catArticulos.find((x) => x.code === sep.code) ?? extras.find((x) => x.code === sep.code);
          if (base) { a = base; variantePegada = sep.variantCode; }
        }
      }
      if (!a) {
        a = { id: pl2.code, code: pl2.code, descripcion: pl2.descripcion || pl2.code, unidad: pl2.unidad || "UND", almacenDefault: "", precioReferencia: 0, tipo: "inventario" };
        extras.push(a);
      }
      // Obra de la línea: la que traiga, o la del contexto (Matriz).
      const oc = bodega ? "" : (pl2.obraCodigo || obraPreset || "");
      let gKey: string;
      if (bodega) gKey = SOLO;
      else {
        gKey = porObra.get(oc) ?? "";
        if (!gKey) {
          gKey = uid(); porObra.set(oc, gKey);
          // La tarea (consumo directo) viene con la línea al copiar/editar.
          nuevosGrupos.push({ key: gKey, obraCodigo: oc || undefined, obraNombre: oc ? obraNombreDe(oc) : undefined,
            taskNo: pl2.taskNo || undefined, taskNombre: pl2.taskDescr || undefined });
        }
      }
      // La UNIDAD viaja con la línea (plantilla nueva o pedido copiado): sin esto la
      // cantidad quedaría pensada en una unidad y expresada en la base. Las plantillas
      // viejas la traen vacía y la resuelve el efecto que fija la unidad por defecto.
      // La variante: la de la línea, o la que venía pegada al código. El nombre de la
      // variante, cuando venía pegada, es la descripción que traía la plantilla ("MINIO
      // ROJO"), que es justamente la de la variante y no la del artículo.
      const vCode = pl2.variantCode || variantePegada;
      const vNombre = pl2.variantNombre || (variantePegada ? pl2.descripcion : undefined);
      // La unidad de la plantilla solo se respeta si trae algo: las de Bodega la
      // guardaron vacía, y ahí manda la del artículo de BC.
      rows.push({ key: uid(), grupoKey: gKey, articuloId: a.id, variantCode: vCode, variantNombre: vNombre, cantidad: pl2.cantidad || 1, unidad: (pl2.unidad ?? "").trim() || undefined, obraCodigo: oc || undefined, obraNombre: oc ? obraNombreDe(oc) : undefined });
    }
    return { grupos: nuevosGrupos, rows, extras };
  }

  // Carga una plantilla: agrupa sus materiales por obra → una tarjeta por obra.
  // Bodega: todo a un único grupo (SOLO), sin obra.
  function aplicarPlantilla(pl: Plantilla) {
    // "Bodega" describe la plantilla (lista de reposición), NO el armado: hoy una
    // plantilla de bodega es material de obra que va al Almacén General, así que sus
    // líneas también van en una tarjeta de obra. Grupo único (sin obra) solo en repuesto.
    const bodega = esBodega(pl);
    const { grupos: nuevosGrupos, rows, extras } = armarGruposFilas(pl.lineas, sinObra);
    if (extras.length) setExtraArt((prev) => { const codes = new Set(prev.map((a) => a.code)); return [...prev, ...extras.filter((e) => !codes.has(e.code))]; });
    // La plantilla puede traer el mismo material repetido en la misma obra: se
    // unifican (suma cantidades) para no cargar líneas duplicadas.
    const { rows: dedup, merged } = mergeDedup(rows);
    // Bodega: guardamos el "requerido" de la plantilla y marcamos la línea para que,
    // cuando llegue el stock del almacén, "pedir" arranque en max(0, requerido − stock).
    const finalRows = bodega ? dedup.map((l) => ({ ...l, requerido: l.cantidad, autoPedir: true })) : dedup;
    if (finalRows.length) {
      setGrupos(sinObra ? [] : nuevosGrupos);
      setLineas(finalRows);
      toast(`Plantilla "${pl.nombre}" cargada (${finalRows.length} materiales)${merged ? ` · ${merged} repetido${merged > 1 ? "s" : ""} unificado${merged > 1 ? "s" : ""}` : ""}`, "success");
    } else toast(`La plantilla "${pl.nombre}" no tiene materiales.`, "info");
  }

  // Copiar pedido: siembra el drawer con las líneas de un pedido existente. Mismo
  // armado que una plantilla; setea además tipo/prioridad/notas/destino del origen.
  function aplicarSeed(s: NuevaSolicitudSeed) {
    // Repuesto y Stock: grupo único sin obra (el destino es la máquina / el almacén).
    const soloUno = s.tipo === "repuesto" || s.tipo === "stock";
    const { grupos: gs, rows, extras } = armarGruposFilas(s.lineas, soloUno);
    if (extras.length) setExtraArt((prev) => { const codes = new Set(prev.map((a) => a.code)); return [...prev, ...extras.filter((e) => !codes.has(e.code))]; });
    const { rows: dedup } = mergeDedup(rows);
    setTipo(s.tipo);
    setDestinoMat(s.consumo ? "consumo" : "almacen");
    if (s.destino) setDestino(s.destino);
    // Repuesto de consumo directo: la actividad del parque de maquinaria viene en las
    // líneas del pedido copiado (no se pierde al copiar ni al editar).
    if (s.tipo === "repuesto" && s.consumo) {
      const t = s.lineas.find((l) => !!l.taskNo);
      if (t?.taskNo) { setTareaMaq(t.taskNo); setTareaMaqNombre(t.taskDescr ?? ""); }
    }
    if (s.almacen) setAlmacenSel(s.almacen);
    if (s.tipo === "stock") setFTipoPl("bodega");
    if (s.prioridad) setPrioridad(s.prioridad);
    if (s.notas) setNotas(s.notas);
    setGrupos(soloUno ? [] : gs);
    setLineas(dedup);
  }

  // Matriz: al abrir con una clasificación, cargar SU plantilla una sola vez.
  useEffect(() => {
    if (!open || idClasificacion == null || plantAuto.current || semilla) return;
    const pl = plantillas.find((p) => Number(p.idClasificacion) === Number(idClasificacion));
    if (!pl) return;
    plantAuto.current = true;
    cargarPlantilla(String(pl.id));
  }, [open, idClasificacion, plantillas]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al abrir el drawer con una semilla (botón "Copiar" o "Editar" del detalle),
  // precargar una sola vez. Al cerrar se limpia el flag para la próxima apertura.
  useEffect(() => {
    if (open && semilla && !seedApplied.current) { aplicarSeed(semilla); seedApplied.current = true; }
    if (!open) seedApplied.current = false;
  }, [open, seed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recuperar el borrador al abrir un pedido NUEVO en blanco (no con semilla ni Matriz).
  // Una sola vez por apertura; el aviso se muestra hasta que se descarte o se envíe.
  const [borradorRecuperado, setBorradorRecuperado] = useState(false);
  const borradorAplicado = useRef(false);
  useEffect(() => {
    if (!open) { borradorAplicado.current = false; return; }
    if (borradorAplicado.current || semilla || idClasificacion != null || obraPreset) return;
    borradorAplicado.current = true;
    const b = leerBorradorPedido();
    if (b) aplicarBorrador(b);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function aplicarBorrador(b: BorradorPedido) {
    setTipo(b.tipo); setDestinoMat(b.destinoMat); setAlmacenSel(b.almacenSel);
    setDestino(b.destino); setPrioridad(b.prioridad); setNotas(b.notas);
    setGrupos(b.grupos ?? []); setLineas(b.lineas ?? []);
    if (b.tipo === "subcontrato") { cargarProveedores(); setProveedorId(b.proveedorId ?? ""); setCurrency(b.currency ?? ""); }
    setBorradorRecuperado(true);
  }

  /** Subcontrato: al elegir el subcontratista se hereda su moneda (como en la orden). */
  function elegirProveedor(id: string) {
    setProveedorId(id);
    const p = catProv.find((x) => x.id === id);
    if (p) setCurrency(p.currencyCode ?? "");
  }

  // Guardar mientras se arma (con 600 ms de respiro, como en plantillas). No se guarda
  // lo que se está EDITANDO ni lo que vino con semilla: eso ya vive en la base.
  useEffect(() => {
    if (!open || editandoId || semilla) return;
    const t = setTimeout(() => {
      try {
        if (!lineas.length) { borrarBorradorPedido(); return; }
        const b: BorradorPedido = { tipo, destinoMat, almacenSel, destino, prioridad, notas, grupos, lineas, ts: Date.now(), proveedorId, currency };
        window.localStorage.setItem(CLAVE_BORRADOR_PEDIDO, JSON.stringify(b));
      } catch { /* modo privado / sin espacio */ }
    }, 600);
    return () => clearTimeout(t);
  }, [open, editandoId, semilla, tipo, destinoMat, almacenSel, destino, prioridad, notas, grupos, lineas, proveedorId, currency]);
  function cargarPlantilla(id: string) {
    const pl = plantillas.find((p) => String(p.id) === id);
    if (!pl) return;
    setPlantillaSel(id);
    // La plantilla NO cambia el tipo que eligió la persona: antes forzaba "material" y
    // con el tipo Stock eso devolvía el pedido a material. Las de Bodega (listas de
    // reposición) sí fijan el destino en ALM: van a inventario, no a consumo directo.
    if (esBodega(pl)) setDestinoMat("almacen");
    aplicarPlantilla(pl);
  }

  // Agrega un material a una obra (grupo). No permite el mismo material repetido
  // DENTRO de la misma obra; sí se puede pedir en otra obra (otra tarjeta).
  function addRow(grupoKey: string, articuloId: string, variantCode?: string, variantNombre?: string, cantidad = 1) {
    const g = grupos.find((x) => x.key === grupoKey);
    const obraCodigo = (esMaterial || esSub) ? g?.obraCodigo : undefined;
    const obraNombre = (esMaterial || esSub) ? g?.obraNombre : undefined;
    // Subcontrato: el MISMO servicio puede ir varias veces (dos alcances distintos del
    // mismo rubro, cada uno con su monto), así que acá no hay duplicado que colapsar.
    const ex = esSub ? undefined : lineas.find((l) => dupKey(l.grupoKey, l.articuloId, l.variantCode) === dupKey(grupoKey, articuloId, variantCode));
    if (ex) {
      const a = catArticulos.find((x) => x.id === articuloId);
      const scope = esMaterial && obraCodigo ? " en esta obra" : "";
      toast(`"${a?.descripcion ?? "Ese material"}" ya está${scope}. Cambiá la cantidad en su línea${esMaterial ? ", o agregalo a otra obra" : ""}.`, "info");
      setFlashKey(ex.key);
      setTimeout(() => setFlashKey((k) => (k === ex.key ? null : k)), 1800);
      return;
    }
    // El material nuevo se agrega ARRIBA (primero) dentro de su obra.
    const key = uid();
    setLineas((ls) => [{ key, grupoKey, articuloId, variantCode, variantNombre, cantidad, obraCodigo, obraNombre }, ...ls]);
    // Y en cuanto BC contesta con sus unidades, la línea FIJA la suya. Si no, la unidad
    // se calcularía al vuelo y la etiqueta pasaría sola de la base a la unidad de compra
    // cuando llega la respuesta: quien tecleó "100" viendo GR terminaría pidiendo 100
    // ESTAÑONES. Solo se fija mientras la línea está intacta (nadie tecleó todavía);
    // si ya se tocó, se respeta lo que la persona está viendo y ella la cambia a mano
    // —y ahí sí se convierte la cantidad.
    const art = catArticulos.find((x) => x.id === articuloId);
    if (art?.code) {
      getUnidades(art.code).then((us) => {
        const porDefecto = unidadPorDefecto(us, art.unidad, art.unidadCompra, art.tipo);
        if (!porDefecto) return;
        setLineas((ls) => ls.map((l) => (
          l.key === key && !l.unidad && l.cantidad === cantidad && l.monto == null && !l.detalle
            ? { ...l, unidad: porDefecto } : l
        )));
      });
    }
  }

  // ── Tarjetas de obra (grupos) ───────────────────────────────────────────────
  function addGrupo() { setGrupos((gs) => [...gs, { key: uid() }]); }
  function setGrupoTarea(grupoKey: string, taskNo: string, taskNombre: string) {
    setGrupos((gs) => gs.map((g) => (g.key === grupoKey ? { ...g, taskNo: taskNo || undefined, taskNombre: taskNombre || undefined } : g)));
  }
  function setGrupoObra(grupoKey: string, code: string) {
    // No se permiten dos tarjetas con la misma obra: los materiales de una obra van
    // todos en una sola tarjeta.
    if (code && grupos.some((g) => g.key !== grupoKey && g.obraCodigo === code)) {
      toast(`"${obraNombreDe(code)}" ya tiene una tarjeta. Agregá ahí sus materiales.`, "info");
      return;
    }
    const nombre = code ? obraNombreDe(code) : undefined;
    setGrupos((gs) => gs.map((g) => (g.key === grupoKey ? { ...g, obraCodigo: code || undefined, obraNombre: nombre, taskNo: undefined, taskNombre: undefined } : g)));
    // Sincroniza la obra en las líneas de esa tarjeta (para el resumen/plantilla/BC).
    setLineas((ls) => ls.map((l) => (l.grupoKey === grupoKey ? { ...l, obraCodigo: code || undefined, obraNombre: nombre } : l)));
  }
  function delGrupo(grupoKey: string) {
    setGrupos((gs) => gs.filter((g) => g.key !== grupoKey));
    setLineas((ls) => ls.filter((l) => l.grupoKey !== grupoKey));
    setCardMenuKey(null);
    setOpenMat((ks) => ks.filter((k) => k !== grupoKey));
  }
  // Duplica una obra: copia TODOS sus materiales (con cantidad y variante) a una
  // tarjeta NUEVA sin obra, para repetir el mismo set en otra casa cambiando solo
  // la obra. La tarjeta nueva se inserta justo debajo de la original.
  function duplicarGrupo(grupoKey: string) {
    const filas = lineas.filter((l) => l.grupoKey === grupoKey);
    const nuevoKey = uid();
    const copias: Row[] = filas.map((l) => ({ ...l, key: uid(), grupoKey: nuevoKey, obraCodigo: undefined, obraNombre: undefined }));
    setGrupos((gs) => { const i = gs.findIndex((g) => g.key === grupoKey); const copy = [...gs]; copy.splice(i < 0 ? gs.length : i + 1, 0, { key: nuevoKey }); return copy; });
    if (copias.length) setLineas((ls) => [...ls, ...copias]);
    setCardMenuKey(null);
    toast(copias.length ? `${copias.length} material(es) copiados — elegí la casa de la obra nueva.` : "Obra nueva agregada — elegí la casa.", "info");
  }

  const setLinea = (key: string, patch: Partial<Row>) => {
    // Cambiar la VARIANTE de una fila no puede dejarla idéntica a otra de la MISMA
    // obra (mismo artículo+variante). Si chocaría, avisamos y no aplicamos el cambio.
    if ("variantCode" in patch) {
      const cur = lineas.find((l) => l.key === key);
      if (cur) {
        const nextVar = "variantCode" in patch ? patch.variantCode : cur.variantCode;
        const choca = lineas.some((l) => l.key !== key && dupKey(l.grupoKey, l.articuloId, l.variantCode) === dupKey(cur.grupoKey, cur.articuloId, nextVar));
        if (choca) {
          const a = catArticulos.find((x) => x.id === cur.articuloId);
          toast(`"${a?.descripcion ?? "Ese material"}" con esa variante ya está en esta obra.`, "info");
          return;
        }
      }
    }
    setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };
  const delLinea = (key: string) => setLineas((ls) => ls.filter((l) => l.key !== key));

  /** Cambiar la unidad CONVIERTE la cantidad. Cambiar solo la etiqueta es exactamente
   *  el error que se quiere evitar: 1 estañón no es 1 gramo. Si la conversión no cabe
   *  en los 4 decimales que guarda la base (1 GR en estañones daría 0,0000 y la línea
   *  se perdería), no se cambia nada y se avisa. */
  function cambiarUnidad(l: Row, code: string) {
    const actual = unidadDe(l);
    if (!code || code.toUpperCase() === actual.toUpperCase()) return;
    const fd = factorDe(l, actual), fh = factorDe(l, code);
    const nueva = cantidadEntreUnidades(l.cantidad, fd, fh);
    if (nueva === null) { setLinea(l.key, { unidad: code }); return; }
    // No basta con que no dé 0: 100 GR en estañones dan 0,0004 EST, que al volver son
    // 102 GR. Un 2% de más con cara de correcto es justo lo que hay que evitar.
    if (l.cantidad > 0 && !conversionFiel(l.cantidad, fd, fh)) {
      toast(`${num.format(l.cantidad)} ${actual} no se puede expresar en ${code} sin desviarse. Ajustá la cantidad o dejalo en ${actual}.`, "info");
      return;
    }
    setLinea(l.key, { unidad: code, cantidad: nueva, autoPedir: false });
  }

  /** Existencias de BC en la unidad de la LÍNEA: BC las devuelve en unidad base, así
   *  que sin convertir la columna compararía gramos contra estañones. */
  const stockEnUnidad = (l: Row): number => {
    const a = catArticulos.find((x) => x.id === l.articuloId);
    const base = stockPorCode[a?.code ?? ""] ?? 0;
    const f = factorDe(l);
    // El stock puede venir NEGATIVO de BC; se convierte igual (dividir por el factor
    // no tiene problema con el signo).
    return f > 0 ? redondearCantidad(base / f) : base;
  };

  function headerObra(): { codigo?: string; nombre?: string } {
    if (!esMaterial && !esSub) return {};
    const codes = Array.from(new Set(validLines.map((l) => l.obraCodigo).filter(Boolean))) as string[];
    if (codes.length === 1) return { codigo: codes[0], nombre: obraNombreDe(codes[0]) };
    if (codes.length === 0) return {};
    return { codigo: "(varias)", nombre: "Varias obras" };
  }

  function buildInput(): NewPedidoInput {
    const h = headerObra();
    return {
      tipoSolicitud: tipo,
      // Stock: el encabezado guarda el ALMACÉN en el campo de obra (misma convención
      // que la pantalla vieja de pedidos a bodega). Material: la obra, o "(varias)".
      obraCodigo: (esMaterial || esSub) ? h.codigo : esStock ? almacenSel : undefined,
      obraNombre: (esMaterial || esSub) ? h.nombre : esStock ? almacenNombre : undefined,
      // La MÁQUINA solo existe en el repuesto de consumo directo. Con el tag ALM el
      // repuesto entra a inventario del almacén elegido y no se amarra a ninguna.
      maquinaNo: esRepuestoCD ? destino : undefined,
      maquinaNombre: esRepuestoCD ? destinoNombre : undefined,
      // Amarre a la celda de la Matriz (se conserva al editar).
      idClasificacion,
      solicitante: usuario ?? "",
      prioridad, notas: notas.trim() || undefined,
      lineas: validLines.map((l) => {
        const a = catArticulos.find((x) => x.id === l.articuloId)!;
        // SUBCONTRATO: la línea es el SERVICIO contratado. Cantidad 1 (el servicio se
        // factura completo, no por avances) y la descripción es el alcance que escribió
        // el ingeniero. Lleva obra + tarea como el consumo directo: en BC el artículo de
        // servicio no admite almacén y se consume contra el proyecto. El MONTO no va acá
        // —la tabla del pedido no tiene precio— sino en la orden que se crea enseguida.
        if (esSub) {
          const gs = grupos.find((x) => x.key === l.grupoKey);
          return {
            articuloId: a.id, descripcion: l.detalle?.trim() || a.descripcion,
            cantidad: l.cantidad, unidad: unidadDe(l) || a.unidad, almacen: l.obraCodigo || "",
            obraCodigo: l.obraCodigo || undefined,
            notas: l.notas?.trim() || undefined,
            taskNo: gs?.taskNo || undefined, taskDescr: gs?.taskNombre || undefined,
          };
        }
        // Consumo inmediato: la tarea (actividad) se elige por obra y se copia a cada línea.
        const g = esConsumo ? grupos.find((x) => x.key === l.grupoKey) : undefined;
        // Almacén de la línea: en consumo directo de MATERIAL es el almacén de la obra
        // (en BC tiene el mismo código que el proyecto, y así lo consume contra la
        // tarea); con tag ALM o en Stock es el almacén elegido; en consumo directo de
        // REPUESTO va al almacén de MAQUINARIA (BC no puede dejar la línea fuera de
        // inventario sin proyecto+tarea, y el repuesto va contra una máquina).
        // Un ACTIVO no lleva almacén: en BC la línea es tipo "Activo fijo" y el campo
        // ni siquiera es editable (mandarlo haría fallar el lanzamiento).
        const almacenLinea = esActivoTipo ? "" : esConsumo ? (l.obraCodigo || "") : usaAlmacen ? almacenSel : ALMACEN_MAQUINARIA;
        // REPUESTO en consumo directo: la línea va contra el parque de maquinaria —
        // proyecto MAQ (MAQUINARIA) · tarea CMAQ (PARQUE MAQUINARIA COSTES), almacén
        // MAQ (mismo código que el proyecto) — y la máquina viaja en el encabezado del
        // pedido. Sin la tarea, BC no consume la línea: el repuesto quedaría de
        // inventario en MAQ (es lo que venía pasando).
        if (esRepuestoCD) {
          return {
            articuloId: a.id, descripcion: l.variantNombre || a.descripcion, cantidad: l.cantidad,
            unidad: unidadDe(l) || a.unidad, almacen: ALMACEN_MAQUINARIA,
            obraCodigo: OBRA_MAQUINARIA, taskNo: tareaMaq || TAREA_PARQUE_MAQUINARIA, taskDescr: tareaMaqNombre || undefined,
            variantCode: l.variantCode || undefined, notas: l.notas?.trim() || undefined,
          };
        }
        // Si se eligió variante, se guarda la descripción de la variante (más específica);
        // si no, la descripción base del material.
        // unidad: la que ELIGIÓ la persona (EST, PQT…), no la base del catálogo. Es lo
        // que termina en dbo.PedidoCompraDet.unitOfMeasureCode y lo que decide con qué
        // unidad se le pide al proveedor.
        return { articuloId: a.id, descripcion: l.variantNombre || a.descripcion, cantidad: l.cantidad, unidad: unidadDe(l) || a.unidad, almacen: almacenLinea, obraCodigo: esMaterial ? (l.obraCodigo || undefined) : undefined, variantCode: l.variantCode || undefined, notas: l.notas?.trim() || undefined, taskNo: g?.taskNo || undefined, taskDescr: g?.taskNombre || undefined };
      }),
    };
  }

  /**
   * SUBCONTRATO: arma la ORDEN DE COMPRA del pedido recién creado y la deja pendiente
   * de aprobación. Un subcontrato no pasa por Proveeduría —el ingeniero ya eligió al
   * subcontratista y negoció los montos—, así que la solicitud y su orden nacen juntas
   * y lo único que falta es que Aprobación la apruebe (ahí se crea en BC) y que bodega
   * reciba la factura al terminar el servicio.
   * Cada línea va con cantidad 1 y el MONTO como precio unitario: el servicio se
   * factura completo, así que la recepción es del 100% y no hay fracciones.
   */
  async function crearOrdenSubcontrato(p: Pedido) {
    // Emparejar cada fila del panel con su línea ya guardada (para el enlace
    // pedido↔orden, que es lo que mueve el stepper y la recepción). Se busca por
    // artículo + descripción y se van consumiendo, así dos líneas del mismo servicio
    // no se pisan.
    const pend = [...p.lineas];
    const tomar = (itemNo: string, descr: string) => {
      let i = pend.findIndex((x) => x.articuloId === itemNo && x.descripcion === descr);
      if (i < 0) i = pend.findIndex((x) => x.articuloId === itemNo);
      return i >= 0 ? pend.splice(i, 1)[0] : undefined;
    };
    const lineas = validLines.map((l) => {
      const a = catArticulos.find((x) => x.id === l.articuloId)!;
      const g = grupos.find((x) => x.key === l.grupoKey);
      const descripcion = l.detalle?.trim() || a.descripcion;
      const pl = tomar(a.id, descripcion);
      return {
        tipo: "articulo" as const, articuloId: a.id,
        pedidoLineaId: pl?.id, pedidoNumero: p.numero,
        descripcion, cantidad: l.cantidad, unidad: unidadDe(l) || a.unidad,
        // El servicio no entra a ningún almacén: se consume contra el proyecto + la
        // tarea (BC ni acepta almacén en una línea de artículo de tipo servicio).
        almacen: "", precioUnitario: l.monto ?? 0, ivaPct: 13,
        proyecto: l.obraCodigo || undefined, taskNo: g?.taskNo || undefined,
      };
    });
    const orden = await createOrden({
      proveedorId, proveedorNo: provSel?.code, proveedorNombre: provSel?.nombre,
      currencyCode: currency, lineas,
    });
    await setOrdenEstado(orden.id, "pendiente_aprobacion");
    return orden;
  }

  async function pedir() {
    if (!canContinue || saving) return;
    setSaving(true);
    try {
      const p = await addPedido(buildInput());
      if (esSub) {
        const orden = await crearOrdenSubcontrato(p);
        limpiarBorradorLocal();
        toast(`Subcontrato ${p.numero} enviado a aprobación (orden ${numeroOrden(orden)})`, "success");
      } else {
        await setPedidoEstado(p.id, "aprobado");
        limpiarBorradorLocal();
        toast(`Pedido ${p.numero} enviado a proveeduría`, "success");
      }
      onGuardado?.({ numero: p.numero, enviado: true });
      close();
    } catch (e) {
      // El pedido puede haber quedado creado y la ORDEN no: hay que decirlo, si no
      // el subcontrato queda invisible (sin orden nadie lo aprueba).
      const motivo = e instanceof Error ? e.message : String(e);
      toast(esSub ? `No se pudo enviar el subcontrato: ${motivo}` : "No se pudo enviar el pedido. Intentá de nuevo.", "error");
      setSaving(false);
    }
  }
  async function guardarBorrador() {
    if (validLines.length === 0) { close(); return; }
    setSaving(true);
    try {
      const p = await addPedido(buildInput());
      limpiarBorradorLocal(); // ya es un borrador REAL en la base
      toast(`Borrador ${p.numero} guardado`, "info");
      onGuardado?.({ numero: p.numero, enviado: false });
      close();
    } catch { toast("No se pudo guardar el borrador.", "error"); setSaving(false); }
  }
  // Editar: mismo formulario, pero reemplaza las líneas del pedido existente. El
  // repo lo rechaza si proveeduría ya ordenó algo (por eso Editar solo aparece en
  // borrador/devuelto), así que el error se muestra tal cual viene.
  async function guardarEdicion() {
    if (!editandoId || !canContinue || saving) return;
    setSaving(true);
    try {
      await editPedido(editandoId, buildInput());
      toast(`Pedido ${editar?.numero ?? ""} actualizado`.trim(), "success");
      onGuardado?.({ numero: editar?.numero ?? "", enviado: false });
      close();
    } catch (e: unknown) {
      toast(`No se pudieron guardar los cambios: ${String((e as Error)?.message ?? e)}`, "error");
      setSaving(false);
    }
  }

  // Guarda las líneas actuales como una plantilla (General o Bodega según el tipo).
  async function guardarComoPlantilla() {
    const nombre = nombrePlant.trim();
    if (!nombre || validLines.length === 0) return;
    setSavingPlant(true);
    const tipoPlant = esConsumo ? "general" : "bodega";
    // Plantilla REUSABLE: NO se guarda la casa (obraCodigo vacío); la obra se elige al
    // cargarla. Si el mismo material (+variante) estaba en varias obras, se unifica en
    // una sola línea sumando la cantidad, para que quede un set de materiales limpio.
    type LP = { code: string; descripcion: string; cantidad: number; unidad: string; obraCodigo: string; variantCode?: string; variantNombre?: string };
    const mapPlant = new Map<string, LP>();
    for (const l of validLines) {
      const a = catArticulos.find((x) => x.id === l.articuloId);
      const code = a?.code ?? l.articuloId;
      const variantCode = l.variantCode || undefined;
      const k = `${code}|${variantCode ?? ""}`;
      const prev = mapPlant.get(k);
      if (prev) prev.cantidad += l.cantidad;
      // La plantilla guarda la unidad ELEGIDA: si guardara la base, al volver a usarla
      // la cantidad quedaría pensada en una unidad y expresada en otra.
      else mapPlant.set(k, { code, descripcion: l.variantNombre || a?.descripcion || "", cantidad: l.cantidad, unidad: unidadDe(l) || a?.unidad || "UND", obraCodigo: "", variantCode, variantNombre: l.variantNombre || undefined });
    }
    const lineasPlant = [...mapPlant.values()];
    try {
      const r = await fetch("/api/compras/plantillas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre, creadoPor: usuario, tipo: tipoPlant, lineas: lineasPlant }) });
      if (!r.ok) throw new Error();
      try { const rp = await fetch("/api/compras/plantillas"); if (rp.ok) setPlantillas(((await rp.json()).plantillas ?? []) as Plantilla[]); } catch { /* refresco opcional */ }
      toast(`Plantilla "${nombre}" guardada`, "success");
      setGuardarPlantOpen(false); setNombrePlant("");
    } catch { toast("No se pudo guardar la plantilla.", "error"); }
    finally { setSavingPlant(false); }
  }

  // Botón "Usar plantilla": a lo ancho en material/repuesto, o en columna al lado del
  // almacén en Stock. Se arma una vez para no repetir props.
  const plantillaBtn = (
    <UsarPlantillaBtn items={plantillaItems} value={plantillaSel} hasMateriales={hayMateriales}
      onPick={cargarPlantilla}
      onClear={() => { setPlantillaSel(""); setLineas([]); setGrupos([]); }}
      filterNode={<Segmented size="sm" value={fTipoPl} options={F_TIPOS} onChange={setFTipoPl} />} />
  );

  return (
    <>
      <div aria-hidden={!open} style={{ position: "fixed", inset: 0, zIndex: 1000, pointerEvents: open ? "auto" : "none" }}>
        <div onClick={requestDismiss} style={{ position: "absolute", inset: 0, background: "rgba(15,18,20,.45)", opacity: open ? 1 : 0, transition: "opacity .25s ease" }} />
        <aside role="dialog" aria-modal="true" aria-label="Nuevo pedido"
          style={{ position: "absolute", top: 0, right: 0, height: "100%", width: "min(840px, 96vw)", background: "var(--ds-tint-base)", boxShadow: "-24px 0 60px rgba(15,18,20,.22)",
            transform: open ? "translateX(0)" : "translateX(100%)", transition: "transform .3s cubic-bezier(.4,0,.2,1)", display: "flex", flexDirection: "column" }}>
          {/* Header */}
          <div className="row row--between" style={{ alignItems: "center", padding: "18px 22px", borderBottom: "1.5px solid var(--ds-color-gray-100)", flexShrink: 0 }}>
            <div className="row gap-3" style={{ alignItems: "center" }}>
              <span style={{ width: 40, height: 40, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--ds-color-gray-100)" }}>
                <Icon name="entrega" size="md" color="currentColor" />
              </span>
              <h2 className="ds-subtitle-lg" style={{ margin: 0 }}>{editandoId ? `Editar ${editar?.numero ?? "pedido"}` : "Nuevo pedido"}</h2>
            </div>
            <button type="button" onClick={requestDismiss} aria-label="Cerrar"
              style={{ width: 36, height: 36, borderRadius: 8, border: 0, background: "none", color: "var(--ds-color-gray-400)", cursor: "pointer", display: "grid", placeItems: "center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 6h14M8 12l4 4 4-4" /></svg>
            </button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
              <div className="col gap-5">
                {borradorRecuperado && (
                  <div className="row row--between wrap gap-2" style={{ alignItems: "center", padding: "10px 12px", borderRadius: 12, background: "color-mix(in srgb, var(--ds-color-green-100) 16%, var(--ds-color-white))" }}>
                    <span className="ds-body-sm">Recuperamos el pedido que estabas armando ({lineas.length} línea(s)).</span>
                    <Button variant="ghost" onClick={() => { limpiarBorradorLocal(); reset(); }}>Descartar y empezar de cero</Button>
                  </div>
                )}
                <Field label="Tipo de solicitud">
                  <Segmented variant="pill" value={tipo} options={TIPOS.map((t) => ({ v: t.v, label: t.label }))} onChange={cambiarTipo} />
                </Field>

                {/* Material / Repuesto: TAG chico ALM|CD. Con ALM se elige el almacén
                    REAL (Almacén General, Agregados, Herramienta, Maquinaria…), en la
                    misma fila. Stock no lleva tag: siempre es a un almacén. */}
                {/* SUBCONTRATO: subcontratista + moneda. Es lo que en un pedido normal
                    pondría Proveeduría; acá lo pone el ingeniero porque ya lo negoció. */}
                {esSub && (
                  <div className="col gap-2">
                    <span className="ds-form-field__label">Subcontratista</span>
                    <div className="row gap-3 wrap">
                      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                        <Dropdown placeholder="Buscar proveedor…" items={provItems} value={proveedorId} onPick={elegirProveedor} />
                      </div>
                      <Segmented size="sm" value={currency || "CRC"} options={[{ v: "CRC", label: "CRC" }, { v: "USD", label: "USD" }]}
                        onChange={(v: string) => setCurrency(v === "CRC" ? "" : v)} />
                    </div>
                    <span className="ds-muted ds-label">
                      Cantidad × precio por unidad. El servicio se contrata completo: se aprueba, se crea la orden en Business Central y se recibe la factura al terminar.
                    </span>
                  </div>
                )}

                {!esStock && !esSub && !esActivoTipo && (
                  /* Sin <Field>: el DS le fija 370px de ancho y el almacén quedaba
                     angosto. Rótulo propio + fila (el tag y el almacén en la misma
                     línea, centrados por .row) a lo ancho del panel. */
                  <div className="col gap-2">
                    <span className="ds-form-field__label">{esRepuesto ? "Destino del repuesto" : "Destino del material"}</span>
                    <div className="row gap-3 wrap">
                      <Segmented size="sm" value={destinoMat} options={DESTINOS} onChange={(v: DestinoMat) => setDestinoMat(v)} />
                      {usaAlmacen && (
                        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                          <Dropdown placeholder="Elegí almacén…" items={almacenItems} value={almacenSel} onPick={cambiarAlmacen} filterNode={filtroAlm} />
                        </div>
                      )}
                    </div>
                    <span className="ds-muted ds-label">{ayudaDestino(tipo, destinoMat)}</span>
                  </div>
                )}

                {/* USAR PLANTILLA. En Stock va EN COLUMNAS con el almacén (y el filtro
                    de plantillas arranca en "Bodega", que son las de reposición). */}
                {esStock ? (
                  <div className="row gap-3 wrap" style={{ alignItems: "flex-end" }}>
                    <div className="col gap-2" style={{ flex: "1 1 220px", minWidth: 0 }}>
                      <span className="ds-form-field__label">Almacén</span>
                      <Dropdown placeholder="Elegí almacén…" items={almacenItems} value={almacenSel} onPick={cambiarAlmacen} filterNode={filtroAlm} />
                    </div>
                    <div style={{ flex: "1 1 220px", minWidth: 0 }}>{plantillaBtn}</div>
                  </div>
                ) : (esSub || esActivoTipo) ? null : plantillaBtn}

                {(esMaterial || esSub) ? (
                  /* MATERIAL: una TARJETA por obra; adentro, sus materiales. */
                  <div className="col gap-2">
                    <div className="row row--between" style={{ alignItems: "center" }}>
                      <span className="ds-form-field__label">{esSub ? "Obra y alcance" : "Obras y materiales"}</span>
                      <span className="ds-muted ds-label">
                        {validLines.length} línea(s){esSub && totalSub > 0 ? ` · ${money(totalSub, currency)}` : ""}
                      </span>
                    </div>
                    {obrasChocadas.length > 0 && (
                      <div className="ds-body-sm" style={{ padding: "8px 12px", borderRadius: 12, background: "color-mix(in srgb, var(--ds-color-red-100) 12%, var(--ds-color-white))", color: "var(--ds-color-red-200)" }}>
                        La obra {obrasChocadas.join(", ")} está bloqueada en Business Central: no se le puede cargar material.
                        Cambiá la obra de esa tarjeta, o pedí que la desbloqueen en BC.
                      </div>
                    )}
                    <div className="col gap-3">
                      {grupos.map((g) => {
                        const filas = lineas.filter((l) => l.grupoKey === g.key);
                        const abierto = openMat.includes(g.key);
                        return (
                          <div key={g.key} className="col gap-0" style={{ position: "relative", borderRadius: 18, border: "1.5px solid var(--ds-color-gray-100)", background: "var(--ds-color-white)", overflow: "hidden" }}>
                            {/* Cabecera (franja): OBRA como chip prominente + agregar material (+) + menú (⋮) */}
                            <div className="row gap-2 nsl-obra-head" data-empty={g.obraCodigo ? undefined : "1"} style={{ alignItems: "center", padding: "10px 12px" }}>
                              {/* La OBRA queda SIEMPRE visible (nunca la tapa el buscador). */}
                              <div style={{ flexShrink: 0, minWidth: 0, maxWidth: abierto ? "42%" : "100%" }}>
                                <ObraChip obras={obraItems} value={g.obraCodigo} nombre={g.obraNombre} onPick={(code) => setGrupoObra(g.key, code)} />
                              </div>
                              {abierto ? (
                                /* Buscador INLINE en la misma línea, a la DERECHA de la obra (no encima).
                                   Al elegir un material se agrega y el buscador se encoge de nuevo al +. */
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <MaterialSearch compact items={itemsBuscador}
                                    onAdd={(id, vc, vn) => { addRow(g.key, id, vc, vn); setOpenMat((ks) => ks.filter((k) => k !== g.key)); }} />
                                </div>
                              ) : (
                                <div style={{ flex: 1 }} />
                              )}
                              <button type="button" onClick={() => setOpenMat((ks) => (ks.includes(g.key) ? [] : [g.key]))}
                                aria-label={esSub ? "Agregar servicio" : "Agregar material"} title={esSub ? "Agregar un servicio al subcontrato" : "Agregar material a esta obra"}
                                style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 12, border: 0, background: "var(--ds-color-green-100)", color: "var(--ds-color-black)", cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "var(--ds-shadow-01)" }}>
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
                              </button>
                              {!esSub && <button type="button" onClick={() => setCardMenuKey((k) => (k === g.key ? null : g.key))} aria-label="Opciones de la obra"
                                style={{ flexShrink: 0, background: "none", border: 0, cursor: "pointer", color: "var(--ds-color-gray-400)", display: "grid", placeItems: "center", padding: 6, borderRadius: 8 }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
                              </button>}
                              {cardMenuKey === g.key && (
                                <>
                                  <div onClick={() => setCardMenuKey(null)} style={{ position: "fixed", inset: 0, zIndex: 3 }} />
                                  <div className="col" style={{ position: "absolute", top: 52, right: 10, zIndex: 4, minWidth: 200, background: "var(--ds-color-white)", border: "1.5px solid var(--ds-color-gray-100)", borderRadius: 12, overflow: "hidden", boxShadow: "0 12px 30px rgba(15,18,20,.16)" }}>
                                    {filas.length > 0 && (
                                      <button type="button" onClick={() => duplicarGrupo(g.key)} className="ds-body-sm" style={{ textAlign: "left", padding: "10px 14px", border: 0, background: "none", cursor: "pointer" }}>Duplicar a otra obra</button>
                                    )}
                                    <button type="button" onClick={() => delGrupo(g.key)} className="ds-body-sm ds-strong" style={{ textAlign: "left", padding: "10px 14px", border: 0, borderTop: filas.length > 0 ? "1.5px solid var(--ds-color-gray-100)" : 0, background: "none", cursor: "pointer", color: "var(--ds-color-red-100)" }}>Quitar obra</button>
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Consumo inmediato: actividad (tarea) de la obra. Sin
                                tarea BC no puede consumir contra el proyecto, así que
                                acá es obligatoria (y no se pide si va a inventario). */}
                            {(esConsumo || esSub) && g.obraCodigo && (
                              <div className="row gap-2" style={{ alignItems: "center", padding: "0 12px 10px" }}>
                                <span className="ds-muted ds-label" style={{ flexShrink: 0 }}>Actividad</span>
                                <TareaPicker obra={g.obraCodigo} value={g.taskNo} valueNombre={g.taskNombre}
                                  onPick={(no, nombre) => setGrupoTarea(g.key, no, nombre)} />
                              </div>
                            )}
                            {/* Materiales de esta obra */}
                            {filas.length === 0 ? (
                              <div className="ds-muted ds-body-sm" style={{ padding: "0 14px 14px" }}>
                                {esSub
                                  ? (g.obraCodigo ? "Agregá los servicios del subcontrato con el +." : "Elegí la obra y agregá los servicios con el +.")
                                  : (g.obraCodigo ? "Agregá materiales con el +." : "Elegí una obra y agregá sus materiales con el +.")}
                              </div>
                            ) : (
                              <div className="col gap-0" style={{ borderTop: "1.5px solid var(--ds-color-gray-100)" }}>
                                {/* Con almacén: columnas En stock · Plantilla · Pedir. */}
                                {verStock && <StockHead />}
                                {filas.map((l, i) => {
                                  const a = catArticulos.find((x) => x.id === l.articuloId);
                                  const variantes = variantesDe(l);
                                  const faltaVar = necesitaVariante(l);
                                  const flash = l.key === flashKey;
                                  // SUBCONTRATO: servicio + ALCANCE en texto libre + MONTO global. No hay
                                  // cantidad, ni variante, ni existencias: el servicio se contrata completo.
                                  if (esSub) return (
                                    <div key={l.key} className="col gap-2" style={{ padding: "10px 12px", borderTop: i ? "1.5px solid var(--ds-color-gray-100)" : 0, background: flash ? "color-mix(in srgb, var(--ds-color-green-100) 16%, var(--ds-color-white))" : "transparent", transition: "background .2s ease" }}>
                                      <div className="row gap-3" style={{ alignItems: "center" }}>
                                        <div className="col" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                                          <span className="ds-body-sm ds-strong">{a?.descripcion ?? "—"}</span>
                                          <span className="ds-muted ds-label">{a?.code}</span>
                                        </div>
                                        {/* CANTIDAD × PRECIO: un subcontrato puede ser "5 ventanas
                                            a ¢350.000" y no un monto suelto (pedido de David,
                                            24/08/2026). Con cantidad 1 se ve igual que antes. */}
                                        <Cantidad value={l.cantidad} onChange={(n) => setLinea(l.key, { cantidad: n })} />
                                        <UnidadBtn unidades={unidadesDe(l)} value={unidadDe(l)} base={a?.unidad ?? ""} onPick={(code) => cambiarUnidad(l, code)} />
                                        <span className="ds-muted ds-label">×</span>
                                        <Monto value={l.monto} onChange={(n) => setLinea(l.key, { monto: n })} currency={currency} />
                                        <button type="button" onClick={() => delLinea(l.key)} aria-label="Quitar servicio"
                                          style={{ background: "none", border: 0, cursor: "pointer", color: "var(--ds-color-gray-400)", display: "grid", placeItems: "center", padding: 6, borderRadius: 8, flexShrink: 0 }}>
                                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
                                        </button>
                                      </div>
                                      {l.cantidad > 1 && (l.monto ?? 0) > 0 && (
                                        <span className="ds-muted ds-label" style={{ textAlign: "right" }}>
                                          {num.format(l.cantidad)} × {money(l.monto ?? 0, currency)} = <strong>{money(l.cantidad * (l.monto ?? 0), currency)}</strong>
                                        </span>
                                      )}
                                      {/* El alcance es lo que va a leer el proveedor en la orden de BC. Si se
                                          deja vacío queda la descripción del servicio del catálogo. */}
                                      <input value={l.detalle ?? ""} onChange={(e) => setLinea(l.key, { detalle: e.target.value })}
                                        placeholder="Alcance (lo que va a decir la orden)…" aria-label="Alcance del servicio"
                                        style={{ width: "100%", height: 38, borderRadius: 10, border: "1.5px solid var(--ds-color-gray-200)", background: "var(--ds-color-white)", padding: "0 12px", fontSize: 14, outline: "none" }} />
                                    </div>
                                  );
                                  return (
                                    <div key={l.key} className="row gap-3 wrap" style={{ alignItems: "center", padding: "10px 12px", borderTop: i ? "1.5px solid var(--ds-color-gray-100)" : 0, background: flash ? "color-mix(in srgb, var(--ds-color-green-100) 16%, var(--ds-color-white))" : faltaVar ? "color-mix(in srgb, var(--ds-color-yellow) 12%, var(--ds-color-white))" : "transparent", transition: "background .2s ease" }}>
                                      <div className="col" style={{ gap: 2, minWidth: 0, flex: "1 1 160px" }}>
                                        <span className="ds-body-sm ds-strong">{l.variantNombre || a?.descripcion || "—"}</span>
                                        <span className="ds-muted ds-label">{a?.code}</span>
                                      </div>
                                      {variantes.length > 0 && (
                                        <div style={{ flex: "0 0 200px", minWidth: 0 }}>
                                          <VarianteBtn variantes={variantes} value={l.variantCode ?? ""}
                                            onPick={(code, nombre) => setLinea(l.key, { variantCode: code, variantNombre: nombre })} />
                                        </div>
                                      )}
                                      {/* Comentario de la línea: al centro y VISIBLE cuando hay texto. */}
                                      <LineaComentarioBtn value={l.notas ?? ""} onChange={(v) => setLinea(l.key, { notas: v })} />
                                      <div className="row gap-2" style={{ alignItems: "center", flexShrink: 0, marginLeft: "auto" }}>
                                        {verStock && <StockCols stock={stockEnUnidad(l)} ready={stockReady} requerido={l.requerido} />}
                                        <Cantidad value={l.cantidad} onChange={(n) => setLinea(l.key, { cantidad: n, autoPedir: false })} />
                                        <UnidadBtn unidades={unidadesDe(l)} value={unidadDe(l)} base={a?.unidad ?? ""} onPick={(code) => cambiarUnidad(l, code)} />
                                        <button type="button" onClick={() => delLinea(l.key)} aria-label="Quitar material"
                                          style={{ background: "none", border: 0, cursor: "pointer", color: "var(--ds-color-gray-400)", display: "grid", placeItems: "center", padding: 6, borderRadius: 8 }}>
                                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {esMaterial && <button type="button" onClick={addGrupo} className="row gap-2"
                      style={{ alignItems: "center", justifyContent: "center", width: "100%", padding: 12, borderRadius: 14, border: "1.5px dashed var(--ds-color-gray-300)", background: "var(--ds-tint-base)", cursor: "pointer", color: "var(--ds-color-ink)", fontWeight: 600 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
                      Agregar obra
                    </button>}
                  </div>
                ) : (
                  /* REPUESTO: una máquina + sus repuestos. STOCK: solo la lista de
                     materiales que se le piden al almacén (el almacén ya se eligió
                     arriba, en columna con la plantilla). */
                  <div className="col gap-4">
                    {/* MÁQUINA: solo en consumo directo. Con el tag ALM el repuesto entra
                        al inventario del almacén elegido y no se amarra a una máquina. */}
                    {esRepuestoCD && (
                      <div className="col gap-2">
                        <div className="row gap-3 wrap" style={{ alignItems: "flex-end" }}>
                          <div className="col gap-2" style={{ flex: "1 1 260px", minWidth: 0 }}>
                            <span className="ds-form-field__label">{tipoMeta.destino}</span>
                            <Dropdown placeholder={bcMaq === null ? "Cargando máquinas…" : `Elegí ${tipoMeta.destino.toLowerCase()}…`} items={destinoItems} value={destino} onPick={setDestino} />
                          </div>
                          {/* ACTIVIDAD: el proyecto es siempre MAQ (MAQUINARIA), pero la
                              tarea se elige — un repuesto normal va a CMAQ (PARQUE
                              MAQUINARIA COSTES) y una mejora a MACT, por ejemplo. */}
                          <div className="col gap-2" style={{ flex: "1 1 260px", minWidth: 0 }}>
                            <span className="ds-form-field__label">Actividad (tarea) · proyecto MAQ</span>
                            <Dropdown placeholder={bcTareasMaq === null ? "Cargando actividades…" : "Elegí actividad…"}
                              items={tareaMaqItems} value={tareaMaq}
                              onPick={(id) => { setTareaMaq(id); setTareaMaqNombre((bcTareasMaq ?? []).find((t) => t.jobTaskNo === id)?.descripcion ?? ""); }} />
                          </div>
                        </div>
                        {bcMaq !== null && !catMaquinas.length && (
                          <span className="ds-muted ds-label">No se pudo traer el parque de maquinaria de Business Central. Reintentá en un momento.</span>
                        )}
                      </div>
                    )}
                    <div className="col gap-2">
                      <div className="row row--between" style={{ alignItems: "center" }}>
                        <span className="ds-form-field__label">Materiales</span>
                        <span className="ds-muted ds-label">{validLines.length} línea(s)</span>
                      </div>
                      <MaterialSearch items={articuloItems} onAdd={(id, vc, vn) => addRow(SOLO, id, vc, vn)} />
                      {lineas.length > 0 && (
                        <div className="col gap-2" style={{ marginTop: 4 }}>
                          {verStock && <StockHead inset />}
                          {lineas.map((l) => {
                            const a = catArticulos.find((x) => x.id === l.articuloId);
                            const variantes = variantesDe(l);
                            const faltaVar = necesitaVariante(l);
                            const flash = l.key === flashKey;
                            return (
                              <div key={l.key} className="row gap-3 wrap" style={{ alignItems: "center", padding: "10px 12px", borderRadius: 12, border: `1.5px solid ${flash ? "var(--ds-color-green-100)" : faltaVar ? "var(--ds-color-yellow)" : "var(--ds-color-gray-100)"}`, background: "var(--ds-color-white)", transition: "border-color .2s ease" }}>
                                <div className="col" style={{ gap: 2, minWidth: 0, flex: "1 1 160px" }}>
                                  <span className="ds-body-sm ds-strong">{l.variantNombre || a?.descripcion || "—"}</span>
                                  <span className="ds-muted ds-label">{a?.code}</span>
                                </div>
                                {variantes.length > 0 && (
                                  <div style={{ flex: "0 0 200px", minWidth: 0 }}>
                                    <VarianteBtn variantes={variantes} value={l.variantCode ?? ""}
                                      onPick={(code, nombre) => setLinea(l.key, { variantCode: code, variantNombre: nombre })} />
                                  </div>
                                )}
                                {/* Comentario de la línea: al centro y VISIBLE cuando hay texto. */}
                                <LineaComentarioBtn value={l.notas ?? ""} onChange={(v) => setLinea(l.key, { notas: v })} />
                                <div className="row gap-2" style={{ alignItems: "center", flexShrink: 0, marginLeft: "auto" }}>
                                  {verStock && <StockCols stock={stockEnUnidad(l)} ready={stockReady} requerido={l.requerido} />}
                                  {/* autoPedir:false → si el usuario ya escribió, el prellenado
                                      (requerido − stock) no le pisa el número al llegar el stock. */}
                                  <Cantidad value={l.cantidad} onChange={(n) => setLinea(l.key, { cantidad: n, autoPedir: false })} />
                                  <UnidadBtn unidades={unidadesDe(l)} value={unidadDe(l)} base={a?.unidad ?? ""} onPick={(code) => cambiarUnidad(l, code)} />
                                  <button type="button" onClick={() => delLinea(l.key)} aria-label="Quitar material"
                                    style={{ background: "none", border: 0, cursor: "pointer", color: "var(--ds-color-gray-400)", display: "grid", placeItems: "center", padding: 6, borderRadius: 8 }}>
                                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
          </div>

          {/* Footer (UNA SOLA PANTALLA): CANCELAR · barra de acciones · Solicitar */}
          <div className="row" style={{ alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 22px", borderTop: "1.5px solid var(--ds-color-gray-100)", flexShrink: 0 }}>
            <button type="button" onClick={requestDismiss} aria-label="Cancelar"
              style={{ height: 48, borderRadius: 999, border: "1.5px solid var(--ds-color-gray-200)", background: "var(--ds-color-white)", boxShadow: "var(--ds-shadow-01)", cursor: "pointer", padding: "0 20px", display: "inline-flex", alignItems: "center", gap: 8, color: "var(--ds-color-ink)", fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: ".03em", flexShrink: 0 }}>
              <Icon name="back" size="sm" color="currentColor" /> Cancelar
            </button>
            {/* Prioridad · Comentario · Guardar como plantilla — como botones de ícono */}
            {hayMateriales && (
              <div className="row gap-2" style={{ alignItems: "center" }}>
                <PrioridadBtn value={prioridad} onChange={setPrioridad} />
                <ComentarioBtn value={notas} onChange={setNotas} required para={esSub ? "aprobación" : undefined} />
                {!esSub && <button type="button" className="nsl-toolbtn" data-tip="Guardar como plantilla" onClick={() => { setNombrePlant(""); setGuardarPlantOpen(true); }} disabled={validLines.length === 0}
                  aria-label="Guardar como plantilla">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.75L12 17l-5.2 2.6 1-5.75-4.2-4.1 5.8-.85L12 3.6z" /></svg>
                </button>}
              </div>
            )}
            {/* Editando: guarda los cambios del pedido. Nuevo: confirma y envía. */}
            <button type="button" onClick={() => { if (!canContinue || saving) return; if (editandoId) guardarEdicion(); else setConfirmPedir(true); }}
              disabled={!canContinue || saving} aria-label={editandoId ? "Guardar cambios" : "Solicitar"}
              style={{ height: 54, borderRadius: 999, border: 0, padding: "0 26px", background: canContinue ? "var(--ds-color-green-100)" : "var(--ds-color-gray-100)", boxShadow: canContinue ? "var(--ds-shadow-01)" : "none", cursor: (canContinue && !saving) ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 15, color: canContinue ? "var(--ds-color-black)" : "var(--ds-color-gray-300)", display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {saving ? (editandoId ? "Guardando…" : "Enviando…") : (editandoId ? "Guardar cambios" : "Solicitar")} <Icon name="arrow-right" size="sm" color="currentColor" />
            </button>
          </div>

          {/* Guardar como plantilla: modal DENTRO del drawer */}
          {guardarPlantOpen && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(15,18,20,.42)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 6 }}
              onClick={() => !savingPlant && setGuardarPlantOpen(false)}>
              <div role="dialog" aria-modal="true" aria-label="Guardar como plantilla" style={{ background: "var(--ds-tint-base)", borderRadius: 18, padding: 22, width: "100%", maxWidth: 380, boxShadow: "0 24px 60px rgba(15,18,20,.28)" }} onClick={(e) => e.stopPropagation()}>
                <h3 className="ds-subtitle-lg" style={{ marginTop: 0, marginBottom: 6 }}>Guardar como plantilla</h3>
                <p className="ds-muted ds-body-sm" style={{ marginTop: 0, marginBottom: 14 }}>
                  Se guardan las {validLines.length} línea(s) como plantilla{" "}
                  <strong>{esConsumo ? "General" : "de Bodega"}</strong> a tu nombre.
                </p>
                <input autoFocus value={nombrePlant} onChange={(e) => setNombrePlant(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && nombrePlant.trim()) guardarComoPlantilla(); }}
                  placeholder="Nombre de la plantilla…"
                  style={{ width: "100%", height: 48, borderRadius: 999, border: "1.5px solid var(--ds-color-gray-200)", background: "var(--ds-color-white)", padding: "0 16px", fontSize: 15, outline: "none" }} />
                <div className="col gap-2" style={{ marginTop: 16 }}>
                  <Button block onClick={guardarComoPlantilla} disabled={!nombrePlant.trim() || savingPlant}>
                    {savingPlant ? "Guardando…" : "Guardar plantilla"}
                  </Button>
                  <Button block variant="ghost" onClick={() => setGuardarPlantOpen(false)} disabled={savingPlant}>Cancelar</Button>
                </div>
              </div>
            </div>
          )}

          {/* Confirmación antes de enviar (al tocar Solicitar) */}
          {confirmPedir && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(15,18,20,.42)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 6 }}>
              <div role="dialog" aria-modal="true" aria-label="¿Enviar el pedido?" style={{ background: "var(--ds-tint-base)", borderRadius: 18, padding: 22, width: "100%", maxWidth: 380, boxShadow: "0 24px 60px rgba(15,18,20,.28)" }}>
                <h3 className="ds-subtitle-lg" style={{ marginTop: 0, marginBottom: 8 }}>{esSub ? "¿Enviar el subcontrato?" : "¿Enviar el pedido?"}</h3>
                {esSub ? (
                  <p className="ds-muted ds-body-sm" style={{ marginTop: 0 }}>
                    Se envía a aprobación: <strong>{validLines.length} servicio(s)</strong> por <strong>{money(totalSub, currency)}</strong>{" "}
                    a <strong>{provSel?.nombre ?? "el subcontratista"}</strong>, contra{" "}
                    <strong>{grupos[0]?.obraCodigo ?? "la obra"}</strong>
                    {grupos[0]?.taskNo ? <> · tarea <strong>{grupos[0].taskNo}</strong></> : null}.
                    {" "}Al aprobarse se crea la orden de compra en Business Central.
                  </p>
                ) : (
                <p className="ds-muted ds-body-sm" style={{ marginTop: 0 }}>
                  Se envía a proveeduría: <strong>{validLines.length} material(es)</strong>
                  {esMaterial
                    ? <> en <strong>{gruposPreview.length} obra{gruposPreview.length !== 1 ? "s" : ""}</strong>, {esConsumo ? <strong>consumo directo (contra proyecto y tarea)</strong> : <>a <strong>{almacenNombre}</strong></>}</>
                    : esStock
                      ? <> para <strong>{almacenNombre}</strong></>
                      : esRepuesto && usaAlmacen
                        ? <> a <strong>{almacenNombre}</strong></>
                        : <> para <strong>{destinoNombre || tipoMeta.destino}</strong>{usaAlmacen ? <> · a <strong>{almacenNombre}</strong></> : <> · <strong>consumo directo</strong></>}</>}
                  {prioridad !== "normal" && <> · prioridad <strong>{PRIORIDADES.find((p) => p.v === prioridad)!.label}</strong></>}.
                </p>
                )}
                <div className="col gap-2" style={{ marginTop: 18 }}>
                  <Button block onClick={pedir} disabled={saving}>{saving ? "Enviando…" : "Confirmar y enviar"}</Button>
                  <Button block variant="ghost" onClick={() => setConfirmPedir(false)} disabled={saving}>Cancelar</Button>
                </div>
              </div>
            </div>
          )}

          {/* Confirmación de salida: DENTRO del drawer */}
          {confirmExit && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(15,18,20,.42)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 5 }}>
              <div role="dialog" aria-modal="true" aria-label="¿Salir del pedido?" style={{ background: "var(--ds-tint-base)", borderRadius: 18, padding: 22, width: "100%", maxWidth: 360, boxShadow: "0 24px 60px rgba(15,18,20,.28)" }}>
                <h3 className="ds-subtitle-lg" style={{ marginTop: 0, marginBottom: 8 }}>¿Salir del pedido?</h3>
                <p className="ds-muted ds-body-sm" style={{ marginTop: 0 }}>
                  {editandoId
                    ? <>Tenés cambios sin guardar en este pedido. Podés <strong>guardarlos</strong> o descartarlos.</>
                    : esSub
                      ? <>Tenés un subcontrato sin enviar. Si lo descartás se pierden los montos; si volvés a abrir el panel, lo recuperamos.</>
                      : <>Tenés cambios sin enviar. Podés guardarlo como <strong>borrador</strong> para seguir después, o descartarlo.</>}
                </p>
                <div className="col gap-2" style={{ marginTop: 18 }}>
                  {validLines.length > 0 && (editandoId
                    ? <Button block onClick={guardarEdicion} disabled={saving || !canContinue}>Guardar cambios</Button>
                    : esSub ? null
                    : <Button block onClick={guardarBorrador} disabled={saving}>Guardar en borrador</Button>)}
                  <Button block variant="outline" onClick={close}>Descartar</Button>
                  <Button block variant="ghost" onClick={() => setConfirmExit(false)}>Seguir editando</Button>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
