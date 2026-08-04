import { randomUUID } from 'node:crypto';
import type sqlModule from 'mssql';
import { sql } from '@/lib/db-adelantedb';
import type { FotoMuestra } from './tipos-deps';

/**
 * Fotos de muestras de laboratorio.
 *
 * Portado de `api/src/lib/fotos-muestra.ts`. Los bytes viven en Azure Blob
 * Storage (container privado); SQL (pro_lab.fotos_muestra) solo guarda la
 * referencia (`blob_nombre`) + metadata. Para mostrar la imagen se genera una
 * URL SAS de lectura temporal (User Delegation SAS, vía Managed Identity).
 *
 * DEPENDENCIAS EXTERNAS NO INSTALADAS: @azure/storage-blob y @azure/identity no
 * están en package.json (decisión del sprint). Se importan de forma dinámica;
 * si faltan (o falta FOTOS_STORAGE_ACCOUNT) las operaciones lanzan
 * ErrorFotos(501) y las rutas responden 501, dejando la feature inactiva hasta
 * configurar env + instalar SDK.
 *
 * Env vars:
 *   FOTOS_STORAGE_ACCOUNT — nombre de la cuenta (ej. stcontrolconcretoadl).
 *   FOTOS_CONTAINER       — container (default 'fotos-muestras').
 *   (auth de la MI: AZURE_CLIENT_ID/AZURE_TENANT_ID/AZURE_CLIENT_SECRET o MI
 *    de Azure — lo resuelve DefaultAzureCredential.)
 */

const ACCOUNT = process.env.FOTOS_STORAGE_ACCOUNT;
const CONTAINER = process.env.FOTOS_CONTAINER ?? 'fotos-muestras';

export class ErrorFotos extends Error {
  status: number;
  codigo: string;
  constructor(status: number, codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorFotos';
    this.status = status;
    this.codigo = codigo;
  }
}

/** ¿Está la env de fotos presente? (No garantiza que el SDK esté instalado.) */
export function fotosEnvConfigurada(): boolean {
  return !!ACCOUNT;
}

// Import dinámico de los SDK de Azure. Si no están instalados, lanzamos 501.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BlobMod = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IdentityMod = any;

async function cargarSdks(): Promise<{ blob: BlobMod; identity: IdentityMod }> {
  if (!ACCOUNT) {
    throw new ErrorFotos(
      501,
      'FOTOS_NO_CONFIG',
      'Fotos no configuradas: falta FOTOS_STORAGE_ACCOUNT.',
    );
  }
  // `turbopackIgnore`/`webpackIgnore`: el bundler NO debe resolver estos paquetes
  // en build-time (@azure/storage-blob no está instalado hasta que se active la
  // feature). Con el ignore quedan como import de runtime; si faltan, el import
  // falla y cae al .catch → 501. (El specifier en variable NO basta: Turbopack lo
  // resuelve igual siguiendo la constante.)
  const pkgBlob = '@azure/storage-blob';
  const pkgIdentity = '@azure/identity';
  const blob = await import(/* turbopackIgnore: true */ /* webpackIgnore: true */ pkgBlob).catch(() => null);
  const identity = await import(/* turbopackIgnore: true */ /* webpackIgnore: true */ pkgIdentity).catch(() => null);
  if (!blob || !identity) {
    throw new ErrorFotos(
      501,
      'FOTOS_NO_CONFIG',
      'Fotos no configuradas: faltan los SDK @azure/storage-blob / @azure/identity.',
    );
  }
  return { blob, identity };
}

