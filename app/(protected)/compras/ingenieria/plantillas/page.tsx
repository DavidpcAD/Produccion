"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/compras/shell";
import { Badge, Button, Card, ConfirmDialog, Field, Input, Modal, Select, useToast } from "@/components/compras/ui";
import { Combobox } from "@/components/compras/combobox";
import { IconEdit } from "@/components/compras/icons";
import { useStore } from "@/lib/compras/store";

type Etapa = { id: number; codigo: string; nombre: string };
type Partida = { id: number; codigo: string; nombre: string; etapaId: number | null };
type SubPartida = { id: number; codigo: string; nombre: string; partidaId: number | null };
type Clasif = { id: number; nombre: string; partidaId: number | null; subPartidaId: number | null };
type Wbs = { etapas: Etapa[]; partidas: Partida[]; subpartidas: SubPartida[]; clasificaciones: Clasif[] };
type Linea = { code: string; descripcion?: string; cantidad: number; unidad?: string; obraCodigo?: string; variantCode?: string; variantNombre?: string };
type TipoPlantilla = "general" | "bodega";
type Plantilla = { id: number; nombre: string; creadoPor: string; idClasificacion: number | null; lineas: Linea[]; tipo?: TipoPlantilla };
type ItemBc = { code: string; descripcion: string; unidad: string };

