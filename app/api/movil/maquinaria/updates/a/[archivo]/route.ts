import { leerArchivoPool } from '@/lib/movil/updates';

export const runtime = 'nodejs';

// GET /api/movil/maquinaria/updates/a/<md5>.<ext> → el bundle o un asset de una
// publicación, tal cual está en disco. Las URLs viajan dentro del manifest
// firmado y cada asset lleva su hash: el teléfono verifica los bytes al bajarlos.
// Público como el manifest: expo-updates baja los assets sin credenciales.
export async function GET(_req: Request, { params }: { params: Promise<{ archivo: string }> }) {
  try {
    const { archivo } = await params;
    const item = await leerArchivoPool(archivo);
    if (!item) return new Response('Archivo no encontrado', { status: 404 });
    return new Response(new Uint8Array(item.bytes), {
      status: 200,
      headers: {
        'Content-Type': item.contentType,
        'Content-Length': String(item.bytes.length),
        // El nombre es el md5 del contenido: nunca cambia de bytes.
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: `"${archivo}"`,
      },
    });
  } catch (e) {
    console.error('[maquinaria/updates/a] fallo leyendo el pool:', e);
    return new Response('Error', { status: 500 });
  }
}
