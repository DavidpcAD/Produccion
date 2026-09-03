// Cliente de Business Central (SaaS) por OAuth client-credentials (S2S),
// usando las APIs PERSONALIZADAS de Adelante (publisher 'adelante', v1.0):
//   - Items:  grupo 'inventory'  -> entitySet 'items'   (page 50125 ItemAPI)
//   - Obras:  grupo 'project'     -> entitySet 'jobs'    (page 50170 JobAPI)
// La compañía sale de BC_COMPANY_ID (GUID). El tenant/environment se deducen
// de BC_BASE_URL (o de BC_TENANT_ID/BC_ENVIRONMENT).

type TokenCache = { token: string; exp: number };
let tokenCache: TokenCache | null = null;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

function soloGuid(v?: string): string | null {
  const m = (v ?? "").match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  return m ? m[0] : null;
}

function tenantYEntorno(): { tenant: string; environment: string } {
  const base = process.env.BC_BASE_URL ?? "";
  const m = base.match(/\/v2\.0\/([^/]+)\/([^/]+)\/api\b/i);
  if (m) return { tenant: m[1], environment: m[2] };
  return { tenant: env("BC_TENANT_ID"), environment: process.env.BC_ENVIRONMENT ?? "Sandbox" };
}

// Raíz de una API personalizada de Adelante para un grupo dado.
function customRoot(group: string): string {
  const { tenant, environment } = tenantYEntorno();
  return `https://api.businesscentral.dynamics.com/v2.0/${tenant}/${environment}/api/adelante/${group}/v1.0`;
}

// Raíz de la API ESTÁNDAR v2.0 (la usa digitación; tiene itemVariants).
function stdRoot(): string {
  const { tenant, environment } = tenantYEntorno();
  return `https://api.businesscentral.dynamics.com/v2.0/${tenant}/${environment}/api/v2.0`;
}

let companyIdCache: string | null = null;

// Resuelve el id de la compañía. Preferimos resolver por NOMBRE listando
// /companies del API custom (así no dependemos de un GUID mal configurado y
// caemos en la compañía a la que la app SÍ tiene permiso). Fallback al GUID.
async function getCompanyId(): Promise<string> {
  if (companyIdCache) return companyIdCache;
  const nombre = process.env.BC_COMPANY || "ADELANTE_DESARROLLOS_NUEVA";
  try {
    const res = await bcFetch(`${customRoot("inventory")}/companies`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const lista: any[] = data.value ?? [];
      const comp = lista.find((c) => c.name === nombre || c.displayName === nombre) ?? lista[0];
      if (comp?.id) { companyIdCache = comp.id; return comp.id; }
    }
  } catch { /* cae al GUID configurado */ }
  const id = soloGuid(process.env.BC_COMPANY_ID);
  if (!id) throw new Error("No se pudo resolver la compañía de BC");
  companyIdCache = id;
  return id;
}

// El systemId de compañía para la API ESTÁNDAR (v2.0) puede diferir del que
// devuelve la API custom de Adelante. Resolvemos por nombre contra /companies estándar.
let stdCompanyIdCache: string | null = null;
async function getStdCompanyId(): Promise<string> {
  if (stdCompanyIdCache) return stdCompanyIdCache;
  const nombre = process.env.BC_COMPANY || "ADELANTE_DESARROLLOS_NUEVA";
  try {
    const res = await bcFetch(`${stdRoot()}/companies`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const lista: any[] = data.value ?? [];
      const comp = lista.find((c) => c.name === nombre || c.displayName === nombre) ?? lista[0];
      if (comp?.id) { stdCompanyIdCache = comp.id; return comp.id; }
    }
  } catch { /* cae al id de la API custom */ }
  return getCompanyId();
}

