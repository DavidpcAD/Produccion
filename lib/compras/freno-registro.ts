// ════════════════════════════════════════════════════════════════════════════════
// FRENOS DE REGISTRO — lo que se revisa contra Business Central ANTES de postear una
// recepción o una factura. Si algo no cuadra, no se postea nada.
//
// Son los mismos tres frenos que la app de Proveeduría aplica en sus tres caminos
// (recibir, registrar factura, facturar lo recibido). Esta app no tenía ninguno: la
// ruta de registrar llamaba al codeunit directo. Y el codeunit NO recibe precios —
// solo N.º de artículo y cantidad—, así que BC factura con lo que tenga la línea del
// pedido en ese momento. Cuando a las líneas de un pedido se les cambió el almacén en
// BC, BC les recalculó el costo unitario al último costo directo; la recepción de la
// fábrica registró después por acá y las facturas quedaron por montos que no eran
// los de la factura del proveedor (que sí coincidía con la orden). Con estos frenos,
// ese registro se habría parado en pantalla.
//
// El orden importa, de lo más caro de deshacer a lo más barato:
//
//   1. ENCABEZADO — que el pedido de BC siga siendo del proveedor de la orden y que
//      esté LANZADO. Una factura cargada a otro proveedor solo se deshace con nota
//      de crédito; y contra un pedido sin lanzar BC no deja registrar.
//   2. LÍNEAS — que cada línea que se registra exista en el pedido de BC (con su tipo
//      y su variante) y tenga saldo. El codeunit se salta en silencio la línea que no
//      calza y devuelve el N.º del documento igual: sin esto, la app da por recibido
//      lo que BC nunca registró.
//   3. PRECIO — que el precio, el IVA y la unidad de BC sean los de la orden, para lo
//      que entra AHORA. Va también en la recepción sin factura: después de la primera
//      recepción el pedido ya no se puede reescribir desde la app, y el arreglo pasa a
//      ser a mano en BC.
//
// Tres reglas que hacen que un freno sirva y no termine apagado:
//   · "No lo sé" nunca frena. Si BC no contesta, o un dato no vino, se deja pasar: el
//     posteo va a fallar por su propio camino si el problema es de verdad.
//   · Lo que se compara sale del SERVIDOR (la orden se lee de la base por `ordenId`),
//     nunca de lo que mande el navegador.
//   · Cada freno tiene su interruptor en Azure (ver lib/compras/frenar-registro.ts),
//     porque un falso positivo deja a Bodega sin poder recibir un camión.
//
// Acá vive SOLO lo puro (sin red ni base) para poder probarlo con node:test: ver
// freno-registro.test.ts. Las lecturas a BC están en lib/compras/bc.ts y el orden de
// los tres frenos en lib/compras/frenar-registro.ts.
// ════════════════════════════════════════════════════════════════════════════════
import type { EstadoPedidoBc } from "./bc";
import type { OrdenLinea } from "./types";

// ─── TIPOS ───────────────────────────────────────────────────────────────────────

/** Los tipos de línea que se registran por cantidad. */
export type TipoPosteable = "articulo" | "recurso" | "activo_fijo";

/** Una línea del pedido de compra tal como la tiene BC. */
export type LineaBc = {
  documentNo: string;
  lineNo: number;
  tipo: TipoPosteable | "cargo" | "otro";
  itemNo: string;
  variantCode: string;
  descripcion: string;
  unidad: string;
  almacen: string;
  cantidad: number;
  recibida: number;
  facturada: number;
  pendiente: number;      // Outstanding Quantity: lo que todavía se puede recibir
  precioUnitario: number; // Direct Unit Cost: con esto factura BC
  // El IVA% que BC le calcula HOY a la línea. `undefined` cuando el camino de lectura
  // no lo trae: "no lo sé" nunca es una acusación, y sin el dato no se compara.
  ivaPct?: number;
};

/** Las líneas del pedido en BC y por qué camino se leyeron. La API estándar no trae
 *  la variante, así que con `fuente: "estandar"` la variante no se puede exigir. */
export type BcLineasPedido = { lineas: LineaBc[]; fuente: "custom" | "estandar" };

