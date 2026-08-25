import type { Articulo, Movimiento, Orden, OrdenLinea, Pedido, PedidoLinea, Role, TipoSolicitud } from "./types";
import { recibeSoloLoSuyo } from "../permissions";

// Almacén de inventario por defecto (el General). El pedido puede elegir OTRO
// almacén real (Agregados, Herramienta, Maquinaria…): eso viaja en `almacen` de la
// línea. Este código es solo el default / el respaldo de las líneas que no traen
// almacén (pedidos viejos, donde `almacen` guardaba la OBRA — ver `obraDeLinea`).
export const ALMACEN_GENERAL = "ALM-GRAL";

// Almacén de MAQUINARIA: destino en BC del repuesto de consumo directo. BC no puede
// "no ingresar a inventario" sin proyecto+tarea (o cuenta contable), y el repuesto va
// contra una máquina, no contra una obra → la línea entra a MAQ.
export const ALMACEN_MAQUINARIA = "MAQ";

// Almacenes de BODEGA: los que se pueden elegir como destino de un pedido. Son los
// ALM-* (General, Barani, Salud Ocupacional), las fábricas F-* (Agregados, Maderas,
// Metales, Muebles, Prefabricados), los generales GEN-* de cada proyecto, y
// Herramienta / Maquinaria. Todo lo demás que hay en BC son ubicaciones de obra o de
// casa (VB-*, CS-*, INF-*, …), que no son destino de compra: se ofrecen aparte.
export function esAlmacenDeBodega(codigo: string): boolean {
  const c = (codigo ?? "").trim().toUpperCase();
  return c.startsWith("ALM-") || c.startsWith("F-") || c.startsWith("GEN-") || c === "HER" || c === "MAQ";
}

// ─── Obra vs almacén de una línea de pedido ─────────────────────────────────────
// Hasta 2026-08 la línea guardaba la OBRA en `almacen` (no se usaba la columna
// `obra` de la tabla) y el almacén real se decidía después, siempre el General.
// Hoy la línea trae obra Y almacén por separado; estas dos funciones leen las dos
// generaciones de pedidos sin que cada pantalla tenga que saberlo.

/** Obra de la línea (vacío si el pedido no es de obra). */
export function obraDeLinea(l: Pick<PedidoLinea, "obraCodigo" | "almacen">, p?: Pick<Pedido, "tipoSolicitud" | "obraCodigo">): string {
  if (l.obraCodigo) return l.obraCodigo;
  // Compat: pedido viejo de material → la obra venía en `almacen`.
  if (!p || p.tipoSolicitud === "material") return l.almacen || p?.obraCodigo || "";
  return "";
}

/** Destino que se le muestra a la gente: la OBRA si es material, el ALMACÉN si es
 *  repuesto o stock. */
export function destinoDeLinea(l: Pick<PedidoLinea, "obraCodigo" | "almacen">, p?: Pick<Pedido, "tipoSolicitud" | "obraCodigo">): string {
  if (p && p.tipoSolicitud !== "material") return l.almacen || p.obraCodigo || "";
  return obraDeLinea(l, p);
}

// ─── UNIDADES DE MEDIDA ─────────────────────────────────────────────────────────
// Un material se CONSUME en una unidad y se COMPRA en otra. El adhesivo M06-0009 se
// consume en gramos (unidad base) y se le compra al proveedor por ESTAÑÓN: 255.000
// gramos por estañón. La solicitud tiene que decir "1 EST", no "1 GR": el 21/08/2026
// salió una orden pidiendo 1 gramo con el precio del gramo, 255.000 veces abajo.
//
// El factor de cada unidad (`qtyPerUnitOfMeasure`) es cuántas unidades BASE trae, y
// la base es la de factor 1. Todo se convierte pasando por la base.

// ─── Código con la VARIANTE PEGADA ──────────────────────────────────────────────
// Los reportes de BC imprimen el artículo y su variante juntos ("M11-0066 -VAR 01"), y
// de ahí salieron tres plantillas que Bodega armó el 22/07/2026 (Ferretería, EPA,
// Lanco): 12 líneas con el código así. Una solicitud hecha desde esas plantillas nacía
// con un código que en BC NO EXISTE, y eso arrastraba todo lo demás: no se encontraba el
// artículo, así que la unidad caía al "UND" por defecto (cuando en BC es GAL o CUBETA),
// no había precio ("sin historial"), la variante quedaba en NULL y la línea no se podía
// lanzar a BC. Se ve en Proveeduría como una pintura en cubeta que dice UND y vale 0.
// Los dos formatos que aparecen en los datos: "M08-0123-VAR 01" y "M11-0081 -VAR 12".
export function separarVariantePegada(code: string): { code: string; variantCode?: string } {
  const t = (code ?? "").trim();
  const m = /^(.+?)\s*-VAR\s+([A-Za-z0-9._-]+)$/i.exec(t);
  if (!m) return { code: t };
  return { code: m[1].trim(), variantCode: m[2].trim() };
}

