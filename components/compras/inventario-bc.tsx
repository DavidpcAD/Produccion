"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Button, Skeleton } from "@/components/compras/ui";
import { Icon } from "@/components/ds/Icon/Icon";
import { num } from "@/lib/compras/helpers";
import type { OrdenLinea } from "@/lib/compras/types";

// ─────────────────────────────────────────────────────────────────────────────
// "¿Esto ya lo tenemos?" — el stock de Business Central al lado de cada material,
// en la bandeja de aprobación.
//
// Va APAGADO y se enciende a mano: aprobar no siempre necesita el inventario (una
// compra de consumo directo no toca bodega), y encenderlo solo son N consultas a BC
// por orden —en una tableta de obra, con la bandeja llena, eso se nota—. Mientras
// nadie lo pida, la pantalla no habla con BC.
//
// El interruptor es UNO para toda la pantalla: quien quiere ver el inventario lo
// quiere para las órdenes que va a revisar, no para una sola. Vive en memoria de la
// página (no en localStorage): la tableta es compartida y esto no es una preferencia
// del aparato como el tema.
// ─────────────────────────────────────────────────────────────────────────────

let encendido = false;
const oyentes = new Set<() => void>();

/** El interruptor compartido. Devuelve [está prendido, prenderlo/apagarlo]. */
export function useVerInventarioBc(): [boolean, (v: boolean) => void] {
  const ver = useSyncExternalStore(
    (fn) => { oyentes.add(fn); return () => { oyentes.delete(fn); }; },
    () => encendido,
    () => false, // en el servidor siempre apagado: así el HTML coincide con la hidratación
  );
  return [ver, (v: boolean) => { encendido = v; for (const fn of oyentes) fn(); }];
}

export type FilaStock = { almacen: string; variante: string; cantidad: number; unidad: string };
/** `total: null` = BC no contestó por ese artículo. No es cero: cero es un dato.
 *  `conocido: false` = BC ni siquiera tiene ficha de ese código. */
export type StockBc = { tipo: string; base: string; conocido?: boolean; total: number | null; almacenes: FilaStock[] };

/** Lo que ya se preguntó, por un rato. El inventario se mueve, así que la respuesta
 *  envejece: pasado esto se vuelve a preguntar. Sirve para que abrir y cerrar las
 *  líneas de la misma orden —o dos órdenes con el mismo material— no repita la
 *  consulta a BC. */
const FRESCO_MS = 60_000;

/** Cuántos almacenes se muestran sin pedirlo. Los demás se abren con un botón. */
const TOPE_ALMACENES = 8;
const cache = new Map<string, { at: number; dato: StockBc }>();

function enCache(code: string): StockBc | undefined {
  const g = cache.get(code);
  if (!g) return undefined;
  if (Date.now() - g.at > FRESCO_MS) { cache.delete(code); return undefined; }
  return g.dato;
}

export type EstadoInv = "apagado" | "cargando" | "ok" | "error";

/** Los códigos de artículo de una orden que SÍ tienen inventario que mirar: los
 *  cargos (flete, impuestos) y los activos fijos no entran a bodega. */
export function codigosConInventario(lineas: OrdenLinea[]): string[] {
  return lineas
    .filter((l) => l.tipo === "articulo" && !l.esActivo && !!l.articuloId?.trim())
    .map((l) => l.articuloId!.trim());
}

/** El stock de esos artículos, solo si el interruptor está prendido.
 *
 *  La respuesta se guarda CON la clave de los artículos que la pidieron: mientras no
 *  coincida con lo que se está mirando, lo que hay en pantalla es de otra orden y se
 *  muestra "cargando", no un número ajeno. */
export function useInventarioBc(codigos: string[], activo: boolean) {
  const [res, setRes] = useState<{ clave: string; stock: Record<string, StockBc>; error: boolean }>(
    { clave: "", stock: {}, error: false },
  );
  // El sort va dentro del useMemo a propósito: ordenar en el cuerpo del componente
  // un array derivado le rompe la memoización al React Compiler.
  const clave = useMemo(() => [...new Set(codigos.filter(Boolean))].sort().join(","), [codigos]);

  useEffect(() => {
    if (!activo || !clave) return;
    let vivo = true;
    (async () => {
      const todos = clave.split(",");
      const guardados = Object.fromEntries(todos.map((c) => [c, enCache(c)]).filter(([, d]) => d) as [string, StockBc][]);
      const faltan = todos.filter((c) => !guardados[c]);
      if (!faltan.length) { if (vivo) setRes({ clave, stock: guardados, error: false }); return; }
      try {
        const r = await fetch(`/api/compras/bc/inventario?items=${encodeURIComponent(faltan.join(","))}`);
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error || "Business Central no respondió.");
        const traidos = (d?.items ?? {}) as Record<string, StockBc>;
        for (const [k, v] of Object.entries(traidos)) cache.set(k, { at: Date.now(), dato: v });
        if (vivo) setRes({ clave, stock: { ...guardados, ...traidos }, error: false });
      } catch {
        // Lo que ya estaba en caché igual se muestra; del resto se dice "s/d".
        if (vivo) setRes({ clave, stock: guardados, error: true });
      }
    })();
    return () => { vivo = false; };
  }, [clave, activo]);

  const listo = res.clave === clave;
  const estado: EstadoInv = !activo || !clave ? "apagado" : !listo ? "cargando" : res.error ? "error" : "ok";
  return { stock: listo ? res.stock : {}, estado };
}