/** Una línea de la orden, en la forma en que se compara contra BC. */
export type LineaApp = {
  tipo: TipoPosteable | "cargo";
  itemNo: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  unidad?: string;   // unidad de COMPRA: en ella están cantidad y precio
  ivaPct?: number;   // el IVA% que la orden le puso a la línea
};

/** Lo que se le pide a BC que registre (lo mismo que recibe el codeunit). */
export type LineaPedida = { itemNo: string; qty: number; variantCode?: string; tipo?: string };

/** Qué camino está posteando: cambia cómo empieza el "no". */
export type AccionRegistro = "recibir" | "facturar" | "registrar";

/** Contra qué saldo se valida: lo pendiente de recibir, o lo recibido sin facturar. */
export type ModoRegistro = "recibir" | "facturar-recibido";

// ─── PIEZAS CHICAS ───────────────────────────────────────────────────────────────

// El código de artículo pelado: lo guardado puede traer la variante pegada
// ("M00-0000 NEGRO") y BC no conoce ese código. Es el mismo corte que `codigoDeItem`
// de helpers.ts; no se importa de ahí porque helpers arrastra módulos que el test
// (node:test, sin bundler) no puede resolver.
const codigo = (itemNo: unknown) => (String(itemNo ?? "").trim().split(/\s+/)[0] ?? "").toUpperCase();

/** El tipo con el que se registra una línea. Sin tipo (los llamados de siempre) es
 *  artículo: así era todo antes de que la orden pudiera llevar un activo fijo. */
export function tipoPosteable(t: unknown): TipoPosteable {
  const v = String(t ?? "").trim().toLowerCase();
  return v === "recurso" || v === "activo_fijo" ? v : "articulo";
}

const NOMBRE_TIPO: Record<TipoPosteable, string> = {
  articulo: "artículo", recurso: "recurso", activo_fijo: "activo fijo",
};

/** El tipo de una línea de la ORDEN. En esta app el activo fijo no es un tipo de
 *  línea propio: es un artículo con `esActivo` (se hereda del pedido origen). */
export function tipoDeLineaOrden(l: Pick<OrdenLinea, "tipo" | "esActivo">): TipoPosteable | "cargo" {
  if (l.tipo === "cargo") return "cargo";
  return l.esActivo ? "activo_fijo" : "articulo";
}

/** El tipo de una línea de BC. Llega de tres fuentes que no prometen el mismo texto:
 *  la API estándar manda "Item", la custom el enum formateado y el codeunit el caption
 *  en el IDIOMA de la sesión ("Producto"). Por eso se acepta también el ordinal del
 *  enum 39 "Purchase Line Type" (2 Item · 3 Resource · 4 Fixed Asset · 5 Charge),
 *  que es lo único estable. */
