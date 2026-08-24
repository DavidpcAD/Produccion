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
export type BcItem = { id: string; code: string; descripcion: string; unidad: string; tipo: BcItemTipo; lastDirectCost?: number; categoria?: string; reorderPoint?: number; safetyStock?: number; reorderQty?: number };
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
    if (items.length) lastGoodItems = items; // guardamos el último catálogo bueno
    return items;
  } catch (e) {
    if (lastGoodItems) { console.warn("BC items falló; sirviendo último catálogo bueno cacheado."); return lastGoodItems; }
    throw e;
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
    let url: string | null = `${stdRoot()}/companies(${cid})/items?$select=number,unitCost,itemCategoryCode,type&$top=5000`;
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
  const unicos = [...new Set((codes ?? []).map((c) => (c ?? "").trim()).filter(Boolean))];
  if (!unicos.length) return out;
  try {
    const cid = await getStdCompanyId();
    for (let i = 0; i < unicos.length; i += 15) {
      const filtro = unicos.slice(i, i + 15).map((c) => `number eq '${odataStr(c)}'`).join(" or ");
      const res = await bcFetch(`${stdRoot()}/companies(${cid})/items?$select=number,type&$filter=${encodeURIComponent(filtro)}`, { cache: "no-store" });
      if (!res.ok) continue;
      const data = (await res.json()) as { value?: { number?: string; type?: string }[] };
      for (const it of (data.value ?? [])) { const no = it.number ?? ""; if (no) out.set(no, tipoDeBc(it.type)); }
    }
  } catch { /* sin tipo: se trata como inventario */ }
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
export async function bcItemUltimaCompra(itemNo: string): Promise<number | null> {
  if (!itemNo) return null;
  try {
    const cid = await getCompanyId();
    const filtro = `$filter=${encodeURIComponent(`itemNo eq '${itemNo}'`)}`;
    const url = `${customRoot("purchasing")}/companies(${cid})/lastPurchasePrices?${filtro}&$orderby=postingDate desc,entryNo desc&$top=1`;
    const res = await bcFetch(url, { next: { revalidate: 300 } } as RequestInit);
    if (!res.ok) return null;
    const row = ((await res.json())?.value ?? [])[0];
    const uc = row?.unitCost;
    return (typeof uc === "number" && uc > 0) ? uc : null;
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
export type NuevaLineaBc = { itemNo: string; cantidad: number; precio?: number; descripcion?: string; variantCode?: string; jobNo?: string; jobTaskNo?: string; jobLineType?: string; locationCode?: string };

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
type AsignacionLineaBc = { lineNo: number; jobNo?: string; jobTaskNo?: string; jobLineType?: string; locationCode?: string };
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
type LineaJobBc = { lineNo: number; jobNo: string; jobTaskNo: string; locationCode: string };

function paginaLineasUrl(cid: string, orderNo: string): string {
  const filtro = encodeURIComponent(`Document_No eq '${odataStr(orderNo)}'`);
  return `${odataRoot()}/Purchase_Order_Line_Excel?company=${encodeURIComponent(cid)}&$filter=${filtro}&$select=Document_No,Line_No,Job_No,Job_Task_No,Location_Code`;
}

/** Proyecto/tarea/almacén REALES de las líneas del pedido en BC. `null` = no se pudo leer. */
async function bcLineasJob(orderNo: string): Promise<LineaJobBc[] | null> {
  try {
    const cid = await getStdCompanyId();
    const res = await bcFetch(paginaLineasUrl(cid, orderNo), { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { value?: { Line_No?: number; Job_No?: string; Job_Task_No?: string; Location_Code?: string }[] };
    return (data.value ?? []).map((l) => ({
      lineNo: Number(l.Line_No ?? 0),
      jobNo: String(l.Job_No ?? "").trim(),
      jobTaskNo: String(l.Job_Task_No ?? "").trim(),
      locationCode: String(l.Location_Code ?? "").trim(),
    }));
  } catch { return null; }
}

/** Asignaciones que BC NO tiene puestas. `null` = no se pudo verificar (no concluir). */
async function bcAsignacionesFaltantes(orderNo: string, asignaciones: AsignacionLineaBc[]): Promise<AsignacionLineaBc[] | null> {
  const enBc = await bcLineasJob(orderNo);
  if (!enBc) return null;
  return asignaciones.filter((a) => {
    const l = enBc.find((x) => x.lineNo === a.lineNo);
    if (!l) return true;
    if (a.jobNo && (l.jobNo !== a.jobNo || l.jobTaskNo !== (a.jobTaskNo ?? ""))) return true;
    if (a.locationCode && l.locationCode !== a.locationCode) return true;
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
    if (a.jobNo) { body.Job_No = a.jobNo; body.Job_Task_No = a.jobTaskNo ?? ""; }
    if (a.locationCode) body.Location_Code = a.locationCode;
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
  let quejaCodeunit = "";
  try {
    const r = await bcSetLineJobs(orderNo, asignaciones);
    if (r.errors) quejaCodeunit = r.errors;
  } catch (e: any) { quejaCodeunit = String(e?.message ?? e); }
  // 2) Verificar en BC. Si no se puede leer, se respeta la respuesta del codeunit.
  const faltan = await bcAsignacionesFaltantes(orderNo, asignaciones);
  if (faltan === null) return quejaCodeunit || undefined;
  if (!faltan.length) return undefined; // quedó puesto (aunque el codeunit se haya quejado)
  // 3) Plan B: escribirlo directo en la línea y volver a verificar.
  const plan = await bcSetLineJobPagina(orderNo, faltan);
  const siguenFaltando = await bcAsignacionesFaltantes(orderNo, asignaciones);
  if (siguenFaltando && !siguenFaltando.length) {
    console.warn(`BC ${orderNo}: el codeunit no aplicó proyecto/tarea (${quejaCodeunit || "sin error, pero la línea quedó vacía"}); se completó escribiendo la línea directo (${plan.updated} línea(s)). Revisar la versión de la extensión AdelanteAPI en este entorno.`);
    return undefined;
  }
  const detalle = [quejaCodeunit || "el codeunit no aplicó nada", plan.errors].filter(Boolean).join(" · ");
  const lineas = (siguenFaltando ?? faltan).map((a) => a.lineNo).join(", ");
  return `${detalle} (líneas sin proyecto/tarea: ${lineas})`;
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
  const tiposItem = await bcItemTipos(lineas.map((l) => l.itemNo));
  const sinAlmacen = (l: NuevaLineaBc) => (tiposItem.get(l.itemNo) ?? "inventario") !== "inventario";
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
    const lineBody: Record<string, unknown> = { lineType: "Item", lineObjectNumber: l.itemNo, quantity: l.cantidad };
    if (l.precio && l.precio > 0) lineBody.directUnitCost = l.precio;
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
      if (lineNo && (consumo || locCode)) asignaciones.push({
        lineNo,
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
  const resLines = await bcFetch(`${stdRoot()}/companies(${cid})/purchaseOrders(${poId})/purchaseOrderLines?$select=id,sequence,lineType,lineObjectNumber,quantity,directUnitCost,itemVariantId`, { cache: "no-store" });
  if (!resLines.ok) throw new Error(`BC ${resLines.status} al leer las líneas de ${orderNo}.`);
  const bcLines: any[] = (await resLines.json()).value ?? [];
  const usados = new Set<string>();
  const asignaciones: AsignacionLineaBc[] = [];
  const tiposResync = await bcItemTipos(items.map((l) => l.itemNo));
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
    if (lineNo && (conJob || locCode)) asignaciones.push({ lineNo, jobNo: conJob ? l.jobNo : undefined, jobTaskNo: conJob ? l.jobTaskNo : undefined, jobLineType: conJob ? (l.jobLineType || "None") : undefined, locationCode: locCode || undefined });
    const patch: Record<string, unknown> = {};
    if (l.precio && l.precio > 0 && Number(bc.directUnitCost) !== l.precio) patch.directUnitCost = l.precio;
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