/** El interruptor, encima de las líneas. */
export function InventarioBoton({ estado }: { estado: EstadoInv }) {
  const [ver, setVer] = useVerInventarioBc();
  return (
    <div className="oc-inv__barra">
      <Button type="button" variant={ver ? "ghost" : "outline"} size="sm" onClick={() => setVer(!ver)} aria-pressed={ver}
        title="Cuánto hay hoy de cada material en Business Central, en todos los almacenes">
        <Icon name="entrega" size="sm" color="currentColor" />
        {ver ? "Ocultar el inventario" : "Ver el inventario en BC"}
      </Button>
      {ver && estado === "error" && (
        <span className="oc-inv__aviso">Business Central no respondió: no se pudo leer el inventario.</span>
      )}
    </div>
  );
}

/** Todo lo que hay del artículo, almacén por almacén, para el tooltip de la tabla.
 *  Va uno por RENGLÓN: el tooltip del navegador respeta los saltos de línea, y con
 *  veinte almacenes en una sola tira no se lee nada. */
export function detalleInventario(d: StockBc): string {
  if (!d.almacenes.length) return "Sin existencias en ningún almacén de BC.";
  return d.almacenes
    .map((a) => `${nombreAlmacen(a)} — ${num.format(a.cantidad)} ${a.unidad || d.base}`)
    .join("\n");
}

function nombreAlmacen(a: FilaStock): string {
  return `${a.almacen || "Sin almacén"}${a.variante ? ` · variante ${a.variante}` : ""}`;
}

function unidadDe(d: StockBc): string {
  return (d.base || d.almacenes.find((a) => a.unidad)?.unidad || "").trim();
}

/** Qué decir de UNA línea: puede no haber nada que decir (un cargo no entra a
 *  bodega), puede no saberse (BC no contestó) o puede haber un número. */
type Lectura =
  | { clase: "n/a"; texto: string; nota?: string }
  | { clase: "cargando" }
  | { clase: "sd"; texto: string; nota: string }
  | {
      clase: "dato"; total: number; unidad: string;
      /** El desglose como TEXTO, para el tooltip de la tabla. */
      detalle: string;
      /** El mismo desglose como datos, para pintarlo en lista donde no hay tooltip. */
      almacenes: FilaStock[];
      enDestino: string | null; nota?: string;
    };

function leer(l: OrdenLinea, stock: Record<string, StockBc>, estado: EstadoInv): Lectura {
  if (l.tipo === "cargo") return { clase: "n/a", texto: "—", nota: "Un cargo (flete, impuestos) no entra a inventario." };
  if (l.esActivo) return { clase: "n/a", texto: "No aplica", nota: "Un activo fijo no entra a inventario." };
  const code = l.articuloId?.trim();
  if (!code) return { clase: "n/a", texto: "—", nota: "La línea no trae código de artículo." };

  const d = stock[code];
  if (!d) {
    if (estado === "cargando") return { clase: "cargando" };
    return { clase: "sd", texto: "s/d", nota: "Business Central no respondió por este artículo." };
  }
  if (d.tipo === "servicio" || d.tipo === "no-inventario") {
    return {
      clase: "n/a",
      texto: d.tipo === "servicio" ? "Servicio" : "No inventariable",
      nota: "No mueve inventario: no hay existencias que comparar.",
    };
  }
  if (d.total == null) return { clase: "sd", texto: "s/d", nota: "Business Central no respondió por este artículo." };
  // Sin ficha y sin una sola existencia no hay con qué decir "no hay": lo más probable
  // es que ese código no exista en BC, y un "0" ahí se leería como inventario vacío.
  if (d.conocido === false && !d.almacenes.length) {
    return { clase: "sd", texto: "s/d", nota: "Business Central no tiene ficha de este artículo." };
  }

  const unidad = unidadDe(d);
  // Lo que hay EN EL ALMACÉN al que va esta línea: el total dice si lo tenemos, esto
  // dice si lo tenemos donde hace falta. Con el total en cero sobra —no hay nada en
  // ninguna parte, así que "0 en tal almacén" solo repite el renglón de arriba—.
  const dest = l.almacen?.trim();
  const enDestino = dest && d.total !== 0
    ? `${num.format(d.almacenes.filter((a) => a.almacen === dest).reduce((s, a) => s + a.cantidad, 0))} en ${dest}`
    : null;
  // El stock de BC viene en la unidad BASE del artículo, que no siempre es la de la
  // línea (M06-0009 se compra en kilos y se inventaría en gramos). Si no coinciden
  // se avisa, porque los dos números NO se restan.
  const nota = unidad && l.unidad && unidad.toUpperCase() !== l.unidad.trim().toUpperCase()
    ? `Ojo: el inventario está en ${unidad} (unidad base del artículo) y la línea pide en ${l.unidad}.`
    : undefined;
  return { clase: "dato", total: d.total, unidad, detalle: detalleInventario(d), almacenes: d.almacenes, enDestino, nota };
}