/** Unidad de un artículo tal como viene de BC (itemUnitsOfMeasure). */
export type UnidadItem = { code: string; factor: number };

// HRS está cargada en 3.508 de los 5.500 artículos de BC (una pintura "medida en
// horas"), casi siempre con factor 1 pero en el adhesivo con 4636,36 — el mismo que
// CUB. Es una carga masiva mal hecha: no se ofrece. Excepción: si es la unidad BASE
// del artículo (hay uno así), esconderla lo dejaría sin ninguna unidad.
const UNIDADES_BASURA = new Set(["HRS"]);

/** Unidades que se le OFRECEN a la persona para un artículo. Descarta las que no se
 *  pueden convertir (sin factor) y la basura de BC, y garantiza que la unidad base
 *  esté siempre (14 artículos no tienen ninguna fila cargada en BC). */
export function unidadesOfrecidas(unidades: UnidadItem[], base: string, tipo?: Articulo["tipo"]): UnidadItem[] {
  const b = (base ?? "").trim();
  // En un SERVICIO, HRS no es basura: es con lo que se contrata (S20-0001 tiene
  // DIA/HRS/UND). El filtro es para los materiales, donde una pintura "medida en
  // horas" es una carga masiva mal hecha.
  const esServicio = tipo === "servicio" || tipo === "no-inventario";
  const out = (unidades ?? [])
    .filter((u) => u.code && u.factor > 0)
    .filter((u) => esServicio || !UNIDADES_BASURA.has(u.code.toUpperCase()) || u.code.toUpperCase() === b.toUpperCase());
  if (b && !out.some((u) => u.code.toUpperCase() === b.toUpperCase())) out.unshift({ code: b, factor: 1 });
  return [...out].sort((a, c) => a.factor - c.factor || a.code.localeCompare(c.code));
}

/** Con qué unidad arranca una línea nueva: la de COMPRA del artículo si BC la tiene
 *  y es ofrecible; si no, la base. (En BC casi nadie mantiene la unidad de compra
 *  —1 artículo de 5.500—, así que en la práctica arranca en la base y la persona
 *  elige; por eso el selector muestra la equivalencia.) */
export function unidadPorDefecto(unidades: UnidadItem[], base: string, compra?: string, tipo?: Articulo["tipo"]): string {
  const ofrecidas = unidadesOfrecidas(unidades, base, tipo);
  const c = (compra ?? "").trim();
  if (c && ofrecidas.some((u) => u.code.toUpperCase() === c.toUpperCase())) return c;
  const b = (base ?? "").trim();
  if (b && ofrecidas.some((u) => u.code.toUpperCase() === b.toUpperCase())) return b;
  return ofrecidas[0]?.code ?? b;
}

/** Decimales que aguanta la base: dbo.PedidoCompraDet.quantitySolicitado y
 *  dbo.OrdenCompraDet.quantity son decimal(18,4). Redondear a más no sirve de nada,
 *  SQL lo trunca igual. */
export const DEC_CANTIDAD = 4;
export const redondearCantidad = (n: number) => Math.round(n * 10 ** DEC_CANTIDAD) / 10 ** DEC_CANTIDAD;

/** La MISMA cantidad expresada en otra unidad: 255.000 GR son 1 EST.
 *  Devuelve null si falta un factor — nunca se adivina — y ya viene redondeada a lo
 *  que la base puede guardar. */
export function cantidadEntreUnidades(cantidad: number, factorDesde: number, factorHasta: number): number | null {
  const q = Number(cantidad), fd = Number(factorDesde), fh = Number(factorHasta);
  if (!Number.isFinite(q)) return null;
  if (!(fd > 0) || !(fh > 0)) return null;
  return redondearCantidad((q * fd) / fh);
}

/** ¿La conversión SIGUE significando lo mismo con los 4 decimales que guarda la base?
 *  100 GR pasados a estañones dan 0,0004 EST, que al volver son 102 GR: la orden le
 *  pediría al proveedor un 2% más de lo que se pidió, con cara de correcta. Redondear
 *  no es gratis cuando el factor es 255.000, así que se comprueba la ida y vuelta. */
export function conversionFiel(cantidad: number, factorDesde: number, factorHasta: number, toleranciaPct = 0.5): boolean {
  const ida = cantidadEntreUnidades(cantidad, factorDesde, factorHasta);
  if (ida == null) return false;
  if (cantidad > 0 && ida === 0) return false;                 // se perdería la línea
  const vuelta = cantidadEntreUnidades(ida, factorHasta, factorDesde);
  if (vuelta == null) return false;
  if (cantidad === 0) return true;
  return Math.abs(vuelta - cantidad) / Math.abs(cantidad) * 100 <= toleranciaPct;
}

