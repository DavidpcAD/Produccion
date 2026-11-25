import { NextResponse } from 'next/server';
import { sesionMovil } from '@/lib/movil/sesion';
import { getDb, sql } from '@/lib/db';

// POST → una foto tomada en la app (avería, problema del checklist o material).
// Se guarda en mant.Archivos, la misma tabla donde Mantenimiento guarda las suyas,
// así la foto se ve en la web en la OT, la inspección o la solicitud sin
// traducir nada. Devuelve el id, que la app manda después junto con el reporte.
const MAXIMO = 8 * 1024 * 1024; // la app las manda comprimidas (~300 KB); esto es el tope
const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];

export async function POST(req: Request) {
  const auth = await sesionMovil(req, 'maquinaria');
  if (auth.error) return auth.error;

  let archivo: FormDataEntryValue | null;
  try {
    archivo = (await req.formData()).get('foto');
  } catch {
    return NextResponse.json({ error: 'No se pudo leer la foto.' }, { status: 400 });
  }
  if (!archivo || typeof archivo === 'string') return NextResponse.json({ error: 'Falta la foto.' }, { status: 400 });
  if (archivo.size > MAXIMO) return NextResponse.json({ error: 'La foto pesa demasiado.' }, { status: 400 });
  const tipo = TIPOS.includes(archivo.type) ? archivo.type : 'image/jpeg';
  const bytes = Buffer.from(await archivo.arrayBuffer());
  if (!bytes.length) return NextResponse.json({ error: 'La foto llegó vacía.' }, { status: 400 });

  try {
    const db = await getDb();
    const r = await db.request()
      .input('contentType', sql.NVarChar(100), tipo)
      .input('sizeBytes', sql.Int, bytes.length)
      // VarBinary(MAX) explícito: si no, mssql puede fijar el largo con la primera foto y truncar las otras.
      .input('datos', sql.VarBinary(sql.MAX), bytes)
      .query<{ id: string }>('INSERT INTO mant.Archivos (contentType, sizeBytes, datos) OUTPUT INSERTED.id VALUES (@contentType, @sizeBytes, @datos)');
    return NextResponse.json({ id: String(r.recordset[0].id) });
  } catch (err) {
    console.error('/api/movil/maquinaria/fotos:', err);
    return NextResponse.json({ error: 'No se pudo guardar la foto. Probá de nuevo.' }, { status: 500 });
  }
}
