// ============================================================================
// Modelo de datos — App de solicitud de material a proveedores
//
// Flujo y personas reales:
//   1. INGENIERÍA  (Laura)  crea una SOLICITUD de material.
//        - tipo 'material'  → destino una OBRA
//        - tipo 'repuesto'  → destino una MÁQUINA
//        Pone ítems, almacén y cantidad. NO pone proveedor ni precio.
//   2. PROVEEDURÍA (Angie)  ve todos los materiales solicitados (de varios
//        pedidos) y selecciona líneas de DISTINTOS pedidos para armar UNA orden
//        que se envía al proveedor. Aquí elige proveedor, fechas, IVA, tipo.
//   3. BODEGA      (Kattya) recibe el material y registra la FACTURA, lo que
//        genera los movimientos contables y alimenta el inventario.
//
// Pedido ↔ Orden es N:M (el enlace vive a nivel de línea: OrdenLinea.pedidoLineaId).
// Una Orden tiene muchas Recepciones (entregas parciales).
// ============================================================================

// nota: la ruta interna 'facturacion' se muestra como "Bodega" (Kattya) en la UI
export type Role = "ingenieria" | "proveeduria" | "aprobacion" | "facturacion" | "contabilidad";

export type LineType = "articulo" | "cargo"; // 'cargo' = flete / cargo de producto
// stock = compra para bodega/inventario · subcontrato = servicio contratado contra
// la obra (en BC no hay módulo de subcontratos: es un pedido de compra a un
// proveedor, con proyecto + tarea, que el ingeniero arma completo).
export type TipoSolicitud = "material" | "repuesto" | "stock" | "subcontrato";
// Destino del material/repuesto pedido (el "tag" ALM/CD del pedido):
//   'almacen' → entra a inventario de un almacén REAL elegido (ALM-GRAL, F-AGREGADO, …)
//   'consumo' → consumo directo: no entra a inventario (material: contra obra + tarea)
export type DestinoPedido = "almacen" | "consumo";

// ---- Catálogos (espejo de Business Central) ----
export interface Proveedor {
  id: string;
  code: string;        // PROV-001305
  nombre: string;
  paymentTermsCode?: string;   // CONTADO
  paymentMethodCode?: string;  // TRANSFER
  currencyCode?: string;       // "" = CRC
  cedula?: string;
}

export interface Articulo {
  id: string;
  code: string;        // M16-0075
  descripcion: string;
  unidad: string;      // unidad BASE (UND, KG, GR…): con la que el material se CONSUME
  /** Unidad de COMPRA de BC (Purch. Unit of Measure): con la que se le pide al
   *  proveedor. Casi ningún artículo la tiene distinta de la base, así que sirve como
   *  default, no para saber si el artículo es multi-unidad (eso lo dice itemUnitsOfMeasure). */
  unidadCompra?: string;
  almacenDefault: string;
  precioReferencia: number;
  // BC Item.Type. El catálogo de los buscadores trae los tres tipos: se compra
  // igual, solo cambia que servicio / no inventariable no llevan almacén en BC.
  tipo: "inventario" | "servicio" | "no-inventario";
}

export interface Obra {
  id: string;
  codigo: string;      // OBRA-001
  nombre: string;
  /** BC: Job.Blocked = "All". Una obra bloqueada NO admite material (BC rechaza la
   *  línea), así que no se ofrece al crear el pedido. Ojo: es distinto de Job.Status. */
  bloqueada?: boolean;
}

export interface Maquina {
  id: string;
  no: string;          // GomEqp Machine No.
  nombre: string;
  placa?: string;
}

export interface Almacen {
  codigo: string;      // ALM-GRAL
  nombre: string;
}

// ============================ PEDIDO (Ingeniería · Laura) ===================
export type PedidoEstado = "borrador" | "aprobado" | "en_orden" | "cerrado" | "devuelto";