/** El precio va al revés que la cantidad: ¢1,74 el gramo son ¢443.700 el estañón. */
export function precioEntreUnidades(precio: number, factorDesde: number, factorHasta: number): number | null {
  const p = Number(precio), fd = Number(factorDesde), fh = Number(factorHasta);
  if (!Number.isFinite(p) || p < 0) return null;
  if (!(fd > 0) || !(fh > 0)) return null;
  return (p / fd) * fh;
}

/** Pasa un precio de la unidad `desde` a la unidad `hasta` con las unidades del
 *  artículo. Devuelve **null** si no se puede saber el factor: más vale no proponer
 *  precio que proponer uno equivocado — el error del 21/08 fue exactamente un precio
 *  correcto en la unidad equivocada (¢1,74, que era por gramo, en una línea de
 *  estañones). Si las dos unidades son la misma, devuelve el precio tal cual, así el
 *  99% del catálogo (una sola unidad) no cambia en nada. */
export function precioEnUnidad(precio: number, desde: string, hasta: string, unidades: UnidadItem[]): number | null {
  const d = (desde ?? "").trim(), h = (hasta ?? "").trim();
  if (!Number.isFinite(precio) || precio <= 0) return null;
  if (!d || !h) return null;
  if (d.toUpperCase() === h.toUpperCase()) return precio;
  const fd = unidades.find((u) => u.code.toUpperCase() === d.toUpperCase())?.factor;
  const fh = unidades.find((u) => u.code.toUpperCase() === h.toUpperCase())?.factor;
  if (!(fd && fd > 0) || !(fh && fh > 0)) return null;
  return precioEntreUnidades(precio, fd, fh);
}

/** "1 EST = 255 000 GR" — nadie sabe cuánto trae un estañón hasta que se lo dicen. */
export function equivalenciaUnidad(u: UnidadItem | undefined, base: string): string {
  if (!u || !(u.factor > 0) || u.factor === 1) return "";
  const b = (base ?? "").trim();
  if (!b || u.code.toUpperCase() === b.toUpperCase()) return "";
  return `1 ${u.code} = ${num.format(u.factor)} ${b}`;
}

// Etiqueta del TIPO de artículo de BC para los buscadores. Los buscadores ofrecen el
// catálogo COMPLETO (inventario, servicio y no inventariable): el inventario es el
// caso normal y no lleva etiqueta; los otros dos sí, porque en BC no llevan almacén.
export function etiquetaTipoArticulo(tipo?: Articulo["tipo"]): string {
  return tipo === "servicio" ? "Servicio" : tipo === "no-inventario" ? "No inventariable" : "";
}

/** Etiqueta de un artículo en los buscadores: "S20-0006 — SERVICIO DE TRANSPORTE · Servicio". */
export function etiquetaArticulo(a: { code: string; descripcion: string; tipo?: Articulo["tipo"] }): string {
  const t = etiquetaTipoArticulo(a.tipo);
  return `${a.code} — ${a.descripcion}${t ? ` · ${t}` : ""}`;
}

// ─── Quién ve QUÉ dentro de Órdenes de Compra ────────────────────────────────
// El scope de las listas es por USUARIO, no por rol: cada uno ve sus solicitudes y
// —si solo recibe lo suyo— las órdenes que salieron de ellas. Ojo: esto es cosmética
// de cliente; el bootstrap sigue trayendo todo (el blindaje por API está pendiente).
type Sesion = { username?: string; nombre?: string; modules?: string[]; roleNames?: string[]; nivelAdmin?: number } | null;

/** Super Admin ve TODO, no solo lo suyo. Se decide por el módulo 'admin' (que solo
 *  sale del rol comodín); quien no tiene rol de Producción conserva el criterio
 *  viejo por nivel, para no quitarle de golpe lo que ya veía. */
export function veTodoEnCompras(me: Sesion): boolean {
  if (!me) return false;
  return me.modules?.length ? me.modules.includes('admin') : (me.nivelAdmin ?? 0) >= 4;
}

/** ¿Ve SOLO su material en la recepción? Fábrica de Maderas es un satélite: pide su
 *  material y recibe únicamente las órdenes que salieron de sus propias solicitudes.
 *  Bodega (la bodega central), Ingeniería y Super Admin reciben TODO — si no, el
 *  material de los ingenieros no lo podría recibir nadie. */
export function soloRecibeLoSuyo(me: Sesion): boolean {
  const m = me?.modules ?? [];
  if (m.includes('ingenieria') || m.includes('admin')) return false;
  return recibeSoloLoSuyo(me?.roleNames);
}

/** ¿Este pedido lo creó el usuario de la sesión? `creadoPorId` es el id estable
 *  (username); `solicitante` calza por nombre para los pedidos históricos. */
