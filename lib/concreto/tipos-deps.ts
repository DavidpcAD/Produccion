// Tipos de las dependencias externas del módulo Concreto (integraciones que
// viven fuera de la base de datos propia): Business Central (pedido de
// ensamblado), fotos en Azure Blob Storage y gestión de roles vía Microsoft
// Graph.
//
// Portado del paquete `@adelante/shared` de la app original
// `adelante-control-concreto`. NO tocar `tipos.ts` (lo mantiene otro agente);
// todo lo de estas features va acá.

// ─── Pedido de Ensamblado en Business Central ────────────────────────────────

/**
 * Una línea del Pedido de Ensamblado (material consumido por la colada), ya
 * con la conversión de unidad aplicada (kg → m³ para áridos si corresponde).
 * BC arma sus propias líneas desde la BOM del Item; estas líneas son el
 * detalle informativo que la app calcula desde los batches de la colada.
 */
export interface LineaPedidoEnsamblado {
  /** Código del material/recurso en BC (ej. M10-0010, EQ-0039). */
  codigo_bc: string;
  descripcion_bc: string;
  /** Unidad de medida en BC (ej. kg, m3, l). */
  um_bc: string;
  /** Cantidad total consumida en la colada (ya convertida a `um_bc`). */
  cantidad_total_consumida: number;
  /** Consumo por m³ producido (cantidad_total / m3_producidos). */
  ratio_por_m3: number;
  /** Cantidad teórica según receta (por ahora null — se llena en sesión futura). */
  cantidad_total_teorica: number | null;
  /** Desviación % real vs teórico (por ahora null). */
  desviacion_pct: number | null;
}

/**
 * Vista previa de lo que se enviará a BC. La UII la usa para mostrar los datos
 * resueltos (item M10, recurso EQ, cantidad m³) + el detalle de materiales, y
 * para detectar bloqueantes antes de confirmar el POST.
 */
export interface PreviewPedidoEnsambladoBC {
  id_colada: number;
  codigo_interno_colada: string;
  fecha_colada: string;

  /** Item resuelto desde la receta_bc de la colada. */
  codigo_producto_bc: string | null;
  descripcion_producto_bc: string | null;
  /** Recurso resuelto desde la receta_bc (ej. EQ-0039 BIANCA). Informativo. */
  codigo_recurso_bc: string | null;
  recurso_bc_descripcion: string | null;

  /** Cantidad m³ total de la colada. */
  cantidad_m3: number;

  /** Obra asignada a la colada (si la hay). Define el almacén destino. */
  obra_works_no: string | null;
  obra_display_name: string | null;

  /** N° de pedido BC ya asignado (si existe → crear falla con 409). */
  numero_pedido_bc_existente: string | null;

  /** Razones por las que NO se puede crear el pedido (validación preventiva). */
  bloqueantes: string[];

  /** Detalle de materiales consumidos (informativo para la UI). */
  lineas: LineaPedidoEnsamblado[];
}

/**
 * Respuesta de la creación del pedido en BC. `numero_pedido` es el `No.` que
 * asignó la No. Series de BC (PENS####).
 */
export interface CrearPedidoEnsambladoBCResponse {
  numero_pedido: string;
  /** ID interno del documento en BC (GUID/SystemId), si BC lo devuelve. */
  id_bc: string | null;
  /** N° del item que terminó en el header (snapshot). */
  codigo_producto_bc: string;
  /** Cantidad m³ enviada. */
  cantidad: number;
  /** Almacén destino enviado. */
  codigo_almacen_destino: string;
  /** Deep-link a la página del pedido en BC (si se pudo armar). */
  url_bc: string | null;
}

/** Overrides opcionales al crear el pedido (todos derivan de la colada si faltan). */
export interface OpcionesCrearPedidoBC {
  /** Almacén destino (Location Code). Default: obra_works_no de la colada. */
  codigoAlmacenDestino?: string;
  /** Fecha de registro (YYYY-MM-DD). Default: hoy. */
  fechaRegistro?: string;
  /** Override del código de producto BC (M10-xxxx). */
  codigoProductoBc?: string;
  /** Override de cantidad (m³). */
  cantidadM3?: number;
}

// ─── Fotos de muestras de laboratorio (Azure Blob Storage) ────────────────────

export interface FotoMuestra {
  id: number;
  id_muestra: number;
  id_ensayo: number | null;
  nombre_original: string | null;
  content_type: string;
  tamano_bytes: number | null;
  creado_en: string;
  /** URL SAS de lectura temporal generada al vuelo. */
  url: string;
}

// ─── Gestión de roles de usuarios (Microsoft Graph / Entra ID) ────────────────

/**
 * Roles definidos como App Roles en la App Registration del API (Entra ID).
 * Mantener sincronizado con la config de Entra ID.
 */
export const ROLES_APP = ['Admin', 'Operador', 'Laboratorio', 'Ingenieria'] as const;
export type RolApp = (typeof ROLES_APP)[number];

/**
 * Usuario del tenant con los roles que tiene asignados en NUESTRA app.
 * `assignmentId` es el id de la asignación user↔role (necesario para borrarla).
 */
export interface UsuarioConRoles {
  /** Object ID del usuario en Entra ID. */
  oid: string;
  nombre: string;
  email: string;
  roles: Array<{ rol: RolApp; assignmentId: string }>;
}
