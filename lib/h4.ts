import 'server-only';

// Cliente server-to-server para la API de H4 (h4control). Solo se usa desde el
// backend: el X-Api-Key es un secreto de servidor y NUNCA debe llegar al cliente.
//
// Las LECTURAS (zonas, estado de biometría) las hacemos por DB directo sobre el
// esquema `h4` de AdelanteSBX (ver lib/db + rutas). Solo el ALTA/enrolamiento va
// por esta API porque encola los comandos a los relojes.

// Base URL de H4. Se puede sobreescribir por env (dominio propio en prod).
const H4_BASE_URL = (process.env.H4_BASE_URL ||
  'https://h4control-ape2aackckb2erdk.eastus2-01.azurewebsites.net').replace(/\/$/, '');

export interface H4Enrolamiento {
  pin: string;      // cédula sin guiones = ID del usuario en los relojes
  equipos: number;  // dispositivos de la zona que recibieron el alta
  conFoto: boolean; // si se encoló también la foto (USERPIC)
}

export class H4Error extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'H4Error';
    this.status = status;
  }
}

/**
 * Enrola a un colaborador en una zona de marca: lo declara miembro de la zona y
 * lo da de alta en todos los relojes de esa zona. Idempotente (H4 hace MERGE).
 *
 * Requisitos previos: el colaborador debe existir y estar activo en
 * dbo.Colaborador. Si tiene foto, debe estar en dbo.Colaborador.fotoBase64
 * ANTES de llamar (H4 la usa para el USERPIC).
 */
export async function enrolarEnZona(
  idZona: number,
  idColaborador: number,
  creadoPor?: string | null,
): Promise<H4Enrolamiento> {
  const apiKey = process.env.H4_API_KEY;
  if (!apiKey) throw new H4Error('H4_API_KEY no configurado', 500);

  const url = `${H4_BASE_URL}/api/zonas/${idZona}/colaboradores`;
  const body: Record<string, unknown> = { idColaborador };
  if (creadoPor) body.creadoPor = creadoPor;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (e) {
    const msg = e instanceof Error && e.name === 'AbortError'
      ? 'H4 no respondió a tiempo'
      : `No se pudo contactar a H4: ${e instanceof Error ? e.message : String(e)}`;
    throw new H4Error(msg, 502);
  } finally {
    clearTimeout(timeout);
  }

  const data = await res.json().catch(() => null) as
    | (H4Enrolamiento & { message?: string })
    | { message?: string }
    | null;

  if (!res.ok) {
    const message = (data && 'message' in data && data.message) || `H4 devolvió ${res.status}`;
    throw new H4Error(message, res.status);
  }
  return data as H4Enrolamiento;
}