export function pedidoEsDelUsuario(p: Pick<Pedido, "creadoPorId" | "solicitante">, me: Sesion): boolean {
  if (!me) return false;
  return (!!me.username && p.creadoPorId === me.username) || (!!me.nombre && p.solicitante === me.nombre);
}

/** Órdenes que salieron de los pedidos de este usuario. El enlace pedido↔orden vive
 *  a nivel de LÍNEA (`pedidoLineaId`): `pedidoNumero` solo existe en el catálogo de
 *  prueba — en SQL viene vacío (ver repo.ts), así que no se puede depender de él. */
export function ordenesDeMisPedidos(ordenes: Orden[], pedidos: Pedido[], me: Sesion): Orden[] {
  const lineasMias = new Set<string>();
  const numerosMios = new Set<string>();
  for (const p of pedidos) {
    if (!pedidoEsDelUsuario(p, me)) continue;
    numerosMios.add(p.numero);
    for (const l of p.lineas) lineasMias.add(l.id);
  }
  if (!lineasMias.size && !numerosMios.size) return [];
  return ordenes.filter((o) => o.lineas.some((l) =>
    (l.pedidoLineaId && lineasMias.has(l.pedidoLineaId)) || (l.pedidoNumero && numerosMios.has(l.pedidoNumero)),
  ));
}

/**
 * Enter/↓ salta a la SIGUIENTE cantidad, Shift+Enter/↑ a la anterior — pedido de los
 * usuarios: "cuando estoy usando una plantilla que pueda bajar a la siguiente línea
 * con un enter, es más rápido cuando pongo cantidades" (24/08/2026).
 * Los campos se ubican por `data-cant` en el orden en que están en la pantalla, así
 * funciona igual con las líneas repartidas en varias tarjetas de obra.
 * Al llegar al final, Enter cierra el teclado en vez de dar la vuelta (evita pisar
 * la primera cantidad sin querer).
 */
export function saltarCantidad(e: React.KeyboardEvent<HTMLInputElement>) {
  const baja = e.key === "Enter" || e.key === "ArrowDown";
  const sube = e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey);
  if (!baja && !sube) return;
  e.preventDefault();
  const campos = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-cant]"));
  const i = campos.indexOf(e.currentTarget);
  if (i === -1) return;
  const destino = campos[i + (sube ? -1 : 1)];
  if (!destino) { e.currentTarget.blur(); return; }
  destino.focus();
  destino.select();
}

export function tipoSolicitudBadge(t: TipoSolicitud): { label: string; tone: string } {
  return t === "repuesto" ? { label: "Repuesto", tone: "yellow" }
    : t === "stock" ? { label: "Stock", tone: "gray" }
    : t === "subcontrato" ? { label: "Subcontrato", tone: "ink" }
    : { label: "Material", tone: "green" };
}

// ─── Subcontratos ───────────────────────────────────────────────────────────────
// Un subcontrato NO pasa por Proveeduría: el ingeniero arma la solicitud Y su orden
// de compra (proveedor, líneas con monto global, proyecto + tarea) de una sola vez, y
// esa orden nace "pendiente de aprobación". Al aprobarla se crea el pedido de compra
// en BC como cualquier otra, y bodega recibe la factura al terminar el servicio.
// Cada línea va a BC como CANTIDAD 1 × el monto: el servicio se factura completo, no
// por avances, así que no hay que recibir fracciones.
export function esSubcontrato(p: Pick<Pedido, "tipoSolicitud">): boolean {
  return p.tipoSolicitud === "subcontrato";
}

/** Monto de una línea de subcontrato: vive en la ORDEN (precioUnitario), no en la
 *  línea de pedido — la tabla del pedido no tiene precio, y el subcontrato siempre
 *  nace con su orden. Devuelve 0 si todavía no hay orden ligada. */
export function montoDeLineaSubcontrato(ordenes: Orden[], pedidoLineaId: string): number {
  for (const o of ordenes) {
    for (const l of o.lineas) {
      if (l.pedidoLineaId === pedidoLineaId) return (l.precioUnitario || 0) * (l.cantidad || 1);
    }
  }
  return 0;
}

// Consumo inmediato: el pedido de obra cuyo material se consume de una vez contra
// el proyecto + la tarea, en vez de entrar al inventario del Almacén General. NO es
// un tipo de solicitud aparte: es un tag del pedido, y vive en la TAREA de sus líneas.
export function esConsumoInmediato(p: Pedido): boolean {
  return p.tipoSolicitud === "material" && p.lineas.some((l) => !!l.taskNo);
}

export function destinoLabel(p: Pedido): string {
  return p.tipoSolicitud === "repuesto"
    ? `${p.maquinaNombre ?? p.maquinaNo ?? "Máquina"}`
    : `${p.obraNombre ?? p.obraCodigo ?? "Obra"}`;
}