export function tipoLineaBc(t: unknown, typeNo?: unknown): LineaBc["tipo"] {
  const n = Number(typeNo);
  if (typeNo !== undefined && typeNo !== null && typeNo !== "" && Number.isFinite(n) && n > 0) {
    if (n === 2) return "articulo";
    if (n === 3) return "recurso";
    if (n === 4) return "activo_fijo";
    if (n === 5) return "cargo";
    return "otro";
  }
  // OData ESCAPA lo que no es alfanumérico dentro de un enum: "Fixed Asset" llega
  // "Fixed_x0020_Asset". Sin desescapar, el activo fijo caía en "otro" y su línea
  // desaparecía del cotejo.
  const s = String(t ?? "")
    .replace(/_x([0-9a-fA-F]{4})_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .trim().toLowerCase().replace(/[\s_.\-()]/g, "");
  if (s === "item" || s === "articulo" || s === "artículo" || s === "producto" || s === "2") return "articulo";
  if (s === "resource" || s === "recurso" || s === "3") return "recurso";
  if (s === "fixedasset" || s === "activofijo" || s === "activosfijos" || s === "4") return "activo_fijo";
  if (s.startsWith("charge") || s.startsWith("cargo") || s === "5") return "cargo";
  return "otro";
}

/** El IVA% de una línea de BC, cuando el camino de lectura lo trae. Devuelve
 *  `undefined` —no 0— si no vino: 0 es "exento" y eso sí es una afirmación. */
export function ivaBcDeLinea(...candidatos: unknown[]): number | undefined {
  for (const c of candidatos) {
    if (c === undefined || c === null || c === "") continue;
    const n = Number(c);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return undefined;
}

/** Las líneas de la orden, listas para compararlas contra BC. */
export function lineasOrdenParaCotejo(lineas: OrdenLinea[] | undefined): LineaApp[] {
  return (lineas ?? []).map((l) => ({
    tipo: tipoDeLineaOrden(l),
    itemNo: String((l.tipo === "cargo" ? l.chargeNo : l.articuloId) ?? ""),
    descripcion: String(l.descripcion ?? ""),
    cantidad: Number(l.cantidad) || 0,
    // El precio tal cual: es el que la app le manda a BC al crear el pedido (el
    // descuento de línea no viaja), así que es contra el que hay que comparar.
    precioUnitario: Number(l.precioUnitario) || 0,
    // Sin la unidad no se detecta el caso más caro: la misma cantidad en otra unidad.
    unidad: String(l.unidad ?? ""),
    ivaPct: Number.isFinite(Number(l.ivaPct)) ? Number(l.ivaPct) : undefined,
  }));
}

// Cómo empieza el "no" de cada camino. Los tres frenos cortan lo mismo y tienen que
// sonar igual.
export const COMO_EMPIEZA: Record<AccionRegistro, string> = {
  recibir: "NO se recibió",
  facturar: "NO se facturó",
  registrar: "NO se registró",
};

// ─── 1. ENCABEZADO: PROVEEDOR + LANZAMIENTO ─────────────────────────────────────

export type ProblemaEncabezado = "proveedor" | "no-lanzado";
export type FrenoEncabezado = {
  ok: boolean;
  verificado: boolean;   // false = no se pudo leer BC: no afirma nada
  problema?: ProblemaEncabezado;
  mensaje?: string;
  bcVendorNo?: string;
  bcEstado?: EstadoPedidoBc;
};

/** El encabezado del pedido en BC tal como se leyó. `null` = no se pudo leer. */
export type EncabezadoLeido = { estado: EstadoPedidoBc; vendorNo?: string } | null;

/** ¿Se puede postear contra este pedido, según su encabezado en BC? */
export function cotejoEncabezado(orderNo: string, bc: EncabezadoLeido, proveedorEsperado: string): FrenoEncabezado {
  const no = (orderNo ?? "").trim();
  const esperado = (proveedorEsperado ?? "").trim();
  if (!no || !bc) return { ok: true, verificado: false };
  const bcEstado = bc.estado;
  const enBc = (bc.vendorNo ?? "").trim();

  // PROVEEDOR. Sin proveedor esperado (la orden no se pudo leer) o sin el de BC no hay
  // nada que comparar: eso no es un desajuste.
  if (esperado && enBc && enBc.toUpperCase() !== esperado.toUpperCase()) {
    return {
      ok: false, verificado: true, problema: "proveedor", bcVendorNo: enBc, bcEstado,
      mensaje: `el pedido ${no} en Business Central es del proveedor ${enBc}, pero esta orden es de ${esperado}. `
        + `O le cambiaron el proveedor al pedido en BC, o la orden quedó apuntando al pedido equivocado. `
        + `Registrarlo así le carga esta compra a la cuenta de otro proveedor`,
    };
  }

  // LANZAMIENTO. Solo frena lo que BC afirmó: "desconocido" es no haber podido leer.
  if (bcEstado === "abierto" || bcEstado === "pendiente_aprobacion") {
    const comoEsta = bcEstado === "abierto" ? "ABIERTO" : "PENDIENTE DE APROBACIÓN";
    return {
      ok: false, verificado: true, problema: "no-lanzado", bcVendorNo: enBc || undefined, bcEstado,
      mensaje: `el pedido ${no} está ${comoEsta} en Business Central, no lanzado. `
        + `Business Central no deja recibir ni facturar contra un pedido sin lanzar. `
        + `La orden figura aprobada acá, pero en BC el lanzamiento todavía no entró: `
        + `tiene que lanzarlo Aprobación`,
    };
  }
  return {
    ok: true, verificado: bcEstado === "lanzado" || !!(esperado && enBc),
    bcVendorNo: enBc || undefined, bcEstado,
  };
}

// Qué hacer con cada problema. Son dos historias distintas: una es "esto está mal,
// avisá"; la otra es "esto todavía no pasó, falta un paso de Aprobación".
const QUE_SIGUE: Record<ProblemaEncabezado, string> = {
  proveedor:
    "Revisalo en BC antes de reintentar. Si el pedido de allá es el equivocado, corregí el N.º de BC de la orden; "
    + "si a este pedido le cambiaron el proveedor, hay que arreglarlo en Business Central.",
  "no-lanzado":
    "No es un error tuyo ni hace falta reintentar todavía: pedile a Aprobación que lance el pedido en Business Central "
    + "y volvé a intentar cuando esté Lanzado.",
};

export type Freno409Encabezado = {
  ok: false; error: string; frenoEncabezado: true;
  frenoProveedor?: true; frenoNoLanzado?: true;
  bcVendorNo?: string; bcEstado?: string;
};

/** El cuerpo del 409, o `null` si el encabezado deja seguir. */
export function frenoEncabezado409(accion: AccionRegistro, r: FrenoEncabezado): Freno409Encabezado | null {
  if (r.ok || !r.problema) return null;
  return {
    ok: false,
    error: `${COMO_EMPIEZA[accion]}: ${r.mensaje}.\n\n${QUE_SIGUE[r.problema]}`,
    frenoEncabezado: true,
    ...(r.problema === "proveedor" ? { frenoProveedor: true as const } : { frenoNoLanzado: true as const }),
    bcVendorNo: r.bcVendorNo,
    bcEstado: r.bcEstado,
  };
}

// ─── 2. LÍNEAS: QUE BC LAS TENGA Y LES QUEDE SALDO ──────────────────────────────

/** Las líneas que BC NO va a poder registrar, en texto para una persona. Vacío = todo
 *  calza. Mismo criterio que el codeunit: busca la línea por N.º y TIPO (y variante si
 *  viene), y reparte el saldo entre las líneas del pedido en orden. */
export function lineasNoPosteables(
  orderNo: string,
  bc: BcLineasPedido,
  lineas: LineaPedida[],
  modo: ModoRegistro,
): string[] {
  const pedidas = (lineas ?? []).filter((l) => String(l?.itemNo ?? "").trim() && (Number(l?.qty) || 0) > 0);
  const problemas: string[] = [];
  // Las claves llevan el TIPO adelante: un recurso y un artículo con el mismo N.º son
  // dos líneas distintas en BC, y sin el tipo una le comería el saldo a la otra.
  const saldo = new Map<string, number>();
  const porItem = new Map<string, LineaBc[]>();
  for (const l of bc.lineas ?? []) {
    if (l.tipo !== "articulo" && l.tipo !== "recurso" && l.tipo !== "activo_fijo") continue;
    const item = `${l.tipo}|${codigo(l.itemNo)}`;
    porItem.set(item, [...(porItem.get(item) ?? []), l]);
    const disponible = modo === "facturar-recibido" ? Math.max(0, l.recibida - l.facturada) : l.pendiente;
    const k = `${item}|${String(l.variantCode ?? "").trim().toUpperCase()}`;
    saldo.set(k, (saldo.get(k) ?? 0) + disponible);
  }
  const queFalta = modo === "facturar-recibido" ? "recibido sin facturar" : "pendiente de recibir";

  for (const p of pedidas) {
    const tipo = tipoPosteable(p.tipo);
    const item = `${tipo}|${codigo(p.itemNo)}`;
    const variante = String(p.variantCode ?? "").trim().toUpperCase();
    const enBc = porItem.get(item) ?? [];
    if (!enBc.length) {
      problemas.push(`${p.itemNo}: el pedido ${orderNo} de Business Central NO tiene ninguna línea de ${NOMBRE_TIPO[tipo]} con ese N.º. `
        + `Si se registra, BC lo va a ignorar en silencio y la app lo va a dar por recibido.`);
      continue;
    }
    // La variante solo se exige si BC la devolvió (la API estándar no la trae).
    const clave = bc.fuente === "custom" && variante ? `${item}|${variante}` : "";
    if (clave && !saldo.has(clave)) {
      const otras = [...new Set(enBc.map((l) => l.variantCode || "(sin variante)"))].join(", ");
      problemas.push(`${p.itemNo}: la orden lo recibe con variante "${variante}" y en BC la(s) línea(s) de ese artículo tienen ${otras}. `
        + `El registro filtra por variante: no va a calzar y BC lo va a saltar sin avisar.`);
      continue;
    }
    // Sin variante se puede tomar saldo de cualquier variante del artículo, pero se
    // empieza por la línea SIN variante: si no, le come el saldo a la variante que
    // otra línea sí pidió por nombre.
    const claves = clave
      ? [clave]
      : [`${item}|`, ...[...saldo.keys()].filter((k) => k.startsWith(`${item}|`) && k !== `${item}|`)];
    const disponible = claves.reduce((s, k) => s + (saldo.get(k) ?? 0), 0);
    const q = Number(p.qty) || 0;
    if (disponible + 1e-6 < q) {
      problemas.push(`${p.itemNo}: se quieren registrar ${q} y en BC solo hay ${disponible} ${queFalta} en el pedido ${orderNo}.`);
      continue;
    }
    // Se descuenta en orden, para que la siguiente línea del mismo material no vuelva
    // a contar lo mismo.
    let resta = q;
    for (const k of claves) {
      if (resta <= 0) break;
      const s = saldo.get(k) ?? 0;
      const usa = Math.min(s, resta);
      saldo.set(k, s - usa);
      resta -= usa;
    }
  }
  return problemas;
}

export type Freno409Lineas = { ok: false; error: string; frenoLineas: true; problemas: string[] };

/** El cuerpo del 409, o `null` si no hay problemas. */
export function frenoLineas409(accion: AccionRegistro, orderNo: string, problemas: string[]): Freno409Lineas | null {
  if (!problemas.length) return null;
  const lista = problemas.map((p) => `• ${p}`).join("\n");
  const error = accion === "facturar"
    ? `NO se facturó: Business Central no puede facturar ${problemas.length} línea(s).\n\n${lista}\n\nRevisá el pedido ${orderNo} en BC antes de reintentar.`
    : accion === "recibir"
      ? `NO se recibió: Business Central no puede recibir ${problemas.length} línea(s).\n\n${lista}\n\nCorregí el pedido ${orderNo} en BC (o la orden acá) y volvé a intentar.`
      : `NO se registró: Business Central no puede recibir ${problemas.length} de las líneas de esta factura.\n\n${lista}\n\n`
        + `Corregí el pedido ${orderNo} en BC (o la orden acá) y volvé a intentar. La orden queda por recibir.`;
  return { ok: false, error, frenoLineas: true, problemas };
}

// ─── 3. PRECIO: QUE BC FACTURE LO QUE DICE LA ORDEN ─────────────────────────────

// Tolerancias: medio céntimo para el precio (lo que redondea BC al mostrar) y un
// epsilon para el IVA, que es un porcentaje exacto de los dos lados.
const EPS_PRECIO = 0.005;
const EPS_IVA = 1e-9;

export type ClaseDifPrecio = "precio" | "iva" | "unidad";

export type DifPrecio = {
  clase: ClaseDifPrecio;
  itemNo: string;
  descripcion: string;
  cantidad: number;   // lo que se registra AHORA (no lo que tiene la orden)
  app: number;        // precio unitario o IVA%, según la clase
  bc: number;
  // La plata de ESTE registro que queda mal si se postea así. Positiva = BC factura
  // de más. Se calcula sobre lo que entra ahora y no sobre la línea entera.
  importe: number;
  texto: string;      // una línea lista para mostrarle a una persona
};

// Solo se comparan los tipos que se registran por cantidad. El CARGO queda afuera:
// BC le reescribe cantidad y precio al repartirlo entre las líneas de artículo.
const COTEJABLES = new Set(["articulo", "recurso", "activo_fijo"]);
const esCotejable = (t: unknown) => COTEJABLES.has(String(t ?? "articulo").trim().toLowerCase());

const cant = (n: number) => n.toLocaleString("es-CR", { maximumFractionDigits: 5 });
const pct = (n: number) => `${n.toLocaleString("es-CR", { maximumFractionDigits: 2 })}%`;

type Junta = { cantidad: number; importe: number; descripcion: string; unidades: Set<string>; ivas: Set<number> };
type Comparable = { tipo: string; itemNo: string; descripcion?: string; cantidad: number; precioUnitario: number; unidad?: string; ivaPct?: number };

// Junta las líneas por código. Un material puede repetirse en dos líneas (otro
// almacén, otra obra) y BC las guarda separadas: lo que importa es que la plata por
// unidad sea la misma de los dos lados. Más de un IVA o una unidad para el mismo
// código = ambiguo, y lo ambiguo no frena.
function juntar(lineas: Comparable[] | undefined): Map<string, Junta> {
  const m = new Map<string, Junta>();
  for (const l of lineas ?? []) {
    if (!esCotejable(l?.tipo)) continue;
    const code = codigo(l?.itemNo);
    if (!code) continue;
    const cantidad = Number(l?.cantidad) || 0;
    const precio = Number(l?.precioUnitario) || 0;
    const j = m.get(code) ?? {
      cantidad: 0, importe: 0, descripcion: String(l?.descripcion ?? "").trim() || code,
      unidades: new Set<string>(), ivas: new Set<number>(),
    };
    j.cantidad += cantidad;
    j.importe += cantidad * precio;
    const u = String(l?.unidad ?? "").trim().toUpperCase();
    if (u) j.unidades.add(u);
    const iva = Number(l?.ivaPct);
    if (l?.ivaPct !== undefined && l?.ivaPct !== null && Number.isFinite(iva) && iva >= 0) j.ivas.add(iva);
    m.set(code, j);
  }
  return m;
}

const precioDe = (j: Junta) => (j.cantidad > 1e-9 ? j.importe / j.cantidad : 0);
const unico = <T,>(s: Set<T>): T | undefined => (s.size === 1 ? [...s][0] : undefined);

/** ¿Lo que BC va a facturar es lo que dice la orden, para lo que se registra AHORA?
 *  Devuelve las diferencias de la más cara a la más barata. `plata` formatea montos
 *  en la moneda de la orden. */
export function diferenciasAlPostear(
  app: LineaApp[],
  bc: LineaBc[],
  pedidas: LineaPedida[],
  plata: (n: number) => string,
): DifPrecio[] {
  const gApp = juntar(app as Comparable[]);
  const gBc = juntar(bc as Comparable[]);

  // Cuánto entra AHORA por código (el mismo artículo puede venir en dos líneas).
  const ahora = new Map<string, number>();
  for (const p of pedidas ?? []) {
    const code = codigo(p?.itemNo);
    const q = Number(p?.qty) || 0;
    if (!code || q <= 0 || !esCotejable(p?.tipo)) continue;
    ahora.set(code, (ahora.get(code) ?? 0) + q);
  }

  const out: DifPrecio[] = [];
  for (const [code, qty] of ahora) {
    const a = gApp.get(code);
    const b = gBc.get(code);
    // Que la línea falte de un lado lo dice el freno de líneas, con el saldo en la
    // mano. Acá solo se comparan montos, y para eso hacen falta los dos.
    if (!a || !b) continue;
    const nombre = a.descripcion || b.descripcion || code;
    const pa = precioDe(a), pb = precioDe(b);

    // LA UNIDAD VA PRIMERO: con distinta unidad el precio de cada lado está en otra
    // cosa y compararlo no significa nada.
    const ua = unico(a.unidades);
    const ub = unico(b.unidades);
    if (ua && ub && ua !== ub) {
      out.push({
        clase: "unidad", itemNo: code, descripcion: nombre, cantidad: qty,
        app: pa, bc: pb, importe: qty * pa,
        texto: `${nombre} (${code}): la orden compra en ${ua} y en BC la línea quedó en ${ub}. `
          + `Es el mismo número en otra unidad, así que el precio de los dos lados no se puede comparar — `
          + `y lo que BC va a facturar son ${cant(qty)} ${ub} a ${plata(pb)}.`,
      });
      continue;
    }

    // PRECIO. El de la app es el de la orden; el de BC es con el que va a facturar.
    if (Math.abs(pa - pb) > EPS_PRECIO) {
      const importe = qty * (pb - pa);
      out.push({
        clase: "precio", itemNo: code, descripcion: nombre, cantidad: qty,
        app: pa, bc: pb, importe,
        texto: `${nombre} (${code}): la orden lo compra a ${plata(pa)} y en BC la línea está a ${plata(pb)}. `
          + `Registrando ${cant(qty)}, BC va a facturar ${plata(qty * pb)} donde la orden dice ${plata(qty * pa)} — `
          + `${plata(Math.abs(importe))} de ${importe > 0 ? "más" : "menos"}.`,
      });
    }

    // IVA. Es el monto que entra a la cuenta por pagar, no un detalle del estimado.
    const ia = unico(a.ivas);
    const ib = unico(b.ivas);
    if (ia !== undefined && ib !== undefined && Math.abs(ia - ib) > EPS_IVA) {
      const importe = qty * pb * (ib - ia) / 100;
      out.push({
        clase: "iva", itemNo: code, descripcion: nombre, cantidad: qty,
        app: ia, bc: ib, importe,
        texto: `${nombre} (${code}): la orden le puso ${pct(ia)} de IVA y en BC la línea calcula ${pct(ib)}. `
          + `Registrando ${cant(qty)}, son ${plata(Math.abs(importe))} de IVA de ${importe > 0 ? "más" : "menos"} `
          + `en la factura de compra.`,
      });
    }
  }
  return out.sort((x, y) => Math.abs(y.importe) - Math.abs(x.importe));
}

/** El título según lo que apareció: decir "precio" cuando lo que no cuadra es el IVA
 *  manda a buscar donde no es. */
export function tituloDeDiferencias(difs: DifPrecio[]): string {
  const clases = new Set(difs.map((d) => d.clase));
  if (clases.size === 1 && clases.has("iva")) return "el IVA que Business Central le calcula a las líneas no es el de la orden";
  if (clases.has("iva")) return "lo que Business Central va a facturar no es lo que dice la orden";
  if (clases.size === 1 && clases.has("unidad")) return "Business Central tiene las líneas en otra unidad que la orden";
  return "el precio que tiene Business Central no es el de la orden";
}

export type Freno409Precio = {
  ok: false; error: string; frenoPrecio: true;
  problemas: string[];
  diferencias: DifPrecio[];
  importeEnJuego: number;
};

/** El cuerpo del 409, o `null` si no hay diferencias. */
export function frenoPrecio409(
  accion: AccionRegistro, orderNo: string, difs: DifPrecio[], plata: (n: number) => string,
): Freno409Precio | null {
  if (!difs.length) return null;
  const importeEnJuego = difs.reduce((s, d) => s + Math.abs(d.importe), 0);
  const problemas = difs.map((d) => d.texto);
  const error = `${COMO_EMPIEZA[accion]}: ${tituloDeDiferencias(difs)} en ${difs.length} línea(s).\n\n`
    + problemas.map((p) => `• ${p}`).join("\n")
    + `\n\nSon ${plata(importeEnJuego)} que no cuadran contra la orden. `
    + `La app no le manda precios a BC al registrar: BC factura con lo que tenga la línea del pedido ${orderNo}, `
    + `así que registrarlo así deja esa plata en la cuenta por pagar del proveedor. `
    + `Corregilo en Business Central (o la orden acá, con Proveeduría) y volvé a intentar.`;
  return { ok: false, error, frenoPrecio: true, problemas, diferencias: difs, importeEnJuego };
}

/** Cualquiera de los tres 409. */
export type Freno409 = Freno409Encabezado | Freno409Lineas | Freno409Precio;
