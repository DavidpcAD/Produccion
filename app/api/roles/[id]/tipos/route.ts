import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';

// Catálogo de tipos de un rol (dbo.TipoRol). Ej. Encargado -> Casas, Infra…
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const { id } = await params;
  const db = await getDb();
  try {
    const res = await db.request().input('id', sql.Int, parseInt(id)).query(`
      SELECT idTipoRol, idRol, nombre FROM dbo.TipoRol
      WHERE idRol = @id AND esActivo = 1 ORDER BY nombre
    `);
    return NextResponse.json({ tipos: res.recordset });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/Invalid object name|TipoRol/i.test(msg)) return NextResponse.json({ tipos: [], tablaFaltante: true });
    console.error('/api/roles/[id]/tipos GET error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Crea un tipo para el rol. Solo Super Admin.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'Solo Super Admin' }, { status: 403 });
  }
  const { id } = await params;
  const idRol = parseInt(id);
  const body = await req.json();
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  if (!nombre) return NextResponse.json({ error: 'Nombre del tipo requerido' }, { status: 400 });

  const db = await getDb();
  try {
    const ins = await db.request()
      .input('idRol', sql.Int, idRol)
      .input('nombre', sql.NVarChar, nombre)
      .input('creadoPor', sql.NVarChar, session.cedula ?? 'control-usuarios')
      .query(`
        INSERT INTO dbo.TipoRol (idRol, nombre, creadoPor)
        OUTPUT INSERTED.idTipoRol
        VALUES (@idRol, @nombre, @creadoPor)
      `);
    return NextResponse.json({ idTipoRol: ins.recordset[0].idTipoRol }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate key|UNIQUE|ux_TipoRol/i.test(msg)) {
      return NextResponse.json({ error: 'Ya existe un tipo con ese nombre en este rol' }, { status: 409 });
    }
    if (/Invalid object name|TipoRol/i.test(msg)) {
      return NextResponse.json({ error: 'Falta correr la migración dbo.TipoRol en la base.' }, { status: 500 });
    }
    console.error('/api/roles/[id]/tipos POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Elimina un tipo del rol (?idTipoRol=). Solo Super Admin.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'Solo Super Admin' }, { status: 403 });
  }
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const idTipoRol = Number(searchParams.get('idTipoRol')) || 0;
  if (!idTipoRol) return NextResponse.json({ error: 'idTipoRol requerido' }, { status: 400 });

  const db = await getDb();
  try {
    // El tipo se guarda por NOMBRE en UsuarioRol.esTipo (no hay FK). Antes de
    // borrar, bloquear si algún usuario del rol está asignado a este tipo: hay
    // que reasignarlos primero (mismo criterio que borrar un rol con usuarios).
    const tipo = await db.request()
      .input('idTipoRol', sql.Int, idTipoRol)
      .input('idRol', sql.Int, parseInt(id))
      .query('SELECT nombre FROM dbo.TipoRol WHERE idTipoRol = @idTipoRol AND idRol = @idRol');
    if (tipo.recordset.length === 0) {
      return NextResponse.json({ error: 'El tipo no existe' }, { status: 404 });
    }
    const nombre = tipo.recordset[0].nombre as string;

    const uso = await db.request()
      .input('idRol', sql.Int, parseInt(id))
      .input('nombre', sql.NVarChar, nombre)
      .query('SELECT COUNT(*) AS n FROM dbo.UsuarioRol WHERE idRol = @idRol AND esTipo = @nombre');
    const n = uso.recordset[0].n as number;
    if (n > 0) {
      return NextResponse.json(
        { error: `No se puede borrar: ${n} ${n === 1 ? 'usuario tiene' : 'usuarios tienen'} el tipo "${nombre}". Reasignalos primero.` },
        { status: 409 },
      );
    }

    await db.request()
      .input('idTipoRol', sql.Int, idTipoRol)
      .input('idRol', sql.Int, parseInt(id))
      .query('DELETE FROM dbo.TipoRol WHERE idTipoRol = @idTipoRol AND idRol = @idRol');
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/roles/[id]/tipos DELETE error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