// Código del destino (obra o máquina) — para mostrar el CÓDIGO de obra (VN-K.21),
// no la descripción del proyecto.
export function destinoCodigo(p: Pedido): string {
  return (p.tipoSolicitud === "repuesto" ? p.maquinaNo : p.obraCodigo) ?? "—";
}

// Nombres de obra "vacíos" que no le dicen nada a Proveeduría (vienen así de BC).
function esNombreObraVacio(s?: string): boolean {
  const t = (s ?? "").trim().toLowerCase();
  return !t || t === "por definir" || t === "sin definir" || t === "n/d";
}

// Texto ÚTIL para que Proveeduría identifique una solicitud. El modelo/nombre de
// obra suele venir "POR DEFINIR" y el código de máquina (MAQ-0012) no dice nada,
// así que se prioriza el COMENTARIO del solicitante y, en repuestos, el NOMBRE de
// la máquina. `principal` es el texto fuerte; `secundaria` el dato de apoyo.
export function solicitudResumen(p: Pedido): { principal: string; secundaria?: string } {
  const comentario = p.notas?.trim() || undefined;
  if (p.tipoSolicitud === "repuesto") {
    const maquina = p.maquinaNombre?.trim() || undefined;
    if (maquina) return { principal: maquina, secundaria: comentario };
    if (comentario) return { principal: comentario };
    return { principal: p.maquinaNo || "Repuesto" };
  }
  const obra = (!esNombreObraVacio(p.obraNombre) ? p.obraNombre?.trim() : undefined) || p.obraCodigo || undefined;
  if (comentario) return { principal: comentario, secundaria: obra };
  return { principal: obra || "Material" };
}

export const CRC = new Intl.NumberFormat("es-CR", {
  style: "currency",
  currency: "CRC",
  minimumFractionDigits: 2,
});

export const num = new Intl.NumberFormat("es-CR", { maximumFractionDigits: 2 });