// Lista de compañías visibles para la app (diagnóstico).
export async function bcCompanies(): Promise<{ id: string; name: string }[]> {
  const res = await bcFetch(`${customRoot("inventory")}/companies`, { cache: "no-store" });
  if (!res.ok) throw new Error(`BC ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.value ?? []).map((c: any) => ({ id: c.id, name: c.name ?? c.displayName }));
}

async function getToken(force = false): Promise<string> {
  if (!force && tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const tenant = env("BC_TENANT_ID");
  const body = new URLSearchParams({
    client_id: env("BC_CLIENT_ID"),
    client_secret: env("BC_CLIENT_SECRET"),
    scope: "https://api.businesscentral.dynamics.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
  });
  if (!res.ok) throw new Error(`OAuth BC falló (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  tokenCache = { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return tokenCache.token;
}

// fetch contra BC con reintento ante 401: el Sandbox a veces resetea el binding
// S2S y el token cacheado deja de ser aceptado. En ese caso pedimos un token
// FRESCO y reintentamos una vez. Logueamos ms-diagnostics para ver el motivo real.
async function bcFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const baseHeaders = { ...(init.headers as Record<string, string> | undefined), Accept: "application/json" };
  const run = (token: string) => fetch(url, { ...init, headers: { ...baseHeaders, Authorization: `Bearer ${token}` } });
  let res = await run(await getToken());
  if (res.status === 401) {
    console.warn(`BC 401 en ${url} — reintento con token fresco. ms-diagnostics=${res.headers.get("ms-diagnostics") ?? "n/a"}`);
    res = await run(await getToken(true)); // fuerza token nuevo (binding pudo resetearse)
    if (res.status === 401) console.error(`BC 401 persiste tras token fresco en ${url}. ms-diagnostics=${res.headers.get("ms-diagnostics") ?? "n/a"}`);
  }
  return res;
}

async function listAll(group: string, entity: string): Promise<any[]> {
  const cid = await getCompanyId();
  let url: string | null = `${customRoot(group)}/companies(${cid})/${entity}`;
  const out: any[] = [];
  let guard = 0;
  while (url && guard++ < 50) {
    // Datos maestros (items, obras): se cachean 5 min para acelerar la carga.
    const res = await bcFetch(url, { next: { revalidate: 300 } } as RequestInit);
    if (!res.ok) throw new Error(`BC ${res.status} en ${url}: ${(await res.text()).slice(0, 250)}`);
    const data: any = await res.json();
    out.push(...(data.value ?? []));
    url = data["@odata.nextLink"] ?? null;
  }
  return out;
}

// tipo = BC Item.Type. El catálogo trae de TODO (inventario, servicio y no
// inventariable) y los buscadores muestran los tres; el tipo se usa para etiquetar
// y para no ponerle almacén a lo que en BC no lo lleva (ver bcCrearPedido).
export type BcItemTipo = "inventario" | "servicio" | "no-inventario";
export type BcItem = { id: string; code: string; descripcion: string; unidad: string; unidadCompra?: string; tipo: BcItemTipo; lastDirectCost?: number; categoria?: string; reorderPoint?: number; safetyStock?: number; reorderQty?: number };
// bloqueada = la OBRA está bloqueada en BC (Job.Blocked = "All"). Ojo: NO es lo mismo
// que Job.Status ("Open"): una obra puede estar Open y bloqueada a la vez, y es lo que
// pasó con VN-K.26 (caso CP-005132, 21/08/2026) — BC rechaza poner ese proyecto en una
// línea de compra con "Project VN-K.26 must not be blocked with type All", así que el
// pedido se crea y nunca se puede lanzar. En producción hay 82 de 221 obras así.
export type BcObra = { id: string; codigo: string; nombre: string; bloqueada?: boolean };
export type BcAlmacen = { codigo: string; nombre: string };

// BC manda el tipo como "Inventory" | "Service" | "Non_x002D_Inventory"
// (Non-Inventory viene escapado en OData). Cualquier otra cosa se trata como
// inventario, que es el caso normal del catálogo.
function tipoDeBc(v: unknown): BcItemTipo {
  const t = String(v ?? "").toLowerCase().replace(/_x002d_/g, "-");
  if (t.startsWith("serv")) return "servicio";
  if (t.startsWith("non-inventory") || t.startsWith("noninventory")) return "no-inventario";
  return "inventario";
}

let lastGoodItems: BcItem[] | null = null;
export async function bcItems(): Promise<BcItem[]> {
  try {
    const rows = await listAll("inventory", "items");
    let items: BcItem[] = rows
      .filter((i) => !(i.Blocked ?? i.blocked))
      .map((i) => {
        const code = i.No ?? i.no ?? i.number ?? "";
        const costCustom = Number(i.LastDirectCost ?? i.lastDirectCost ?? i.UnitCost ?? i.unitCost ?? 0) || undefined;
        const catCustom = (i.ItemCategoryCode ?? i.itemCategoryCode ?? "").toString().trim() || undefined;
        return {
          id: i.id ?? i.systemId ?? code,
          code,
          descripcion: i.Description ?? i.description ?? i.displayName ?? code,
          unidad: i.BaseUnitOfMeasure ?? i.baseUnitOfMeasure ?? i.baseUnitOfMeasureCode ?? "UND",
          // Unidad de COMPRA (Purch. Unit of Measure). Viene en la MISMA respuesta y
          // hasta ahora se descartaba: es el default con el que se le pide al proveedor.
          // Ojo: en BC casi nadie la mantiene (1 artículo de 5.500 la tiene distinta de
          // la base), así que NO sirve para saber si un artículo es multi-unidad — eso
          // lo dice itemUnitsOfMeasure. Solo sirve como default cuando existe.
          unidadCompra: (i.PurchUnitOfMeasure ?? i.purchUnitOfMeasure ?? "").toString().trim() || undefined,
          // La API custom no expone el Type; lo completa bcItemExtra (API estándar).
          tipo: "inventario" as BcItemTipo,
          lastDirectCost: costCustom,
          categoria: catCustom,
          reorderPoint: Number(i.reorderPoint ?? i.ReorderPoint ?? 0) || undefined,
          safetyStock: Number(i.safetyStockQuantity ?? i.SafetyStockQuantity ?? 0) || undefined,
          reorderQty: Number(i.reorderQuantity ?? i.ReorderQuantity ?? 0) || undefined,
        };
      });
    // Enriquecer con COSTO UNITARIO, CATEGORÍA (= partida en Planificación) y TIPO
    // del ítem desde la API estándar v2.0. El "último costo directo" que muestra la
    // ficha de BC no lo expone ninguna de las dos APIs (haría falta agregarlo a la
    // page 50125 de la extensión); mientras tanto se usa el costo unitario, que es
    // el fallback que este código ya preveía.
    const extra = await bcItemExtra();
    if (extra.size) items = items.map((i) => { const e = extra.get(i.code); return { ...i, lastDirectCost: e?.cost ?? i.lastDirectCost, categoria: e?.categoria ?? i.categoria, tipo: e?.tipo ?? i.tipo }; });
    // Bloqueados SOLO para compras: el filtro de arriba no los ve (ver bcItemsBloqueados).
    const bloqueados = await bcItemsBloqueados();
    if (bloqueados?.size) items = items.filter((i) => !bloqueados.has(i.code));
    if (items.length) lastGoodItems = items; // guardamos el último catálogo bueno
    return items;
  } catch (e) {
    if (lastGoodItems) { console.warn("BC items falló; sirviendo último catálogo bueno cacheado."); return lastGoodItems; }
    throw e;
  }
}

// ─── Artículos BLOQUEADOS en BC ─────────────────────────────────────────────────
// En BC un artículo se retira de DOS formas y hay que respetar las dos:
//   · `Blocked`            → bloqueado para todo. La API custom sí lo trae (y ya se
//                            filtra al mapear el catálogo).
//   · `Purchasing Blocked` → bloqueado SOLO para compras. Es el caso típico del
//                            artículo reemplazado: se deja usar el inventario que
//                            queda, pero no se le vuelve a comprar. NI la API custom
//                            (page 50125) NI la estándar v2.0 lo exponen, así que sale
//                            de la página publicada `Ficha_producto_Excel`.
// Caso real (03/09/2026): M06-0116 "TORNILLO 1-1/4 P/F" está bloqueado en BC y el
// buscador lo seguía ofreciendo al lado de su reemplazo M06-0805 ("TORNILLO P/GYP
// 1-1/4 P FINA", con existencias) — el ingeniero pedía el que no era.
//
// Son DOS consultas porque el endpoint OData de páginas rechaza el OR entre campos
// distintos: "The 'OR' operator is not supported on distinct fields on an OData
// filter". Son pocas filas (18 bloqueados en Sandbox), así que sale barato.
// `null` = no se pudo leer: quien llama NO debe concluir que no hay bloqueados (mejor
// mostrar el catálogo completo que dejarlo vacío).
let itemsBloqueadosCache: { at: number; set: Set<string> } | null = null;
export async function bcItemsBloqueados(): Promise<Set<string> | null> {
  if (itemsBloqueadosCache && Date.now() - itemsBloqueadosCache.at < 300_000) return itemsBloqueadosCache.set;
  try {
    const cid = await getStdCompanyId();
    const out = new Set<string>();
    for (const campo of ["Blocked", "Purchasing_Blocked"]) {
      let url: string | null = `${odataRoot()}/Ficha_producto_Excel?company=${encodeURIComponent(cid)}&$select=No&$filter=${encodeURIComponent(`${campo} eq true`)}`;
      let guard = 0;
      while (url && guard++ < 20) {
        const res = await bcFetch(url, { next: { revalidate: 300 } } as RequestInit);
        if (!res.ok) return null;
        const data = (await res.json()) as { value?: { No?: string }[]; "@odata.nextLink"?: string };
        for (const r of (data.value ?? [])) { const n = String(r.No ?? "").trim(); if (n) out.add(n); }
        url = data["@odata.nextLink"] ?? null;
      }
    }
    itemsBloqueadosCache = { at: Date.now(), set: out };
    return out;
  } catch (e) {
    console.warn("BC: no se pudo leer qué artículos están bloqueados; el catálogo va sin ese filtro.", e);
    return itemsBloqueadosCache?.set ?? null;
  }
}

// Mapa itemNo -> { último costo directo, categoría, tipo } desde la API estándar
// v2.0 (la custom no devuelve el Type). Cacheado 5 min. Si falla, la UI cae al
// historial local / sin categoría y todo se trata como inventario.
async function bcItemExtra(): Promise<Map<string, { cost?: number; categoria?: string; tipo?: BcItemTipo }>> {
  const map = new Map<string, { cost?: number; categoria?: string; tipo?: BcItemTipo }>();
  try {
    const cid = await getStdCompanyId();
    // OJO: la entidad `item` de la API v2.0 de este entorno NO tiene
    // `lastDirectCost` (BC responde 400 "Could not find a property named
    // 'lastDirectCost'"), y con el $select inválido esta consulta fallaba SIEMPRE:
    // el mapa salía vacío y ni el costo ni la categoría ni el tipo llegaban. Se pide
    // `unitCost` (el costo unitario del ítem), que ya era el fallback previsto.
    // SIN $top: con `$top=5000` BC devuelve EXACTAMENTE 5.000 filas y NO manda
    // @odata.nextLink, así que el resto se perdía en silencio. En el entorno de
    // producción hay 5.502 artículos: se cortaban 502, y como el catálogo viene ordenado
    // por código, los que quedaban afuera eran justo los SERVICIOS (S20-* … S24-*). Se
    // veía como "el buscador de subcontratos solo ofrece 2 servicios" (24/08/2026) y
    // además esos 502 artículos quedaban sin costo y sin categoría.
    // Comprobado contra BC: con $top → 5.000 items y 2 servicios; sin $top → 5.502 y 114.
    let url: string | null = `${stdRoot()}/companies(${cid})/items?$select=number,unitCost,itemCategoryCode,type`;
    let guard = 0;
    while (url && guard++ < 20) {
      const res = await bcFetch(url, { next: { revalidate: 300 } } as RequestInit);
      if (!res.ok) break;
      const data: any = await res.json();
      for (const it of (data.value ?? [])) {
        const no = it.number ?? it.no ?? "";
        if (!no) continue;
        const cost = (typeof it.unitCost === "number" && it.unitCost > 0) ? it.unitCost : undefined;
        const categoria = (it.itemCategoryCode ?? "").toString().trim() || undefined;
        map.set(no, { cost, categoria, tipo: tipoDeBc(it.type) });
      }
      url = data["@odata.nextLink"] ?? null;
    }
  } catch { /* sin datos extra */ }
  return map;
}

// Tipo (Item.Type) de varios artículos, por la API estándar v2.0. Se usa al armar
// el pedido de compra: los buscadores ofrecen TODO el catálogo (inventario,
// servicio y no inventariable) y BC no acepta almacén en las líneas de servicio /
// no inventariable, así que esas van SIN locationCode.
// Si la consulta falla, el ítem se trata como inventario (comportamiento previo).
export async function bcItemTipos(codes: string[]): Promise<Map<string, BcItemTipo>> {
  const out = new Map<string, BcItemTipo>();
  for (const [no, f] of await bcItemFichas(codes)) out.set(no, f.tipo);
  return out;
}

/** Tipo + unidad BASE de varios artículos, en una sola pasada (API estándar v2.0).
 *  La base hace falta para decidir si la unidad de una línea es "la que eligió la
 *  persona" o "la que venía por defecto" — ver `unidadParaBc` en bcCrearPedido. */
export async function bcItemFichas(codes: string[]): Promise<Map<string, { tipo: BcItemTipo; base: string }>> {
  const out = new Map<string, { tipo: BcItemTipo; base: string }>();
  const unicos = [...new Set((codes ?? []).map((c) => (c ?? "").trim()).filter(Boolean))];
  if (!unicos.length) return out;
  try {
    const cid = await getStdCompanyId();
    for (let i = 0; i < unicos.length; i += 15) {
      const filtro = unicos.slice(i, i + 15).map((c) => `number eq '${odataStr(c)}'`).join(" or ");
      const res = await bcFetch(`${stdRoot()}/companies(${cid})/items?$select=number,type,baseUnitOfMeasureCode&$filter=${encodeURIComponent(filtro)}`, { cache: "no-store" });
      if (!res.ok) continue;
      const data = (await res.json()) as { value?: { number?: string; type?: string; baseUnitOfMeasureCode?: string }[] };
      for (const it of (data.value ?? [])) {
        const no = it.number ?? "";
        if (no) out.set(no, { tipo: tipoDeBc(it.type), base: (it.baseUnitOfMeasureCode ?? "").trim() });
      }
    }
  } catch { /* sin tipo: se trata como inventario, y sin base no se manda unidad */ }
  return out;
}

// Último costo directo de UN item (precio de su última compra), API estándar v2.0.
// Fallback cuando no hay precio facturado a un proveedor específico.
export async function bcItemLastCost(itemNo: string): Promise<number | null> {
  if (!itemNo) return null;
  try {
    const cid = await getStdCompanyId();
    // Sin `lastDirectCost`: no existe en la entidad `item` de la API v2.0 de este
    // entorno y el $select inválido hacía que esto devolviera siempre null.
    const url = `${stdRoot()}/companies(${cid})/items?$filter=${encodeURIComponent(`number eq '${itemNo}'`)}&$select=number,unitCost&$top=1`;
    const res = await bcFetch(url, { next: { revalidate: 300 } } as RequestInit);
    if (!res.ok) return null;
    const it = ((await res.json())?.value ?? [])[0];
    if (!it) return null;
    return (typeof it.unitCost === "number" && it.unitCost > 0) ? it.unitCost : null;
  } catch { return null; }
}

// Último COSTO DE COMPRA real del material, vía la API custom Adelante
// (page 50235 lastPurchasePrices sobre Item Ledger Entry, solo recepciones de
// compra). Trae el movimiento más reciente (postingDate desc, entryNo desc) y
// devuelve su unitCost. Es lo más fiel al "último precio pagado" por ese ítem.
/** Última compra REAL de un artículo (API custom `lastPurchasePrices`).
 *
 *  OJO con la unidad, que es la trampa de todo esto: la fila dice
 *  `unitOfMeasureCode: "EST"` pero `quantity` viene en unidad BASE y `unitCost` es
 *  `costAmountActual / quantity`, o sea el precio POR UNIDAD BASE. Comprobado con
 *  M06-0009: uom EST, quantity 255.000, costAmountActual ¢442.434,15, unitCost
 *  ¢1,7350 — que es el gramo, no el estañón (255.000 gramos = 1 estañón). Quien lea
 *  `unitCost` creyendo que es el precio de la unidad del documento se equivoca por
 *  255.000x: es exactamente el error del 21/08/2026.
 *
 *  Por eso esto devuelve el precio SIEMPRE por unidad base y quien lo use lo convierte
 *  con el factor de la unidad de su línea (ver `precioEnUnidad` en helpers).
 *  Si viene `vendorNo`, se prefiere la última compra a ESE proveedor; si nunca le
 *  compró, cae a la última de cualquiera. */
export type BcUltimaCompra = { precioBase: number; unidadDocumento: string; fecha: string; documentoNo: string; vendorNo: string; delProveedor: boolean };
export async function bcUltimaCompra(itemNo: string, vendorNo = ""): Promise<BcUltimaCompra | null> {
  if (!itemNo) return null;
  try {
    const cid = await getCompanyId();
    const filtro = `$filter=${encodeURIComponent(`itemNo eq '${odataStr(itemNo)}'`)}`;
    const url = `${customRoot("purchasing")}/companies(${cid})/lastPurchasePrices?${filtro}&$orderby=postingDate desc,entryNo desc&$top=20`;
    const res = await bcFetch(url, { next: { revalidate: 300 } } as RequestInit);
    if (!res.ok) return null;
    const filas = ((await res.json())?.value ?? []) as Record<string, unknown>[];
    const prov = vendorNo.trim().toUpperCase();
    const deEse = prov ? filas.filter((f) => String(f.vendorNo ?? "").toUpperCase() === prov) : [];
    const fila = deEse[0] ?? filas[0];
    if (!fila) return null;
    // El precio por unidad base se recalcula del importe y la cantidad (que ya viene en
    // base), en vez de confiar en `unitCost`: son lo mismo, pero así queda a la vista
    // de qué se está dividiendo.
    const cantidad = Number(fila.quantity ?? 0);
    const importe = Number(fila.costAmountActual ?? 0);
    const precioBase = cantidad > 0 && importe > 0 ? importe / cantidad : Number(fila.unitCost ?? 0);
    if (!(precioBase > 0)) return null;
    return {
      precioBase,
      unidadDocumento: String(fila.unitOfMeasureCode ?? "").trim(),
      fecha: String(fila.postingDate ?? ""),
      documentoNo: String(fila.documentNo ?? ""),
      vendorNo: String(fila.vendorNo ?? ""),
      delProveedor: deEse.length > 0,
    };
  } catch { return null; }
}

export async function bcObras(): Promise<BcObra[]> {
  const rows = await listAll("project", "jobs");
  // El API custom de obras NO expone el bloqueo, así que se lee de la página publicada
  // FichaProyecto. Si no se puede leer, NADIE queda marcado como bloqueada (degradar
  // así evita el peor caso: dejar al usuario sin obras para elegir).
  const bloqueadas = await bcObrasBloqueadas();
  return rows.map((j) => {
    const codigo = j.no ?? j.No ?? "";
    return {
      id: j.id ?? j.no ?? "",
      codigo,
      nombre: j.description ?? j.Description ?? j.no ?? "",
      bloqueada: bloqueadas?.has(codigo) || undefined,
    };
  });
}

/** Códigos de obra con Job.Blocked distinto de vacío. `null` = no se pudo leer. */
let bloqueadasCache: { set: Set<string>; exp: number } | null = null;
export async function bcObrasBloqueadas(): Promise<Set<string> | null> {
  if (bloqueadasCache && bloqueadasCache.exp > Date.now()) return bloqueadasCache.set;
  try {
    const cid = await getStdCompanyId();
    const out = new Set<string>();
    let url: string | null = `${odataRoot()}/FichaProyecto?company=${encodeURIComponent(cid)}&$select=No,Blocked&$top=1000`;
    let guard = 0;
    while (url && guard++ < 10) {
      const res = await bcFetch(url, { cache: "no-store" });
      if (!res.ok) return null;
      const data = (await res.json()) as { value?: { No?: string; Blocked?: string }[]; "@odata.nextLink"?: string };
      for (const j of (data.value ?? [])) {
        const no = String(j.No ?? "").trim();
        const b = String(j.Blocked ?? "").trim();
        if (no && b && b !== "_x0020_") out.add(no);
      }
      url = data["@odata.nextLink"] ?? null;
    }
    bloqueadasCache = { set: out, exp: Date.now() + 5 * 60_000 }; // 5 min, como el catálogo
    return out;
  } catch { return null; }
}

// Lista paginada de una API custom con path+query ya armados (incluye $filter).
// A diferencia de listAll (datos maestros, cache 5 min), aquí el caller decide
// el cache vía `opts` (p.ej. no-store para stock, que cambia con cada recepción).
async function listCustom(group: string, path: string, opts: RequestInit = { cache: "no-store" }): Promise<any[]> {
  const cid = await getCompanyId();
  let url: string | null = `${customRoot(group)}/companies(${cid})/${path}`;
  const out: any[] = [];
  let guard = 0;
  while (url && guard++ < 50) {
    const res = await bcFetch(url, opts);
    if (!res.ok) throw new Error(`BC ${res.status} en ${url}: ${(await res.text()).slice(0, 250)}`);
    const data: any = await res.json();
    out.push(...(data.value ?? []));
    url = data["@odata.nextLink"] ?? null;
  }
  return out;
}

// Escapa una comilla simple para un literal OData ('' = comilla dentro del string).
function odataStr(v: string): string {
  return v.replace(/'/g, "''");
}

// ─── UNIDADES DE MEDIDA DE UN ARTÍCULO ──────────────────────────────────────────
// Un material se CONSUME en una unidad y se COMPRA en otra: el adhesivo M06-0009 se
// consume en gramos (unidad base) pero se le compra al proveedor por estañón, y un
// estañón trae 255.000 gramos. Si la solicitud viaja en la unidad base, la orden le
// pide al proveedor "1 GR" con el precio del gramo: el documento sale 255.000 veces
// abajo (pasó el 21/08/2026).
//
// La lista REAL de unidades de un artículo vive en la API custom, entidad
// `itemUnitsOfMeasure` (campos camelCase: itemNo, code, qtyPerUnitOfMeasure). La
// unidad BASE es la que tiene factor 1. Ojo: la API NO soporta el operador `in`
// (501), así que se filtra con `or`.
//
// La `Purch. Unit of Measure` de la ficha NO sirve para detectar artículos
// multi-unidad: solo 1 de 5.500 la tiene distinta de la base. Sirve únicamente como
// default cuando el artículo sí tiene varias unidades.
export type BcUnidadItem = { code: string; factor: number };

type FilaUom = { itemNo?: string; ItemNo?: string; code?: string; Code?: string; qtyPerUnitOfMeasure?: number | string; QtyPerUnitOfMeasure?: number | string };
function mapUnidades(filas: FilaUom[]): Map<string, BcUnidadItem[]> {
  const out = new Map<string, BcUnidadItem[]>();
  for (const f of filas) {
    const item = (f.itemNo ?? f.ItemNo ?? "").toString().trim();
    const code = (f.code ?? f.Code ?? "").toString().trim();
    const factor = Number(f.qtyPerUnitOfMeasure ?? f.QtyPerUnitOfMeasure ?? 0);
    // Sin factor no se puede convertir, y convertir a ciegas es peor que no ofrecer
    // la unidad. (Hoy no hay ninguna fila así en el catálogo, pero es barato.)
    if (!item || !code || !(factor > 0)) continue;
    const lista = out.get(item) ?? [];
    if (!lista.some((u) => u.code === code)) lista.push({ code, factor });
    out.set(item, lista);
  }
  for (const lista of out.values()) lista.sort((a, b) => a.factor - b.factor || a.code.localeCompare(b.code));
  return out;
}

/** Unidades de UN artículo, con su factor respecto de la base. Lista vacía si el
 *  artículo no tiene ninguna cargada en BC (hay 14 así) o si BC falla. */
export async function bcUnidadesDeItem(itemNo: string): Promise<BcUnidadItem[]> {
  const code = (itemNo ?? "").trim();
  if (!code) return [];
  const filas = await listCustom("inventory", `itemUnitsOfMeasure?$filter=${encodeURIComponent(`itemNo eq '${odataStr(code)}'`)}`);
  return mapUnidades(filas).get(code) ?? [];
}

/** Unidades de VARIOS artículos (para validar antes de mandar la línea a BC). Se
 *  pide en tandas con `or`, igual que bcItemTipos. Si BC falla devuelve lo que haya:
 *  quien llama debe tratar "sin datos" como "no validar", no como "inválido". */
export async function bcUnidadesDeItems(codes: string[]): Promise<Map<string, BcUnidadItem[]>> {
  const unicos = [...new Set((codes ?? []).map((c) => (c ?? "").trim()).filter(Boolean))];
  const out = new Map<string, BcUnidadItem[]>();
  if (!unicos.length) return out;
  try {
    for (let i = 0; i < unicos.length; i += 15) {
      const filtro = unicos.slice(i, i + 15).map((c) => `itemNo eq '${odataStr(c)}'`).join(" or ");
      const filas = await listCustom("inventory", `itemUnitsOfMeasure?$filter=${encodeURIComponent(filtro)}`);
      for (const [item, lista] of mapUnidades(filas)) out.set(item, lista);
    }
  } catch (e) {
    console.warn("BC unidades por item falló; se manda la línea sin unidad:", e);
  }
  return out;
}

export type BcExistencia = { itemNo: string; variantCode: string; locationCode: string; descripcion: string; cantidad: number; unidad: string };

// Existencias (stock neto físico) por ubicación, vía la API custom Adelante
// `inventoryByLocation` (page 50236, grupo inventory). cantidad = quantityOnHand
// = SUM(Quantity) de TODOS los movimientos (inventario actual real). Fila por
// variante (PK = itemNo+variantCode+locationCode). Requiere al menos itemNo o
// locationCode (la API lo exige por performance). Convención: locationCode = N.º
// de obra, así que "existencias de una obra" = filtrar por su locationCode.
export async function bcExistencias(opts: { itemNo?: string; locationCode?: string }): Promise<BcExistencia[]> {
  const itemNo = (opts.itemNo ?? "").trim();
  const locationCode = (opts.locationCode ?? "").trim();
  if (!itemNo && !locationCode) throw new Error("Se requiere itemNo o locationCode para consultar existencias.");
  const conds: string[] = [];
  if (itemNo) conds.push(`itemNo eq '${odataStr(itemNo)}'`);
  if (locationCode) conds.push(`locationCode eq '${odataStr(locationCode)}'`);
  const rows = await listCustom("inventory", `inventoryByLocation?$filter=${encodeURIComponent(conds.join(" and "))}`);
  return rows.map((r) => ({
    itemNo: r.itemNo ?? r.ItemNo ?? "",
    variantCode: r.variantCode ?? r.VariantCode ?? "",
    locationCode: r.locationCode ?? r.LocationCode ?? "",
    descripcion: r.description ?? r.Description ?? "",
    cantidad: Number(r.quantityOnHand ?? r.QuantityOnHand ?? 0) || 0,
    unidad: r.unitOfMeasure ?? r.UnitOfMeasure ?? r.baseUnitOfMeasure ?? "",
  }));
}

export type BcJobTask = { jobNo: string; jobTaskNo: string; descripcion: string; tipo: string };

// Catálogo de tareas de obra (Job Task) vía la API custom Adelante `jobTasks`
// (page 50154, grupo project). Filtrable por jobNo. Datos relativamente estables:
// cache 5 min como el resto de maestros.
export async function bcJobTasks(jobNo?: string): Promise<BcJobTask[]> {
  const j = (jobNo ?? "").trim();
  const query = j ? `?$filter=${encodeURIComponent(`jobNo eq '${odataStr(j)}'`)}` : "";
  const rows = await listCustom("project", `jobTasks${query}`, { next: { revalidate: 300 } } as RequestInit);
  return rows.map((t) => ({
    jobNo: t.jobNo ?? t.JobNo ?? "",
    jobTaskNo: t.jobTaskNo ?? t.JobTaskNo ?? "",
    descripcion: t.description ?? t.Description ?? "",
    tipo: t.jobTaskType ?? t.JobTaskType ?? "",
  }));
}

export type BcItemCharge = { no: string; descripcion: string };

// Catálogo de Cargos de producto (Item Charge, tabla BC 5800): Transporte,
// Servicio de corte, Impuestos exterior, etc. Se usan al armar la orden para
// agregar líneas tipo "Cargo (Prod.)". Custom API Adelante (grupo purchasing).
// Defensiva: si aún no está publicada, devuelve [] (la UI cae a texto libre).
export async function bcItemCharges(): Promise<BcItemCharge[]> {
  try {
    const rows = await listCustom("purchasing", "itemCharges", { next: { revalidate: 300 } } as RequestInit);
    return rows
      .map((r) => ({ no: r.no ?? r.No ?? r.number ?? "", descripcion: r.description ?? r.Description ?? "" }))
      .filter((c) => c.no);
  } catch {
    return [];
  }
}

// Resuelve el TIPO (Item Charge) de un cargo, robusto ante clientes con bundle viejo:
//   1) el chargeNo que mandó el cliente (si viene);
//   2) si viene vacío, se DEDUCE por la descripción contra el catálogo de BC
//      (p.ej. "Transporte" -> "01"), porque la descripción del cargo se copia del
//      propio catálogo al elegir el tipo y SÍ se persiste;
//   3) fallback env (BC_ITEM_CHARGE_FLETE) por si acaso.
// Devuelve "" si no se pudo determinar (el llamador decide si aborta/omite).
export function resolverItemChargeNo(cargo: { chargeNo?: string; descripcion?: string }, catalogo: BcItemCharge[]): string {
  const directo = (cargo.chargeNo || "").trim();
  if (directo) return directo;
  const desc = (cargo.descripcion || "").trim().toLowerCase();
  if (desc) {
    const hit = catalogo.find((x) => (x.descripcion || "").trim().toLowerCase() === desc);
    if (hit?.no) return hit.no;
  }
  return (process.env.BC_ITEM_CHARGE_FLETE || "").trim();
}

// ─── ACTIVOS FIJOS ──────────────────────────────────────────────────────────────
// Catálogo de Activos Fijos de BC (AF-0001…) para las solicitudes de tipo "activo".
// Sale de la API ESTÁNDAR, no de la custom: la estándar trae además la CLASE
// (HERR / MAQ / VEH) y la subclase, que es como la gente los reconoce en la lista de
// BC, y el flag `blocked`. La custom (adelante/inventory/fixedAssets) solo da
// no/description/blocked, así que queda de respaldo por si la estándar no responde.
export type BcActivo = { no: string; descripcion: string; clase?: string; subclase?: string; ubicacion?: string; serie?: string };

export async function bcActivosFijos(): Promise<BcActivo[]> {
  const mapear = (r: any): BcActivo => ({
    no: r.number ?? r.no ?? r.No ?? "",
    descripcion: (r.displayName ?? r.description ?? r.Description ?? "").trim(),
    clase: (r.classCode ?? r.FAClassCode ?? "").toString().trim() || undefined,
    subclase: (r.subclassCode ?? "").toString().trim() || undefined,
    ubicacion: (r.fixedAssetLocationCode ?? "").toString().trim() || undefined,
    serie: (r.serialNumber ?? "").toString().trim() || undefined,
  });
  // Un activo BLOQUEADO en BC no admite movimientos: no se ofrece para comprar.
  const vivos = (rows: any[]) => rows.filter((r) => !(r.blocked ?? r.Blocked)).map(mapear).filter((a) => a.no);
  try {
    const cid = await getStdCompanyId();
    const out: any[] = [];
    let url: string | null = `${stdRoot()}/companies(${cid})/fixedAssets?$top=1000`;
    while (url) {
      const res: Response = await bcFetch(url, { next: { revalidate: 300 } } as RequestInit);
      if (!res.ok) throw new Error(`BC activos ${res.status}`);
      const d: any = await res.json();
      out.push(...(d.value ?? []));
      url = d["@odata.nextLink"] ?? null;
    }
    return vivos(out).sort((a, b) => a.no.localeCompare(b.no));
  } catch {
    // Respaldo: la API custom de Adelante (sin clase, pero con el N.º y la descripción).
    try { return vivos(await listCustom("inventory", "fixedAssets", { next: { revalidate: 300 } } as RequestInit)).sort((a, b) => a.no.localeCompare(b.no)); }
    catch { return []; }
  }
}

// ─── MÁQUINAS (parque de maquinaria) ───────────────────────────────────────────
// Catálogo de máquinas de BC (MAQ00005 "TRACTOR MASSEY FERGUSON MF6711"…): es la
// tabla GomEqp Machine de la extensión Goom Parque Maquinaria, la misma lista que
// sale en BC al elegir el "N.º máquina" de una línea de pedido. NO está en la API
// custom de Adelante ni en la estándar (es una tabla de un tercero), así que se lee
// por la página publicada `Maquinaria` (OData V4), que existe en Sandbox y en
// Production y no depende de la extensión AdelanteAPI.
export type BcMaquina = { no: string; nombre: string; placa?: string; activoFijo?: string };

// La página `Maquinaria` de BC es LENTA: devolver las 132 máquinas tarda ~60 s (la
// página trae flowfields de costos/ventas de la máquina y BC los calcula para cada
// fila, sin importar el $select). No es algo que se arregle desde acá, así que:
//   · el catálogo se guarda en memoria del proceso por 12 h (una máquina nueva del
//     parque no aparece al instante, y con eso no hay problema),
//   · las llamadas simultáneas comparten el MISMO fetch (el drawer dispara varias),
//   · vencido el plazo se devuelve la lista vieja y se refresca por detrás, así
//     nadie vuelve a esperar el minuto.
// Lo que sí lo arreglaría de raíz: una API page propia en la extensión de Adelante
// (grupo `inventory`, sin los flowfields), como se hizo con obras y almacenes.
const MAQUINAS_TTL_MS = 12 * 60 * 60 * 1000;
let maquinasCache: { rows: BcMaquina[]; exp: number } | null = null;
let maquinasEnVuelo: Promise<BcMaquina[]> | null = null;

async function bcMaquinasDeBc(): Promise<BcMaquina[]> {
  const cid = await getStdCompanyId();
  const campos = "No,Name,License_Plate,Cancellation_Date,Fixed_Asset_No";
  const out: BcMaquina[] = [];
  let url: string | null = `${odataRoot()}/Maquinaria?company=${encodeURIComponent(cid)}&$select=${campos}&$top=1000`;
  let guard = 0;
  while (url && guard++ < 10) {
    const res: Response = await bcFetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`BC máquinas ${res.status}`);
    const data = (await res.json()) as { value?: Record<string, unknown>[]; "@odata.nextLink"?: string };
    for (const m of data.value ?? []) {
      const no = String(m.No ?? "").trim();
      if (!no) continue;
      // Máquina DADA DE BAJA (fecha de cancelación puesta): no se le compran repuestos.
      // BC deja la fecha en 0001-01-01 cuando está vigente.
      const baja = String(m.Cancellation_Date ?? "").trim();
      if (baja && baja !== "0001-01-01") continue;
      out.push({
        no,
        nombre: String(m.Name ?? "").trim() || no,
        placa: String(m.License_Plate ?? "").trim() || undefined,
        activoFijo: String(m.Fixed_Asset_No ?? "").trim() || undefined,
      });
    }
    url = (data["@odata.nextLink"] as string | undefined) ?? null;
  }
  return out.sort((a, b) => a.no.localeCompare(b.no));
}

export async function bcMaquinas(): Promise<BcMaquina[]> {
  const ahora = Date.now();
  const refrescar = () => {
    if (!maquinasEnVuelo) {
      maquinasEnVuelo = bcMaquinasDeBc()
        .then((rows) => { if (rows.length) maquinasCache = { rows, exp: Date.now() + MAQUINAS_TTL_MS }; return rows; })
        .catch(() => maquinasCache?.rows ?? [])
        .finally(() => { maquinasEnVuelo = null; });
    }
    return maquinasEnVuelo;
  };
  // Lista vigente: se devuelve tal cual.
  if (maquinasCache && maquinasCache.exp > ahora) return maquinasCache.rows;
  // Vencida pero con datos: se devuelve la vieja y se refresca por detrás.
  if (maquinasCache) { void refrescar(); return maquinasCache.rows; }
  // Primera vez (o BC nunca respondió): toca esperar.
  return refrescar();
}

export type BcPostedReceiptLine = {
  documentNo: string;    // N.º de recepción registrada (albarán), p.ej. CR-000003
  lineNo: number;        // N.º de línea dentro de la recepción
  vendorNo: string;      // proveedor del material (Buy-from Vendor No.)
  itemNo: string;        // artículo recibido
  descripcion: string;
  locationCode: string;
  cantidad: number;      // cantidad recibida en la recepción
  precioUnitario: number;
  importe: number;       // importe de la línea (base del reparto "Por importe")
  pesoBruto: number;     // Gross Weight (base del reparto "Por peso")
  volumen: number;       // Unit Volume (base del reparto "Por volumen")
  /** Unidad del DOCUMENTO (EST, CUB…): la cantidad de arriba está en esta unidad.
   *  BC la devuelve y hasta ahora se descartaba, así que la pantalla mostraba "1"
   *  cuando en BC eso era "1 ESTAÑÓN" (255.000 gramos). */
  unidad: string;
  /** Cuántas unidades BASE trae esa unidad (qtyPerUnitOfMeasure) y la cantidad ya
   *  expresada en base (quantityBase), que es como se mueve el inventario. */
  factor: number;
  cantidadBase: number;
  /** Moneda del documento de la recepción. NO es necesariamente la del cargo que se
   *  le va a asignar: el material lo facturó su proveedor y el flete lo factura otro. */
  moneda: string;
  fecha: string;         // fecha de registro (posting date)
};

// Líneas de recepciones de compra YA REGISTRADAS (albaranes, tabla Purch. Rcpt.
// Line 121), para asignarles un Cargo de producto que factura un TERCERO (caso
// típico: el material lo facturó el proveedor, pero el transporte lo trajo y
// factura otra empresa). Custom API Adelante `postedReceiptLines` (grupo
// purchasing). Filtrable por proveedor del material, artículo y/o N.º de
// recepción; exige al menos un filtro (performance). Propaga el error para que
// el endpoint distinga "API no publicada" de "sin resultados".
export async function bcPostedReceiptLines(opts: { vendorNo?: string; itemNo?: string; documentNo?: string }): Promise<BcPostedReceiptLine[]> {
  const vendorNo = (opts.vendorNo ?? "").trim();
  const itemNo = (opts.itemNo ?? "").trim();
  const documentNo = (opts.documentNo ?? "").trim();
  if (!vendorNo && !itemNo && !documentNo) throw new Error("Se requiere proveedor, artículo o N.º de recepción para buscar líneas de recepción.");
  const conds: string[] = [];
  if (vendorNo) conds.push(`buyFromVendorNo eq '${odataStr(vendorNo)}'`);
  if (itemNo) conds.push(`no eq '${odataStr(itemNo)}'`);
  if (documentNo) conds.push(`documentNo eq '${odataStr(documentNo)}'`);
  const rows = await listCustom("purchasing", `postedReceiptLines?$filter=${encodeURIComponent(conds.join(" and "))}&$orderby=documentNo desc,lineNo`);
  return rows
    .map((r) => ({
      documentNo: r.documentNo ?? r.DocumentNo ?? "",
      lineNo: Number(r.lineNo ?? r.LineNo ?? 0) || 0,
      vendorNo: r.buyFromVendorNo ?? r.BuyFromVendorNo ?? r.vendorNo ?? "",
      itemNo: r.no ?? r.No ?? r.itemNo ?? "",
      descripcion: r.description ?? r.Description ?? "",
      locationCode: r.locationCode ?? r.LocationCode ?? "",
      cantidad: Number(r.quantity ?? r.Quantity ?? 0) || 0,
      precioUnitario: Number(r.directUnitCost ?? r.DirectUnitCost ?? 0) || 0,
      importe: Number(r.lineAmount ?? r.LineAmount ?? r.amount ?? r.Amount ?? 0) || 0,
      pesoBruto: Number(r.grossWeight ?? r.GrossWeight ?? 0) || 0,
      volumen: Number(r.unitVolume ?? r.UnitVolume ?? 0) || 0,
      unidad: (r.unitOfMeasureCode ?? r.UnitOfMeasureCode ?? "").toString().trim(),
      factor: Number(r.qtyPerUnitOfMeasure ?? r.QtyPerUnitOfMeasure ?? 0) || 0,
      cantidadBase: Number(r.quantityBase ?? r.QuantityBase ?? 0) || 0,
      moneda: (r.currencyCode ?? r.CurrencyCode ?? "").toString().trim(),
      fecha: r.postingDate ?? r.PostingDate ?? "",
    }))
    .filter((l) => l.documentNo && l.lineNo > 0);
}

// Almacenes/ubicaciones (tabla Location) por la API custom de Adelante
// (api/adelante/inventory/v1.0/locations, page 50234). Se usan para elegir el
// almacén de recepción al armar la orden. Cache de último bueno + fallback.
let lastGoodAlmacenes: BcAlmacen[] | null = null;
export async function bcAlmacenes(): Promise<BcAlmacen[]> {
  try {
    const rows = await listAll("inventory", "locations");
    const alm = rows
      .map((l) => ({ codigo: l.code ?? l.Code ?? "", nombre: l.name ?? l.Name ?? l.code ?? l.Code ?? "" }))
      .filter((a) => a.codigo);
    if (alm.length) lastGoodAlmacenes = alm;
    return alm;
  } catch {
    return lastGoodAlmacenes ?? [];
  }
}

export type BcVendor = { id: string; code: string; nombre: string; currencyCode: string };

// Proveedores (vendors) de BC por la API ESTÁNDAR v2.0 (la app tiene FULL ACCESS).
// Se cachean 5 min como dato maestro. code = number del proveedor (lo que va como vendorNo).
let lastGoodVendors: BcVendor[] | null = null;
export async function bcVendors(): Promise<BcVendor[]> {
 try {
  const cid = await getStdCompanyId();
  let url: string | null = `${stdRoot()}/companies(${cid})/vendors?$select=id,number,displayName,currencyCode&$top=5000`;
  const out: any[] = [];
  let guard = 0;
  while (url && guard++ < 50) {
    const res = await bcFetch(url, { next: { revalidate: 300 } } as RequestInit);
    if (!res.ok) throw new Error(`BC ${res.status} en vendors: ${(await res.text()).slice(0, 200)}`);
    const data: any = await res.json();
    out.push(...(data.value ?? []));
    url = data["@odata.nextLink"] ?? null;
  }
  const vendors = out
    .filter((v) => !(v.blocked && v.blocked !== "_x0020_" && v.blocked !== " "))
    .map((v) => ({
      id: v.id ?? v.number ?? "",
      code: v.number ?? "",
      nombre: v.displayName ?? v.number ?? "",
      currencyCode: v.currencyCode ?? "",
    }))
    .filter((v) => v.code);
  if (vendors.length) lastGoodVendors = vendors;
  return vendors;
 } catch (e) {
  if (lastGoodVendors) { console.warn("BC vendors falló; sirviendo último listado bueno cacheado."); return lastGoodVendors; }
  throw e;
 }
}

// Último precio con que se FACTURÓ un item a un proveedor, leído de las facturas
// de compra registradas en BC (API estándar v2.0). Revisa las facturas más
// recientes del proveedor y devuelve el precio de la línea de ese item.
// Devuelve null si no hay historial o si BC no responde (la UI cae al historial local).
/** OBSOLETA — no la use nadie para proponer precio.
 *
 *  (1) El `$select` pide `directUnitCost`, que NO existe en `purchaseInvoiceLine`: BC
 *  responde 400 y la función devolvía null SIEMPRE. Esta "fuente", que el código
 *  presentaba como la más precisa, nunca funcionó.
 *  (2) Corregido el $select sí devuelve el precio de compra real (unitCost × quantity =
 *  netAmount), pero en la MONEDA y la UNIDAD DEL DOCUMENTO: para M06-0009 son 969,91
 *  DÓLARES por ESTAÑÓN. Mezclarlo con las otras dos fuentes, que están en colones y por
 *  unidad base, exige convertir moneda y unidad — y equivocarse ahí son 456x y 255.000x.
 *  Comprobado: 969,91 USD × 456,16 (tipo de cambio del 29/05/2026) = ¢442.434,15, que es
 *  exactamente el costAmountActual de esa misma compra en `lastPurchasePrices`.
 *  Por eso el precio sale de `bcUltimaCompra`, que está en colones y por unidad base.
 *  Se deja el código como registro de lo que NO hay que volver a intentar. */
export async function bcUltimoPrecioFacturado(itemNo: string, vendorNo: string): Promise<number | null> {
  if (!itemNo || !vendorNo) return null;
  try {
    const cid = await getStdCompanyId();
    const filtro = `$filter=${encodeURIComponent(`vendorNumber eq '${vendorNo}'`)}`;
    const url =
      `${stdRoot()}/companies(${cid})/purchaseInvoices?${filtro}` +
      `&$orderby=invoiceDate desc&$top=20` +
      `&$expand=purchaseInvoiceLines($select=lineType,lineObjectNumber,directUnitCost,unitCost)`;
    const res = await bcFetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data: any = await res.json();
    for (const inv of (data.value ?? [])) {
      for (const l of (inv.purchaseInvoiceLines ?? [])) {
        if ((l.lineObjectNumber ?? "") === itemNo) {
          const precio = (typeof l.directUnitCost === "number" && l.directUnitCost > 0) ? l.directUnitCost
            : (typeof l.unitCost === "number" && l.unitCost > 0) ? l.unitCost : null;
          if (precio != null) return precio;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export type BcOrdenTotales = { subtotal: number; iva: number; total: number; currencyCode: string };

// Totales del Pedido de compra CALCULADOS POR BC (fuente de verdad): subtotal
// (excl. IVA, incluye cargos), IVA total y total con IVA. La app los MUESTRA tal
// cual para que la orden se vea igual que en BC (en vez de recalcular y desalinearse).
// Defensiva: null si BC no responde o el pedido no existe todavía.
export async function bcOrdenTotales(orderNo: string): Promise<BcOrdenTotales | null> {
  if (!orderNo) return null;
  try {
    const cid = await getStdCompanyId();
    const filtro = `$filter=${encodeURIComponent(`number eq '${odataStr(orderNo)}'`)}&$select=totalAmountExcludingTax,totalTaxAmount,totalAmountIncludingTax,currencyCode&$top=1`;
    const res = await bcFetch(`${stdRoot()}/companies(${cid})/purchaseOrders?${filtro}`, { cache: "no-store" });
    if (!res.ok) return null;
    const po = ((await res.json())?.value ?? [])[0];
    if (!po) return null;
    return {
      subtotal: Number(po.totalAmountExcludingTax) || 0,
      iva: Number(po.totalTaxAmount) || 0,
      total: Number(po.totalAmountIncludingTax) || 0,
      currencyCode: po.currencyCode || "",
    };
  } catch { return null; }
}

export type BcVariante = { code: string; descripcion: string; id?: string };

// Resultado de cargar variantes. `disponible=false` significa que NO se pudo
// consultar el catálogo de variantes (p.ej. la app no tiene permiso sobre la
// tabla Item Variant 5401, o la API no está publicada): en ese caso el form
// NO debe asumir "no tiene variantes", porque el item podría tener variante
// obligatoria y el pedido fallaría en BC.
export type BcVariantsResult = { variantes: BcVariante[]; disponible: boolean };

function mapVariantes(rows: any[]): BcVariante[] {
  return (rows ?? []).map((v: any) => ({
    code: v.code ?? v.Code ?? "",
    descripcion: v.description ?? v.Description ?? v.code ?? "",
    id: v.id ?? v.systemId ?? undefined,   // systemId (GUID), para itemVariantId al crear el pedido
  }));
}

// Variantes de un item. Intenta primero la API CUSTOM de Adelante
// (api/adelante/inventory/v1.0/.../itemVariants, page 50128) y, si esa falla,
// cae a la API ESTÁNDAR v2.0 (.../itemVariants). Solo se considera "no tiene
// variantes" cuando alguna de las dos responde OK con lista vacía. Si ambas
// fallan (401/permiso/no publicada), devuelve disponible=false.
const lastGoodVariants = new Map<string, BcVariantsResult>();
export async function bcVariantsEx(itemNo: string): Promise<BcVariantsResult> {
  if (!itemNo) return { variantes: [], disponible: true };
  const filtro = `$filter=itemNumber eq '${encodeURIComponent(itemNo)}'`;

  // 1) API custom de Adelante.
  try {
    const cid = await getCompanyId();
    const res = await bcFetch(`${customRoot("inventory")}/companies(${cid})/itemVariants?${filtro}`, { cache: "no-store" });
    if (res.ok) { const r = { variantes: mapVariantes((await res.json()).value), disponible: true }; lastGoodVariants.set(itemNo, r); return r; }
  } catch { /* intenta la estándar */ }

  // 2) Fallback: API estándar v2.0.
  try {
    const stdCid = await getStdCompanyId();
    const res = await bcFetch(`${stdRoot()}/companies(${stdCid})/itemVariants?${filtro}`, { cache: "no-store" });
    if (res.ok) { const r = { variantes: mapVariantes((await res.json()).value), disponible: true }; lastGoodVariants.set(itemNo, r); return r; }
  } catch { /* ambas fallaron */ }

  // Ambas fallaron (binding parpadeó): si tenemos un resultado bueno previo de este
  // item, lo servimos en vez de alarmar con disponible:false.
  const cached = lastGoodVariants.get(itemNo);
  if (cached) { console.warn(`BC variantes de ${itemNo} falló; sirviendo último resultado bueno cacheado.`); return cached; }
  return { variantes: [], disponible: false };
}

// Resuelve el código de variante de un item a su itemVariantId (systemId GUID),
// que es lo que exige la línea estándar de BC (igual que locationId). Cachea por
// item+code. Usa la API estándar de itemVariants (devuelve id).
const stdVariantIdCache: Record<string, string | null> = {};
async function getStdVariantId(itemNo: string, code: string): Promise<string | null> {
  if (!itemNo || !code) return null;
  const key = `${itemNo}|${code}`;
  if (key in stdVariantIdCache) return stdVariantIdCache[key];
  try {
    const cid = await getStdCompanyId();
    const filtro = `$filter=${encodeURIComponent(`itemNumber eq '${itemNo}' and code eq '${code}'`)}&$select=id,code`;
    const res = await bcFetch(`${stdRoot()}/companies(${cid})/itemVariants?${filtro}`, { cache: "no-store" });
    if (res.ok) {
      const id = ((await res.json()).value ?? [])[0]?.id ?? null;
      stdVariantIdCache[key] = id;
      return id;
    }
  } catch { /* no resoluble */ }
  stdVariantIdCache[key] = null;
  return null;
}

// ---- Escritura: crear Pedido de compra (Purchase Order) por la API ESTÁNDAR ----
export type NuevaLineaBc = { itemNo: string; cantidad: number; precio?: number; descripcion?: string; variantCode?: string; jobNo?: string; jobTaskNo?: string; jobLineType?: string; locationCode?: string;
  /** La línea compra un ACTIVO FIJO: en BC va como línea tipo "Activo fijo" y el
   *  `itemNo` es el N.º del activo (AF-0001), no un artículo. No lleva almacén ni
   *  variante: un activo no entra a inventario. */
  esActivo?: boolean;
  /** Unidad con la que se le pide al proveedor (EST, PQT…). Ver `unidadParaBc`: solo
   *  viaja a BC cuando NO es la unidad base del artículo. */
  unidad?: string;
  /** REPUESTO: N.º de la máquina a la que se le compra (GomEqp Machine No. de la línea). */
  machineNo?: string };

// La API estándar de purchaseOrderLine NO acepta `locationCode`; requiere
// `locationId` (el systemId GUID del almacén). Lo resolvemos por código contra
// la entidad /locations estándar y lo cacheamos por código.
const stdLocationIdCache: Record<string, string | null> = {};
async function getStdLocationId(cid: string, code: string): Promise<string | null> {
  if (!code) return null;
  if (code in stdLocationIdCache) return stdLocationIdCache[code];
  try {
    const filtro = `$filter=${encodeURIComponent(`code eq '${code}'`)}&$select=id,code`;
    const res = await bcFetch(`${stdRoot()}/companies(${cid})/locations?${filtro}`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      const id = (data.value ?? [])[0]?.id ?? null;
      stdLocationIdCache[code] = id;
      return id;
    }
  } catch { /* sin ubicación resoluble */ }
  stdLocationIdCache[code] = null;
  return null;
}

// Cargo de producto (Item Charge) a agregar al pedido: tipo (chargeNo del catálogo
// BC), cantidad y precio unitario. Sin chargeNo cae al flete por defecto (env).
export type CargoBc = { chargeNo?: string; descripcion?: string; cantidad?: number; precio: number };

// Consumo inmediato / Stock: setea Job No. + Job Task No. (+ Job Line Type) y/o Location
// Code por línea vía el codeunit custom AdelantePO_SetLineJob (la API estándar no expone
// esos campos, igual que los cargos). El body manda assignmentsJson como STRING JSON
// escapado (como PostInvoice), y el retorno `value` es a su vez un JSON string (doble
// parseo). Idempotente y no tumba por línea: devuelve { updated, errors }.
type AsignacionLineaBc = { lineNo: number; jobNo?: string; jobTaskNo?: string; jobLineType?: string; locationCode?: string;
  /** N.º de MÁQUINA de la línea (GomEqp Machine No.): es el repuesto que se le compra
   *  a esa máquina. El codeunit AdelantePO_SetLineJob no conoce el campo, así que
   *  siempre lo termina escribiendo el plan B (la página publicada). */
  machineNo?: string;
  /** BORRARLE el proyecto y la tarea a la línea (material que va a inventario, ver
   *  `bcQuitarObraDeLineas`). El codeunit no puede: solo escribe cuando el jobNo
   *  viene con valor. Lo hace la página publicada. */
  limpiarJob?: boolean;
  /** CENTRO DE COSTO (Shortcut Dimension 1) a escribirle a la línea. Último recurso de
   *  `bcQuitarObraDeLineas`, cuando revalidar el almacén no bastó. */
  cc?: string;
  /** Reescribirle a la línea el almacén que YA tiene, para forzar a BC a revalidarlo.
   *  No cambia el almacén (va el mismo código): lo que se busca es que BC vuelva a
   *  derivar las DIMENSIONES de la línea desde la dimensión por defecto del almacén.
   *  Así el centro de costo queda en el que ese almacén exige (ALM-GRAL → INV) sin que
   *  la app tenga que adivinar el valor. Ver `bcQuitarObraDeLineas`. */
  revalidarAlmacen?: string };
export async function bcSetLineJobs(orderNo: string, asignaciones: AsignacionLineaBc[]): Promise<{ updated: number; errors: string }> {
  if (!orderNo || !asignaciones.length) return { updated: 0, errors: "" };
  const cid = await getStdCompanyId();
  const url = `${odataRoot()}/AdelantePO_SetLineJob?company=${encodeURIComponent(cid)}`;
  const res = await bcFetch(url, {
    method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderNo, assignmentsJson: JSON.stringify(asignaciones) }),
  });
  if (!res.ok) throw new Error(`BC setLineJob ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const d: any = await res.json().catch(() => ({}));
  let inner: any = {};
  if (typeof d?.value === "string") { try { inner = JSON.parse(d.value); } catch { inner = {}; } }
  else if (d?.value && typeof d.value === "object") inner = d.value;
  return { updated: Number(inner?.updated ?? 0) || 0, errors: String(inner?.errors ?? "") };
}

// ─── Proyecto/tarea de la línea: verificar y, si hace falta, escribirlo directo ──
// Caso real del 21/08/2026 (CP-005132 en producción): el codeunit
// AdelantePO_SetLineJob contestó sin error, pero la línea quedó en BC con Job No. y
// Job Task No. VACÍOS. Como la app no lanza un pedido de consumo directo sin su obra
// (si no, el material entra a inventario en silencio — caso CP-003873), la orden se
// quedó pendiente. El mismo llamado SÍ aplica en Sandbox: la extensión "AdelanteAPI"
// está en 1.2.4.5 en Sandbox y en 1.2.4.4 en Production.
// Conclusión: no se le puede creer al "ok" del codeunit. Se LEE la línea en BC y, si
// el proyecto/tarea no quedó, se escribe por la página publicada
// Purchase_Order_Line_Excel (OData V4), que existe en los dos entornos y no depende
// de la extensión. Verificado contra Sandbox: borrar y poner Job No./Job Task No. por
// PATCH funciona (200) y queda.
type LineaJobBc = { lineNo: number; itemNo: string; jobNo: string; jobTaskNo: string; locationCode: string; machineNo: string;
  /** CENTRO DE COSTO de la línea = Shortcut Dimension 1 (así lo llama BC en el tooltip:
   *  "código de dimensión de acceso directo 1"). Es el campo que decide a quién se le
   *  carga el gasto, y el que BC valida contra la dimensión por defecto del almacén
   *  AL REGISTRAR (no al lanzar). Ver `bcQuitarObraDeLineas`. */
  cc: string;
  /** ÁREA DE COSTO = Shortcut Dimension 2. Se lee solo para poder decirlo en el aviso. */
  ac: string };

function paginaLineasUrl(cid: string, orderNo: string): string {
  const filtro = encodeURIComponent(`Document_No eq '${odataStr(orderNo)}'`);
  return `${odataRoot()}/Purchase_Order_Line_Excel?company=${encodeURIComponent(cid)}&$filter=${filtro}&$select=Document_No,Line_No,No,Job_No,Job_Task_No,Location_Code,GomEqp_Machine_No,Shortcut_Dimension_1_Code,Shortcut_Dimension_2_Code`;
}

/** Proyecto/tarea/almacén REALES de las líneas del pedido en BC. `null` = no se pudo leer. */
async function bcLineasJob(orderNo: string): Promise<LineaJobBc[] | null> {
  try {
    const cid = await getStdCompanyId();
    const res = await bcFetch(paginaLineasUrl(cid, orderNo), { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { value?: { Line_No?: number; No?: string; Job_No?: string; Job_Task_No?: string; Location_Code?: string; GomEqp_Machine_No?: string; Shortcut_Dimension_1_Code?: string; Shortcut_Dimension_2_Code?: string }[] };
    return (data.value ?? []).map((l) => ({
      lineNo: Number(l.Line_No ?? 0),
      itemNo: String(l.No ?? "").trim(),
      jobNo: String(l.Job_No ?? "").trim(),
      jobTaskNo: String(l.Job_Task_No ?? "").trim(),
      locationCode: String(l.Location_Code ?? "").trim(),
      machineNo: String(l.GomEqp_Machine_No ?? "").trim(),
      cc: String(l.Shortcut_Dimension_1_Code ?? "").trim(),
      ac: String(l.Shortcut_Dimension_2_Code ?? "").trim(),
    }));
  } catch { return null; }
}

/** Líneas que en BC llevan OBRA pero NO tarea. `null` = no se pudo leer (no concluir).
 *
 *  BC no lanza un pedido así ("Project Task No. must have a value in Purchase Line…")
 *  y el error crudo no dice qué hacer. Se lee ANTES del Release para poder avisar con
 *  la línea, el artículo y la obra.
 *
 *  Regla (25/08/2026, caso CP-005170 / orden CP-000057): si la línea lleva obra, lleva
 *  su TAREA. No se le quita el proyecto para salir del paso: el costo se iría a
 *  inventario en vez de a la partida de la obra. Quién mete el proyecto sin tarea:
 *  Proveeduría, que al enviar la orden a aprobación crea el pedido en BC y copia el
 *  campo `obra` de la línea a Job No. aunque la solicitud no tenga tarea (una solicitud
 *  de material "a inventario" NO debería llevar proyecto). */
export async function bcLineasProyectoSinTarea(orderNo: string): Promise<{ lineNo: number; itemNo: string; jobNo: string }[] | null> {
  const enBc = await bcLineasJob(orderNo);
  if (!enBc) return null;
  return enBc.filter((l) => l.jobNo && !l.jobTaskNo).map(({ lineNo, itemNo, jobNo }) => ({ lineNo, itemNo, jobNo }));
}

/** Texto para el usuario de las líneas con obra y sin tarea (para el toast y el
 *  historial de la orden). Sin el Nº de pedido: quien llama ya lo dice. */
export function mensajeProyectoSinTarea(lineas: { lineNo: number; itemNo: string; jobNo: string }[]): string {
  const detalle = lineas.map((l) => `línea ${l.lineNo}${l.itemNo ? ` (${l.itemNo})` : ""} · obra ${l.jobNo}`).join(" · ");
  return `hay ${lineas.length} línea(s) con obra y sin tarea (${detalle}). BC no lanza una línea con proyecto sin tarea: ponele la tarea (actividad) de la obra a esa línea y reintentá. Si el material no va contra la obra, quitale el proyecto al pedido.`;
}

/** Asignaciones que BC NO tiene puestas. `null` = no se pudo verificar (no concluir).
 *  `conMaquina` = si el N.º de máquina cuenta como faltante. Se mira al DECIDIR qué
 *  escribir, pero NO en la verificación final: el proyecto/tarea es lo que decide si
 *  el pedido se puede lanzar (sin eso el material entra a inventario en silencio),
 *  mientras que la máquina es un dato del gasto — si BC no la acepta se avisa en el
 *  log y el pedido igual se lanza, en vez de dejar la orden trabada. */
async function bcAsignacionesFaltantes(
  orderNo: string,
  asignaciones: AsignacionLineaBc[],
  conMaquina = true,
): Promise<AsignacionLineaBc[] | null> {
  const enBc = await bcLineasJob(orderNo);
  if (!enBc) return null;
  return asignaciones.filter((a) => {
    const l = enBc.find((x) => x.lineNo === a.lineNo);
    // Línea que no está en BC: solo es un problema si había que ponerle proyecto/almacén.
    if (!l) return conMaquina || !!a.jobNo || !!a.locationCode;
    if (a.jobNo && (l.jobNo !== a.jobNo || l.jobTaskNo !== (a.jobTaskNo ?? ""))) return true;
    if (a.locationCode && l.locationCode !== a.locationCode) return true;
    if (conMaquina && a.machineNo && l.machineNo !== a.machineNo) return true;
    return false;
  });
}

/** Escribe proyecto+tarea (y almacén) línea por línea con la página publicada. */
async function bcSetLineJobPagina(orderNo: string, asignaciones: AsignacionLineaBc[]): Promise<{ updated: number; errors: string }> {
  let updated = 0; let errors = "";
  const cid = await getStdCompanyId();
  for (const a of asignaciones) {
    const key = `Purchase_Order_Line_Excel(Document_Type='Order',Document_No='${odataStr(orderNo)}',Line_No=${a.lineNo})`;
    const body: Record<string, unknown> = {};
    // La TAREA va primero: BC aplica las propiedades en el orden del JSON y no
    // acepta una tarea sin su proyecto, así que se vacía antes de soltar el proyecto.
    if (a.limpiarJob) { body.Job_Task_No = ""; body.Job_No = ""; }
    else if (a.jobNo) { body.Job_No = a.jobNo; body.Job_Task_No = a.jobTaskNo ?? ""; }
    if (a.locationCode) body.Location_Code = a.locationCode;
    // Va DESPUÉS de soltar el proyecto, a propósito: BC aplica las propiedades en el
    // orden del JSON, así que cuando revalida el almacén ya no hay proyecto que le
    // gane al centro de costo por defecto del almacén.
    else if (a.revalidarAlmacen) body.Location_Code = a.revalidarAlmacen;
    // Va de último: si además hay que forzar el centro de costo, se escribe DESPUÉS de
    // que el almacén (y su dimensión por defecto) ya se aplicaron.
    if (a.cc) body.Shortcut_Dimension_1_Code = a.cc;
    // N.º máquina del repuesto: la línea de BC lo lleva en GomEqp_Machine_No. Es la
    // única vía desde la app — ni la API estándar ni el codeunit exponen el campo.
    if (a.machineNo) body.GomEqp_Machine_No = a.machineNo;
    if (!Object.keys(body).length) continue;
    try {
      const res = await bcFetch(`${odataRoot()}/${key}?company=${encodeURIComponent(cid)}`, {
        method: "PATCH", cache: "no-store",
        headers: { "Content-Type": "application/json", "If-Match": "*" },
        body: JSON.stringify(body),
      });
      if (res.ok) updated++;
      else if (!errors) errors = `línea ${a.lineNo}: BC ${res.status} ${mensajeBcLegible((await res.text()).slice(0, 400))}`;
    } catch (e: any) { if (!errors) errors = `línea ${a.lineNo}: ${String(e?.message ?? e)}`; }
  }
  return { updated, errors };
}

/** Aplica proyecto/tarea/almacén y CONFIRMA contra BC. Devuelve el motivo si al final
 *  no quedó (quien llama NO debe lanzar el pedido), o undefined si quedó bien. */
async function bcAplicarAsignaciones(orderNo: string, asignaciones: AsignacionLineaBc[]): Promise<string | undefined> {
  if (!asignaciones.length) return undefined;
  // 1) El codeunit sigue siendo el camino principal (es el que el dev de BC mantiene).
  //    Solo se le mandan las asignaciones CON proyecto: no conoce el N.º de máquina, y
  //    una asignación sin jobNo podría dejarle la línea sin proyecto. La máquina la
  //    escribe el plan B (la página publicada), que es la única vía para ese campo.
  const paraCodeunit = asignaciones.filter((a) => !!a.jobNo);
  let quejaCodeunit = "";
  if (paraCodeunit.length) {
    try {
      const r = await bcSetLineJobs(orderNo, paraCodeunit);
      if (r.errors) quejaCodeunit = r.errors;
    } catch (e: any) { quejaCodeunit = String(e?.message ?? e); }
  }
  // 2) Verificar en BC. Si no se puede leer, se respeta la respuesta del codeunit.
  const faltan = await bcAsignacionesFaltantes(orderNo, asignaciones);
  if (faltan === null) return quejaCodeunit || undefined;
  if (!faltan.length) return undefined; // quedó puesto (aunque el codeunit se haya quejado)
  // 3) Plan B: escribirlo directo en la línea y volver a verificar.
  const plan = await bcSetLineJobPagina(orderNo, faltan);
  // Verificación final: la máquina NO bloquea (ver bcAsignacionesFaltantes).
  const siguenFaltando = await bcAsignacionesFaltantes(orderNo, asignaciones, false);
  if (siguenFaltando && !siguenFaltando.length) {
    console.warn(`BC ${orderNo}: el codeunit no aplicó proyecto/tarea (${quejaCodeunit || "sin error, pero la línea quedó vacía"}); se completó escribiendo la línea directo (${plan.updated} línea(s)). Revisar la versión de la extensión AdelanteAPI en este entorno.`);
    return undefined;
  }
  const detalle = [quejaCodeunit || "el codeunit no aplicó nada", plan.errors].filter(Boolean).join(" · ");
  const lineas = (siguenFaltando ?? faltan).map((a) => a.lineNo).join(", ");
  return `${detalle} (líneas sin proyecto/tarea: ${lineas})`;
}

// ─── Emparejar las líneas de la app con las del pedido en BC ────────────────────
// Por N.º de línea (lo firme) y solo si el ARTÍCULO coincide; lo que no calce así se
// empareja por artículo, en orden. Sin la doble pasada, un pedido con el mismo
// artículo repetido (una línea a inventario y otra contra la obra) podía terminar
// escribiéndole la obra a la línea equivocada.
const claveBc = (n: string) => (n ?? "").trim().toUpperCase();

function emparejarLineasBc<T extends { lineNo?: number; itemNo: string }>(
  enBc: LineaJobBc[],
  items: T[],
): { linea: LineaJobBc; quiere: T }[] {
  const lineas = [...enBc].sort((a, b) => a.lineNo - b.lineNo);
  const usadas = new Set<number>();
  const pares: { linea: LineaJobBc; quiere: T }[] = [];
  const pendientesDeEmparejar: T[] = [];
  for (const q of items) {
    const l = q.lineNo ? lineas.find((x) => x.lineNo === q.lineNo && claveBc(x.itemNo) === claveBc(q.itemNo)) : undefined;
    if (l && !usadas.has(l.lineNo)) { usadas.add(l.lineNo); pares.push({ linea: l, quiere: q }); }
    else pendientesDeEmparejar.push(q);
  }
  for (const q of pendientesDeEmparejar) {
    const l = lineas.find((x) => !usadas.has(x.lineNo) && claveBc(x.itemNo) === claveBc(q.itemNo));
    if (l) { usadas.add(l.lineNo); pares.push({ linea: l, quiere: q }); }
  }
  return pares;
}

// ─── Tag ALM: la obra es control del ingeniero y NO viaja a BC ──────────────────
//
// POR QUÉ (03/09/2026, PED-000131 → CP-005293 y PED-000041 → CP-005375): con el tag ALM
// el material entra a INVENTARIO del almacén elegido y el gasto lo paga ESE almacén. La
// obra que el ingeniero puso en "Obras y materiales" es control suyo (para qué obra pidió
// el material), no un consumo contra el proyecto: eso solo pasa con el tag CD.
//
// Lo que llega mal a BC es el CENTRO DE COSTO de la línea (Shortcut Dimension 1). Dos
// caminos lo ensucian, y hay que cerrar los dos:
//   1. Proveeduría copia la obra al `Job No.` de la línea. Con el proyecto puesto BC le
//      PISA el centro de costo con el de la obra (regla del sistema: CC de una obra = su
//      N.º). Encima BC no lanza una línea con proyecto y sin tarea, y la salida a mano
//      —borrar el proyecto en BC— deja la DIMENSIÓN VIEJA pegada.
//   2. Aunque la línea quede sin proyecto, si el centro de costo ya trae la obra, ahí se
//      queda: nadie lo recalcula.
//
// Y el golpe llega tarde: BC valida la dimensión contra la que exige el almacén SOLO AL
// REGISTRAR, no al lanzar. Por eso CP-005375 se creó y se lanzó sin chistar, y el "no"
// apareció cuando Bodega fue a registrar la factura, con el material ya recibido:
// «el almacén ALM-GRAL obliga a que la dimensión CC sea INV, y la línea lleva VN-L.03».
//
// Qué hace esta función, antes del Release y solo con las líneas que la app sabe que van
// a inventario (la solicitud NO tiene tarea):
//   a. Le borra `Job No.` + `Job Task No.`.
//   b. Le reescribe el MISMO almacén que ya tiene. No es para cambiarle el almacén (ese
//      es de Proveeduría): es para que BC revalide el campo y vuelva a derivar las
//      dimensiones desde la dimensión por defecto de ese almacén. Así el centro de costo
//      queda en el que BC exige (ALM-GRAL → INV) SIN que la app tenga que adivinarlo —
//      no hay página publicada de "Dimensiones predeterminadas" para consultarlo.
//   c. Vuelve a LEER la línea y confirma que quedó sin obra y con un centro de costo que
//      ya no es la obra. Si sigue mal, NO se lanza: es exactamente el pedido que Bodega
//      no va a poder registrar después.
// ─── Qué CENTRO DE COSTO exige cada almacén ─────────────────────────────────────
// BC no publica las "Dimensiones predeterminadas" por ninguna API (ni la estándar, ni
// la custom, ni como página), así que la app no puede PREGUNTAR qué centro de costo
// exige un almacén. Pero BC lo contesta con los hechos: entre las líneas de pedido de
// compra de ese almacén que NO llevan proyecto, el centro de costo es el que puso su
// dimensión por defecto. Medido en Production: ALM-GRAL → INV en 302 de 302 líneas,
// MAQ → MAQ, ALM-SSO → ALM-SSO, F-MADERAS → F-MADERAS…
//
// Solo se devuelve el valor cuando es ABRUMADOR (≥90% de al menos 5 líneas). Con menos
// evidencia no se escribe nada: es preferible no lanzar el pedido a escribirle a
// contabilidad un centro de costo adivinado.
let ccPorAlmacenCache: { at: number; map: Map<string, string> } | null = null;
export async function bcCentroCostoPorAlmacen(): Promise<Map<string, string>> {
  if (ccPorAlmacenCache && Date.now() - ccPorAlmacenCache.at < 300_000) return ccPorAlmacenCache.map;
  const map = new Map<string, string>();
  try {
    const cid = await getStdCompanyId();
    const sel = "Line_No,No,Job_No,Location_Code,Shortcut_Dimension_1_Code";
    let url: string | null = `${odataRoot()}/Purchase_Order_Line_Excel?company=${encodeURIComponent(cid)}&$select=${sel}`;
    const conteo = new Map<string, Map<string, number>>();
    let guard = 0;
    while (url && guard++ < 60) {
      const res = await bcFetch(url, { next: { revalidate: 300 } } as RequestInit);
      if (!res.ok) return map;
      const data = (await res.json()) as { value?: { No?: string; Job_No?: string; Location_Code?: string; Shortcut_Dimension_1_Code?: string }[]; "@odata.nextLink"?: string };
      for (const l of (data.value ?? [])) {
        if (!String(l.No ?? "").trim()) continue;          // línea vacía / de texto
        if (String(l.Job_No ?? "").trim()) continue;       // con proyecto manda el proyecto
        const loc = String(l.Location_Code ?? "").trim();
        if (!loc) continue;
        const cc = String(l.Shortcut_Dimension_1_Code ?? "").trim();
        if (!cc) continue;
        if (!conteo.has(loc)) conteo.set(loc, new Map());
        const m = conteo.get(loc)!;
        m.set(cc, (m.get(cc) ?? 0) + 1);
      }
      url = data["@odata.nextLink"] ?? null;
    }
    for (const [loc, m] of conteo) {
      const total = [...m.values()].reduce((a, b) => a + b, 0);
      const [cc, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
      if (total >= 5 && n / total >= 0.9) map.set(loc.toUpperCase(), cc);
    }
    ccPorAlmacenCache = { at: Date.now(), map };
    return map;
  } catch (e) {
    console.warn("BC: no se pudo deducir el centro de costo de cada almacén.", e);
    return ccPorAlmacenCache?.map ?? map;
  }
}

export type LineaAlmacenBc = { lineNo?: number; itemNo: string;
  /** Obra que el ingeniero puso en la solicitud (control interno). Se manda para poder
   *  reconocer el centro de costo malo aunque la línea ya no tenga proyecto. */
  obra?: string };

export type PendienteObraBc = { lineNo: number; itemNo: string; motivo: string };

export async function bcQuitarObraDeLineas(
  orderNo: string,
  alm: LineaAlmacenBc[],
): Promise<{ limpiadas: { lineNo: number; itemNo: string; jobNo: string; cc: string }[]; pendientes: PendienteObraBc[]; error?: string }> {
  const items = (alm ?? []).filter((l) => l.itemNo);
  if (!orderNo || !items.length) return { limpiadas: [], pendientes: [] };
  const enBc = await bcLineasJob(orderNo);
  // No se pudo LEER el pedido: no hay nada que afirmar. No se bloquea por esto (el
  // pre-vuelo de "obra sin tarea" tampoco concluye si no puede leer), pero se avisa.
  if (!enBc) return { limpiadas: [], pendientes: [], error: `no se pudieron leer las líneas de ${orderNo} en BC para quitarles la obra` };

  // Línea sucia = tiene proyecto/tarea, o su centro de costo ES la obra de la solicitud.
  const sucia = (linea: LineaJobBc, obra?: string) =>
    !!(linea.jobNo || linea.jobTaskNo) || !!(obra && claveBc(linea.cc) === claveBc(obra));
  const conObra = emparejarLineasBc(enBc, items).filter(({ linea, quiere }) => sucia(linea, quiere.obra));
  if (!conObra.length) return { limpiadas: [], pendientes: [] };
  const fallo = (motivo: string) => conObra.map(({ linea }) => ({ lineNo: linea.lineNo, itemNo: linea.itemNo, motivo }));

  const est = await bcEstadoPedido(orderNo);
  // YA LANZADO en BC: no hay nada que hacer acá y tampoco se puede — BC no deja tocar
  // las líneas de un pedido liberado. Se sale sin pendientes para que quien llama siga
  // su camino normal y termine contestando "ya estaba lanzado" en vez de un error. Pasa
  // con el botón "Reintentar lanzar en BC" sobre una orden que alguien ya liberó.
  if (est.lanzado) return { limpiadas: [], pendientes: [] };
  // Igual que al escribir la tarea del consumo directo: con el workflow de aprobación
  // de BC activo el pedido está "Pendiente de aprobación" y allá no se pueden tocar
  // líneas ("Status must be equal to 'Open'"). Reabrirlo cancela la solicitud viva; el
  // Release que viene enseguida la vuelve a mandar y a aprobar en el mismo paso.
  if (est.enAprobacion) {
    try { await bcReabrirPedido(orderNo); }
    catch (e) {
      const detalle = String((e as Error)?.message ?? e);
      return { limpiadas: [], pendientes: fallo(`el pedido está pendiente de aprobación en BC y no se pudo reabrir para quitarle la obra: ${detalle}`), error: detalle };
    }
  }

  const plan = await bcSetLineJobPagina(orderNo, conObra.map(({ linea }) => ({
    lineNo: linea.lineNo, limpiarJob: true,
    // Sin almacén (servicio / no inventariable) no hay nada que revalidar.
    revalidarAlmacen: linea.locationCode || undefined,
  })));
  // Se VERIFICA contra BC: no se le cree al 200 del PATCH (misma lección que dejó
  // CP-005132 con el codeunit).
  const despues = await bcLineasJob(orderNo);
  if (!despues) return { limpiadas: [], pendientes: fallo("no se pudo verificar en BC que la línea quedara sin obra"), error: plan.errors || undefined };

  // ¿Cómo quedó cada línea? Sigue MAL si conserva el proyecto, o si su centro de costo
  // todavía es la obra — que es el caso de Proveeduría: escribe la DIMENSIÓN directo y
  // sin proyecto (CP-005377), y ahí soltar el proyecto no cambia nada porque no hay.
  const malProyecto = (d?: LineaJobBc) => !!(d && (d.jobNo || d.jobTaskNo));
  const malCC = (d: LineaJobBc | undefined, obra?: string) => !!(d && obra && claveBc(d.cc) === claveBc(obra));

  // ÚLTIMO RECURSO: a las que quedaron con el centro de costo de la obra se les escribe
  // el que ese almacén exige, deducido de los propios pedidos de BC (ver
  // `bcCentroCostoPorAlmacen`). Se hace solo acá, después de intentar lo limpio —soltar
  // el proyecto y dejar que BC re-derive— y solo si BC responde algo contundente para
  // ese almacén; si no, se prefiere no lanzar antes que inventar un centro de costo.
  let ultima = despues;
  const forzar = conObra
    .map(({ linea, quiere }) => ({ quiere, d: despues.find((x) => x.lineNo === linea.lineNo) }))
    .filter(({ d, quiere }) => !malProyecto(d) && malCC(d, quiere.obra));
  if (forzar.length) {
    const ccAlmacen = await bcCentroCostoPorAlmacen();
    const asignaciones = forzar
      .map(({ d }) => ({ lineNo: d!.lineNo, cc: ccAlmacen.get((d!.locationCode || "").toUpperCase()) }))
      .filter((a): a is { lineNo: number; cc: string } => !!a.cc);
    if (asignaciones.length) {
      const plan2 = await bcSetLineJobPagina(orderNo, asignaciones);
      if (plan2.errors) console.warn(`BC ${orderNo}: no se pudo forzar el centro de costo del almacén: ${plan2.errors}`);
      ultima = (await bcLineasJob(orderNo)) ?? despues;
    }
  }

  const limpiadas: { lineNo: number; itemNo: string; jobNo: string; cc: string }[] = [];
  const pendientes: PendienteObraBc[] = [];
  for (const { linea, quiere } of conObra) {
    const d = ultima.find((x) => x.lineNo === linea.lineNo);
    if (malProyecto(d)) {
      pendientes.push({ lineNo: linea.lineNo, itemNo: linea.itemNo, motivo: `en BC sigue contra la obra ${d!.jobNo || linea.jobNo}` });
    } else if (malCC(d, quiere.obra)) {
      // Lo grave: sin proyecto pero con el centro de costo de la obra. BC lo va a
      // rechazar cuando Bodega registre la factura, no ahora.
      pendientes.push({ lineNo: linea.lineNo, itemNo: linea.itemNo, motivo: `su centro de costo sigue siendo la obra ${d!.cc}${d!.locationCode ? ` y el almacén es ${d!.locationCode}` : ""}` });
    } else {
      limpiadas.push({ lineNo: linea.lineNo, itemNo: linea.itemNo, jobNo: linea.jobNo, cc: d?.cc ?? "" });
    }
  }
  return { limpiadas, pendientes, error: pendientes.length ? (plan.errors || undefined) : undefined };
}

/** Texto para el usuario de las líneas de almacén que siguen con la obra en BC. */
export function mensajeObraNoQuitada(pendientes: PendienteObraBc[]): string {
  const detalle = pendientes.map((p) => `línea ${p.lineNo || "?"}${p.itemNo ? ` (${p.itemNo})` : ""}: ${p.motivo}`).join(" · ");
  return `${pendientes.length} línea(s) de material a ALMACÉN siguen con la obra en Business Central (${detalle}). NO se lanzó el pedido a propósito: BC valida el centro de costo contra el que exige el almacén SOLO al registrar la factura, así que si esto pasa, el pedido se lanza, el material llega y Bodega no puede registrar nada. Arreglalo en BC —quitale el N.º proyecto a la línea y ponele en Centro de Costo el que el almacén exige— y reintentá. Si la compra SÍ va contra la obra, la solicitud tiene que pedirse como consumo directo, con su actividad.`;
}

// ─── Consumo directo: completar el proyecto/tarea que la app SÍ conoce ──────────
//
// POR QUÉ (caso 25/08/2026): Proveeduría crea el pedido en BC copiando la obra al
// `Job No.` (o al almacén) pero NUNCA la tarea, porque no la tiene. BC entonces
// rechaza el Release con "Project Task No. must have a value…" y la salida fácil es
// borrarle el proyecto a la línea en BC — con eso el pedido lanza, pero el material
// entra a INVENTARIO en la ubicación de la obra en vez de consumirse contra la
// partida (pasó con CP-005182, CP-005183 y CP-005132).
//
// La app sí sabe la tarea: viene de la solicitud de Ingeniería. Así que antes de
// lanzar se la escribe a BC. Reglas, todas para no romper nada de lo que ya hay allá:
//   · Solo `Job No.` + `Job Task No.` (+ Job Line Type "None", igual que al crear el
//     pedido: con "Budget" BC infla el presupuesto de la obra con cada compra). El
//     ALMACÉN no se toca — es de Proveeduría y pisarlo fue el problema que arregló
//     el cambio de "aprobar es lanzar, no reescribir" (ver aprobar.ts).
//   · Se emparejan las líneas por N.º de línea, y solo si el ARTÍCULO coincide. Sin
//     eso, un pedido con el mismo artículo repetido (una línea a inventario y otra
//     contra la obra) podía terminar cargándole la obra a la línea equivocada.
//   · Si la línea en BC ya tiene tarea, no se le toca: alguien la puso a mano.
//   · Si en BC la línea tiene OTRA obra que la de la app, tampoco: repuntar el costo
//     a otra obra en silencio es peor que no lanzar. Sale como pendiente y quien
//     aprueba se entera.
// `pendientes` son las líneas de consumo directo que, después de intentarlo, siguen
// SIN obra+tarea en BC: quien llama NO debe lanzar el pedido si hay alguna.
export type LineaConsumoBc = { lineNo?: number; itemNo: string; jobNo: string; jobTaskNo: string; machineNo?: string };
export type PendienteConsumoBc = { lineNo: number; itemNo: string; motivo: string };

export async function bcCompletarProyectoTarea(
  orderNo: string,
  cd: LineaConsumoBc[],
): Promise<{ aplicadas: number; pendientes: PendienteConsumoBc[]; error?: string }> {
  // Se atienden las líneas con proyecto+tarea y también las que solo traen MÁQUINA
  // (repuesto): el N.º máquina es un campo aparte y hay que dejarlo puesto igual.
  const items = (cd ?? []).filter((l) => l.itemNo && ((l.jobNo && l.jobTaskNo) || l.machineNo));
  if (!orderNo || !items.length) return { aplicadas: 0, pendientes: [] };
  const enBc = await bcLineasJob(orderNo);
  // No se pudo LEER el pedido: no se puede afirmar que las líneas estén bien, y
  // lanzar a ciegas es justo lo que manda el material a inventario sin su obra.
  if (!enBc) return { aplicadas: 0, pendientes: [], error: `no se pudieron leer las líneas de ${orderNo} en BC para verificar el consumo directo` };

  const lineas = [...enBc].sort((a, b) => a.lineNo - b.lineNo);
  const pares = emparejarLineasBc(enBc, items);

  const asignaciones: AsignacionLineaBc[] = [];
  const pendientes: PendienteConsumoBc[] = [];
  for (const { linea, quiere } of pares) {
    // Ya tiene tarea en BC: alguien la puso a mano y no se toca. Ojo: si además falta
    // la MÁQUINA (repuesto), sí se escribe — es un campo aparte y no repunta costos.
    if (linea.jobTaskNo && (!quiere.machineNo || linea.machineNo === quiere.machineNo)) continue;
    if (linea.jobTaskNo) { asignaciones.push({ lineNo: linea.lineNo, machineNo: quiere.machineNo }); continue; }
    if (quiere.jobNo && linea.jobNo && claveBc(linea.jobNo) !== claveBc(quiere.jobNo)) {
      pendientes.push({ lineNo: linea.lineNo, itemNo: linea.itemNo, motivo: `en BC está contra la obra ${linea.jobNo} y la solicitud dice ${quiere.jobNo}: no se toca desde acá` });
      continue;
    }
    asignaciones.push({
      lineNo: linea.lineNo,
      jobNo: quiere.jobNo || undefined, jobTaskNo: quiere.jobNo ? quiere.jobTaskNo : undefined,
      jobLineType: quiere.jobNo ? "None" : undefined,
      machineNo: quiere.machineNo || undefined,
    });
  }
  // Líneas de consumo directo de la app que ni siquiera están en el pedido de BC.
  for (const q of items) {
    if (pares.some((p) => p.quiere === q)) continue;
    pendientes.push({ lineNo: q.lineNo ?? 0, itemNo: q.itemNo, motivo: `la línea del artículo ${q.itemNo} no aparece en el pedido de BC` });
  }
  if (!asignaciones.length) return { aplicadas: 0, pendientes };

  // Con el workflow de aprobación de BC activo (MS-POAPW-01/02) el pedido espera
  // "Pendiente de aprobación", y BC no deja tocar líneas en ese estado ("Status must
  // be equal to 'Open'"). Reabrirlo cancela la solicitud y permite escribir la tarea;
  // el Release que viene justo después la vuelve a mandar Y la aprueba en el mismo
  // paso (AdelantePO_ReleaseOrder), así que el rastro de aprobación no se pierde.
  const est = await bcEstadoPedido(orderNo);
  if (est.enAprobacion) {
    try { await bcReabrirPedido(orderNo); }
    catch (e) {
      return { aplicadas: 0, pendientes, error: `el pedido está pendiente de aprobación en BC y no se pudo reabrir para ponerle la tarea del consumo directo: ${String((e as Error)?.message ?? e)}` };
    }
  }

  const error = await bcAplicarAsignaciones(orderNo, asignaciones);
  if (error) {
    for (const a of asignaciones) pendientes.push({ lineNo: a.lineNo, itemNo: lineas.find((l) => l.lineNo === a.lineNo)?.itemNo ?? "", motivo: "BC no aceptó el proyecto/tarea" });
    return { aplicadas: 0, pendientes, error };
  }
  return { aplicadas: asignaciones.length, pendientes };
}

/** Texto para el usuario de las líneas de consumo directo que quedaron sin obra+tarea. */
export function mensajeConsumoIncompleto(pendientes: PendienteConsumoBc[]): string {
  const detalle = pendientes.map((p) => `línea ${p.lineNo || "?"}${p.itemNo ? ` (${p.itemNo})` : ""}: ${p.motivo}`).join(" · ");
  return `${pendientes.length} línea(s) de consumo directo se quedaron sin obra y tarea en BC (${detalle}). No se lanzó el pedido: así el material entraría a inventario en vez de cargarse a la obra. Arreglalo en BC (o quitale el consumo directo a la solicitud) y reintentá.`;
}

/** De una lista de artículos, cuáles TIENEN variantes en BC. `null` = no se pudo saber.
 *  Se usa como guard al crear el pedido: si el artículo tiene variantes hay que mandar
 *  cuál, si no BC rechaza el lanzamiento ("Variant Code must have a value in Purchase
 *  Line"). Comprobado en producción: de 76 líneas de artículos con variantes, las 72
 *  que llevan variante están lanzadas y las 4 que no, quedaron trabadas. */
export async function bcItemsConVariantes(codes: string[]): Promise<Set<string> | null> {
  const unicos = [...new Set((codes ?? []).map((c) => (c ?? "").trim()).filter(Boolean))];
  if (!unicos.length) return new Set();
  try {
    const cid = await getStdCompanyId();
    const out = new Set<string>();
    for (let i = 0; i < unicos.length; i += 15) {
      const filtro = unicos.slice(i, i + 15).map((c) => `itemNumber eq '${odataStr(c)}'`).join(" or ");
      const res = await bcFetch(`${stdRoot()}/companies(${cid})/itemVariants?$select=itemNumber&$filter=${encodeURIComponent(filtro)}&$top=500`, { cache: "no-store" });
      if (!res.ok) return null;
      const data = (await res.json()) as { value?: { itemNumber?: string }[] };
      for (const v of (data.value ?? [])) { const n = String(v.itemNumber ?? "").trim(); if (n) out.add(n); }
    }
    return out;
  } catch { return null; }
}

export async function bcCrearPedido(input: { vendorNo: string; currencyCode?: string; locationCode?: string; lineas: NuevaLineaBc[]; cargos?: CargoBc[]; flete?: { monto: number; descripcion?: string } }): Promise<{ number: string; id: string; omitidas: string[]; creadas: number; lineError?: string; cargoError?: string; cargosCreados: number; jobError?: string }> {
  if (!input?.vendorNo) throw new Error("Falta el proveedor (vendorNo).");
  const lineas = (input.lineas ?? []).filter((l) => l.itemNo && l.cantidad > 0);
  if (!lineas.length) throw new Error("No hay líneas de material válidas para el pedido.");
  // GUARD (antes de tocar BC): TODO cargo con importe debe tener su tipo (Item Charge).
  // El tipo se resuelve por chargeNo directo o, si falta, por la descripción contra el
  // catálogo de BC (recupera el tipo aunque el cliente traiga un bundle viejo). Si aun
  // así no se determina, abortamos SIN crear nada en BC (la orden no queda a medias).
  const cargosEfectivos: CargoBc[] = (input.cargos && input.cargos.length)
    ? input.cargos
    : (input.flete && input.flete.monto > 0 ? [{ descripcion: input.flete.descripcion, cantidad: 1, precio: input.flete.monto }] : []);
  const catalogoCargos = cargosEfectivos.some((c) => c.precio > 0) ? await bcItemCharges() : [];
  if (cargosEfectivos.some((c) => c.precio > 0 && !resolverItemChargeNo(c, catalogoCargos))) {
    throw new Error("El cargo no tiene tipo (Item Charge) y no se pudo deducir por la descripción. Elegí el tipo de cargo en Proveeduría y reintentá.");
  }
  // GUARD (antes de tocar BC): OBRA BLOQUEADA. Si el proyecto está bloqueado, BC no deja
  // ponerlo en la línea ("Project X must not be blocked with type All") y el pedido queda
  // creado y sin poder lanzarse nunca — es lo que pasó con CP-005132 (obra VN-K.26).
  // Mejor no crear nada y decir el motivo.
  const obrasPedido = [...new Set(lineas.map((l) => (l.jobNo ?? "").trim()).filter(Boolean))];
  if (obrasPedido.length) {
    const bloqueadas = await bcObrasBloqueadas();
    const chocan = bloqueadas ? obrasPedido.filter((o) => bloqueadas.has(o)) : [];
    if (chocan.length) {
      throw new Error(`La obra ${chocan.join(", ")} está BLOQUEADA en Business Central, así que no se le puede cargar material. Desbloqueala en BC o pedí el material contra otra obra. (No se creó nada en BC.)`);
    }
  }
  // GUARD (antes de tocar BC): VARIANTE FALTANTE. Si el artículo tiene variantes, BC
  // exige cuál en la línea; sin ella el pedido se crea y no se puede lanzar nunca.
  const sinVariante = lineas.filter((l) => !(l.variantCode ?? "").trim()).map((l) => l.itemNo);
  if (sinVariante.length) {
    const conVariantes = await bcItemsConVariantes(sinVariante);
    const faltan = conVariantes ? [...new Set(sinVariante.filter((i) => conVariantes.has(i)))] : [];
    if (faltan.length) {
      throw new Error(`El artículo ${faltan.join(", ")} tiene variantes en Business Central y la orden no dice cuál. Elegí la variante en la orden (proveeduría) y reintentá. (No se creó nada en BC.)`);
    }
  }
  const cid = await getStdCompanyId(); // MISMA compañía que items/vendors (API estándar)
  const jsonHeaders = { "Content-Type": "application/json" };

  // 1) Encabezado: proveedor (+ moneda si no es CRC).
  const headerBody: Record<string, unknown> = { vendorNumber: input.vendorNo };
  const cur = (input.currencyCode ?? "").toUpperCase();
  if (cur && cur !== "CRC") headerBody.currencyCode = cur;
  const resH = await bcFetch(`${stdRoot()}/companies(${cid})/purchaseOrders`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(headerBody), cache: "no-store" });
  if (!resH.ok) throw new Error(`BC ${resH.status} al crear el pedido: ${(await resH.text()).slice(0, 300)}`);
  const po: any = await resH.json();

  // 2) Líneas: una por material (tipo Artículo). Si una línea falla, la OMITIMOS y
  // seguimos, pero GUARDAMOS el motivo real de BC (antes se descartaba y quedaba a
  // ciegas por qué no se agregaban las líneas). Devolvemos omitidas + primer error.
  const omitidas: string[] = [];
  let lineError: string | undefined;
  let cargoError: string | undefined;
  let cargosCreados = 0;
  let creadas = 0;
  // Almacén de recepción POR LÍNEA. Regla del negocio (BC):
  //   · Consumo inmediato → N.º proyecto + N.º tarea + el almacén DE LA OBRA (en BC el
  //     almacén de una obra tiene el MISMO código que el proyecto). BC exige almacén en
  //     las líneas de artículo inventariable: sin él el Release falla con "Location Code
  //     must have a value" (pasó con CP-003876). Y el almacén NO impide el consumo: al
  //     registrar, BC genera el par Purchase + Negative Adjmt. en ese almacén (neto 0)
  //     y el Job Ledger Entry de uso contra la tarea. Comprobado en BC: 91 de 97 líneas
  //     de compra con proyecto llevan almacén = proyecto, y los consumos históricos por
  //     compra están todos en el almacén de la obra (ninguno en ALM-GRAL).
  //   · Stock → almacén (el de la línea, el de la orden o el de env) y ningún proyecto.
  // La línea estándar de BC requiere el GUID (locationId), no el código.
  const locFallback = input.locationCode || process.env.BC_RECEPCION_LOCATION || "";
  const esConsumo = (l: NuevaLineaBc) => !!(l.jobNo && l.jobTaskNo); // consumo requiere ambos
  // SERVICIO / NO INVENTARIABLE: en BC esas líneas no llevan almacén (el campo no es
  // editable y el Release falla). El catálogo de los buscadores trae los tres tipos,
  // así que acá se consulta el tipo y se les manda la línea SIN almacén; el proyecto
  // + la tarea sí se les pone (el consumo contra la obra se registra igual).
  const fichasItem = await bcItemFichas(lineas.filter((l) => !l.esActivo).map((l) => l.itemNo));
  const tiposItem = new Map([...fichasItem].map(([no, f]) => [no, f.tipo] as const));
  // Un ACTIVO FIJO tampoco lleva almacén: no entra a inventario (el campo ni siquiera
  // es editable en una línea tipo Activo fijo y el Release fallaría).
  const sinAlmacen = (l: NuevaLineaBc) => !!l.esActivo || (tiposItem.get(l.itemNo) ?? "inventario") !== "inventario";
  // UNIDAD de la línea. Si no se la mandamos, BC NO usa la unidad base: usa la
  // `Purch. Unit of Measure` del artículo. Comprobado en el Sandbox con M06-0009 (base
  // GR, compra EST): la misma línea, con y sin unidad en el POST, queda en EST. O sea
  // que una solicitud de "255.000 GR" terminaba pidiéndole al proveedor 255.000
  // ESTAÑONES. Por eso la unidad que eligió la persona viaja SIEMPRE.
  // Único filtro: que el código exista para ese artículo en BC. Hay líneas históricas
  // con unidades que salieron del catálogo de respaldo (SACO, ROLLO) y BC rechazaría
  // la línea entera; esas se mandan sin unidad, como hasta ahora.
  const unidadesItem = await bcUnidadesDeItems(
    lineas.filter((l) => (l.unidad ?? "").trim()).map((l) => l.itemNo),
  );
  const unidadParaBc = (l: NuevaLineaBc): string => {
    const code = (l.unidad ?? "").trim();
    if (!code) return "";
    const lista = unidadesItem.get(l.itemNo);
    if (!lista || !lista.length) return "";                       // sin datos: no se inventa
    const match = lista.find((u) => u.code.toUpperCase() === code.toUpperCase());
    return match ? match.code : "";
  };
  // ¿La descripción la manda la APP o la ficha del artículo de BC? Solo los que no
  // son de inventario (servicio / no inventariable) llevan la de la app.
  const descripcionPropia = (l: NuevaLineaBc) => !l.esActivo && !!(l.descripcion ?? "").trim() && sinAlmacen(l);
  const almacenDe = (l: NuevaLineaBc) => (sinAlmacen(l) ? "" : esConsumo(l) ? (l.locationCode || l.jobNo!) : (l.locationCode || locFallback));
  // Se resuelven ANTES de crear nada en BC: si a una línea de consumo le falta el
  // almacén de su obra, abortamos sin dejar un pedido a medias en BC (y NUNCA se cae a
  // ALM-GRAL: mandaría a la bodega central material que no pasa por ahí).
  const locIds = new Map<string, string | null>();
  for (const l of lineas) {
    const code = almacenDe(l);
    if (code && !locIds.has(code)) locIds.set(code, await getStdLocationId(cid, code));
    if (esConsumo(l) && !sinAlmacen(l) && !locIds.get(code)) {
      throw new Error(`Consumo inmediato: la obra ${l.jobNo} no tiene almacén propio en Business Central (se buscó el código "${code}"). Creá el almacén de la obra en BC, o pedí el material a inventario.`);
    }
  }
  const asignaciones: AsignacionLineaBc[] = [];
  for (const l of lineas) {
    const consumo = esConsumo(l);
    const locCode = almacenDe(l);
    const locId = locCode ? locIds.get(locCode) ?? null : null;
    // Un activo fijo va como línea tipo "Activo fijo" (enum purchaseLineType de BC) y
    // su `lineObjectNumber` es el N.º del activo (AF-0001), no un artículo.
    const lineBody: Record<string, unknown> = { lineType: l.esActivo ? "Fixed Asset" : "Item", lineObjectNumber: l.itemNo, quantity: l.cantidad };
    // La unidad va ANTES del precio a propósito: BC aplica las propiedades en el orden
    // del JSON y al validar la unidad recalcula el Direct Unit Cost de la línea. Si
    // fuera después, pisaría el precio negociado.
    const uom = unidadParaBc(l);
    if (uom) lineBody.unitOfMeasureCode = uom;
    if (l.precio && l.precio > 0) lineBody.directUnitCost = l.precio;
    // DESCRIPCIÓN de la línea. En un artículo de INVENTARIO manda la ficha de BC (su
    // descripción es la buena y no se pisa). En SERVICIO / NO INVENTARIABLE la
    // descripción ES el trabajo contratado —el alcance que escribió el ingeniero en un
    // subcontrato—, así que esa sí viaja: sin esto la orden llegaba a BC diciendo
    // "SUBCONTRATO ELECTRICO" a secas, sin decir de qué obra ni de qué alcance.
    // (BC corta el campo en 100 caracteres.)
    if (descripcionPropia(l)) lineBody.description = l.descripcion!.slice(0, 100);
    if (locId) lineBody.locationId = locId;
    // Variante: si el item la exige, BC pide itemVariantId (GUID), no el código.
    if (l.variantCode) {
      const vId = await getStdVariantId(l.itemNo, l.variantCode);
      if (vId) lineBody.itemVariantId = vId;
    }
    const resL = await bcFetch(`${stdRoot()}/companies(${cid})/purchaseOrders(${po.id})/purchaseOrderLines`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(lineBody), cache: "no-store" });
    if (resL.ok) {
      creadas++;
      // Capturar el Line No. (sequence) para poder setear proyecto/tarea/almacén después.
      const created: any = await resL.json().catch(() => ({}));
      const lineNo = Number(created?.sequence);
      if (lineNo && (consumo || locCode || l.machineNo)) asignaciones.push({
        lineNo,
        // REPUESTO: N.º de máquina de la línea (GomEqp Machine No.).
        machineNo: l.machineNo || undefined,
        jobNo: consumo ? l.jobNo : undefined,
        jobTaskNo: consumo ? l.jobTaskNo : undefined,
        // "None" = Job Line Type en blanco, que es como están 95 de las 97 líneas con
        // proyecto hechas en BC. Con "Budget" BC crea una Job Planning Line de
        // presupuesto que —al estar Apply Usage Link apagado en las obras— NO se liga
        // al consumo: el presupuesto de la obra crece con cada compra y los reportes
        // Actual vs Budget cuentan doble.
        jobLineType: consumo ? (l.jobLineType || "None") : undefined,
        locationCode: locCode || undefined,
      });
    }
    else {
      omitidas.push(l.itemNo);
      if (!lineError) lineError = `${l.itemNo}: BC ${resL.status} ${(await resL.text()).slice(0, 400)}`;
    }
  }
  // 3) CARGOS DE PRODUCTO (Item Charge): NO por la API estándar (se traga la línea
  // sin avisar). Van por el codeunit AdelantePO_AddChargeLine (idempotente por
  // itemChargeNo). El reparto por importe lo hace el codeunit al registrar.
  const cargos: CargoBc[] = cargosEfectivos; // ya validado arriba: todos con tipo (Item Charge)
  if (creadas > 0) {
    for (const cg of cargos) {
      const qty = cg.cantidad && cg.cantidad > 0 ? cg.cantidad : 1;
      if (!(cg.precio > 0)) continue;
      // El tipo (Item Charge) debe ser un código REAL de BC. Se resuelve por chargeNo
      // directo o, si falta, por la descripción contra el catálogo (ya cargado arriba).
      const chargeNo = resolverItemChargeNo(cg, catalogoCargos);
      if (!chargeNo) {
        if (!cargoError) cargoError = "El cargo no tiene tipo (Item Charge). Elegí el tipo de cargo y reintentá.";
        continue;
      }
      try {
        await bcAddChargeLine(po.number, chargeNo, cg.descripcion || "CARGO / TRANSPORTE", qty, cg.precio);
        cargosCreados++;
      } catch (e: any) {
        if (!cargoError) cargoError = `cargo ${chargeNo}: ${String(e?.message ?? e)}`;
      }
    }
  }
  // Si NINGUNA línea entró, el pedido quedaría vacío en BC (y "no hay nada que
  // lanzar"). Borramos el encabezado huérfano y fallamos con el motivo real.
  if (creadas === 0) {
    try { await bcFetch(`${stdRoot()}/companies(${cid})/purchaseOrders(${po.id})`, { method: "DELETE", cache: "no-store" }); } catch { /* best effort */ }
    throw new Error(`BC rechazó todas las líneas del pedido — ${lineError ?? "sin detalle"}`);
  }
  // Consumo inmediato / Stock: proyecto+tarea + almacén por línea (codeunit custom, la
  // API estándar no expone esos campos).
  // Esto NO puede quedar como advertencia: si la asignación falla (obra bloqueada, tarea
  // que no existe o no es de Registro, codeunit caído), la línea se queda sin proyecto y
  // el material termina sumado a inventario en silencio — que es justo lo que pasó con
  // CP-003873. Por eso se exige que BC confirme TODAS las asignaciones; si no, quien
  // llama NO debe lanzar el pedido (queda Abierto en BC con el motivo real).
  // No basta con que el codeunit diga que sí: se confirma leyendo la línea en BC y,
  // si falta, se escribe directo (ver bcAplicarAsignaciones).
  const jobError = await bcAplicarAsignaciones(po.number, asignaciones);
  return { number: po.number ?? "", id: po.id ?? "", omitidas, creadas, lineError, cargoError, cargosCreados, jobError };
}

// Raíz OData V4 (para los web services de codeunit custom, p.ej. AdelantePO).
function odataRoot(): string {
  const { tenant, environment } = tenantYEntorno();
  return `https://api.businesscentral.dynamics.com/v2.0/${tenant}/${environment}/ODataV4`;
}

// ─── Errores de BC en algo legible (y accionable) ─────────────────────────────
// BC responde {"error":{"code":"Application_DialogException","message":"…  CorrelationId: …"}}
// y ese JSON crudo terminaba tal cual en el toast del usuario. Acá se saca el
// `message`, se le quita el CorrelationId y se traducen los casos conocidos a lo
// que hay que HACER.
export function mensajeBcLegible(raw: string): string {
  let msg = String(raw ?? "");
  const m = msg.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (m) { try { msg = JSON.parse(`"${m[1]}"`); } catch { msg = m[1]; } }
  msg = msg.replace(/\s*CorrelationId:\s*[0-9a-fA-F-]+\.?/, "").trim();
  const l = msg.toLowerCase();
  // El codeunit de lanzamiento intenta APROBAR una solicitud de aprobación que no
  // existe para ese pedido (flujo de aprobación de compras de BC).
  if (l.includes("no approval request to approve"))
    return "BC no tiene una solicitud de aprobación abierta para este pedido, así que no lo puede aprobar ni lanzar. Liberalo desde BC (o desactivá el flujo de aprobación de pedidos de compra) y reintentá.";
  if (l.includes("approval process") || l.includes("pending approval") || l.includes("pendiente de aprobación"))
    return "El pedido está pendiente de aprobación en BC. Aprobalo ahí y reintentá el lanzamiento.";
  if (l.includes("location code must have a value"))
    return `A una línea le falta el almacén en BC: ${msg}`;
  // Línea con obra y sin tarea. Respaldo del pre-vuelo de /api/compras/bc/relanzar
  // (que sí sabe qué línea y qué obra): esto es para cuando no se pudo leer el pedido.
  if (l.includes("project task no. must have a value") || l.includes("job task no. must have a value"))
    return `Una línea del pedido lleva obra pero no tarea, y BC no lanza así. Ponele la tarea (actividad) de la obra a esa línea; si el material no va contra la obra, quitale el proyecto. Detalle de BC: ${msg}`;
  return msg || "BC no dio detalle del error.";
}

// ─── Estado de un pedido en BC ────────────────────────────────────────────────
// El `status` de la API v2.0 NO se lee como en la pantalla de BC. Verificado
// contra BC Production (20/08/2026, pedidos reales):
//   · "Draft"           = Abierto, sin lanzar
//   · "In_x0020_Review" = Pendiente de aprobación
//   · "Open"            = LANZADO (Released)  ← ojo, "Open" no es "abierto"
// `existe:false` = ya no está en Pedidos de compra: lo registraron, lo eliminaron
// o lo archivaron (BC archiva una copia al eliminar/registrar; un pedido de compra
// archivado NO se puede restaurar, hay que crearlo de nuevo).
// `desconocido:true` = no se pudo preguntar (BC caído / sin permiso): NO concluir nada.
export type BcEstadoPedido = { existe: boolean; status?: string; lanzado: boolean; enAprobacion: boolean; desconocido?: boolean };
export async function bcEstadoPedido(orderNo: string): Promise<BcEstadoPedido> {
  const nada: BcEstadoPedido = { existe: false, lanzado: false, enAprobacion: false };
  if (!orderNo) return { ...nada, desconocido: true };
  try {
    const cid = await getStdCompanyId();
    const filtro = `$filter=${encodeURIComponent(`number eq '${odataStr(orderNo)}'`)}&$select=number,status`;
    const res = await bcFetch(`${stdRoot()}/companies(${cid})/purchaseOrders?${filtro}`, { cache: "no-store" });
    if (!res.ok) return { ...nada, desconocido: true };
    const row = ((await res.json())?.value ?? [])[0];
    if (!row) return nada; // no está en Pedidos de compra
    const status = String(row.status ?? "");
    const n = status.replace(/_x0020_/g, " ").toLowerCase();
    return { existe: true, status, lanzado: n === "open" || n === "released", enAprobacion: n.includes("review") || n.includes("approval") };
  } catch { return { ...nada, desconocido: true }; }
}

// ¿El pedido tiene RECEPCIONES registradas en BC? Es lo que distingue las dos
// razones por las que un pedido desaparece de Pedidos de compra:
//   · con recepción  → se REGISTRÓ (recibido/facturado): el pedido cumplió su ciclo.
//   · sin recepción  → lo ELIMINARON o ARCHIVARON sin registrar nada.
// Sin esta consulta, la app trataría los dos casos igual y podría duplicar una
// compra ya registrada. `null` = no se pudo saber (no concluir nada).
export async function bcPedidoTieneRecepciones(orderNo: string): Promise<boolean | null> {
  if (!orderNo) return null;
  try {
    const cid = await getStdCompanyId();
    const filtro = `$filter=${encodeURIComponent(`orderNumber eq '${odataStr(orderNo)}'`)}&$select=number&$top=1`;
    const res = await bcFetch(`${stdRoot()}/companies(${cid})/purchaseReceipts?${filtro}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (((await res.json())?.value ?? []).length > 0);
  } catch { return null; }
}

// Manda el pedido a APROBACIÓN en BC (workflows MS-POAPW-01/02) SIN aprobarlo:
// queda "Pendiente de aprobación" con su solicitud abierta, así quien mira BC ve qué
// está esperando visto bueno. Lo llama la app cuando una orden pasa a
// `pendiente_aprobacion` y ya tiene pedido en BC; el "Aprobar y lanzar" de Aprobación
// después lo aprueba y lo lanza (AdelantePO_ReleaseOrder).
//
// El codeunit es tolerante a propósito: si el pedido ya está esperando aprobación, o ya
// está lanzado, o ningún workflow aplica a ese documento, no hace nada y devuelve el
// estado tal cual. Por eso reintentar (reenviar a aprobación) nunca duplica solicitudes.
export async function bcEnviarAAprobacion(orderNo: string): Promise<string> {
  if (!orderNo) throw new Error("Falta el número de pedido para enviar a aprobación.");
  const cid = await getStdCompanyId();
  const url = `${odataRoot()}/AdelantePO_SendForApproval?company=${encodeURIComponent(cid)}`;
  const res = await bcFetch(url, {
    method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderNo }),
  });
  if (!res.ok) throw new Error(mensajeBcLegible((await res.text()).slice(0, 600)));
  const d: any = await res.json().catch(() => ({}));
  return d?.value ?? "Pending Approval";
}

// Reabre (Reopen) el pedido en BC y, si tenía una solicitud de aprobación viva, la
// CANCELA (el codeunit llama a OnCancelPurchaseApprovalRequest antes del Reopen).
// La app lo necesita en los dos caminos que devuelven una orden a Proveeduría —
// rechazar desde Aprobación y "cancelar envío" / "volver a abrir" desde Proveeduría —
// porque si no, el pedido se queda en BC "Pendiente de aprobación" (o Lanzado) con la
// solicitud abierta y nadie puede editarlo.
export async function bcReabrirPedido(orderNo: string): Promise<string> {
  if (!orderNo) throw new Error("Falta el número de pedido para reabrir.");
  const cid = await getStdCompanyId();
  const url = `${odataRoot()}/AdelantePO_ReopenOrder?company=${encodeURIComponent(cid)}`;
  const res = await bcFetch(url, {
    method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderNo }),
  });
  if (!res.ok) throw new Error(mensajeBcLegible((await res.text()).slice(0, 600)));
  const d: any = await res.json().catch(() => ({}));
  return d?.value ?? "Open";
}

// Lanza (Release) un Pedido de compra en BC -> estado "Lanzado".
// La API estándar v2.0 NO puede liberar un pedido; se hace por el web service
// del codeunit custom "Adelante PO Actions" (publicado como "AdelantePO").
// Procedimiento esperado: AdelantePO_ReleaseOrder(orderNo) -> Text (status).
export async function bcReleasePedido(orderNo: string): Promise<string> {
  if (!orderNo) throw new Error("Falta el número de pedido para lanzar.");
  const cid = await getStdCompanyId();
  const url = `${odataRoot()}/AdelantePO_ReleaseOrder?company=${encodeURIComponent(cid)}`;
  const res = await bcFetch(url, {
    method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderNo }),
  });
  if (!res.ok) throw new Error(mensajeBcLegible((await res.text()).slice(0, 600)));
  const d: any = await res.json().catch(() => ({}));
  return d?.value ?? "Released";
}

// Re-sincroniza PRECIO + VARIANTE de las líneas de un pedido YA creado en BC, para
// reflejar correcciones hechas en la app después de crearlo (antes, "reintentar
// lanzar" solo relanzaba la versión vieja). Empareja por número de artículo en
// orden y solo hace PATCH de lo que cambió.
// OJO: no verificado aún contra un pedido real con release fallido — probar en
// el Sandbox (CP-003833) antes de confiar en producción.
export async function bcResyncPedidoLines(orderNo: string, lineas: NuevaLineaBc[]): Promise<{ patched: number; sinMatch: string[]; jobError?: string }> {
  if (!orderNo) throw new Error("Falta el número de pedido de BC.");
  const items = (lineas ?? []).filter((l) => l.itemNo && l.cantidad > 0);
  if (!items.length) return { patched: 0, sinMatch: [] };
  const cid = await getStdCompanyId();
  const jsonHeaders = { "Content-Type": "application/json" };
  // 1) Pedido por número -> id.
  const filtro = `$filter=${encodeURIComponent(`number eq '${orderNo}'`)}&$select=id,number`;
  const resPo = await bcFetch(`${stdRoot()}/companies(${cid})/purchaseOrders?${filtro}`, { cache: "no-store" });
  if (!resPo.ok) throw new Error(`BC ${resPo.status} al buscar el pedido ${orderNo}.`);
  const poId = ((await resPo.json()).value ?? [])[0]?.id;
  if (!poId) throw new Error(`No se encontró el pedido ${orderNo} en BC.`);
  // 2) Líneas existentes en BC.
  const resLines = await bcFetch(`${stdRoot()}/companies(${cid})/purchaseOrders(${poId})/purchaseOrderLines?$select=id,sequence,lineType,lineObjectNumber,quantity,directUnitCost,itemVariantId,description,unitOfMeasureCode`, { cache: "no-store" });
  if (!resLines.ok) throw new Error(`BC ${resLines.status} al leer las líneas de ${orderNo}.`);
  const bcLines: any[] = (await resLines.json()).value ?? [];
  const usados = new Set<string>();
  const asignaciones: AsignacionLineaBc[] = [];
  const fichasResync = await bcItemFichas(items.map((l) => l.itemNo));
  const tiposResync = new Map([...fichasResync].map(([no, f]) => [no, f.tipo] as const));
  // Misma regla que al crear: la unidad elegida se reafirma siempre que exista para ese
  // artículo en BC (si no, el reintento de lanzamiento la revertiría a la de BC).
  const unidadesResync = await bcUnidadesDeItems(items.filter((l) => (l.unidad ?? "").trim()).map((l) => l.itemNo));
  const unidadResync = (l: NuevaLineaBc): string => {
    const code = (l.unidad ?? "").trim();
    if (!code) return "";
    const lista = unidadesResync.get(l.itemNo);
    const match = lista?.find((u) => u.code.toUpperCase() === code.toUpperCase());
    return match ? match.code : "";
  };
  let patched = 0; const sinMatch: string[] = [];
  for (const l of items) {
    const bc = bcLines.find((b) => !usados.has(b.id) && String(b.lineObjectNumber) === String(l.itemNo) && /item/i.test(String(b.lineType)));
    if (!bc) { sinMatch.push(l.itemNo); continue; }
    usados.add(bc.id);
    // Consumo inmediato / Stock: recordar la asignación de proyecto+tarea / almacén (por Line No.).
    const lineNo = Number(bc.sequence);
    // Mismo criterio que al crear: consumo = proyecto + tarea + almacén de la OBRA
    // (código = proyecto), y jobLineType en blanco ("None"). Esto es lo que arregla el
    // relanzamiento de un pedido que quedó Abierto en BC por falta de almacén.
    const conJob = !!(l.jobNo && l.jobTaskNo);
    // Servicio / no inventariable: sin almacén (BC no lo acepta). Ver bcCrearPedido.
    const soloServicio = (tiposResync.get(l.itemNo) ?? "inventario") !== "inventario";
    const locCode = soloServicio ? "" : conJob ? (l.locationCode || l.jobNo!) : (l.locationCode || "");
    if (lineNo && (conJob || locCode || l.machineNo)) asignaciones.push({ lineNo, jobNo: conJob ? l.jobNo : undefined, jobTaskNo: conJob ? l.jobTaskNo : undefined, jobLineType: conJob ? (l.jobLineType || "None") : undefined, locationCode: locCode || undefined, machineNo: l.machineNo || undefined });
    const patch: Record<string, unknown> = {};
    // La unidad PRIMERO (BC recalcula el costo al validarla) y solo si cambió.
    const uomR = unidadResync(l);
    if (uomR && String(bc.unitOfMeasureCode ?? "").toUpperCase() !== uomR.toUpperCase()) patch.unitOfMeasureCode = uomR;
    if (l.precio && l.precio > 0 && Number(bc.directUnitCost) !== l.precio) patch.directUnitCost = l.precio;
    // Igual que el precio: al validar el artículo, BC pisa la descripción con la de la
    // ficha. En servicio / no inventariable la descripción de la app es la que vale
    // (el alcance del subcontrato), así que se reafirma acá.
    const descr = (l.descripcion ?? "").trim().slice(0, 100);
    if (descr && soloServicio && String(bc.description ?? "") !== descr) patch.description = descr;
    if (l.variantCode) {
      const vId = await getStdVariantId(l.itemNo, l.variantCode);
      if (vId && bc.itemVariantId !== vId) patch.itemVariantId = vId;
    }
    if (!Object.keys(patch).length) continue;
    const resP = await bcFetch(`${stdRoot()}/companies(${cid})/purchaseOrders(${poId})/purchaseOrderLines(${bc.id})`, {
      method: "PATCH", cache: "no-store",
      headers: { ...jsonHeaders, "If-Match": bc["@odata.etag"] ?? "*" },
      body: JSON.stringify(patch),
    });
    if (!resP.ok) throw new Error(`BC ${resP.status} al actualizar la línea ${l.itemNo}: ${(await resP.text()).slice(0, 200)}`);
    patched++;
  }
  // Consumo inmediato / Stock: aplicar proyecto+tarea / almacén por línea (idempotente).
  // Si NO se aplicaron todas, es un error DURO (ver nota en bcCrearPedido).
  // Mismo criterio que en el alta: confirmar contra BC, no creerle al codeunit.
  const jobError = await bcAplicarAsignaciones(orderNo, asignaciones);
  return { patched, sinMatch, jobError };
}

// Registra (Recibir + Facturar) una factura parcial del pedido en BC con todos sus
// movimientos contables, vía el web service custom AdelantePO_PostInvoice.
// lines = cantidades recibidas en ESTA factura por item ({itemNo, qty}).
export async function bcRegistrarFactura(
  orderNo: string,
  vendorInvoiceNo: string,
  lines: { itemNo: string; qty: number; variantCode?: string }[],
  postingDate = "", // fecha de registro (ISO yyyy-mm-dd). "" → BC usa la fecha del día
  // Cargo de transporte de ESTA factura/viaje (opcional). Se agrega a la OC y se
  // reparte entre lo que se recibe en este registro, según `metodo`.
  cargo?: { itemChargeNo: string; descripcion?: string; monto: number; metodo?: string },
): Promise<string> {
  if (!orderNo) throw new Error("Falta el número de pedido de BC.");
  if (!vendorInvoiceNo) throw new Error("Falta el N.º de factura del proveedor.");
  const cid = await getStdCompanyId();
  // Cargo de transporte por viaje: se agrega la línea de Cargo (Prod.) a la OC y se
  // asigna con el método elegido ANTES de registrar (para que quede repartido en
  // esta factura sobre lo recibido). Debe ir antes del PostInvoice.
  if (cargo && cargo.itemChargeNo && cargo.monto > 0) {
    await bcAddChargeLine(orderNo, cargo.itemChargeNo, cargo.descripcion || "Transporte", 1, cargo.monto);
    try { await bcAssignItemCharges(orderNo, (cargo.metodo || "Amount").trim() || "Amount"); }
    catch (e) { console.warn(`BC asignar cargo de transporte en ${orderNo} falló:`, e); }
  }
  const url = `${odataRoot()}/AdelantePO_PostInvoice?company=${encodeURIComponent(cid)}`;
  const res = await bcFetch(url, {
    method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderNo, vendorInvoiceNo, linesJson: JSON.stringify(lines), postingDate }),
  });
  if (!res.ok) throw new Error(`BC registrar ${res.status}: ${(await res.text()).slice(0, 250)}`);
  const d: any = await res.json().catch(() => ({}));
  return d?.value ?? "Registrado";
}

// MODO 2 — Solo RECEPCIÓN (material llega bien, la factura queda en revisión).
// Registra la recepción en BC (Receive=true, Invoice=false) vía AdelantePO_PostReceipt.
// Mueve inventario/cantidad recibida sin tocar la factura ni el ledger del proveedor.
export async function bcRecibir(orderNo: string, lines: { itemNo: string; qty: number; variantCode?: string }[], postingDate = ""): Promise<string> {
  if (!orderNo) throw new Error("Falta el número de pedido de BC.");
  const cid = await getStdCompanyId();
  const url = `${odataRoot()}/AdelantePO_PostReceipt?company=${encodeURIComponent(cid)}`;
  const res = await bcFetch(url, {
    method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderNo, linesJson: JSON.stringify(lines), postingDate }),
  });
  if (!res.ok) throw new Error(`BC recibir ${res.status}: ${(await res.text()).slice(0, 250)}`);
  const d: any = await res.json().catch(() => ({}));
  return d?.value ?? "Recibido";
}

// MODO 2 — Solo FACTURA de lo ya recibido (Kattya revisa y registra después).
// Factura en BC lo que estaba recibido-no-facturado (Receive=false, Invoice=true)
// vía AdelantePO_PostInvoiceOfReceived.
export async function bcFacturarRecibido(orderNo: string, vendorInvoiceNo: string, lines: { itemNo: string; qty: number; variantCode?: string }[], postingDate = ""): Promise<string> {
  if (!orderNo) throw new Error("Falta el número de pedido de BC.");
  if (!vendorInvoiceNo) throw new Error("Falta el N.º de factura del proveedor.");
  const cid = await getStdCompanyId();
  const url = `${odataRoot()}/AdelantePO_PostInvoiceOfReceived?company=${encodeURIComponent(cid)}`;
  const res = await bcFetch(url, {
    method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderNo, vendorInvoiceNo, linesJson: JSON.stringify(lines), postingDate }),
  });
  if (!res.ok) throw new Error(`BC facturar ${res.status}: ${(await res.text()).slice(0, 250)}`);
  const d: any = await res.json().catch(() => ({}));
  return d?.value ?? "Facturado";
}

// Crea el Pedido en BC (queda Abierto) y lo LANZA enseguida -> "Lanzado".
// Si el create funciona pero el release falla (p.ej. AdelantePO no publicado aún),
// devuelve el pedido creado con released=false para que la UI avise sin romperse.
export async function bcCrearYLanzarPedido(input: { vendorNo: string; currencyCode?: string; locationCode?: string; lineas: NuevaLineaBc[]; cargos?: CargoBc[]; metodo?: string; flete?: { monto: number; descripcion?: string } }):
  Promise<{ number: string; id: string; omitidas: string[]; creadas: number; lineError?: string; cargoError?: string; cargosCreados?: number; jobError?: string; released: boolean; releaseError?: string }> {
  const { number, id, omitidas, creadas, lineError, cargoError, cargosCreados, jobError } = await bcCrearPedido(input);
  // Si NINGUNA línea entró a BC, no tiene sentido intentar lanzar (BC responde
  // "nothing to release"). Devolvemos released=false con el motivo real de la línea.
  if (creadas === 0) {
    return { number, id, omitidas, creadas, lineError, cargoError, cargosCreados, jobError, released: false, releaseError: lineError ?? "BC rechazó todas las líneas del pedido." };
  }
  // FORZAR EL PRECIO DE LA APP: al insertar la línea, la API estándar valida el
  // N.º del artículo y autocompleta el "Direct Unit Cost" desde la ficha del ítem,
  // PISANDO el precio que mandamos en el POST (si el ítem no tiene costo, lo deja
  // en blanco → no se puede facturar). Re-sincronizamos con PATCH para que el
  // precio NEGOCIADO en la app sea el que queda en BC. No debe tumbar el lanzamiento.
  try { await bcResyncPedidoLines(number, input.lineas); } catch (e) { console.warn(`BC resync de precios en ${number} falló:`, e); }
  // Cargos con método distinto de importe: reasignar explícitamente (Igualmente/
  // Peso/Volumen). El default "Amount" ya lo hace el codeunit al registrar, así que
  // solo llamamos cuando el método NO es Amount. No debe tumbar el lanzamiento.
  const met = (input.metodo ?? "").trim();
  const hayCargos = (input.cargos && input.cargos.length) || (input.flete && input.flete.monto > 0);
  if (hayCargos && met && met.toLowerCase() !== "amount") {
    try { await bcAssignItemCharges(number, met); } catch (e) { console.warn(`BC asignar cargo (${met}) en ${number} falló:`, e); }
  }
  // Proyecto/tarea/almacén sin aplicar → NO se lanza. Si se lanzara, el pedido se
  // registraría con la línea sin proyecto y el material entraría a inventario sin que
  // nadie se enterara. Queda Abierto en BC y la orden pendiente en la app, con el motivo.
  if (jobError) {
    return {
      number, id, omitidas, creadas, lineError, cargoError, cargosCreados, jobError,
      released: false,
      releaseError: `No se aplicó el proyecto/tarea/almacén en BC (${jobError}). El pedido ${number} quedó ABIERTO en BC sin lanzar, para no registrar material sin su obra.`,
    };
  }
  // Misma red que en /api/compras/bc/relanzar: si alguna línea quedó con obra y sin
  // tarea, BC rechaza el Release con un error crudo. Se avisa con la línea y la obra.
  const sinTarea = await bcLineasProyectoSinTarea(number);
  if (sinTarea?.length) {
    return {
      number, id, omitidas, creadas, lineError, cargoError, cargosCreados, jobError,
      released: false,
      releaseError: `El pedido ${number} quedó ABIERTO en BC: ${mensajeProyectoSinTarea(sinTarea)}`,
    };
  }
  try {
    await bcReleasePedido(number);
    return { number, id, omitidas, creadas, lineError, cargoError, cargosCreados, jobError, released: true };
  } catch (e: any) {
    return { number, id, omitidas, creadas, lineError, cargoError, cargosCreados, jobError, released: false, releaseError: String(e?.message ?? e) };
  }
}

// Crea una línea de Cargo de producto (Item Charge) en un pedido, vía el codeunit
// AdelantePO_AddChargeLine. La API ESTÁNDAR se traga la línea de cargo sin avisar,
// así que las líneas de cargo van SIEMPRE por acá (las de artículo siguen por la
// API estándar). Es idempotente por itemChargeNo (no duplica si se reintenta).
export async function bcAddChargeLine(orderNo: string, itemChargeNo: string, description: string, quantity: number, directUnitCost: number): Promise<string> {
  if (!orderNo) throw new Error("Falta el número de pedido para el cargo.");
  if (!itemChargeNo) throw new Error("Falta el tipo de cargo (itemChargeNo).");
  const cid = await getStdCompanyId();
  const url = `${odataRoot()}/AdelantePO_AddChargeLine?company=${encodeURIComponent(cid)}`;
  const res = await bcFetch(url, {
    method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderNo, itemChargeNo, description, quantity: quantity > 0 ? quantity : 1, directUnitCost }),
  });
  if (!res.ok) throw new Error(`BC add cargo ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const d: any = await res.json().catch(() => ({}));
  return d?.value ?? "Agregado";
}

// Sugerir/aplicar la asignación de los Cargos de producto de un pedido con un
// método (Amount|Weight|Volume|Equally), vía el codeunit AdelantePO_AssignItemCharges.
export async function bcAssignItemCharges(orderNo: string, metodo = "Amount"): Promise<string> {
  if (!orderNo) throw new Error("Falta el número de pedido para asignar cargos.");
  const cid = await getStdCompanyId();
  const url = `${odataRoot()}/AdelantePO_AssignItemCharges?company=${encodeURIComponent(cid)}`;
  const res = await bcFetch(url, {
    method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderNo, metodo }),
  });
  if (!res.ok) throw new Error(`BC asignar cargos ${res.status}: ${(await res.text()).slice(0, 250)}`);
  const d: any = await res.json().catch(() => ({}));
  return d?.value ?? "Asignado";
}

export type ReceiptLineRef = { documentNo: string; lineNo: number };

// Registra en BC un Cargo de producto (flete/transporte facturado por un TERCERO)
// contra líneas de recepciones YA REGISTRADAS. En un solo codeunit server-side
// (AdelantePO_PostChargeOnReceipts) hace todo el flujo de las capturas: crea un
// pedido de compra al proveedor del cargo con UNA sola línea "Cargo (Prod.)",
// "trae" las líneas de recepción indicadas, sugiere el reparto con `metodo`, fija
// el N.º de factura del proveedor y REGISTRA. Devuelve el nº de factura registrada.
export async function bcPostChargeOnReceipts(input: {
  chargeVendorNo: string;      // proveedor del cargo (transportista)
  vendorInvoiceNo: string;     // N.º factura proveedor (obligatorio para registrar)
  itemChargeNo?: string;       // tipo de cargo (Item Charge). Alias UI: chargeNo
  chargeNo?: string;
  chargeAmount?: number;       // importe TOTAL del cargo. Si no viene: precio × cantidad
  cantidad?: number;
  precio?: number;
  metodo?: string;             // Amount | Equally | Weight | Volume
  receiptLines: ReceiptLineRef[]; // líneas de recepción destino
  documentDate?: string;       // fecha de emisión (ISO yyyy-mm-dd) → Posting/Document Date. "" = hoy
  // NOTA: currencyCode lo resuelve BC por el proveedor del cargo (no se envía).
}): Promise<string> {
  const itemChargeNo = (input.itemChargeNo ?? input.chargeNo ?? "").trim();
  const chargeAmount = (input.chargeAmount != null && input.chargeAmount > 0)
    ? input.chargeAmount
    : (input.precio ?? 0) * (input.cantidad && input.cantidad > 0 ? input.cantidad : 1);
  if (!input.chargeVendorNo) throw new Error("Falta el proveedor del cargo.");
  if (!input.vendorInvoiceNo) throw new Error("Falta el N.º de factura del proveedor.");
  if (!itemChargeNo) throw new Error("Falta el tipo de cargo de producto.");
  if (!(chargeAmount > 0)) throw new Error("El importe del cargo debe ser mayor que 0.");
  const lines = (input.receiptLines ?? []).filter((l) => l.documentNo && l.lineNo > 0);
  if (!lines.length) throw new Error("Seleccioná al menos una línea de recepción para asignar el cargo.");
  const cid = await getStdCompanyId();
  const url = `${odataRoot()}/AdelantePO_PostChargeOnReceipts?company=${encodeURIComponent(cid)}`;
  // El JSON mapea 1:1 a los parámetros del codeunit: NO agregar campos de más.
  const body = {
    chargeVendorNo: input.chargeVendorNo,
    itemChargeNo,
    chargeAmount,
    vendorInvoiceNo: input.vendorInvoiceNo,
    metodo: (input.metodo ?? "Amount"),
    receiptLinesJson: JSON.stringify(lines),
    postingDate: input.documentDate ?? "", // "" → BC usa la fecha del día (Today)
  };
  const res = await bcFetch(url, {
    method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`BC cargo sobre recibido ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const d: any = await res.json().catch(() => ({}));
  return d?.value ?? "Registrado";
}

// Deep link al Pedido recién creado, en la lista de Pedidos de compra de BC.
export function bcDeepLinkPedido(numero: string): string {
  const { tenant, environment } = tenantYEntorno();
  const company = process.env.BC_COMPANY || "ADELANTE_DESARROLLOS_NUEVA";
  const filtro = encodeURIComponent(`'No.' IS '${numero}'`);
  return `https://businesscentral.dynamics.com/${tenant}/${environment}?company=${encodeURIComponent(company)}&page=9307&filter=${filtro}`;
}

function decodeJwt(token: string): any {
  try {
    const part = token.split(".")[1];
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(Buffer.from(pad, "base64").toString("utf8"));
  } catch { return null; }
}

export async function bcHealth() {
  const out: any = { configCompanyId: soloGuid(process.env.BC_COMPANY_ID) };
  // --- DIAGNÓSTICO: qué credenciales ve el worker en runtime ---
  out.diag = {
    envClientId: process.env.BC_CLIENT_ID ?? null,
    envTenant: process.env.BC_TENANT_ID ?? null,
    envSecretLen: (process.env.BC_CLIENT_SECRET ?? "").length,
    envBaseUrl: process.env.BC_BASE_URL ?? null,
    authority: `https://login.microsoftonline.com/${process.env.BC_TENANT_ID}/oauth2/v2.0/token`,
  };
  try {
    const tok = await getToken();
    const p = decodeJwt(tok) ?? {};
    out.diag.token = { appid: p.appid, tid: p.tid, aud: p.aud, ver: p.ver, iss: p.iss, roles: p.roles, app_displayname: p.app_displayname, idtyp: p.idtyp };
    // Probes discriminantes con el MISMO token, contra /companies de cada API.
    // - standard  : si 401 => BC no reconoce la app en el entorno (registro/consent/entorno).
    // - automation: confirma reconocimiento de la app a nivel automation.
    // - custom    : si standard OK pero este 401 => permiso del API 'adelante' o extensión no publicada.
    const t = process.env.BC_TENANT_ID;
    const envName = (process.env.BC_ENVIRONMENT ?? "Sandbox");
    const base = `https://api.businesscentral.dynamics.com/v2.0/${t}/${envName}`;
    const probe = async (label: string, url: string) => {
      try {
        const r = await fetch(url, { cache: "no-store", headers: { Authorization: `Bearer ${tok}`, Accept: "application/json" } });
        let bodyMsg: string | null = null;
        if (!r.ok) { try { bodyMsg = (await r.text()).slice(0, 200); } catch { /* noop */ } }
        return {
          label, status: r.status, ok: r.ok,
          wwwAuthenticate: r.headers.get("www-authenticate"),
          msDiagnostics: r.headers.get("ms-diagnostics"),
          requestId: r.headers.get("request-id") ?? r.headers.get("x-ms-request-id"),
          body: bodyMsg,
        };
      } catch (e: any) { return { label, error: String(e?.message ?? e) }; }
    };
    const cidGuid = soloGuid(process.env.BC_COMPANY_ID);
    // Compañías que ve la API ESTÁNDAR (su systemId puede diferir del de la custom).
    try {
      const rc = await fetch(`${base}/api/v2.0/companies`, { cache: "no-store", headers: { Authorization: `Bearer ${tok}`, Accept: "application/json" } });
      if (rc.ok) out.diag.stdCompanies = ((await rc.json()).value ?? []).map((c: any) => ({ id: c.id, name: c.name }));
    } catch { /* noop */ }
    const stdCid = out.diag.stdCompanies?.[0]?.id ?? cidGuid;
    out.diag.probes = await Promise.all([
      probe("standard", `${base}/api/v2.0/companies`),
      probe("automation", `${base}/api/microsoft/automation/v2.0/companies`),
      probe("custom-adelante", `${base}/api/adelante/inventory/v1.0/companies`),
      probe("custom-itemVariants", `${base}/api/adelante/inventory/v1.0/companies(${cidGuid})/itemVariants?$top=1`),
      probe("std-itemVariants(stdCid)", `${base}/api/v2.0/companies(${stdCid})/itemVariants?$top=1`),
    ]);
  } catch (e: any) { out.diag.tokenError = String(e?.message ?? e); }
  try {
    out.diag.outboundIp = (await (await fetch("https://api.ipify.org")).text()).trim();
  } catch (e: any) { out.diag.ipError = String(e?.message ?? e); }
  try { out.companies = await bcCompanies(); } catch (e: any) { out.companiesError = String(e?.message ?? e); }
  try { out.companyIdUsado = await getCompanyId(); } catch (e: any) { out.companyError = String(e?.message ?? e); }
  try { out.items = (await bcItems()).length; out.ok = true; } catch (e: any) { out.itemsError = String(e?.message ?? e); out.ok = false; }
  try { out.obras = (await bcObras()).length; } catch (e: any) { out.obrasError = String(e?.message ?? e); }
  return out;
}