// Servicio + User Delegation Key cacheados en memoria.
let _svc: BlobMod | null = null;
async function svc(): Promise<BlobMod> {
  if (_svc) return _svc;
  const { blob, identity } = await cargarSdks();
  _svc = new blob.BlobServiceClient(
    `https://${ACCOUNT}.blob.core.windows.net`,
    new identity.DefaultAzureCredential(),
  );
  return _svc;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _udk: { key: any; expira: number } | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function obtenerUdk(): Promise<any> {
  const ahora = Date.now();
  if (_udk && _udk.expira > ahora + 60 * 60 * 1000) return _udk.key;
  const inicio = new Date(ahora - 5 * 60 * 1000);
  const fin = new Date(ahora + 24 * 60 * 60 * 1000);
  const key = await (await svc()).getUserDelegationKey(inicio, fin);
  _udk = { key, expira: fin.getTime() };
  return key;
}

async function urlLecturaFoto(blobNombre: string): Promise<string> {
  const { blob } = await cargarSdks();
  const key = await obtenerUdk();
  const ahora = Date.now();
  const sas = blob
    .generateBlobSASQueryParameters(
      {
        containerName: CONTAINER,
        blobName: blobNombre,
        permissions: blob.BlobSASPermissions.parse('r'),
        startsOn: new Date(ahora - 5 * 60 * 1000),
        expiresOn: new Date(ahora + 2 * 60 * 60 * 1000),
      },
      key,
      ACCOUNT,
    )
    .toString();
  const url = (await svc()).getContainerClient(CONTAINER).getBlockBlobClient(blobNombre).url;
  return `${url}?${sas}`;
}

interface FilaFoto {
  id: number | string;
  id_muestra: number | string;
  id_ensayo: number | string | null;
  blob_nombre: string;
  content_type: string;
  tamano_bytes: number | null;
  nombre_original: string | null;
  creado_en: Date | string;
}

async function mapearFoto(r: FilaFoto): Promise<FotoMuestra> {
  return {
    id: Number(r.id),
    id_muestra: Number(r.id_muestra),
    id_ensayo: r.id_ensayo === null ? null : Number(r.id_ensayo),
    nombre_original: r.nombre_original,
    content_type: r.content_type,
    tamano_bytes: r.tamano_bytes !== null ? Number(r.tamano_bytes) : null,
    creado_en: r.creado_en instanceof Date ? r.creado_en.toISOString() : String(r.creado_en),
    url: await urlLecturaFoto(r.blob_nombre),
  };
}

/** Verifica que el ensayo exista y pertenezca a la muestra. */
async function validarEnsayoEnMuestra(
  pool: sqlModule.ConnectionPool,
  idEnsayo: number,
  idMuestra: number,
): Promise<void> {
  const r = await pool
    .request()
    .input('id', sql.BigInt, idEnsayo)
    .input('idm', sql.BigInt, idMuestra)
    .query<{ ok: number }>(
      'SELECT COUNT(*) AS ok FROM pro_lab.ensayos WHERE id = @id AND id_muestra = @idm',
    );
  if ((r.recordset[0]?.ok ?? 0) === 0) {
    throw new ErrorFotos(
      400,
      'ENSAYO_INVALIDO',
      `El ensayo ${idEnsayo} no existe o no pertenece a la muestra ${idMuestra}.`,
    );
  }
}

/** Lista las fotos de una muestra, cada una con su URL de lectura temporal. */
export async function listarFotos(
  pool: sqlModule.ConnectionPool,
  idMuestra: number,
): Promise<FotoMuestra[]> {
  const r = await pool
    .request()
    .input('id_muestra', sql.BigInt, idMuestra)
    .query<FilaFoto>(`
      SELECT id, id_muestra, id_ensayo, blob_nombre, content_type, tamano_bytes,
             nombre_original, creado_en
      FROM pro_lab.fotos_muestra
      WHERE id_muestra = @id_muestra
      ORDER BY creado_en DESC, id DESC
    `);
  return Promise.all(r.recordset.map(mapearFoto));
}

/** Sube una foto a Blob + inserta la fila. Devuelve la foto con URL de lectura. */
export async function crearFoto(
  pool: sqlModule.ConnectionPool,
  idMuestra: number,
  args: {
    buffer: Buffer;
    contentType: string;
    nombreOriginal: string | null;
    idEnsayo: number | null;
    actorEmail: string;
  },
): Promise<FotoMuestra> {
  // Validar que la muestra exista (evita huérfanos en blob).
  const rM = await pool
    .request()
    .input('id', sql.BigInt, idMuestra)
    .query<{ id: number }>('SELECT id FROM pro_lab.muestras WHERE id = @id');
  if (!rM.recordset[0]) {
    throw new ErrorFotos(404, 'MUESTRA_NO_ENCONTRADA', `Muestra ${idMuestra} no existe.`);
  }

  if (args.idEnsayo !== null) {
    await validarEnsayoEnMuestra(pool, args.idEnsayo, idMuestra);
  }

  const ext = args.contentType === 'image/png' ? 'png' : 'jpg';
  const blobNombre = `muestras/${idMuestra}/${randomUUID()}.${ext}`;

  // 1) Subir a Blob.
  await (await svc())
    .getContainerClient(CONTAINER)
    .getBlockBlobClient(blobNombre)
    .uploadData(args.buffer, { blobHTTPHeaders: { blobContentType: args.contentType } });

  // 2) Insertar fila (auditoría: guardamos el email del actor).
  const r = await pool
    .request()
    .input('id_muestra', sql.BigInt, idMuestra)
    .input('id_ensayo', sql.BigInt, args.idEnsayo)
    .input('blob_nombre', sql.NVarChar(300), blobNombre)
    .input('content_type', sql.NVarChar(100), args.contentType)
    .input('tamano_bytes', sql.Int, args.buffer.byteLength)
    .input('nombre_original', sql.NVarChar(200), args.nombreOriginal)
    .input('email', sql.NVarChar(200), args.actorEmail)
    .query<FilaFoto>(`
      INSERT INTO pro_lab.fotos_muestra
        (id_muestra, id_ensayo, blob_nombre, content_type, tamano_bytes, nombre_original,
         creado_por_email)
      OUTPUT INSERTED.id, INSERTED.id_muestra, INSERTED.id_ensayo, INSERTED.blob_nombre,
             INSERTED.content_type, INSERTED.tamano_bytes, INSERTED.nombre_original,
             INSERTED.creado_en
      VALUES (@id_muestra, @id_ensayo, @blob_nombre, @content_type, @tamano_bytes,
              @nombre_original, @email)
    `);
  const fila = r.recordset[0];
  if (!fila) throw new ErrorFotos(500, 'INSERT_FALLO', 'No se pudo registrar la foto.');
  return mapearFoto(fila);
}

/** Reasigna la foto a otro ensayo (o la quita si idEnsayo === null). */
export async function actualizarFotoEnsayo(
  pool: sqlModule.ConnectionPool,
  idFoto: number,
  idEnsayo: number | null,
): Promise<FotoMuestra> {
  const rF = await pool
    .request()
    .input('id', sql.BigInt, idFoto)
    .query<{ id_muestra: number | string }>(
      'SELECT id_muestra FROM pro_lab.fotos_muestra WHERE id = @id',
    );
  const filaF = rF.recordset[0];
  if (!filaF) throw new ErrorFotos(404, 'FOTO_NO_ENCONTRADA', `Foto ${idFoto} no existe.`);
  const idMuestra = Number(filaF.id_muestra);

  if (idEnsayo !== null) {
    await validarEnsayoEnMuestra(pool, idEnsayo, idMuestra);
  }

  const r = await pool
    .request()
    .input('id', sql.BigInt, idFoto)
    .input('id_ensayo', sql.BigInt, idEnsayo)
    .query<FilaFoto>(`
      UPDATE pro_lab.fotos_muestra
      SET id_ensayo = @id_ensayo
      OUTPUT INSERTED.id, INSERTED.id_muestra, INSERTED.id_ensayo, INSERTED.blob_nombre,
             INSERTED.content_type, INSERTED.tamano_bytes, INSERTED.nombre_original,
             INSERTED.creado_en
      WHERE id = @id
    `);
  const fila = r.recordset[0];
  if (!fila) throw new ErrorFotos(500, 'UPDATE_FALLO', 'No se pudo actualizar la foto.');
  return mapearFoto(fila);
}

/** Borra la foto (blob + fila). */
export async function eliminarFoto(pool: sqlModule.ConnectionPool, id: number): Promise<void> {
  const r = await pool
    .request()
    .input('id', sql.BigInt, id)
    .query<{ blob_nombre: string }>('SELECT blob_nombre FROM pro_lab.fotos_muestra WHERE id = @id');
  const fila = r.recordset[0];
  if (!fila) throw new ErrorFotos(404, 'FOTO_NO_ENCONTRADA', `Foto ${id} no existe.`);

  await (await svc())
    .getContainerClient(CONTAINER)
    .getBlockBlobClient(fila.blob_nombre)
    .deleteIfExists();
  await pool.request().input('id', sql.BigInt, id).query('DELETE FROM pro_lab.fotos_muestra WHERE id = @id');
}