export function money(amount: number, currencyCode?: string): string {
  const cur = (currencyCode ?? "").trim() || "CRC";
  // Intl exige un código ISO de TRES LETRAS: con cualquier otra cosa lanza RangeError y
  // se cae el render de toda la pantalla. Y en BC hay monedas cargadas como "EURO" y
  // "COLONES" — el total que devuelve /api/compras/bc/orden-totales sale de ahí sin
  // validar, y esa llamada solo existe en el DETALLE de la orden. Con un código así se
  // formatea el número y se pone el código al lado, que es honesto y no revienta.
  if (!/^[A-Za-z]{3}$/.test(cur)) return `${num.format(amount || 0)} ${cur}`;
  return new Intl.NumberFormat("es-CR", { style: "currency", currency: cur, minimumFractionDigits: 2 }).format(amount || 0);
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  // Fechas "solo día" (YYYY-MM-DD) se formatean directo, SIN convertir zona horaria:
  // new Date("2026-07-21") se parsea como UTC medianoche y en CR (UTC−6) mostraba el
  // día anterior (20/07). Acá tomamos los dígitos tal cual → dd/mm/aaaa.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(iso);
  return isNaN(+d) ? "—" : d.toLocaleDateString("es-CR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Fecha de HOY en local (no UTC): new Date().toISOString() daba la fecha UTC, que en
// la tarde de CR ya es el día siguiente. Construimos la fecha local para que el
// default coincida con el día real.
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-CR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Fecha compacta "8 Agosto" (día + mes) para la lista de solicitudes. El detalle
// completo (dd/mm/aaaa) queda en el tooltip. Igual que formatDate, toma los dígitos
// del ISO "solo día" sin convertir zona horaria (evita el corrimiento en CR).
export function formatDiaMes(iso: string): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  if (isNaN(+d)) return "—";
  const mes = d.toLocaleDateString("es-CR", { month: "long" });
  return `${d.getDate()} ${mes.charAt(0).toUpperCase()}${mes.slice(1)}`;
}

// Número de solicitud "corto" para la UI: solo los últimos 4 dígitos (PED-000025 →
// "0025"). En SQL se guarda el número completo; esto es puramente visual. El
// número completo va en el tooltip.
export function pedidoNumeroCorto(numero: string): string {
  const dig = (numero || "").replace(/\D/g, "");
  return dig ? dig.slice(-4).padStart(4, "0") : (numero || "—");
}

// Iniciales de una persona para el avatar (una o dos letras). "Laura Jiménez" → "LJ".
export function iniciales(nombre: string): string {
  const parts = (nombre || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const PERSONA_POR_ROL: Record<string, string> = {
  ingenieria: "Laura Jiménez",
  proveeduria: "Angie",
  aprobacion: "Luis Roberto",
  facturacion: "Kattya",
};

export const ROL_LABEL: Record<string, string> = {
  ingenieria: "Ingeniería",
  proveeduria: "Proveeduría",
  aprobacion: "Aprobación",
  facturacion: "Bodega",
};

// ---- líneas de pedido ----
export function pedidoLineaPendiente(l: PedidoLinea): number {
  return Math.max(0, l.cantidad - l.cantidadOrdenada);
}

// % de la solicitud que Proveeduría ya convirtió en órdenes de compra
// (cantidadOrdenada / cantidad). Es el avance de COMPRA, distinto del de entrega.
export function pedidoOrdenadoPct(p: Pedido): number {
  const total = p.lineas.reduce((s, l) => s + l.cantidad, 0);
  if (total === 0) return 0;
  const ord = p.lineas.reduce((s, l) => s + Math.min(l.cantidadOrdenada, l.cantidad), 0);
  return Math.round(Math.min(100, (ord / total) * 100));
}

// Cuánto de una línea de pedido ya LLEGÓ (recibido en bodega), rastreando las
// órdenes en las que entró esa línea (enlace N:M por OrdenLinea.pedidoLineaId).
export function recibidoDeLineaPedido(ordenes: Orden[], pedidoLineaId: string): number {
  let total = 0;
  for (const o of ordenes) {
    for (const l of o.lineas) {
      if (l.pedidoLineaId === pedidoLineaId) total += l.cantidadRecibida;
    }
  }
  return total;
}

// ---- líneas de orden ----
export function ordenLineaPendiente(l: OrdenLinea): number {
  return Math.max(0, l.cantidad - l.cantidadRecibida);
}

export function ordenLineaCompleta(l: OrdenLinea): boolean {
  // Los cargos (flete) no se reciben: cuentan como completos para no bloquear el cierre.
  if (l.tipo === "cargo") return true;
  return l.cantidadRecibida >= l.cantidad - 1e-9;
}

// Último precio usado para un artículo con un proveedor (para detectar aumentos)
// Devuelve el precio CON SU UNIDAD Y SU MONEDA: un precio suelto no se puede comparar
// ni copiar a otra línea. ¢0,77 el gramo no es ¢0,77 el estañón (255.000x), y $969,91
// no es ¢969,91 (~500x). Los dos errores son de órdenes de magnitud.
export function ultimoPrecioProveedor(ordenes: Orden[], articuloId: string, proveedorId: string): { precio: number; unidad: string; moneda: string } | null {
  const cand = ordenes
    .filter((o) => o.proveedorId === proveedorId)
    .flatMap((o) => o.lineas.filter((l) => l.articuloId === articuloId).map((l) => ({ fecha: o.fecha, precio: l.precioUnitario, unidad: l.unidad ?? "", moneda: o.currencyCode ?? "" })))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  return cand.length ? { precio: cand[0].precio, unidad: cand[0].unidad, moneda: cand[0].moneda } : null;
}

/** ¿Son la misma moneda? En la app "" y "CRC" son las dos el colón. */
export function mismaMoneda(a?: string, b?: string): boolean {
  const n = (m?: string) => ((m ?? "").trim().toUpperCase() || "CRC");
  return n(a) === n(b);
}

export function ordenLineaImporte(l: OrdenLinea): number {
  return l.cantidad * l.precioUnitario * (1 - (l.descuentoPct ?? 0) / 100);
}

export function ordenSubtotal(o: Orden): number {
  return o.lineas.reduce((s, l) => s + ordenLineaImporte(l), 0);
}

// Total de la orden CON IVA — el mismo número que ve Proveeduría en el detalle:
// importe neto de cada línea + 13% (o el % de la línea) SOLO sobre los artículos;
// los cargos (flete) van sin IVA. Fuente única para que Aprobación y el detalle
// muestren SIEMPRE el mismo total (antes Aprobación sumaba sin IVA y no cuadraba).
export function ordenTotalConIva(o: Orden): number {
  return o.lineas.reduce(
    (s, l) => s + ordenLineaImporte(l) * (l.tipo === "articulo" ? 1 + (l.ivaPct ?? 0) / 100 : 1),
    0,
  );
}

export function ordenRecibidoPct(o: Orden): number {
  // Solo cuentan los artículos: los cargos (flete) no se reciben.
  const arts = o.lineas.filter((l) => l.tipo === "articulo");
  const total = arts.reduce((s, l) => s + l.cantidad, 0);
  if (total === 0) return 0;
  const rec = arts.reduce((s, l) => s + l.cantidadRecibida, 0);
  return Math.round((rec / total) * 100);
}

export function ordenEstaCompleta(o: Orden): boolean {
  return o.lineas.length > 0 && o.lineas.every(ordenLineaCompleta);
}

export function ordenEsParcial(o: Orden): boolean {
  const algo = o.lineas.some((l) => l.cantidadRecibida > 0);
  return algo && !ordenEstaCompleta(o);
}

// Números de solicitud (PED-…) reales que originaron la orden. Las líneas
// agregadas a mano llevan pedidoNumero "Manual" y no cuentan como solicitud.
export function ordenPedidos(o: Orden): string[] {
  return [...new Set(o.lineas.filter((l) => l.pedidoNumero && l.pedidoNumero !== "Manual").map((l) => l.pedidoNumero!))];
}

// Máquinas destino de una orden de repuestos. La orden no guarda la máquina; se deriva
// de los pedidos origen (un pedido de repuesto sí lleva maquinaNombre).
export function ordenMaquinas(o: Orden, pedidos: Pedido[]): string[] {
  const nums = new Set(o.lineas.map((l) => l.pedidoNumero).filter(Boolean));
  const out = new Set<string>();
  for (const p of pedidos) if (nums.has(p.numero) && p.maquinaNombre) out.add(p.maquinaNombre);
  return [...out];
}

// Devoluciones pendientes para un rol (misma lógica que DevolucionesView): solicitudes
// devueltas (pedido "devuelto") + órdenes rechazadas por Aprobación ("rechazado").
export function devolucionesCount(role: Role, pedidos: Pedido[], ordenes: Orden[]): number {
  const solic = (role === "ingenieria" || role === "proveeduria") ? pedidos.filter((p) => p.estado === "devuelto").length : 0;
  const ords = (role === "proveeduria" || role === "aprobacion" || role === "facturacion") ? ordenes.filter((o) => o.estado === "rechazado").length : 0;
  return solic + ords;
}

// Orden "directa" = compra armada sin partir de una solicitud (ninguna línea
// proviene de un pedido real). Las órdenes que nacen de solicitudes tienen al
// menos una línea con su PED-… de origen.
export function ordenEsDirecta(o: Orden): boolean {
  return ordenPedidos(o).length === 0;
}

// ---- badges ----
export function pedidoBadge(estado: Pedido["estado"]): { label: string; tone: string } {
  switch (estado) {
    case "borrador": return { label: "Borrador", tone: "gray" };
    case "aprobado": return { label: "En proveeduría", tone: "green" };
    case "en_orden": return { label: "En orden", tone: "yellow" };
    case "cerrado": return { label: "Cerrado", tone: "gray" };
    case "devuelto": return { label: "Devuelto", tone: "red" };
  }
}

// Estado de COMPRA de una solicitud, tal como lo ve Proveeduría (derivado del
// avance de órdenes, no del ciclo de vida borrador/aprobado del pedido).
export function pedidoCompraBadge(p: Pedido): { label: string; tone: string } {
  const pct = pedidoOrdenadoPct(p);
  if (pct >= 100) return { label: "100% comprado", tone: "green" };
  if (pct > 0) return { label: "Parcialmente comprado", tone: "yellow" };
  return { label: "Pendiente de comprar", tone: "gray" };
}

// ---- progreso de una solicitud (pipeline de 5 pasos) ----
// Pedido → Proveeduría → Orden → Aprobado → Facturado. Mapea el ciclo de vida
// real (estado del pedido + estado de las órdenes ligadas + recepción) a un paso
// 1..5 para el mini-stepper de "Mis solicitudes".
export interface PedidoProgresoPaso { label: string; tip: string; done: boolean; current: boolean; }
export interface PedidoProgreso {
  nivel: number;        // paso alcanzado (1..5)
  total: number;        // 5
  devuelto: boolean;    // volvió a Ingeniería (estado devuelto)
  completado: boolean;  // terminó TODO el flujo (los 5 pasos con ✓)
  motivo?: string;      // motivo de la devolución (si devuelto)
  actualLabel: string;  // nombre del paso actual
  pasos: PedidoProgresoPaso[];
}

// Extrae el motivo de una devolución del comentario del pedido. Al devolver, el
// store guarda notas como "↩ Devuelto: <motivo> · <resto>".
export function motivoDevolucion(p: Pedido): string | undefined {
  const m = /devuelto:\s*([^·]+)/i.exec(p.notas ?? "");
  return m ? m[1].trim() : undefined;
}

// Quién devolvió la solicitud (y de qué área), leído de la bitácora: el último
// movimiento "devuelto" del pedido guarda usuario + rol. Sirve para el detalle
// "Devuelta por … · Proveeduría" en el stepper.
export interface DevolucionInfo { por?: string; rolLabel?: string; fecha?: string; }
export function devolucionInfo(p: Pedido, movimientos: Movimiento[]): DevolucionInfo | undefined {
  if (p.estado !== "devuelto") return undefined;
  const m = movimientos
    .filter((x) => x.entidad === "pedido" && x.idEntidad === p.id && x.tipoMovimiento === "devuelto")
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))[0];
  if (!m) return undefined;
  return { por: m.usuario, rolLabel: m.rol ? ROL_LABEL[m.rol] : undefined, fecha: m.fecha };
}

const PASOS_SOLICITUD: { label: string; tip: string }[] = [
  { label: "Pedido", tip: "Solicitud creada" },
  { label: "Proveeduría", tip: "En Proveeduría" },
  { label: "Orden", tip: "En orden de compra" },
  { label: "Aprobado", tip: "Orden aprobada y lanzada" },
  { label: "Facturado", tip: "Recibido y facturado" },
];

// Órdenes que incluyen al menos una línea de este pedido (enlace N:M por
// OrdenLinea.pedidoLineaId).
export function ordenesDePedido(ordenes: Orden[], p: Pedido): Orden[] {
  const ids = new Set(p.lineas.map((l) => l.id));
  return ordenes.filter((o) => o.lineas.some((l) => l.pedidoLineaId && ids.has(l.pedidoLineaId)));
}

export function pedidoProgreso(p: Pedido, ordenes: Orden[]): PedidoProgreso {
  const ligadas = ordenesDePedido(ordenes, p);
  const totalCant = p.lineas.reduce((s, l) => s + l.cantidad, 0);
  const recibida = p.lineas.reduce((s, l) => s + recibidoDeLineaPedido(ordenes, l.id), 0);
  const recibidoTotal = totalCant > 0 && recibida >= totalCant - 1e-9;
  const parcialRecibido = recibida > 1e-9 && !recibidoTotal;

  const enProveeduria = p.estado !== "borrador";               // ya fue enviada
  const hayOrden = ligadas.length > 0 || pedidoOrdenadoPct(p) > 0;
  const ordenAprobada = ligadas.some((o) => o.estado === "lanzado" || o.estado === "completado");
  // COMPLETADA = todo el flujo terminó (recibida y facturada / cerrada). Solo así
  // el paso 5 lleva ✓; mientras se recibe, el paso 5 queda "en curso".
  const completado = p.estado === "cerrado" || (hayOrden && recibidoTotal);

  let nivel = 1;
  if (enProveeduria) nivel = 2;
  if (hayOrden) nivel = 3;
  if (ordenAprobada) nivel = 4;
  if (ordenAprobada && parcialRecibido) nivel = 5; // recibiendo → Facturado en curso
  if (completado) nivel = 5;

  const pasos = PASOS_SOLICITUD.map((s, i) => ({
    label: s.label, tip: s.tip,
    done: completado ? true : i + 1 < nivel,
    current: completado ? false : i + 1 === nivel,
  }));
  const devuelto = p.estado === "devuelto";
  return {
    nivel, total: PASOS_SOLICITUD.length, devuelto, completado,
    motivo: devuelto ? motivoDevolucion(p) : undefined,
    actualLabel: completado ? "Completada" : PASOS_SOLICITUD[nivel - 1].label,
    pasos,
  };
}

export function ordenBadge(estado: Orden["estado"]): { label: string; tone: string } {
  switch (estado) {
    case "abierto": return { label: "Abierto", tone: "gray" };
    case "pendiente_aprobacion": return { label: "Pendiente de aprobación", tone: "yellow" };
    case "rechazado": return { label: "Rechazada", tone: "red" };
    case "lanzado": return { label: "Lanzado", tone: "green" };
    case "completado": return { label: "Completado", tone: "green" };
  }
  // Sin este default, un estado fuera del union devuelve undefined y el `.tone` de quien
  // llama tira TypeError: pantalla en blanco por un dato inesperado. La tabla de estados
  // de SQL tiene códigos que no están en OrdenEstado ('devuelto', 'cerrado'…), así que
  // es alcanzable. Mejor mostrar el código crudo que reventar.
  return { label: String(estado ?? "—"), tone: "gray" };
}

// Distribución proporcional de un cargo (flete) por importe de las líneas de artículo
export function distribuirCargo(monto: number, lineas: OrdenLinea[]): Record<string, number> {
  const articulos = lineas.filter((l) => l.tipo === "articulo");
  const base = articulos.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0);
  const res: Record<string, number> = {};
  if (base === 0) return res;
  articulos.forEach((l) => {
    res[l.id] = (monto * (l.cantidad * l.precioUnitario)) / base;
  });
  return res;
}

export function nextNumero(prefix: string, existentes: string[]): string {
  const nums = existentes
    .map((n) => parseInt(n.replace(/[^0-9]/g, ""), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `${prefix}-${String(max + 1).padStart(6, "0")}`;
}

// Solo almacenes físicos (códigos ALM-*). Oculta bodegas de obra (VN-M.28, etc.),
// que no son ubicaciones físicas de recepción y no deben ofrecerse al armar órdenes.
export function almacenesFisicos<T extends { codigo: string }>(list: T[]): T[] {
  return list.filter((a) => a.codigo.toUpperCase().startsWith("ALM-"));
}
