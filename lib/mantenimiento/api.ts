// Cliente HTTP delgado para app/api/*. Cada función tira un Error con el
// mensaje que ya arma el propio endpoint (NextResponse.json({error, ...})) si
// la respuesta no es 2xx, para que quien llama solo necesite un try/catch +
// mostrar err.message en un toast.

export interface RespuestaSubida {
  id: string;
  url: string;
  sizeBytes: number;
  contentType: string;
}

interface DocConId<T> {
  id: string;
  data: T;
}

interface RespuestaColeccion<T> {
  docs?: DocConId<T>[];
}

// Este módulo vive EMBEBIDO en Produccion bajo /mantenimiento, y sus rutas de
// API cuelgan de /api/mantenimiento/*. Las pantallas y el store siguen pidiendo
// "/api/equipos", "/api/ots", … (como en el repo original de Steven); acá se les
// antepone el prefijo en un solo lugar, para no tocar cada llamada.
function conBase(ruta: string): string {
  return ruta.startsWith("/api/") ? "/api/mantenimiento/" + ruta.slice("/api/".length) : ruta;
}

async function manejarRespuesta(respuesta: Response): Promise<any> {
  let cuerpo: any = null;
  try {
    cuerpo = await respuesta.json();
  } catch {
    // Algunas rutas (ej. /api/blob/[id] en error) responden texto plano.
  }
  if (!respuesta.ok) {
    throw new Error((cuerpo && cuerpo.error) || `Error ${respuesta.status} al hablar con el servidor.`);
  }
  return cuerpo;
}

export async function apiGet<T = any>(ruta: string): Promise<T> {
  const respuesta = await fetch(conBase(ruta), { cache: "no-store" });
  return manejarRespuesta(respuesta);
}

export async function apiPost<T = any>(ruta: string, body?: unknown): Promise<T> {
  const respuesta = await fetch(conBase(ruta), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {})
  });
  return manejarRespuesta(respuesta);
}

export async function apiPatch<T = any>(ruta: string, body?: unknown): Promise<T> {
  const respuesta = await fetch(conBase(ruta), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {})
  });
  return manejarRespuesta(respuesta);
}

export async function apiDelete<T = any>(ruta: string): Promise<T> {
  const respuesta = await fetch(conBase(ruta), { method: "DELETE" });
  return manejarRespuesta(respuesta);
}

// Sube un archivo (foto o firma) a /api/assets y devuelve { id, url, sizeBytes, contentType }.
export async function subirArchivo(archivo: File | Blob, contentType?: string): Promise<RespuestaSubida> {
  const formulario = new FormData();
  formulario.append("file", archivo);
  if (contentType) formulario.append("contentType", contentType);
  const respuesta = await fetch(conBase("/api/assets"), { method: "POST", body: formulario });
  return manejarRespuesta(respuesta);
}

// Los GET de colecciones devuelven { docs: [{ id, data }, ...] } — esto los
// aplana a [{ id, ...data }, ...], que es la forma que usan las pantallas.
export function aplanarDocs<T extends object>(respuesta: RespuestaColeccion<T> | null | undefined): (T & { id: string })[] {
  return (respuesta?.docs || []).map((doc) => ({ id: doc.id, ...doc.data }));
}