// ============================ NOTIFICACIONES (in-app) =======================
export interface Notificacion {
  id: string;
  tipo: "pedido" | "orden" | "factura" | "devuelto";
  mensaje: string;
  fecha: string;       // ISO
  leida: boolean;
  rol?: Role;          // a qué rol le interesa (opcional)
  href?: string;       // a dónde llevar al hacer click
}

// ============================ PLANIFICACIÓN (Ingeniería) =====================
// Grilla tipo "Programación": filas = unidades, columnas = partidas (categorías
// que el ingeniero crea), celdas = valor libre (fecha / estado / color / texto).
export interface PlanCategoria { id: string; nombre: string; }
export interface PlanFila {
  id: string;
  modelo: string;
  lote: string;
  responsable: string;
  valores: Record<string, string>; // valores[categoriaId] = valor de la celda
}

export interface PedidoLinea {
  id: string;
  articuloId: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  /** Almacén REAL de destino (ALM-GRAL, F-AGREGADO, …). En consumo directo de
   *  material es el almacén de la obra (mismo código que el proyecto en BC).
   *  Histórico: en pedidos viejos de material acá venía la OBRA (ver `obraCodigo`). */
  almacen: string;
  /** Obra de la línea (dbo.PedidoCompraDet.obra). Un pedido de material puede
   *  tener varias obras, una por tarjeta. En pedidos viejos la obra venía dentro
   *  de `almacen`; el mapeo la recupera acá para que el resto no cambie. */
  obraCodigo?: string;
  variantCode?: string;     // variante del item (si aplica)
  taskNo?: string;          // N.º tarea proyecto (Job Task) — consumo inmediato
  taskDescr?: string;       // descripción de la tarea (para mostrar / BC)
  cantidadOrdenada: number; // cuánto de esta línea ya pasó a una orden
  notas?: string;
  /** Proveeduría la devolvió a Ingeniería para corregir (ej. código de material
   *  equivocado), sin tocar las demás líneas del pedido. Solo puede pasar en una
   *  línea sin nada ordenado (cantidadOrdenada = 0): si ya tiene orden de compra
   *  queda bloqueada, no se devuelve. Se limpia sola al guardar la corrección. */
  devuelta?: boolean;
}

export interface Pedido {
  id: string;
  numero: string;            // PED-000123
  tipoSolicitud: TipoSolicitud;
  obraCodigo?: string;       // destino si material
  obraNombre?: string;
  maquinaNo?: string;        // destino si repuesto
  maquinaNombre?: string;
  solicitante: string;       // Laura (nombre para mostrar)
  creadoPorId?: string;      // id ESTABLE del creador (username de sesión); para "mis solicitudes". Histórico: puede traer un nombre.
  loteRef?: string;          // lote/unidad de Planificación desde el que se armó (para enlazar)
  fecha: string;             // ISO
  estado: PedidoEstado;
  prioridad: "normal" | "alta" | "urgente";
  notas?: string;
  idClasificacion?: number | null; // clasificación WBS (para ligar la celda de la Matriz al pedido)
  lineas: PedidoLinea[];
}

// ============================ ORDEN (Proveeduría · Angie) ===================
export type OrdenEstado =
  | "abierto"
  | "pendiente_aprobacion"
  | "rechazado"
  | "lanzado"
  | "completado";

