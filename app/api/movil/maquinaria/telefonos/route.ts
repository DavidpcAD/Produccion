import { NextResponse } from 'next/server';
import { faltaTabla, listarTelefonos, marcarPrueba, PLATAFORMA, visorWeb } from '@/lib/movil/telefonos';
import { estadoReparto } from '@/lib/movil/updates';

export const dynamic = 'force-dynamic';

// GET → lo que pinta Mantenimiento → App móvil. Mantenimiento ve los teléfonos,
// quién los usa y cuándo se conectaron; el Super Admin además ve la ubicación y
// el reparto de versiones (y es el único que lo puede mover, en ../reparto).
export async function GET() {
  const { visor, error } = await visorWeb();
  if (error) return error;
  try {
    let telefonos: Awaited<ReturnType<typeof listarTelefonos>> = [];
    let sinTabla = false;
    try {
      telefonos = await listarTelefonos(visor.puedeRepartir);
    } catch (e) {
      if (!faltaTabla(e)) throw e;
      sinTabla = true;
    }
    const reparto = visor.puedeRepartir ? await estadoReparto(PLATAFORMA) : null;
    return NextResponse.json(
      { puedeRepartir: visor.puedeRepartir, sinTabla, telefonos, reparto },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('/api/movil/maquinaria/telefonos:', err);
    return NextResponse.json({ error: 'No se pudieron cargar los teléfonos.' }, { status: 500 });
  }
}

// PATCH → marca o desmarca un teléfono de prueba. Solo el Super Admin.
export async function PATCH(req: Request) {
  const { visor, error } = await visorWeb();
  if (error) return error;
  if (!visor.puedeRepartir) return NextResponse.json({ error: 'Solo el Super Admin marca teléfonos de prueba.' }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { identificador?: unknown; esPrueba?: unknown } | null;
  const id = typeof body?.identificador === 'string' ? body.identificador : '';
  if (!id || typeof body?.esPrueba !== 'boolean') return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  try {
    if (!(await marcarPrueba(id, body.esPrueba))) return NextResponse.json({ error: 'Ese teléfono no está registrado' }, { status: 404 });
    return NextResponse.json({ identificador: id, esPrueba: body.esPrueba });
  } catch (err) {
    console.error('/api/movil/maquinaria/telefonos PATCH:', err);
    return NextResponse.json({ error: 'No se pudo marcar el teléfono.' }, { status: 500 });
  }
}
