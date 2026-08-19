import type { Movimiento, Orden, OrdenLinea, Pedido, PedidoLinea, Role, TipoSolicitud } from "./types";

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

export function tipoSolicitudBadge(t: TipoSolicitud): { label: string; tone: string } {
  return t === "repuesto" ? { label: "Repuesto", tone: "yellow" }
    : t === "stock" ? { label: "Stock", tone: "gray" }
    : { label: "Material", tone: "green" };
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
  const cur = currencyCode && currencyCode.trim() ? currencyCode : "CRC";
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
export function ultimoPrecioProveedor(ordenes: Orden[], articuloId: string, proveedorId: string): number | null {
  const cand = ordenes
    .filter((o) => o.proveedorId === proveedorId)
    .flatMap((o) => o.lineas.filter((l) => l.articuloId === articuloId).map((l) => ({ fecha: o.fecha, precio: l.precioUnitario })))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  return cand.length ? cand[0].precio : null;
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
