// Store de actualizaciones remotas (OTA) de la app de maquinaria: expo-updates,
// protocolo v1. Es el mismo esquema que usa h4 con la app de cuadrillas.
//
// El servidor NO firma nada. La llave privada vive en la Mac de quien publica
// (~/.maquinaria-movil/keys) y nunca sube a Azure; acá solo se leen y se
// reenvían bytes ya firmados. Por eso lo que se sirve es Buffer y nunca pasa por
// JSON.parse/JSON.stringify: la firma cubre los bytes exactos del manifest, y
// reserializarlo (aunque quede "igual") la rompe y el teléfono lo descarta sin
// avisar.
//
// Layout del store:
//   <RAIZ>/releases.json                               reparto: qué recibe la flota y cada teléfono
//   <RAIZ>/updates/<rv>/<updateId>/manifest.json       bytes exactos que se firmaron
//   <RAIZ>/updates/<rv>/<updateId>/manifest.sig        header expo-signature ya armado
//   <RAIZ>/directives/no-update-available.json + .sig  directiva "no hay nada nuevo" firmada
//   <RAIZ>/pool/<md5>.<ext>                            bundles y assets, por contenido
//
// releases.json lo escribe SOLO este servidor, desde Mantenimiento → App móvil.
// La Mac sube publicaciones y nunca lo toca: subir una publicación no le cambia
// nada a nadie, queda disponible para elegirla en la web.
//
// QUÉ RECIBE CADA TELÉFONO. Cada publicación lleva su número en
// `metadata.publicacion` ("0.3"). El servidor manda `expo-manifest-filters:
// publicacion="0.3"` con el número que le toca a ese teléfono, y expo-updates
// instala lo que se le sirve aunque sea MÁS VIEJO que lo que corre si lo que
// corre no pasa el filtro. Así funciona volver a una versión anterior.
import { randomUUID } from 'node:crypto';
import { readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

/** Raíz del store. En Azure: /home/data/maquinaria-updates (persistente, fuera de wwwroot). */
export function raizStore(): string {
  const v = process.env.MAQUINARIA_UPDATES_DIR?.trim();
  if (v) return path.resolve(v.startsWith('~') ? path.join(homedir(), v.slice(1)) : v);
  // En App Service (WEBSITE_INSTANCE_ID solo existe ahí) /home es el único disco
  // que sobrevive a los deploys. Tener el default correcto es a propósito: si
  // dependiera de una App Setting olvidada, toda la flota recibiría 404 para
  // siempre sin que nadie se entere.
  if (process.env.WEBSITE_INSTANCE_ID) return '/home/data/maquinaria-updates';
  return path.join(homedir(), 'maquinaria-movil-updates');
}

async function leerBytes(abs: string): Promise<Buffer | null> {
  try {
    return await readFile(abs);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

/** El `.sig` termina en \n y un header con salto de línea es ilegal: va con trim. */
async function leerFirma(abs: string): Promise<string | null> {
  const s = (await leerBytes(abs))?.toString('utf8').trim();
  return s ? s : null;
}

// Lo que viene del request (o de releases.json) arma rutas de archivo: se valida
// para que ningún ".." salga del store.
const SEGMENTO_OK = /^[A-Za-z0-9._-]+$/;
export function segmentoSeguro(s: string): boolean {
  return SEGMENTO_OK.test(s) && s !== '.' && s !== '..';
}

/**
 * releases.json — el estado del reparto.
 *   android   qué recibe TODA la flota, por runtimeVersion
 *   equipos   teléfonos con una publicación propia (para probar), por runtimeVersion y por ID de Android
 *   anterior  lo que tenía la flota antes del último "distribuir"
 */
interface Releases {
  android?: Record<string, string>;
  ios?: Record<string, string>;
  equipos?: Record<string, Record<string, Record<string, string> | undefined> | undefined>;
  anterior?: Record<string, Record<string, { updateId: string; publicacion: string | null }> | undefined>;
}

async function leerReleases(): Promise<Releases | null> {
  const crudo = await leerBytes(path.join(raizStore(), 'releases.json'));
  return crudo ? (JSON.parse(crudo.toString('utf8')) as Releases) : null;
}

/** tmp + rename: nadie lee el puntero a medio escribir. */
async function escribirReleases(r: Releases): Promise<void> {
  const destino = path.join(raizStore(), 'releases.json');
  const tmp = `${destino}.tmp-${process.pid}`;
  await writeFile(tmp, `${JSON.stringify(r, null, 2)}\n`, 'utf8');
  await rename(tmp, destino);
}

function establesDe(r: Releases, platform: string): Record<string, string> {
  return ((r as Record<string, unknown>)[platform] as Record<string, string> | undefined) ?? {};
}

export interface Publicacion {
  updateId: string;
  runtimeVersion: string;
  /** Número legible ("0.3"). */
  publicacion: string | null;
  publicadaUtc: string;
}

function numeroDe(manifest: unknown): string | null {
  const m = manifest as { metadata?: { publicacion?: unknown }; extra?: { publicacion?: unknown } } | null;
  const n = m?.metadata?.publicacion ?? m?.extra?.publicacion;
  return typeof n === 'string' && n.trim() !== '' ? n.trim() : null;
}

/** Una publicación no cambia una vez subida: se lee una sola vez (la fecha va en la clave). */
const cachePublicaciones = new Map<string, Publicacion>();

async function listarDir(abs: string): Promise<string[]> {
  try {
    return (await readdir(abs, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}

/** Todas las publicaciones subidas, de la más nueva a la más vieja. */
export async function listarPublicaciones(): Promise<Publicacion[]> {
  const dirUpdates = path.join(raizStore(), 'updates');
  const out: Publicacion[] = [];
  for (const rv of await listarDir(dirUpdates)) {
    if (!segmentoSeguro(rv)) continue;
    for (const updateId of await listarDir(path.join(dirUpdates, rv))) {
      if (!segmentoSeguro(updateId)) continue;
      const abs = path.join(dirUpdates, rv, updateId, 'manifest.json');
      let fecha: number;
      try {
        fecha = (await stat(abs)).mtimeMs;
      } catch {
        continue; // a medio subir: todavía no es una publicación
      }
      const clave = `${rv}/${updateId}@${fecha}`;
      let p = cachePublicaciones.get(clave);
      if (!p) {
        const bytes = await leerBytes(abs);
        if (!bytes) continue;
        let m: { createdAt?: unknown };
        try {
          m = JSON.parse(bytes.toString('utf8')); // solo para LEER datos
        } catch {
          continue;
        }
        p = {
          updateId,
          runtimeVersion: rv,
          publicacion: numeroDe(m),
          publicadaUtc: typeof m.createdAt === 'string' ? m.createdAt : new Date(fecha).toISOString(),
        };
        cachePublicaciones.set(clave, p);
      }
      out.push(p);
    }
  }
  return out.sort((a, b) => b.publicadaUtc.localeCompare(a.publicadaUtc));
}

export interface UpdatePublicado {
  updateId: string;
  manifest: Buffer;
  firma: string;
  /** Valor de `expo-manifest-filters` que fija al teléfono en esta publicación. */
  filtro: string | null;
}

async function leerPublicado(runtimeVersion: string, updateId: string): Promise<UpdatePublicado | null> {
  if (!segmentoSeguro(updateId)) return null;
  const dir = path.join(raizStore(), 'updates', runtimeVersion, updateId);
  const manifest = await leerBytes(path.join(dir, 'manifest.json'));
  const firma = manifest ? await leerFirma(path.join(dir, 'manifest.sig')) : null;
  if (!manifest || !firma) return null;
  let numero: string | null = null;
  try {
    numero = numeroDe(JSON.parse(manifest.toString('utf8')));
  } catch {
    /* sin número no hay filtro */
  }
  // Va en un header de campos estructurados: solo un número simple, nada que escapar.
  const filtro = numero && /^[0-9A-Za-z._-]{1,20}$/.test(numero) ? `publicacion="${numero}"` : null;
  return { updateId, manifest, firma, filtro };
}

/**
 * Qué update le corresponde a este teléfono. null si no hay nada para ese
 * runtimeVersion (APK recién compilado al que todavía no se le repartió nada).
 * Lanza si lo que recibe la flota está incompleto: un store roto tiene que verse.
 */
export async function buscarUpdate(
  platform: string,
  runtimeVersion: string,
  equipo: string | null,
): Promise<UpdatePublicado | null> {
  if (!segmentoSeguro(platform) || !segmentoSeguro(runtimeVersion)) return null;
  const releases = await leerReleases();
  if (!releases) return null;

  const propia = equipo ? releases.equipos?.[platform]?.[runtimeVersion]?.[equipo] : undefined;
  if (propia) {
    const u = await leerPublicado(runtimeVersion, propia);
    if (u) return u;
    console.error(`[maquinaria/updates] el teléfono ${equipo} tiene asignada ${propia} y no está completa en el store`);
  }

  const estable = establesDe(releases, platform)[runtimeVersion];
  if (!estable) return null;
  const u = await leerPublicado(runtimeVersion, estable);
  if (!u) throw new Error(`releases.json apunta a ${estable} pero su manifest o su firma no están en el store`);
  return u;
}

/** Qué hay publicado y a quién le llega: lo que pinta la pantalla App móvil. */
export interface EstadoReparto {
  publicaciones: Publicacion[];
  /** Lo que recibe toda la flota, por runtimeVersion. */
  estable: Record<string, { updateId: string; publicacion: string | null }>;
  /** Teléfonos con una publicación propia, por ID de Android. */
  asignados: Record<string, { updateId: string; runtimeVersion: string; publicacion: string | null }>;
}

export async function estadoReparto(platform: string): Promise<EstadoReparto> {
  const [releases, publicaciones] = await Promise.all([leerReleases(), listarPublicaciones()]);
  const r = releases ?? {};
  const numero = (updateId: string) => publicaciones.find((p) => p.updateId === updateId)?.publicacion ?? null;

  const estable: EstadoReparto['estable'] = {};
  for (const [rv, updateId] of Object.entries(establesDe(r, platform))) {
    estable[rv] = { updateId, publicacion: numero(updateId) };
  }
  const asignados: EstadoReparto['asignados'] = {};
  for (const [rv, porEquipo] of Object.entries(r.equipos?.[platform] ?? {})) {
    for (const [equipo, updateId] of Object.entries(porEquipo ?? {})) {
      asignados[equipo] = { updateId, runtimeVersion: rv, publicacion: numero(updateId) };
    }
  }
  return { publicaciones, estable, asignados };
}

export type AccionReparto = 'enviar' | 'quitar' | 'distribuir';

const CUANDO_LLEGA = 'Le llega cuando la app consulte (al abrirla o al volver a ella) y se instala al volver a abrirla.';
const CUANDO_LES_LLEGA = 'Les llega cuando la app consulte (al abrirla o al volver a ella) y se instala al volver a abrirla.';

/**
 * Aplica una acción sobre el reparto: lee, modifica y escribe. Sin candado entre
 * procesos: es un archivo que se toca pocas veces por semana y por una sola
 * persona; lo peor que pasa es tener que volver a mandar una.
 */
export async function aplicarReparto(
  accion: AccionReparto,
  opts: { platform: string; equipo?: string | null; updateId?: string | null; runtimeVersionEquipo?: string | null },
): Promise<{ estado: EstadoReparto; mensaje: string }> {
  const { platform } = opts;
  if (!segmentoSeguro(platform)) throw new ErrorReparto('Plataforma inválida');
  const equipo = opts.equipo?.trim() ?? '';
  if (accion !== 'distribuir' && (!equipo || !segmentoSeguro(equipo))) throw new ErrorReparto('Teléfono inválido');

  const r = (await leerReleases()) ?? {};
  const publicaciones = await listarPublicaciones();
  const nombre = (p: Publicacion) => (p.publicacion ? `La ${p.publicacion}` : 'Esa publicación');
  const estables = establesDe(r, platform);
  let mensaje: string;

  if (accion === 'quitar') {
    for (const porEquipo of Object.values(r.equipos?.[platform] ?? {})) {
      if (porEquipo) delete porEquipo[equipo];
    }
    const rv = opts.runtimeVersionEquipo;
    const deTodos = rv ? publicaciones.find((p) => p.updateId === estables[rv]) : undefined;
    mensaje = `Ese teléfono vuelve a la de todos${deTodos?.publicacion ? ` (${deTodos.publicacion})` : ''}. ${CUANDO_LLEGA}`;
  } else {
    const pub = publicaciones.find((p) => p.updateId === opts.updateId);
    if (!pub) throw new ErrorReparto('Esa publicación no está en el servidor. Subila desde la Mac y volvé a intentar.');
    const rv = pub.runtimeVersion;

    if (accion === 'enviar') {
      if (opts.runtimeVersionEquipo && opts.runtimeVersionEquipo !== rv) {
        throw new ErrorReparto(
          'Ese teléfono tiene instalado otro APK: esta publicación es para una base distinta y no le serviría. Instalale el APK nuevo primero.',
        );
      }
      for (const porEquipo of Object.values(r.equipos?.[platform] ?? {})) {
        if (porEquipo) delete porEquipo[equipo];
      }
      if (estables[rv] === pub.updateId) {
        mensaje = `Ese teléfono queda con la ${pub.publicacion ?? 'publicación'} que tienen todos. ${CUANDO_LLEGA}`;
      } else {
        r.equipos = r.equipos ?? {};
        const porPlataforma = (r.equipos[platform] = r.equipos[platform] ?? {});
        const porEquipo = (porPlataforma[rv] = porPlataforma[rv] ?? {});
        porEquipo[equipo] = pub.updateId;
        mensaje = `${nombre(pub)} va para ese teléfono. ${CUANDO_LLEGA}`;
      }
    } else {
      const previo = estables[rv];
      if (previo && previo !== pub.updateId) {
        r.anterior = r.anterior ?? {};
        r.anterior[platform] = {
          ...(r.anterior[platform] ?? {}),
          [rv]: { updateId: previo, publicacion: publicaciones.find((p) => p.updateId === previo)?.publicacion ?? null },
        };
      }
      estables[rv] = pub.updateId;
      (r as Record<string, unknown>)[platform] = estables;
      // Distribuir alcanza también a los que tenían otra para probar.
      if (r.equipos?.[platform]) delete r.equipos[platform]![rv];
      mensaje = `${nombre(pub)} queda para todos los teléfonos. ${CUANDO_LES_LLEGA}`;
    }
  }

  await escribirReleases(r);
  return { estado: await estadoReparto(platform), mensaje };
}

/** Error de negocio, escrito para que lo lea una persona: va como 400. */
export class ErrorReparto extends Error {}

/** La directiva noUpdateAvailable firmada (una sola para todos los runtimeVersion). */
export async function buscarDirectivaSinUpdate(): Promise<{ cuerpo: Buffer; firma: string } | null> {
  const dir = path.join(raizStore(), 'directives');
  const cuerpo = await leerBytes(path.join(dir, 'no-update-available.json'));
  if (!cuerpo) return null;
  const firma = await leerFirma(path.join(dir, 'no-update-available.sig'));
  return firma ? { cuerpo, firma } : null;
}

const CRLF = '\r\n';

/**
 * Respuesta multipart/mixed del protocolo v1. Detalles que rompen en silencio:
 * el `boundary` es obligatorio; sin `expo-protocol-version: 1` el cliente
 * descarta todo; la parte se reconoce SOLO por el `name=`; la firma va como
 * header de la parte y cubre únicamente su cuerpo.
 */
export function respuestaMultipart(
  partes: Array<{ nombre: 'manifest' | 'directive'; cuerpo: Buffer; firma: string }>,
  extra?: Record<string, string>,
): Response {
  const boundary = `maq-${randomUUID()}`;
  const trozos: Buffer[] = [];
  for (const p of partes) {
    trozos.push(
      Buffer.from(
        `--${boundary}${CRLF}` +
          `content-type: application/json; charset=utf-8${CRLF}` +
          `content-disposition: form-data; name="${p.nombre}"${CRLF}` +
          `expo-signature: ${p.firma}${CRLF}${CRLF}`,
        'utf8',
      ),
    );
    trozos.push(p.cuerpo);
    trozos.push(Buffer.from(CRLF, 'utf8'));
  }
  trozos.push(Buffer.from(`--${boundary}--${CRLF}`, 'utf8'));
  const body = Buffer.concat(trozos);
  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      'Content-Type': `multipart/mixed; boundary=${boundary}`,
      'Content-Length': String(body.length),
      'expo-protocol-version': '1',
      'expo-sfv-version': '0',
      'Cache-Control': 'private, max-age=0',
      ...extra,
    },
  });
}

const TIPOS: Record<string, string> = {
  '.js': 'application/javascript; charset=utf-8',
  '.hbc': 'application/javascript',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

/** Un archivo del pool, o null si no existe o el nombre es inválido. */
export async function leerArchivoPool(nombre: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!segmentoSeguro(nombre)) return null;
  const pool = path.join(raizStore(), 'pool');
  const abs = path.resolve(pool, nombre);
  if (abs !== path.join(pool, nombre)) return null; // se sirve sin auth: no salir del pool
  const bytes = await leerBytes(abs);
  if (!bytes) return null;
  return { bytes, contentType: TIPOS[path.extname(nombre).toLowerCase()] ?? 'application/octet-stream' };
}