export interface OrdenLinea {
  id: string;
  /** N.º de línea del documento (10000, 20000…). Es el mismo que lleva la línea en
   *  Business Central, así que sirve para emparejarlas sin adivinar por artículo. */
  lineNo?: number;
  tipo: LineType;
  articuloId?: string;
  variantCode?: string;     // variante del item (obligatoria en BC para items con variantes)
  pedidoLineaId?: string;   // enlace N:M a la línea de pedido origen
  pedidoNumero?: string;
  /** Obra de la línea, heredada de la línea de pedido origen (la orden no la
   *  persiste; la resuelve el join de repo.listOrdenes/getOrden). En consumo
   *  directo la obra además viaja como `proyecto` (Job No. de BC). */
  obra?: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  almacen: string;
  precioUnitario: number;
  ivaPct: number;
  chargeNo?: string;         // N.º de Cargo de producto (Item Charge BC) — solo líneas tipo "cargo"
  chargeMethod?: string;     // método de asignación del cargo: Amount|Weight|Volume|Equally (default Amount)
  descuentoPct?: number;     // descuento de línea
  proyecto?: string;         // obra / Job No.
  taskNo?: string;           // N.º tarea proyecto
  cantidadRecibida: number;
  cantidadFacturada: number;
}

export interface Orden {
  id: string;
  numero: string;           // CP-000862
  proveedorId: string;
  proveedorNo?: string;     // código BC del proveedor (PROV-…) para crear el pedido en BC al aprobar
  proveedorNombre?: string;
  almacenRecepcion?: string; // almacén/ubicación de recepción en BC (default ALM-GRAL)
  fecha: string;            // ISO emisión
  fechaRecepEsperada?: string;
  currencyCode: string;     // "" = CRC, "USD"
  estado: OrdenEstado;
  versionesArchivadas: number;
  lineas: OrdenLinea[];
  bcNumber?: string;        // Nº del Pedido de compra en Business Central (CP-…)
  bcDeepLink?: string;      // link directo al Pedido en BC (editar / registrar / vista previa)
  notas?: string;           // motivo de la última devolución/denegación (Aprobación → Proveeduría)
  motivoRechazo?: string;   // motivo del rechazo (Aprobación); también queda en el histórico
}

// ============================ RECEPCIÓN / FACTURA (Bodega · Kattya) =========
export interface RecepcionLinea {
  ordenLineaId: string;
  cantidadRecibida: number;
  precioFactura?: number;   // precio facturado de la línea (puede diferir del de la orden)
}

export interface Recepcion {
  id: string;
  ordenId: string;
  numeroFactura: string;
  fechaFactura: string;
  fechaRecepcion: string;
  fechaRegistro: string;
  total: number;
  lineas: RecepcionLinea[];
  parcial: boolean;
  // Quién recibió/registró la recepción (hay varios en bodega). Es creadoPor en BD.
  recibidoPor?: string;
  // MODO 2: material recibido pero la factura quedó EN REVISIÓN (aún sin registrar).
  // Se deriva de numeroFactura vacío; Kattya la registra después (bcFacturarRecibido).
  facturaEnRevision?: boolean;
}

// ============================ NOTAS DE CRÉDITO (Bodega · Kattya) ============
// Líneas de una factura recibida que vienen MAL (dañado / menos cantidad / precio
// distinto). El material se recibe igual, pero esas líneas se marcan para emitir
// una NOTA DE CRÉDITO. Es DISTINTO de Devoluciones (que devuelve toda la OC/pedido).
export type MotivoNC = "danado" | "menos_cantidad" | "precio_distinto";
export interface NotaCreditoLinea {
  id: string;
  ordenId: string;
  ordenNumero: string;
  proveedor?: string;
  ordenLineaId?: string;
  articuloNo?: string;
  descripcion: string;
  motivo: MotivoNC;
  cantidad: number;
  precioUnitario?: number;
  nota?: string;
  fecha: string;                 // ISO
  estado: "pendiente" | "resuelta";
}

// ============================ BITÁCORA / MOVIMIENTOS ========================
export interface Movimiento {
  id: string;
  entidad: "pedido" | "orden" | "recepcion";
  idEntidad: string;
  documentoNo: string;
  tipoMovimiento: string;       // creado, enviado_aprobacion, aprobado, rechazado, recepcion_parcial…
  estadoAnterior?: string;
  estadoNuevo?: string;
  detalle?: string;
  usuario: string;
  rol: Role;
  fecha: string;                // ISO datetime
}
