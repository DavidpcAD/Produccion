import { NextResponse } from 'next/server';
import { sesionMovil } from '@/lib/movil/sesion';
import { faltaTabla, leerRegistro, olvidarToken, registrarTelefono } from '@/lib/movil/telefonos';

// POST → la app se anuncia cada vez que se abre: qué teléfono, qué APK y qué
// publicación corre, los permisos que dio, su token de avisos y dónde está.
// Es lo que muestra Mantenimiento → App móvil.
export async function POST(req: Request) {
  const auth = await sesionMovil(req, ['maquinaria', 'mecanico']);
  if (auth.error) return auth.error;
  const d = leerRegistro(await req.json().catch(() => null));
  if (!d) return NextResponse.json({ error: 'Datos del teléfono inválidos' }, { status: 400 });
  try {
    const usuario = (auth.sesion.username || auth.sesion.cedula || String(auth.sesion.idUsuario)).trim();
    await registrarTelefono({ idUsuario: auth.sesion.idUsuario, usuario }, d);
    return NextResponse.json({ registrado: true });
  } catch (err) {
    // Sin la migración la app sigue andando igual: el registro es solo informativo.
    if (faltaTabla(err)) return NextResponse.json({ registrado: false }, { status: 503 });
    console.error('/api/movil/maquinaria/dispositivo:', err);
    return NextResponse.json({ error: 'No se pudo registrar el teléfono' }, { status: 500 });
  }
}

// DELETE → al cerrar sesión: el teléfono deja de recibir avisos a nombre de esa persona.
export async function DELETE(req: Request) {
  const auth = await sesionMovil(req, ['maquinaria', 'mecanico']);
  if (auth.error) return auth.error;
  const body = (await req.json().catch(() => null)) as { identificador?: unknown } | null;
  const id = typeof body?.identificador === 'string' ? body.identificador.trim() : '';
  if (!id || !/^[A-Za-z0-9._-]{1,100}$/.test(id)) return NextResponse.json({ error: 'Falta el teléfono' }, { status: 400 });
  try {
    await olvidarToken(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (faltaTabla(err)) return NextResponse.json({ ok: false }, { status: 503 });
    console.error('/api/movil/maquinaria/dispositivo DELETE:', err);
    return NextResponse.json({ error: 'No se pudo dar de baja el aviso' }, { status: 500 });
  }
}
