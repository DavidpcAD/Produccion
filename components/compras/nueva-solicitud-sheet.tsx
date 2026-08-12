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
import { AnimatePresence, motion } from "motion/react";
import { springs } from "@/components/ds/springs";
import { ToggleCards } from "@/components/ds/ToggleCards/ToggleCards";
import { Icon } from "@/components/ds/Icon/Icon";
import { Badge, Button, Field, Textarea, useToast } from "@/components/compras/ui";
import { useStore, type NewPedidoInput } from "@/lib/compras/store";
import type { Almacen, Articulo, Obra, Pedido, TipoSolicitud } from "@/lib/compras/types";

type Variante = { code: string; descripcion: string };
type Row = { key: string; articuloId: string; variantCode?: string; variantNombre?: string; cantidad: number; obraCodigo?: string; obraNombre?: string };
type PlantillaLinea = { code: string; cantidad: number; obraCodigo?: string; variantCode?: string; variantNombre?: string; descripcion?: string; unidad?: string };
type Plantilla = { id: number; nombre: string; tipo?: "general" | "bodega"; idClasificacion?: number | null; lineas: PlantillaLinea[]; creadoPor?: string };
type FTipo = "todas" | "mias" | "general" | "bodega";
type Item = { id: string; title: string; sub?: string };