/** La celda de inventario en la TABLA (PC). */
export function InventarioCelda({ linea, stock, estado }: { linea: OrdenLinea; stock: Record<string, StockBc>; estado: EstadoInv }) {
  const r = leer(linea, stock, estado);
  if (r.clase === "cargando") return <Skeleton width={56} height={13} />;
  if (r.clase === "n/a" || r.clase === "sd") return <span className="ds-muted" title={r.nota}>{r.texto}</span>;
  return (
    <span className="oc-inv__dato" title={[r.detalle, r.nota].filter(Boolean).join(" — ")}>
      <span className={`oc-inv__total${r.total > 0 ? " is-hay" : ""}`}>{num.format(r.total)} {r.unidad}</span>
      {r.enDestino && <span className="oc-inv__dest">{r.enDestino}</span>}
    </span>
  );
}

/** La misma lectura APILADA (celular y riel de revisión), donde no hay tooltip que
 *  valga: el desglose por almacén se escribe completo. */
export function InventarioLinea({ linea, stock, estado }: { linea: OrdenLinea; stock: Record<string, StockBc>; estado: EstadoInv }) {
  const r = leer(linea, stock, estado);
  return (
    <div className="oc-inv__fila">
      <span className="oc-inv__rot">En inventario (BC)</span>
      {r.clase === "cargando" ? <Skeleton width={90} height={13} /> : r.clase === "n/a" || r.clase === "sd" ? (
        <span className="ds-muted">{r.texto}{r.nota ? ` · ${r.nota}` : ""}</span>
      ) : (
        <div className="oc-inv__dato">
          <span className={`oc-inv__total${r.total > 0 ? " is-hay" : ""}`}>{num.format(r.total)} {r.unidad}</span>
          <Desglose almacenes={r.almacenes} base={r.unidad} />
          {r.nota && <span className="oc-inv__desglose ds-wrap">{r.nota}</span>}
        </div>
      )}
    </div>
  );
}

/** Dónde está el material, un almacén por renglón y las cantidades en columna.
 *  Antes era una tira de texto separada por puntos: con tres almacenes se leía, con
 *  veinte era un párrafo y no se encontraba nada. */
function Desglose({ almacenes, base }: { almacenes: FilaStock[]; base: string }) {
  // Un material repartido en veinte almacenes de obra tapaba la línea siguiente. Se
  // muestran los de MÁS existencias (vienen ordenados de mayor a menor, que es el
  // orden en que importan) y el resto se abre a pedido. No se recorta nada: lo que
  // no se ve está a un clic.
  const [todos, setTodos] = useState(false);
  const faltan = almacenes.length - TOPE_ALMACENES;
  const visibles = todos ? almacenes : almacenes.slice(0, TOPE_ALMACENES);

  if (!almacenes.length) {
    return <span className="oc-inv__desglose ds-wrap">Sin existencias en ningún almacén de BC.</span>;
  }
  return (
    <>
    <ul className="oc-inv__alm">
      {visibles.map((a, i) => (
        <li key={`${a.almacen}-${a.variante}-${i}`} className="oc-inv__alm-fila">
          <span className="oc-inv__alm-cod ds-wrap">
            {a.almacen || "Sin almacén"}
            {a.variante && <span className="oc-inv__alm-var">variante {a.variante}</span>}
          </span>
          <span className="oc-inv__alm-cant">{num.format(a.cantidad)} {a.unidad || base}</span>
        </li>
      ))}
    </ul>
    {faltan > 0 && (
      <button type="button" className="oc-inv__alm-mas" onClick={() => setTodos((v) => !v)} aria-expanded={todos}>
        {todos ? "Ver solo los principales" : `Ver los otros ${faltan} ${faltan === 1 ? "almacén" : "almacenes"}`}
      </button>
    )}
    </>
  );
}