export default function PlantillasPage() {
  const toast = useToast();
  const { usuario } = useStore();
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [wbs, setWbs] = useState<Wbs>({ etapas: [], partidas: [], subpartidas: [], clasificaciones: [] });
  const [items, setItems] = useState<ItemBc[]>([]);
  // Estado de la carga de materiales (vienen de BC). Si BC está lento o falla, el
  // buscador quedaba vacío en silencio ("no aparecen materiales"); ahora se ve y
  // se puede reintentar.
  const [itemsCargando, setItemsCargando] = useState(true);
  const [itemsError, setItemsError] = useState(false);
  const [buscar, setBuscar] = useState(""); const [fPartida, setFPartida] = useState("");
  const [fTipo, setFTipo] = useState<"todas" | TipoPlantilla>("todas");
  // Por defecto cada quien ve SOLO las plantillas que creó; con el toggle puede ver todas.
  const [soloMias, setSoloMias] = useState(true);
  const [editor, setEditor] = useState<Plantilla | "new" | null>(null);
  const [aBorrar, setABorrar] = useState<Plantilla | null>(null);

  async function recargar() {
    try {
      const [rp, rc] = await Promise.all([fetch("/api/compras/plantillas"), fetch("/api/compras/clasificaciones")]);
      const dp = await rp.json(); const dc = await rc.json();
      if (rp.ok) setPlantillas(dp.plantillas ?? []);
      if (rc.ok) setWbs({ etapas: dc.etapas ?? [], partidas: dc.partidas ?? [], subpartidas: dc.subpartidas ?? [], clasificaciones: dc.clasificaciones ?? [] });
    } catch (e: any) { toast(String(e?.message ?? e), "error"); }
  }
  useEffect(() => { recargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cargarItems = useCallback(() => {
    setItemsCargando(true);
    setItemsError(false);
    fetch("/api/compras/bc/items")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
        return d;
      })
      .then((d) => {
        const arr = Array.isArray(d.items) ? d.items : [];
        setItems(arr.map((i: any) => ({ code: i.code, descripcion: i.descripcion, unidad: i.unidad || "UND" })));
        // BC respondió pero sin materiales → lo tratamos como fallo recuperable.
        if (arr.length === 0) setItemsError(true);
      })
      .catch(() => { setItems([]); setItemsError(true); })
      .finally(() => setItemsCargando(false));
  }, []);
  useEffect(() => { cargarItems(); }, [cargarItems]);

  // Bodega = sin amarre a clasificación. Compatibilidad: plantillas viejas sin tipo
  // que no tengan clasificación se tratan como bodega.
  const esBodega = (pl: Plantilla) => pl.tipo === "bodega" || (!pl.tipo && !pl.idClasificacion);
  const clasDe = (id: number | null) => wbs.clasificaciones.find((c) => c.id === id);
  const ctxDeClas = (c?: Clasif) => {
    if (!c) return { partida: undefined as Partida | undefined, etapa: undefined as Etapa | undefined, sub: undefined as SubPartida | undefined };
    const sub = c.subPartidaId ? wbs.subpartidas.find((s) => s.id === c.subPartidaId) : undefined;
    const partida = wbs.partidas.find((p) => p.id === (c.partidaId ?? sub?.partidaId));
    const etapa = wbs.etapas.find((e) => e.id === partida?.etapaId);
    return { partida, etapa, sub };
  };

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return plantillas.filter((pl) => {
      if (soloMias && usuario && pl.creadoPor !== usuario) return false;
      if (fTipo !== "todas" && (fTipo === "bodega") !== esBodega(pl)) return false;
      const c = clasDe(pl.idClasificacion); const { partida } = ctxDeClas(c);
      if (fPartida && String(partida?.id) !== fPartida) return false;
      if (!q) return true;
      return pl.nombre.toLowerCase().includes(q) || (c?.nombre.toLowerCase().includes(q) ?? false);
    }).sort((a, b) => {
      // Ordenar por partida (código) → clasificación → nombre; sin clasificación al final.
      const pa = ctxDeClas(clasDe(a.idClasificacion)).partida?.codigo ?? "￿";
      const pb = ctxDeClas(clasDe(b.idClasificacion)).partida?.codigo ?? "￿";
      if (pa !== pb) return pa.localeCompare(pb, "es", { numeric: true });
      const ca = clasDe(a.idClasificacion)?.nombre ?? ""; const cb = clasDe(b.idClasificacion)?.nombre ?? "";
      if (ca !== cb) return ca.localeCompare(cb, "es", { numeric: true });
      return a.nombre.localeCompare(b.nombre, "es", { numeric: true });
    });
  }, [plantillas, buscar, fPartida, fTipo, wbs, soloMias, usuario]); // eslint-disable-line react-hooks/exhaustive-deps

  const misPlantillas = useMemo(() => plantillas.filter((pl) => !usuario || pl.creadoPor === usuario).length, [plantillas, usuario]);

  async function borrar(pl: Plantilla) {
    try {
      const r = await fetch(`/api/compras/plantillas/${pl.id}?usuario=${encodeURIComponent(usuario ?? "")}`, { method: "DELETE" });
      if (!r.ok) throw new Error("No se pudo borrar");
      toast("Plantilla borrada", "success"); recargar();
    } catch (e: any) { toast(String(e?.message ?? e), "error"); }
    finally { setABorrar(null); }
  }

  return (
    <AppShell role="ingenieria">
      <main className="page page--wide">
        <div className="page__head">
          <div className="page__title">
            <h1 className="ds-heading">Plantillas de pedido</h1>
            <p className="ds-muted"><strong>Generales</strong>: amarradas a etapa · partida · clasificación (alimentan la matriz por obra). <strong>Bodega</strong>: solo lista de materiales, sin clasificación.</p>
          </div>
          <Button onClick={() => setEditor("new")}>+ Nueva plantilla</Button>
        </div>

        <Card className="mt-2">
          <div className="grid-2">
            <Field label="Buscar plantilla"><Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Nombre o clasificación…" /></Field>
            <Field label="Tipo">
              <Select value={fTipo} onChange={(e) => setFTipo(e.target.value as "todas" | TipoPlantilla)}>
                <option value="todas">Todas</option>
                <option value="general">Generales</option>
                <option value="bodega">Bodega</option>
              </Select>
            </Field>
            <Field label="Partida">
              <Select value={fPartida} onChange={(e) => setFPartida(e.target.value)} disabled={fTipo === "bodega"}>
                <option value="">Todas las partidas</option>
                {wbs.partidas.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}
              </Select>
            </Field>
          </div>
          <div className="row gap-3 mt-3" style={{ alignItems: "center" }}>
            <div style={{ display: "inline-flex", background: "var(--ds-color-gray-100)", borderRadius: 999, padding: 3, gap: 2 }} role="group" aria-label="Filtrar plantillas por autor">
              <button type="button" onClick={() => setSoloMias(true)} aria-pressed={soloMias} title="Solo las plantillas que vos creaste"
                style={{ border: 0, cursor: "pointer", padding: "5px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, background: soloMias ? "var(--ds-surface)" : "transparent", color: soloMias ? "var(--ds-text)" : "var(--ds-color-gray-500)" }}>
                Mías ({misPlantillas})
              </button>
              <button type="button" onClick={() => setSoloMias(false)} aria-pressed={!soloMias} title="Ver las plantillas de todos"
                style={{ border: 0, cursor: "pointer", padding: "5px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, background: !soloMias ? "var(--ds-surface)" : "transparent", color: !soloMias ? "var(--ds-text)" : "var(--ds-color-gray-500)" }}>
                Todas ({plantillas.length})
              </button>
            </div>
            <span className="ds-body-sm ds-muted" style={{ marginLeft: "auto" }}>{visibles.length} plantilla(s)</span>
          </div>
        </Card>

        <div className="mt-4" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {visibles.length === 0 && <div className="empty">No hay plantillas.</div>}
          {visibles.map((pl) => {
            const c = clasDe(pl.idClasificacion); const { partida, etapa } = ctxDeClas(c);
            return (
              <Card key={pl.id} onClick={() => setEditor(pl)} style={{ cursor: "pointer" }}>
                <div className="row row--between" style={{ alignItems: "flex-start" }}>
                  <span className="ds-strong">{pl.nombre}</span>
                  <span className="row gap-1">
                    <button className="icon-btn" title="Editar plantilla" aria-label="Editar" onClick={(ev) => { ev.stopPropagation(); setEditor(pl); }}><IconEdit size={15} /></button>
                    <button className="icon-btn" title="Borrar" onClick={(ev) => { ev.stopPropagation(); setABorrar(pl); }}>×</button>
                  </span>
                </div>
                <div className="row gap-2 wrap mt-2">
                  <Badge tone={esBodega(pl) ? "yellow" : "green"}>{esBodega(pl) ? "Bodega" : "General"}</Badge>
                  {!esBodega(pl) && etapa && <Badge tone="gray">{etapa.nombre}</Badge>}
                  {!esBodega(pl) && (c ? <Badge tone="green">{c.nombre}</Badge> : <Badge tone="red">Sin clasificación</Badge>)}
                </div>
                <div className="ds-body-sm ds-muted mt-2">{pl.lineas.length} línea(s){partida ? ` · Partida ${partida.codigo}` : ""}</div>
              </Card>
            );
          })}
        </div>

        {editor && (
          <PlantillaEditor plantilla={editor === "new" ? null : editor} wbs={wbs} items={items} usuario={usuario ?? ""}
            itemsCargando={itemsCargando} itemsError={itemsError} onReintentarItems={cargarItems}
            onClose={() => setEditor(null)} onSaved={() => { setEditor(null); recargar(); }} />
        )}

        {aBorrar && (
          <ConfirmDialog
            title="Borrar plantilla"
            message={<>¿Seguro que querés borrar la plantilla <strong>{aBorrar.nombre}</strong>? Esta acción no se puede deshacer.</>}
            confirmLabel="Sí, borrar"
            onConfirm={() => borrar(aBorrar)}
            onCancel={() => setABorrar(null)}
          />
        )}
      </main>
    </AppShell>
  );
}

function PlantillaEditor({ plantilla, wbs, items, usuario, itemsCargando, itemsError, onReintentarItems, onClose, onSaved }: {
  plantilla: Plantilla | null; wbs: Wbs; items: ItemBc[]; usuario: string;
  itemsCargando: boolean; itemsError: boolean; onReintentarItems: () => void;
  onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  // Contexto inicial desde la clasificación de la plantilla (si edita).
  const clasInicial = wbs.clasificaciones.find((c) => c.id === plantilla?.idClasificacion);
  const subInicial = clasInicial?.subPartidaId ? wbs.subpartidas.find((s) => s.id === clasInicial.subPartidaId) : undefined;
  const partInicial = wbs.partidas.find((p) => p.id === (clasInicial?.partidaId ?? subInicial?.partidaId));
  const [etapaId, setEtapaId] = useState(String(wbs.etapas.find((e) => e.id === partInicial?.etapaId)?.id ?? wbs.etapas[0]?.id ?? ""));
  const partidasEt = wbs.partidas.filter((p) => String(p.etapaId) === etapaId);
  const [partidaId, setPartidaId] = useState(String(partInicial?.id ?? partidasEt[0]?.id ?? ""));
  const [idClas, setIdClas] = useState(plantilla?.idClasificacion ? String(plantilla.idClasificacion) : "");
  const [tipo, setTipo] = useState<TipoPlantilla>(plantilla?.tipo ?? (plantilla && !plantilla.idClasificacion ? "bodega" : "general"));
  const [nombre, setNombre] = useState(plantilla?.nombre ?? "");
  const [lineas, setLineas] = useState<Linea[]>(plantilla?.lineas ?? []);
  const [qaCode, setQaCode] = useState(""); const [qaQty, setQaQty] = useState("");
  // Variantes del artículo elegido (BC). Para plantillas de bodega, el material
  // que tiene variantes debe pedir cuál — así la solicitud sale con la variante.
  const [qaVariantes, setQaVariantes] = useState<{ code: string; descripcion: string }[]>([]);
  const [qaVariante, setQaVariante] = useState("");
  useEffect(() => {
    setQaVariante("");
    if (!qaCode) { setQaVariantes([]); return; }
    let vivo = true;
    fetch(`/api/compras/bc/variants?item=${encodeURIComponent(qaCode)}`)
      .then((r) => (r.ok ? r.json() : { variantes: [] }))
      .then((d) => { if (vivo) setQaVariantes(d.variantes ?? []); })
      .catch(() => { if (vivo) setQaVariantes([]); });
    return () => { vivo = false; };
  }, [qaCode]);
  const variantePendiente = qaVariantes.length > 0 && !qaVariante;
  const [guardando, setGuardando] = useState(false);
  // Stock actual en Business Central por material (código → total | null s/d | "…" cargando).
  const [stockBc, setStockBc] = useState<Record<string, number | null | "loading">>({});
  const codigosLineas = useMemo(() => [...new Set(lineas.map((l) => l.code).filter(Boolean))].join(","), [lineas]);
  useEffect(() => {
    const codes = codigosLineas ? codigosLineas.split(",") : [];
    const faltan = codes.filter((c) => !(c in stockBc));
    if (!faltan.length) return;
    setStockBc((s) => { const n = { ...s }; for (const c of faltan) n[c] = "loading"; return n; });
    let vivo = true;
    Promise.all(faltan.map(async (c) => {
      try {
        const r = await fetch(`/api/bc/existencias?itemNo=${encodeURIComponent(c)}`);
        const d = await r.json().catch(() => ({}));
        const tot = r.ok && Array.isArray(d.existencias)
          ? d.existencias.reduce((a: number, e: any) => a + (Number(e.cantidad) || 0), 0)
          : null;
        return [c, tot] as const;
      } catch { return [c, null] as const; }
    })).then((pares) => { if (vivo) setStockBc((s) => ({ ...s, ...Object.fromEntries(pares) })); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigosLineas]);

  // Clasificaciones bajo la partida elegida (directas o vía sus sub-partidas).
  const clasOpciones = useMemo(() => {
    const subsPartida = new Set(wbs.subpartidas.filter((s) => String(s.partidaId) === partidaId).map((s) => s.id));
    return wbs.clasificaciones.filter((c) => String(c.partidaId) === partidaId || (c.subPartidaId != null && subsPartida.has(c.subPartidaId)));
  }, [wbs, partidaId]);

  function agregar() {
    const it = items.find((x) => x.code === qaCode);
    if (!it || !(Number(qaQty) > 0)) { toast("Elegí un artículo y una cantidad.", "error"); return; }
    if (variantePendiente) { toast("Elegí la variante del material.", "error"); return; }
    const v = qaVariantes.find((x) => x.code === qaVariante);
    setLineas((L) => [...L, { code: it.code, descripcion: it.descripcion, unidad: it.unidad, cantidad: Number(qaQty), obraCodigo: "", variantCode: qaVariante || undefined, variantNombre: v?.descripcion || undefined }]);
    setQaCode(""); setQaQty(""); setQaVariante(""); setQaVariantes([]);
  }
  const delLinea = (i: number) => setLineas((L) => L.filter((_, idx) => idx !== i));
  const setLinea = (i: number, patch: Partial<Linea>) => setLineas((L) => L.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  // Importar materiales desde Excel para armar la plantilla (detecta la columna de
  // código por match con el catálogo BC y la de cantidad por ser la más numérica).
  const fileRef = useRef<HTMLInputElement>(null);
  async function importarExcel(file: File) {
    try {
      const mod = (await import("xlsx")) as unknown as { default?: typeof import("xlsx") } & typeof import("xlsx");
      const XLSX = mod.default ?? mod;
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
      if (!aoa.length) { toast("El Excel está vacío.", "error"); return; }
      const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
      const byCode = new Map(items.map((a) => [norm(a.code), a]));
      const nCols = Math.max(...aoa.map((r) => r.length));
      const count = (pred: (v: unknown) => boolean) => Array.from({ length: nCols }, (_, c) => aoa.reduce((n, r) => n + (pred(r[c]) ? 1 : 0), 0));
      const codeHits = count((v) => byCode.has(norm(v)));
      const codeCol = codeHits.indexOf(Math.max(...codeHits));
      if (!codeHits[codeCol]) { toast("No encontré una columna con códigos de material de BC.", "error"); return; }
      const numHits = count((v) => v !== "" && !isNaN(Number(v)) && Number(v) > 0).map((n, c) => (c === codeCol ? -1 : n));
      const cantCol = Math.max(...numHits) > 0 ? numHits.indexOf(Math.max(...numHits)) : -1;
      const nuevas: Linea[] = [];
      let sinMatch = 0;
      for (const r of aoa) {
        const it = byCode.get(norm(r[codeCol]));
        if (!it) { if (norm(r[codeCol])) sinMatch++; continue; }
        nuevas.push({ code: it.code, descripcion: it.descripcion, unidad: it.unidad, cantidad: cantCol >= 0 ? (Number(r[cantCol]) || 0) : 0, obraCodigo: "" });
      }
      if (!nuevas.length) { toast("Ninguna fila coincidió con el catálogo de BC.", "error"); return; }
      setLineas((L) => [...nuevas, ...L]);
      toast(`Se importaron ${nuevas.length} material(es)${sinMatch ? ` · ${sinMatch} sin coincidencia (omitidos)` : ""}. Revisá cantidades y guardá la plantilla.`, "success");
    } catch (e) {
      toast(`No pude leer el Excel: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function guardar() {
    if (!nombre.trim()) { toast("Poné un nombre.", "error"); return; }
    if (tipo === "general" && !idClas) { toast("Elegí la clasificación (o cambiá a plantilla de bodega).", "error"); return; }
    setGuardando(true);
    try {
      const body = { nombre: nombre.trim(), tipo, idClasificacion: tipo === "bodega" ? null : (idClas ? Number(idClas) : null), lineas, creadoPor: usuario, usuario };
      const r = plantilla
        ? await fetch(`/api/compras/plantillas/${plantilla.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/compras/plantillas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "No se pudo guardar");
      toast(`Plantilla ${plantilla ? "actualizada" : "creada"}`, "success"); onSaved();
    } catch (e: any) { toast(String(e?.message ?? e), "error"); setGuardando(false); }
  }

  return (
    <Modal title={plantilla ? "Editar plantilla" : "Nueva plantilla de pedido"} onClose={onClose} full
      footer={<>
        {(!nombre.trim() || (tipo === "general" && !idClas)) && (
          <span className="ds-body-sm ds-muted" style={{ marginRight: "auto" }}>
            {!nombre.trim() ? "Poné un nombre a la plantilla" : "Elegí la clasificación"}
          </span>
        )}
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={guardar} disabled={guardando || !nombre.trim() || (tipo === "general" && !idClas)}>{guardando ? "Guardando…" : "Guardar plantilla"}</Button>
      </>}>
      {/* Tipo de plantilla: general (amarrada a clasificación) vs bodega (solo materiales) */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {([["general", "General", "Etapa · partida · clasificación"], ["bodega", "Bodega", "Solo lista de materiales"]] as const).map(([t, titulo, hint]) => {
          const active = tipo === t;
          return (
            <button key={t} type="button" onClick={() => setTipo(t)}
              style={{
                flex: 1, textAlign: "left", cursor: "pointer", padding: "10px 14px", borderRadius: 10,
                display: "flex", flexDirection: "column", gap: 2,
                border: `1.5px solid ${active ? "var(--ds-color-black)" : "var(--ds-color-gray-100)"}`,
                background: active ? "var(--ds-color-black)" : "var(--ds-surface)",
                color: active ? "var(--ds-color-white)" : "inherit",
              }}>
              <span className="ds-strong">{titulo}</span>
              <span className="ds-body-sm" style={{ opacity: 0.75 }}>{hint}</span>
            </button>
          );
        })}
      </div>
      <div className="grid-2">
        <Field label="Nombre de la plantilla"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={tipo === "bodega" ? "Ej. Reposición bodega general" : "Ej. Pisos porcelanato 60x120"} /></Field>
        {tipo === "general" && <>
        <Field label="Etapa">
          <Select value={etapaId} onChange={(e) => { setEtapaId(e.target.value); const f = wbs.partidas.find((p) => String(p.etapaId) === e.target.value); setPartidaId(String(f?.id ?? "")); setIdClas(""); }}>
            {wbs.etapas.map((e) => <option key={e.id} value={e.id}>{e.codigo} · {e.nombre}</option>)}
          </Select>
        </Field>
        <Field label="Partida">
          <Select value={partidaId} onChange={(e) => { setPartidaId(e.target.value); setIdClas(""); }}>
            {partidasEt.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}
          </Select>
        </Field>
        <Field label="Clasificación">
          <Select value={idClas} onChange={(e) => setIdClas(e.target.value)}>
            <option value="">{clasOpciones.length ? "Elegí la clasificación…" : "Sin clasificaciones en esta partida"}</option>
            {clasOpciones.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Select>
        </Field>
        </>}
      </div>

      <div className="mt-4">
        <div className="row row--between wrap gap-2" style={{ alignItems: "center" }}>
          <span className="ds-label ds-muted">Líneas de la plantilla</span>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importarExcel(f); }} />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>↑ Importar Excel</Button>
        </div>
        <div className="row wrap gap-2" style={{ alignItems: "flex-end", margin: "8px 0 10px" }}>
          <div style={{ flex: "1 1 260px", minWidth: 200 }}>
            <label className="ds-label ds-muted" style={{ display: "block", marginBottom: 4 }}>Artículo</label>
            <Combobox items={items} value={qaCode} onChange={(k) => setQaCode(k)} getKey={(i) => i.code} getLabel={(i) => `${i.code} — ${i.descripcion}`} getSearch={(i) => `${i.code} ${i.descripcion}`} placeholder={itemsCargando ? "Cargando materiales…" : "Buscar artículo…"} />
            {itemsCargando ? (
              <div className="ds-body-sm ds-muted" style={{ marginTop: 4 }}>Cargando materiales de Business Central…</div>
            ) : itemsError ? (
              <div className="ds-body-sm" style={{ marginTop: 4, color: "var(--ds-color-red-200)" }}>
                No se pudieron cargar los materiales de BC (puede estar lento).{" "}
                <button type="button" onClick={onReintentarItems} style={{ textDecoration: "underline", fontWeight: 600 }}>Reintentar</button>
              </div>
            ) : (
              <div className="ds-body-sm ds-muted" style={{ marginTop: 4 }}>{items.length.toLocaleString("es-CR")} materiales · escribí para buscar</div>
            )}
          </div>
          {qaVariantes.length > 0 && (
            <div style={{ flex: "0 1 220px", minWidth: 170 }}>
              <label className="ds-label ds-muted" style={{ display: "block", marginBottom: 4 }}>Variante</label>
              <Combobox items={qaVariantes} value={qaVariante} onChange={(k) => setQaVariante(k)} getKey={(v) => v.code} getLabel={(v) => `${v.code} — ${v.descripcion}`} getSearch={(v) => `${v.code} ${v.descripcion}`} placeholder="Elegí variante…" />
            </div>
          )}
          <div><label className="ds-label ds-muted" style={{ display: "block", marginBottom: 4 }}>Cantidad</label><Input type="number" min={0} value={qaQty} onChange={(e) => setQaQty(e.target.value)} placeholder="0" style={{ width: 100 }} /></div>
          <div className="col" style={{ gap: 2 }}>
            <Button onClick={agregar} disabled={!qaCode || !(Number(qaQty) > 0) || variantePendiente}>+ Agregar</Button>
            {variantePendiente && <span className="ds-body-sm ds-muted" style={{ textAlign: "center" }}>Elegí la variante</span>}
          </div>
        </div>
        <div className="ds-table-wrap" style={{ boxShadow: "none", border: "1.5px solid var(--ds-color-gray-100)" }}>
          <table className="ds-table">
            <thead><tr><th>Artículo</th><th>Variante</th><th>Unidad</th><th className="ds-num">Stock BC</th><th className="ds-num">Cantidad</th><th></th></tr></thead>
            <tbody>
              {lineas.length === 0 && <tr><td colSpan={6}><div className="empty">Sin líneas. Agregá artículos.</div></td></tr>}
              {lineas.map((l, i) => {
                const st = stockBc[l.code];
                return (
                <tr key={i}>
                  <td><span className="ds-strong ds-body-sm">{l.code}</span> <span className="ds-muted">— {l.descripcion}</span></td>
                  <td className="ds-muted">{l.variantCode ? `${l.variantCode}${l.variantNombre ? ` — ${l.variantNombre}` : ""}` : "—"}</td>
                  <td className="ds-muted">{l.unidad ?? "—"}</td>
                  <td className="ds-num">
                    {st === undefined || st === "loading"
                      ? <span className="ds-muted">…</span>
                      : st === null
                        ? <span className="ds-muted" title="Sin conexión a Business Central">s/d</span>
                        : <span className={st > 0 ? "ds-strong" : "ds-muted"}>{st.toLocaleString("es-CR")}</span>}
                  </td>
                  <td className="ds-num"><Input type="number" min={0} value={l.cantidad} onChange={(e) => setLinea(i, { cantidad: Number(e.target.value) })} style={{ width: 90, textAlign: "right", padding: "6px 10px" }} /></td>
                  <td className="ds-num"><button className="icon-btn icon-btn--quitar" title="Quitar" onClick={() => delLinea(i)}>×</button></td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