const uid = () => Math.random().toString(36).slice(2, 9);
const TIPOS: { v: TipoSolicitud; label: string; destino: string }[] = [
  { v: "material", label: "Material", destino: "Obra" },
  { v: "repuesto", label: "Repuesto", destino: "Máquina" },
  { v: "stock", label: "Bodega", destino: "Almacén" },
];
const PRIORIDADES: { v: Pedido["prioridad"]; label: string }[] = [
  { v: "normal", label: "Normal" }, { v: "alta", label: "Alta" }, { v: "urgente", label: "Urgente" },
];
const F_TIPOS: { v: FTipo; label: string }[] = [
  { v: "todas", label: "Todas" }, { v: "mias", label: "Mías" }, { v: "general", label: "General" }, { v: "bodega", label: "Bodega" },
];
const filtrar = (items: Item[], q: string, max = 40) => {
  const s = q.trim().toLowerCase();
  return (s ? items.filter((i) => `${i.title} ${i.sub ?? ""}`.toLowerCase().includes(s)) : items).slice(0, max);
};

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
function Segmented<T extends string>({ value, options, onChange, size = "md" }: {
  value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "5px 10px" : "8px 14px";
  return (
    <div className="row gap-0" style={{ border: "1.5px solid var(--ds-color-gray-100)", borderRadius: 10, overflow: "hidden", width: "fit-content", maxWidth: "100%", flexWrap: "wrap" }}>
      {options.map((o) => {
        const active = o.v === value;
        return (
          <button key={o.v} type="button" onClick={() => onChange(o.v)} className={size === "sm" ? "ds-label ds-strong" : "ds-body-sm ds-strong"}
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
function VarianteBtn({ variantes, value, onPick }: {
  variantes: Variante[]; value?: string; onPick: (code: string, nombre?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sel = variantes.find((v) => v.code === value);
  const label = sel ? (sel.descripcion || sel.code) : "Variante…";
  return (
    <div ref={wrapRef} style={{ display: "inline-flex", width: "100%", minWidth: 0 }}>
      <button type="button" className="nsl-varbtn" data-warn={value ? undefined : "1"} title={label} onClick={() => setOpen((o) => !o)}>
        <span className="nsl-varbtn__label">{label}</span>
        <svg className="nsl-varbtn__chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s ease" }}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <Popover anchorRef={wrapRef} open={open} onClose={() => setOpen(false)} minWidth={260}>
        <div style={{ width: "100%", padding: 8 }}>
          <div className="nsl-list" style={{ display: "flex", flexDirection: "column", gap: 2, overflowY: "auto", maxHeight: 260 }}>
            {variantes.length === 0 && <div className="ds-muted ds-body-sm" style={{ padding: 12, textAlign: "center" }}>Sin variantes.</div>}
            {variantes.map((v) => (
              <button key={v.code} type="button" onClick={() => { onPick(v.code, v.descripcion); setOpen(false); }}
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

// ─── Cantidad (input simple; al enfocar selecciona todo para reemplazar) ─────────
function Cantidad({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <input inputMode="numeric" value={value} aria-label="Cantidad" onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => onChange(Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0))}
      style={{ width: 72, textAlign: "center", height: 38, borderRadius: 10, border: "1.5px solid var(--ds-color-gray-100)", background: "var(--ds-tint-base)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }} />
  );
}

// ─── Buscar material (mismo dropdown en 2 etapas): material → (si tiene) variante ─
function MaterialSearch({ items, resolveVariantes, onAdd }: {
  items: Item[]; resolveVariantes: (id: string) => Promise<Variante[]>; onAdd: (id: string, vc?: string, vn?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<{ id: string; label: string; variantes: Variante[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const list: Item[] = useMemo(() => (stage ? stage.variantes.map((v) => ({ id: v.code, title: v.descripcion || v.code })) : items), [stage, items]);
  const matches = useMemo(() => filtrar(list, q), [q, list]);
  function reset() { setOpen(false); setStage(null); setQ(""); }
  const toggle = () => { if (open) { reset(); } else { setOpen(true); inputRef.current?.focus(); } };
  function clickItem(id: string) {
    // Se agrega el material directo. Si tiene variantes, se elige/cambia en el
    // botón de variante de la LÍNEA (no acá), para no llenar el buscador de pasos.
    onAdd(id); reset();
  }
  const placeholder = stage ? `Variante de ${stage.label}…` : "Buscar material para agregar…";
  return (
    <div style={{ width: "100%" }}>
      <div ref={boxRef} style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 62, paddingLeft: 18, paddingRight: 8, background: "var(--ds-color-white)", borderRadius: 999, boxShadow: "var(--ds-shadow-01)", border: `1.5px solid ${stage ? "var(--ds-color-green-100)" : open ? "var(--ds-color-gray-300)" : "var(--ds-color-gray-100)"}` }}>
        <input ref={inputRef} value={q} placeholder={placeholder} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          style={{ flex: 1, minWidth: 0, border: 0, background: "transparent", outline: "none", fontSize: 15, color: "var(--ds-color-gray-500)" }} />
        <span style={{ flexShrink: 0, transform: "scale(0.76)", transformOrigin: "center", display: "inline-flex" }}>
          <ToggleCards size="small" visibility={open ? "open" : "close"} onClick={toggle} ariaLabel={open ? "Cerrar" : "Abrir"} />
        </span>
      </div>
      <Popover anchorRef={boxRef} open={open} onClose={reset}>
        <div style={{ width: "100%", padding: 8, display: "flex", flexDirection: "column" }}>
          {stage && (
            <button type="button" onClick={() => { setStage(null); setQ(""); inputRef.current?.focus(); }} className="row gap-2"
              style={{ alignItems: "center", width: "100%", textAlign: "left", padding: "8px 12px", border: 0, borderBottom: "1.5px solid var(--ds-color-gray-100)", background: "none", cursor: "pointer", color: "var(--ds-color-gray-400)", flexShrink: 0 }}>
              <Icon name="back" size="sm" color="currentColor" /> <span className="ds-label ds-strong">Volver a materiales</span>
            </button>
          )}
          <div className="nsl-list" style={{ display: "flex", flexDirection: "column", gap: 2, overflowY: "auto", maxHeight: 300, marginTop: stage ? 6 : 0 }}>
            {busy && <div className="ds-muted ds-body-sm" style={{ padding: 12, textAlign: "center" }}>Buscando variantes…</div>}
            {!busy && matches.length === 0 && <div className="ds-muted ds-body-sm" style={{ padding: 12, textAlign: "center" }}>Sin resultados.</div>}
            {!busy && matches.map((i) => (
              <button key={i.id} type="button" onClick={() => clickItem(i.id)}
                className="nsl-opt row row--between" style={{ gap: 8, alignItems: "center", width: "100%", textAlign: "left", padding: "11px 14px", border: 0, borderRadius: 12, cursor: "pointer", background: "transparent" }}>
                <span className="col" style={{ gap: 2, minWidth: 0 }}>
                  <span className="ds-body-sm ds-strong">{i.title}</span>
                  {i.sub && <span className="ds-muted ds-label">{i.sub}</span>}
                </span>
                <Icon name="plus" size="sm" color="var(--ds-color-green-200)" />
              </button>
            ))}
          </div>
        </div>
      </Popover>
    </div>
  );
}

export function NuevaSolicitudSheet({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const { articulos, obras, maquinas, almacenes, usuario, addPedido, setPedidoEstado } = useStore();
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
        const items: Articulo[] = ri.ok ? (((await ri.json()).items ?? []).map((i: any) => ({
          id: i.id, code: i.code, descripcion: i.descripcion, unidad: i.unidad || "UND", almacenDefault: "", precioReferencia: 0, tipo: "inventario" as const,
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
  const catArticulos = useMemo(() => {
    const base = bcArt ?? articulos;
    if (!extraArt.length) return base;
    const codes = new Set(base.map((a) => a.code));
    return [...base, ...extraArt.filter((e) => !codes.has(e.code))];
  }, [bcArt, articulos, extraArt]);
  const catObras = bcObras ?? obras;
  const catAlm = bcAlm ?? almacenes;

  const [step, setStep] = useState<1 | 2>(1);
  const [tipo, setTipo] = useState<TipoSolicitud>("material");
  const [destino, setDestino] = useState("");
  const [mismaObra, setMismaObra] = useState(true);
  const [prioridad, setPrioridad] = useState<Pedido["prioridad"]>("normal");
  const [lineas, setLineas] = useState<Row[]>([]);
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [obraKey, setObraKey] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState<string | null>(null); // resalta una línea ya existente
  const [guardarPlantOpen, setGuardarPlantOpen] = useState(false);
  const [nombrePlant, setNombrePlant] = useState("");
  const [savingPlant, setSavingPlant] = useState(false);
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const varCache = useRef<Record<string, Variante[]>>({});
  const [varMap, setVarMap] = useState<Record<string, Variante[]>>({});
  const [fTipoPl, setFTipoPl] = useState<FTipo>("todas");
  const [pendingPlantilla, setPendingPlantilla] = useState<string | null>(null); // plantilla general esperando obra
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
  useEffect(() => {
    for (const l of lineas) { const a = catArticulos.find((x) => x.id === l.articuloId); if (a?.code) getVariantes(a.code); }
  }, [lineas, catArticulos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bodega (stock): por defecto el Almacén General mientras no se elija otro.
  useEffect(() => {
    if (tipo !== "stock" || destino) return;
    const gen = catAlm.find((a) => a.codigo === "ALM-GRAL")
      ?? catAlm.find((a) => /general/i.test((a as { nombre?: string }).nombre ?? "") || /general/i.test(a.codigo));
    if (gen) setDestino(gen.codigo);
  }, [tipo, destino, catAlm]);

  const tipoMeta = TIPOS.find((t) => t.v === tipo)!;
  const esMaterial = tipo === "material";
  const obraItems: Item[] = useMemo(() => catObras.map((o) => ({ id: o.codigo, title: o.nombre, sub: o.codigo })), [catObras]);
  const destinoItems: Item[] = useMemo(() => {
    if (tipo === "repuesto") return maquinas.map((m) => ({ id: m.no, title: m.nombre, sub: m.no }));
    if (tipo === "stock") return catAlm.map((a) => ({ id: a.codigo, title: (a as any).nombre || a.codigo, sub: a.codigo }));
    return obraItems;
  }, [tipo, obraItems, maquinas, catAlm]);
  // La unidad NO va en la lista de búsqueda (solo el código); la unidad se muestra
  // en la línea ya agregada, junto a la cantidad.
  const articuloItems: Item[] = useMemo(() => catArticulos.map((a) => ({ id: a.id, title: a.descripcion, sub: a.code })), [catArticulos]);
  const destinoNombre = destinoItems.find((d) => d.id === destino)?.title ?? "";
  const obraNombreDe = (code: string) => catObras.find((o) => o.codigo === code)?.nombre ?? code;

  const esBodega = (p: Plantilla) => p.tipo === "bodega" || (!p.tipo && p.idClasificacion == null);
  const plantillaItems: Item[] = useMemo(() => plantillas
    .filter((p) => fTipoPl === "mias" ? (p.creadoPor ?? "") === (usuario ?? "")
      : fTipoPl === "bodega" ? esBodega(p)
      : fTipoPl === "general" ? !esBodega(p) : true)
    .map((p) => ({ id: String(p.id), title: p.nombre, sub: esBodega(p) ? "Bodega" : "General" })), [plantillas, fTipoPl, usuario]);

  const validLines = lineas.filter((l) => l.articuloId && l.cantidad > 0);
  const hasData = validLines.length > 0 || !!destino || notas.trim().length > 0;
  const variantesDe = (l: Row) => { const a = catArticulos.find((x) => x.id === l.articuloId); return a ? (varMap[a.code] ?? []) : []; };
  const necesitaVariante = (l: Row) => { const vs = variantesDe(l); return vs.length > 0 && !l.variantCode; };
  const destinoOk = esMaterial ? validLines.every((l) => !!l.obraCodigo) : !!destino;
  const canContinue = validLines.length > 0 && destinoOk && validLines.every((l) => !necesitaVariante(l));

  function reset() {
    setStep(1); setTipo("material"); setDestino(""); setMismaObra(true); setPrioridad("normal");
    setLineas([]); setNotas(""); setSaving(false); setFTipoPl("todas"); setMenuKey(null); setObraKey(null); setPendingPlantilla(null); setPlantillaSel(""); setExtraArt([]);
  }
  function close() { setConfirmExit(false); setOpen(false); setTimeout(reset, 260); }
  function requestDismiss() { if (hasData && !saving) setConfirmExit(true); else close(); }

  function aplicarPlantilla(pl: Plantilla, obraCodigo?: string) {
    const rows: Row[] = [];
    const extras: Articulo[] = [];
    for (const pl2 of pl.lineas) {
      if (!pl2.code) continue;
      let a = catArticulos.find((x) => x.code === pl2.code) ?? extras.find((x) => x.code === pl2.code);
      if (!a) {
        // El material no está en el catálogo cargado: se sintetiza con la info de
        // la plantilla (código, descripción, unidad) para no perder la línea.
        a = { id: pl2.code, code: pl2.code, descripcion: pl2.descripcion || pl2.code, unidad: pl2.unidad || "UND", almacenDefault: "", precioReferencia: 0, tipo: "inventario" };
        extras.push(a);
      }
      const oc = pl2.obraCodigo || obraCodigo || undefined;
      rows.push({ key: uid(), articuloId: a.id, variantCode: pl2.variantCode, variantNombre: pl2.variantNombre, cantidad: pl2.cantidad || 1, obraCodigo: oc, obraNombre: oc ? obraNombreDe(oc) : undefined });
    }
    if (extras.length) setExtraArt((prev) => { const codes = new Set(prev.map((a) => a.code)); return [...prev, ...extras.filter((e) => !codes.has(e.code))]; });
    if (rows.length) { setLineas(rows); toast(`Plantilla "${pl.nombre}" cargada (${rows.length} materiales)`, "success"); }
    else toast(`La plantilla "${pl.nombre}" no tiene materiales.`, "info");
  }
  function cargarPlantilla(id: string) {
    const pl = plantillas.find((p) => String(p.id) === id);
    if (!pl) return;
    setPlantillaSel(id);
    if (esBodega(pl)) {
      // Bodega: va para bodega, sin obra. Se vuelve una solicitud de Bodega.
      setTipo("stock"); setDestino(""); setPendingPlantilla(null); aplicarPlantilla(pl, undefined);
      return;
    }
    // General: va a una obra. Primero se elige la obra, luego se cargan los materiales.
    setTipo("material");
    if (destino) { aplicarPlantilla(pl, destino); }
    else { setPendingPlantilla(id); toast(`Elegí la obra y se cargan los materiales de "${pl.nombre}".`, "info"); }
  }

  function addRow(articuloId: string, variantCode?: string, variantNombre?: string, cantidad = 1) {
    // Si el material YA está en el pedido, no lo duplica ni suma en silencio: avisa y
    // resalta la línea existente para que ahí cambien la cantidad o la obra.
    const ex = lineas.find((l) => l.articuloId === articuloId && (l.variantCode ?? "") === (variantCode ?? ""));
    if (ex) {
      const a = catArticulos.find((x) => x.id === articuloId);
      toast(`"${a?.descripcion ?? "Ese material"}" ya está en el pedido. Cambiá la cantidad o la obra en su línea.`, "info");
      setFlashKey(ex.key);
      setTimeout(() => setFlashKey((k) => (k === ex.key ? null : k)), 1800);
      return;
    }
    const obraCodigo = esMaterial ? (destino || undefined) : undefined;
    // Los materiales nuevos se agregan ARRIBA (los más recientes primero).
    setLineas((ls) => [{ key: uid(), articuloId, variantCode, variantNombre, cantidad, obraCodigo, obraNombre: obraCodigo ? obraNombreDe(obraCodigo) : undefined }, ...ls]);
  }
  // Variantes de un artículo (por id) para el drill-down del buscador de materiales.
  const resolveVariantes = async (articuloId: string) => { const a = catArticulos.find((x) => x.id === articuloId); return a ? getVariantes(a.code) : []; };
  function pickGlobalObra(code: string) {
    setDestino(code);
    if (mismaObra) setLineas((ls) => ls.map((l) => ({ ...l, obraCodigo: code, obraNombre: obraNombreDe(code) })));
    if (pendingPlantilla) {
      const pl = plantillas.find((p) => String(p.id) === pendingPlantilla);
      setPendingPlantilla(null);
      if (pl) aplicarPlantilla(pl, code);
    }
  }
  const setLinea = (key: string, patch: Partial<Row>) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const delLinea = (key: string) => setLineas((ls) => ls.filter((l) => l.key !== key));
  function duplicarLinea(key: string) {
    setLineas((ls) => { const idx = ls.findIndex((x) => x.key === key); if (idx < 0) return ls; return [...ls.slice(0, idx + 1), { ...ls[idx], key: uid() }, ...ls.slice(idx + 1)]; });
  }

  function headerObra(): { codigo?: string; nombre?: string } {
    if (tipo === "repuesto") return {};
    if (tipo === "stock") return { codigo: destino, nombre: destinoNombre };
    const codes = Array.from(new Set(validLines.map((l) => l.obraCodigo).filter(Boolean))) as string[];
    if (codes.length === 1) return { codigo: codes[0], nombre: obraNombreDe(codes[0]) };
    if (codes.length === 0) return { codigo: destino || undefined, nombre: destino ? obraNombreDe(destino) : undefined };
    return { codigo: "(varias)", nombre: "Varias obras" };
  }

  function buildInput(): NewPedidoInput {
    const h = headerObra();
    return {
      tipoSolicitud: tipo,
      obraCodigo: tipo === "repuesto" ? undefined : h.codigo,
      obraNombre: tipo === "repuesto" ? undefined : h.nombre,
      maquinaNo: tipo === "repuesto" ? destino : undefined,
      maquinaNombre: tipo === "repuesto" ? destinoNombre : undefined,
      solicitante: usuario ?? "",
      prioridad, notas: notas.trim() || undefined,
      lineas: validLines.map((l) => {
        const a = catArticulos.find((x) => x.id === l.articuloId)!;
        // Si se eligió variante, se guarda la descripción de la variante (más específica);
        // si no, la descripción base del material.
        return { articuloId: a.id, descripcion: l.variantNombre || a.descripcion, cantidad: l.cantidad, unidad: a.unidad, almacen: esMaterial ? (l.obraCodigo || "") : "", variantCode: l.variantCode || undefined };
      }),
    };
  }

  async function pedir() {
    if (!canContinue || saving) return;
    setSaving(true);
    try { const p = await addPedido(buildInput()); await setPedidoEstado(p.id, "aprobado"); toast(`Pedido ${p.numero} enviado a proveeduría`, "success"); close(); }
    catch { toast("No se pudo enviar el pedido. Intentá de nuevo.", "error"); setSaving(false); }
  }
  async function guardarBorrador() {
    if (validLines.length === 0) { close(); return; }
    setSaving(true);
    try { const p = await addPedido(buildInput()); toast(`Borrador ${p.numero} guardado`, "info"); close(); }
    catch { toast("No se pudo guardar el borrador.", "error"); setSaving(false); }
  }

  // Guarda las líneas actuales como una plantilla (General o Bodega según el tipo).
  async function guardarComoPlantilla() {
    const nombre = nombrePlant.trim();
    if (!nombre || validLines.length === 0) return;
    setSavingPlant(true);
    const tipoPlant = tipo === "stock" ? "bodega" : "general";
    const lineasPlant = validLines.map((l) => {
      const a = catArticulos.find((x) => x.id === l.articuloId);
      return { code: a?.code ?? l.articuloId, descripcion: l.variantNombre || a?.descripcion || "", cantidad: l.cantidad, unidad: a?.unidad || "UND", obraCodigo: esMaterial ? (l.obraCodigo || "") : "", variantCode: l.variantCode || undefined, variantNombre: l.variantNombre || undefined };
    });
    try {
      const r = await fetch("/api/compras/plantillas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre, creadoPor: usuario, tipo: tipoPlant, lineas: lineasPlant }) });
      if (!r.ok) throw new Error();
      try { const rp = await fetch("/api/compras/plantillas"); if (rp.ok) setPlantillas(((await rp.json()).plantillas ?? []) as Plantilla[]); } catch { /* refresco opcional */ }
      toast(`Plantilla "${nombre}" guardada`, "success");
      setGuardarPlantOpen(false); setNombrePlant("");
    } catch { toast("No se pudo guardar la plantilla.", "error"); }
    finally { setSavingPlant(false); }
  }

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
              <h2 className="ds-subtitle-lg" style={{ margin: 0 }}>{step === 1 ? "Nuevo pedido" : "Vista previa"}</h2>
            </div>
            <button type="button" onClick={requestDismiss} aria-label="Cerrar" className="modal-close"><Icon name="close" size="sm" color="currentColor" /></button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
            {step === 1 ? (
              <div className="col gap-5">
                <Field label="Tipo de solicitud">
                  <Segmented value={tipo} options={TIPOS.map((t) => ({ v: t.v, label: t.label }))} onChange={(v) => { setTipo(v); setDestino(""); setPendingPlantilla(null); }} />
                </Field>

                {/* Plantilla (opcional) + Destino: lado a lado */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, alignItems: "start" }}>
                  <div className="col gap-2">
                    <span className="ds-form-field__label">Plantilla (opcional)</span>
                    <Dropdown placeholder="Buscar plantilla…" items={plantillaItems} value={plantillaSel} onPick={cargarPlantilla} badgeSub
                      onClear={() => { setPlantillaSel(""); setLineas([]); setPendingPlantilla(null); }}
                      filterNode={<Segmented size="sm" value={fTipoPl} options={F_TIPOS} onChange={setFTipoPl} />} />
                  </div>
                  <div className="col gap-2">
                    <div className="row row--between wrap gap-2" style={{ alignItems: "center" }}>
                      <span className="ds-form-field__label">{tipoMeta.destino}</span>
                      {esMaterial && (
                        <label className="row gap-2" style={{ alignItems: "center", cursor: "pointer" }} title="La obra elegida se aplica a todos los materiales">
                          <input type="checkbox" className="ds-cbx" checked={mismaObra} onChange={(e) => setMismaObra(e.target.checked)} />
                          <span className="ds-label ds-muted">Aplicar a todos</span>
                        </label>
                      )}
                    </div>
                    <Dropdown placeholder={`Elegí ${tipoMeta.destino.toLowerCase()}…`} items={destinoItems} value={destino} onPick={esMaterial ? pickGlobalObra : setDestino} />
                  </div>
                </div>

                {/* Materiales */}
                <div className="col gap-2">
                  <div className="row row--between" style={{ alignItems: "center" }}>
                    <span className="ds-form-field__label">Materiales</span>
                    <span className="ds-muted ds-label">{validLines.length} línea(s)</span>
                  </div>
                  <MaterialSearch items={articuloItems} resolveVariantes={resolveVariantes} onAdd={addRow} />

                  {lineas.length > 0 && (
                    <div className="col gap-2" style={{ marginTop: 4 }}>
                      {lineas.map((l) => {
                        const a = catArticulos.find((x) => x.id === l.articuloId);
                        const showObra = esMaterial && (!mismaObra || obraKey === l.key);
                        const variantes = variantesDe(l);
                        const faltaVar = necesitaVariante(l);
                        const warn = (esMaterial && !mismaObra && !l.obraCodigo) || faltaVar;
                        const flash = l.key === flashKey;
                        return (
                          <div key={l.key} className="col gap-2" style={{ position: "relative", padding: "10px 12px", borderRadius: 12, border: `1.5px solid ${flash ? "var(--ds-color-green-100)" : warn ? "var(--ds-color-yellow)" : "var(--ds-color-gray-100)"}`, background: "var(--ds-color-white)", boxShadow: flash ? "0 0 0 3px color-mix(in srgb, var(--ds-color-green-100) 40%, transparent)" : undefined, transition: "box-shadow .2s ease, border-color .2s ease" }}>
                            <div className="row gap-3 wrap" style={{ alignItems: "center" }}>
                              <div className="col" style={{ gap: 2, minWidth: 0, flex: "1 1 200px" }}>
                                <span className="ds-body-sm ds-strong">{l.variantNombre || a?.descripcion || "—"}</span>
                                <span className="ds-muted ds-label">{a?.code}</span>
                              </div>
                              {showObra && (
                                <div style={{ flex: "0 0 180px", minWidth: 0 }}>
                                  <Dropdown small warn placeholder="Obra…" items={obraItems} value={l.obraCodigo ?? ""}
                                    onPick={(code) => { setLinea(l.key, { obraCodigo: code, obraNombre: obraNombreDe(code) }); setObraKey(null); }} />
                                </div>
                              )}
                              {variantes.length > 0 && (
                                <div style={{ flex: "0 0 180px", minWidth: 0 }}>
                                  <VarianteBtn variantes={variantes} value={l.variantCode ?? ""}
                                    onPick={(code, nombre) => setLinea(l.key, { variantCode: code, variantNombre: nombre })} />
                                </div>
                              )}
                              <div className="row gap-2" style={{ alignItems: "center", flexShrink: 0, marginLeft: "auto" }}>
                                <Cantidad value={l.cantidad} onChange={(n) => setLinea(l.key, { cantidad: n })} />
                                <span className="ds-muted ds-label" style={{ minWidth: 26 }}>{a?.unidad}</span>
                                <button type="button" onClick={() => setMenuKey((k) => (k === l.key ? null : l.key))} aria-label="Opciones"
                                  style={{ background: "none", border: 0, cursor: "pointer", color: "var(--ds-color-gray-400)", display: "grid", placeItems: "center", padding: 6, borderRadius: 8 }}>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
                                </button>
                              </div>
                            </div>
                            {menuKey === l.key && (
                              <>
                                <div onClick={() => setMenuKey(null)} style={{ position: "fixed", inset: 0, zIndex: 3 }} />
                                <div className="col" style={{ position: "absolute", top: 46, right: 10, zIndex: 4, minWidth: 170, background: "var(--ds-color-white)", border: "1.5px solid var(--ds-color-gray-100)", borderRadius: 12, overflow: "hidden", boxShadow: "0 12px 30px rgba(15,18,20,.16)" }}>
                                  {esMaterial && <button type="button" onClick={() => { setObraKey(l.key); setMenuKey(null); }} className="ds-body-sm" style={{ textAlign: "left", padding: "10px 14px", border: 0, background: "none", cursor: "pointer" }}>Cambiar obra</button>}
                                  <button type="button" onClick={() => { duplicarLinea(l.key); setMenuKey(null); }} className="ds-body-sm" style={{ textAlign: "left", padding: "10px 14px", border: 0, background: "none", cursor: "pointer", borderTop: esMaterial ? "1.5px solid var(--ds-color-gray-100)" : 0 }}>Duplicar</button>
                                  <button type="button" onClick={() => { delLinea(l.key); setMenuKey(null); }} className="ds-body-sm ds-strong" style={{ textAlign: "left", padding: "10px 14px", border: 0, borderTop: "1.5px solid var(--ds-color-gray-100)", background: "none", cursor: "pointer", color: "var(--ds-color-red-100)" }}>Eliminar</button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <Field label="Prioridad"><Segmented value={prioridad} options={PRIORIDADES} onChange={setPrioridad} /></Field>
                <Field label="Comentario (opcional)">
                  <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} placeholder="Nota para proveeduría…" className="ds-form-field__input" style={{ width: "100%", resize: "vertical" }} />
                </Field>
              </div>
            ) : (
              <div className="col gap-4">
                <div className="row gap-2 wrap">
                  <Badge tone={esMaterial ? "green" : tipo === "repuesto" ? "yellow" : "gray"}>{tipoMeta.label}</Badge>
                  {prioridad !== "normal" && <Badge tone={prioridad === "urgente" ? "red" : "yellow"}>{PRIORIDADES.find((p) => p.v === prioridad)!.label}</Badge>}
                </div>
                <div className="col gap-1">
                  <span className="ds-muted ds-label" style={{ textTransform: "uppercase", letterSpacing: ".04em" }}>{esMaterial ? "Obra" : tipoMeta.destino}</span>
                  <span className="ds-subtitle">{(esMaterial ? headerObra().nombre : destinoNombre) || "—"}</span>
                  {!esMaterial && destino && <span className="ds-muted ds-body-sm">{destino}</span>}
                </div>
                <div className="col gap-2">
                  <span className="ds-muted ds-label" style={{ textTransform: "uppercase", letterSpacing: ".04em" }}>Materiales ({validLines.length})</span>
                  <div className="col gap-0" style={{ border: "1.5px solid var(--ds-color-gray-100)", borderRadius: 14, overflow: "hidden" }}>
                    {validLines.map((l, i) => {
                      const a = catArticulos.find((x) => x.id === l.articuloId)!;
                      const oc = l.obraCodigo || "";
                      return (
                        <div key={l.key} className="row row--between gap-3" style={{ alignItems: "center", padding: "10px 12px", borderTop: i ? "1.5px solid var(--ds-color-gray-100)" : 0 }}>
                          <div className="col" style={{ gap: 2, minWidth: 0 }}>
                            <span className="ds-body-sm ds-strong">{l.variantNombre || a.descripcion}</span>
                            <span className="ds-muted ds-label">{a.code}{esMaterial && oc ? ` · ${obraNombreDe(oc)}` : ""}</span>
                          </div>
                          <span className="ds-strong" style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{l.cantidad} {a.unidad}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {notas.trim() && (
                  <div className="col gap-1">
                    <span className="ds-muted ds-label" style={{ textTransform: "uppercase", letterSpacing: ".04em" }}>Comentario</span>
                    <span className="ds-body-sm">{notas.trim()}</span>
                  </div>
                )}
                {validLines.length > 0 && (
                  <Button variant="outline" block onClick={() => { setNombrePlant(""); setGuardarPlantOpen(true); }}>
                    ☆ Guardar como plantilla
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Footer: navegación circular ‹ › + puntitos de paso (estilo DS) */}
          <div className="row" style={{ alignItems: "center", justifyContent: "space-between", padding: "16px 22px", borderTop: "1.5px solid var(--ds-color-gray-100)", flexShrink: 0 }}>
            <button type="button" onClick={step === 1 ? requestDismiss : () => setStep(1)} aria-label={step === 1 ? "Cancelar" : "Volver"}
              style={{ width: 54, height: 54, borderRadius: "50%", border: "1.5px solid var(--ds-color-gray-100)", background: "var(--ds-color-white)", boxShadow: "var(--ds-shadow-01)", cursor: "pointer", display: "grid", placeItems: "center", color: "var(--ds-color-ink)" }}>
              <Icon name="back" size="md" color="currentColor" />
            </button>
            <div className="row gap-2" style={{ alignItems: "center" }}>
              {[1, 2].map((s) => (
                <span key={s} style={{ width: s === step ? 10 : 8, height: s === step ? 10 : 8, borderRadius: "50%", background: s === step ? "var(--ds-color-black)" : "var(--ds-color-gray-200)", transition: "all .2s ease" }} />
              ))}
            </div>
            {step === 1 ? (
              <button type="button" onClick={() => { if (canContinue) setStep(2); }} disabled={!canContinue} aria-label="Seguir"
                style={{ width: 54, height: 54, borderRadius: "50%", border: 0, background: canContinue ? "var(--ds-color-green-100)" : "var(--ds-color-gray-100)", boxShadow: canContinue ? "var(--ds-shadow-01)" : "none", cursor: canContinue ? "pointer" : "not-allowed", display: "grid", placeItems: "center", color: canContinue ? "var(--ds-color-black)" : "var(--ds-color-gray-300)" }}>
                <Icon name="arrow-right" size="md" color="currentColor" />
              </button>
            ) : (
              <button type="button" onClick={pedir} disabled={saving} aria-label="Pedir"
                style={{ height: 54, borderRadius: 999, border: 0, padding: "0 24px", background: "var(--ds-color-green-100)", boxShadow: "var(--ds-shadow-01)", cursor: saving ? "default" : "pointer", fontWeight: 700, fontSize: 15, color: "var(--ds-color-black)", display: "inline-flex", alignItems: "center", gap: 8 }}>
                {saving ? "Enviando…" : "Pedir"} <Icon name="arrow-right" size="sm" color="currentColor" />
              </button>
            )}
          </div>

          {/* Guardar como plantilla: modal DENTRO del drawer */}
          {guardarPlantOpen && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(15,18,20,.42)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 6 }}
              onClick={() => !savingPlant && setGuardarPlantOpen(false)}>
              <div style={{ background: "var(--ds-tint-base)", borderRadius: 18, padding: 22, width: "100%", maxWidth: 380, boxShadow: "0 24px 60px rgba(15,18,20,.28)" }} onClick={(e) => e.stopPropagation()}>
                <h3 className="ds-subtitle-lg" style={{ marginTop: 0, marginBottom: 6 }}>Guardar como plantilla</h3>
                <p className="ds-muted ds-body-sm" style={{ marginTop: 0, marginBottom: 14 }}>
                  Se guardan las {validLines.length} línea(s) como plantilla{" "}
                  <strong>{tipo === "stock" ? "de Bodega" : "General"}</strong> a tu nombre.
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

          {/* Confirmación de salida: DENTRO del drawer */}
          {confirmExit && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(15,18,20,.42)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 5 }}>
              <div style={{ background: "var(--ds-tint-base)", borderRadius: 18, padding: 22, width: "100%", maxWidth: 360, boxShadow: "0 24px 60px rgba(15,18,20,.28)" }}>
                <h3 className="ds-subtitle-lg" style={{ marginTop: 0, marginBottom: 8 }}>¿Salir del pedido?</h3>
                <p className="ds-muted ds-body-sm" style={{ marginTop: 0 }}>Tenés cambios sin enviar. Podés guardarlo como <strong>borrador</strong> para seguir después, o descartarlo.</p>
                <div className="col gap-2" style={{ marginTop: 18 }}>
                  {validLines.length > 0 && <Button block onClick={guardarBorrador} disabled={saving}>Guardar en borrador</Button>}
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
