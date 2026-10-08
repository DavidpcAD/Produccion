import type { CuerpoListo } from "@/lib/http/json-comprimido";

/* ============================================================================
   UNA SOLA CORRIDA COMPARTIDA del bootstrap de Compras (PASO 2).

   El problema: cada pestaña abierta vuelve a pedir el bootstrap cada 20 s
   (store.tsx, REFRESCO_MS). Dos pestañas que caen juntas corren el trabajo dos
   veces, y el 304 NO lo evita: el servidor arma el cuerpo (serializa ~5.7 MB de
   AdelantePRO, lo hashea, lo comprime) y recién ahí compara la huella. O sea que
   la parte CARA se pagaba igual, muchas veces por minuto.

   Acá se guarda la RESPUESTA YA ARMADA (cuerpo + ETag + gzip, un `CuerpoListo`),
   no los datos crudos: volver a serializar y a sacar la huella es la otra mitad
   del costo. Dos cosas:

   · Coalescing: el que llega mientras otra corrida va en vuelo se cuelga de ESA,
     no arranca otra.
   · Ventana corta de reúso (TTL de unos segundos): dentro de ella se devuelve la
     foto sin tocar la base.

   REGLA DURA (lo que hace que esto no sea peligroso): TODA ESCRITURA bota la foto
   al instante. Si alguien guarda algo, pide la lista y la recibe sin lo suyo, no
   lo lee como "va con retraso", lo lee como "no se guardó" — y lo vuelve a
   guardar. Un documento duplicado cuesta más que todo lo que ahorró la caché. Por
   eso `invalidarBootstrap()` se engancha en la CREACIÓN DE LA CONSULTA (ver
   lib/compras/pedir.ts), no en cada escritura a mano.

   APAGADO: `COMPRAS_BOOTSTRAP_TTL_MS=0` → no se guarda nada y no se comparte nada,
   o sea el comportamiento de siempre (cada request arma su cuerpo). Es el
   interruptor por variable de entorno, sin desplegar.
   ============================================================================ */

export type SnapshotBootstrap = CuerpoListo & {
  /** `Date.now()` de cuando se armó. */
  creado: number;
};

const TTL_DEFECTO = 8_000;

/** TTL de reúso en ms. `0` (o negativo) = caché apagada. Se lee en cada request
 *  para que el interruptor por env tenga efecto sin reiniciar. */
export function ttlBootstrapMs(): number {
  const v = process.env.COMPRAS_BOOTSTRAP_TTL_MS;
  if (v == null || v === "") return TTL_DEFECTO;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : TTL_DEFECTO;
}

/** ¿La foto sigue sirviendo? Pura: no mira el reloj por su cuenta. */
export function esFresca(snap: SnapshotBootstrap | null, ahora: number, ttl: number): boolean {
  if (!snap || ttl <= 0) return false;
  return ahora - snap.creado < ttl;
}

/** Detector de escrituras: INSERT / UPDATE / DELETE / MERGE en cualquier parte de
 *  la sentencia. Falso positivo asumido: un SELECT que mencione la palabra
 *  "update" en un texto bota la foto. Botar de más cuesta una consulta; botar de
 *  menos cuesta que alguien no vea lo que acaba de guardar. */
const RE_ESCRITURA = /\b(insert|update|delete|merge)\b/i;
export function esEscritura(sentencia: unknown): boolean {
  const texto =
    typeof sentencia === "string"
      ? sentencia
      : Array.isArray(sentencia)
        ? sentencia.join(" ") // query tag-template: TemplateStringsArray
        : "";
  return RE_ESCRITURA.test(texto);
}

// ── Estado del módulo (vive lo que viva el proceso del servidor) ─────────────
let foto: SnapshotBootstrap | null = null;
let enVuelo: Promise<SnapshotBootstrap> | null = null;
// Generación: cada invalidación la sube. Una corrida que empezó ANTES de una
// escritura termina con una generación vieja y por eso NO se guarda: pudo haber
// leído datos previos al cambio.
let generacion = 0;

/** Bota la foto al instante y envenena cualquier corrida en vuelo (no se
 *  guardará su resultado). La llama `pedir()` ante cada INSERT/UPDATE/DELETE/MERGE. */
export function invalidarBootstrap(): void {
  generacion++;
  foto = null;
  // Se suelta la promesa en vuelo para que el que llegue después de la escritura
  // arranque una corrida NUEVA (con datos post-escritura) en vez de colgarse de
  // una que leyó de antes. La vieja sigue corriendo, pero su resultado se
  // descarta por la generación.
  enVuelo = null;
}

/** Devuelve la foto fresca, o la corrida en vuelo, o arranca una con `construir`.
 *  `construir` arma el `CuerpoListo` (corre las queries, serializa, comprime). */
export async function snapshotBootstrap(
  construir: () => Promise<CuerpoListo>,
): Promise<{ snap: SnapshotBootstrap; cache: "hit" | "vuelo" | "miss" }> {
  const ttl = ttlBootstrapMs();
  // Apagada: siempre fresco, sin compartir ni guardar.
  if (ttl <= 0) {
    const listo = await construir();
    return { snap: { ...listo, creado: Date.now() }, cache: "miss" };
  }

  if (esFresca(foto, Date.now(), ttl)) return { snap: foto!, cache: "hit" };
  if (enVuelo) return { snap: await enVuelo, cache: "vuelo" };

  const miGen = generacion;
  const p = (async (): Promise<SnapshotBootstrap> => {
    const listo = await construir();
    const snap: SnapshotBootstrap = { ...listo, creado: Date.now() };
    // Solo se guarda si nadie invalidó mientras se construía.
    if (generacion === miGen) foto = snap;
    return snap;
  })();
  enVuelo = p;
  p.catch(() => {}).finally(() => { if (enVuelo === p) enVuelo = null; });

  return { snap: await p, cache: "miss" };
}

/** Solo para pruebas: devuelve el estado interno a cero. */
export function _resetBootstrapCache(): void {
  foto = null;
  enVuelo = null;
  generacion = 0;
}
