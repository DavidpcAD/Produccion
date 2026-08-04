import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';

// Comentarios del reporte, anclados a (anio, mes) y a un scope
// ('ejecutivo' | 'seccion' | 'celda'). Portado de la Azure Function
// `comentarios`. Tabla: pro_uti.comentarios_reporte.
//
// Nota de auth: en el modelo nuevo la sesión (getSession) trae idUsuario /
// nombre / cedula, NO el oid/email de Entra ID. Mapeamos:
//   autor_oid   ← idUsuario, autor_nombre ← nombre, autor_email ← cedula.
// (El sistema original guardaba claims de Entra ID.)

const SCOPES = ['ejecutivo', 'seccion', 'celda'] as const;
type Scope = (typeof SCOPES)[number];

// ── GET /api/utilidades/comentarios?anio=&mes= ─────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const anio = Number(sp.get('anio'));
  const mes = Number(sp.get('mes'));
  if (!Number.isInteger(anio) || anio < 2015 || anio > 2100 || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: 'Parámetros inválidos (anio, mes)' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();
    const result = await db
      .request()
      .input('anio', sql.SmallInt, anio)
      .input('mes', sql.TinyInt, mes).query(`
        SELECT id_comentario, anio, mes, scope, seccion_id, celda_id,
               contenido_markdown, autor_nombre, autor_email, autor_rol,
               estado, creado_en, editado_en
        FROM pro_uti.comentarios_reporte
        WHERE anio = @anio AND mes = @mes AND eliminado_en IS NULL
        ORDER BY scope, seccion_id, creado_en
      `);
    return NextResponse.json({ comentarios: result.recordset });
  } catch (e) {
    console.error('Error en GET /api/utilidades/comentarios:', e);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// ── POST /api/utilidades/comentarios — upsert por (anio, mes, scope, seccion) ─
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 1) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  let body: {
    anio?: number;
    mes?: number;
    scope?: string;
    seccion_id?: string | null;
    contenido_markdown?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  const anio = Number(body.anio);
  const mes = Number(body.mes);
  const scope = body.scope as Scope;
  const seccionId = body.seccion_id ?? null;
  const contenido = (body.contenido_markdown ?? '').trim();

  if (
    !Number.isInteger(anio) || anio < 2015 || anio > 2100 ||
    !Number.isInteger(mes) || mes < 1 || mes > 12 ||
    !SCOPES.includes(scope) ||
    contenido.length === 0 || contenido.length > 10000
  ) {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  try {
    const db = await getAdelanteDb();
    const result = await db
      .request()
      .input('anio', sql.SmallInt, anio)
      .input('mes', sql.TinyInt, mes)
      .input('scope', sql.NVarChar(20), scope)
      .input('seccion_id', sql.NVarChar(100), seccionId)
      .input('contenido', sql.NVarChar(sql.MAX), contenido)
      .input('oid', sql.NVarChar(50), String(session.idUsuario || session.idCol))
      .input('email', sql.NVarChar(255), session.cedula)
      .input('nombre', sql.NVarChar(255), session.nombre)
      .input('rol', sql.NVarChar(50), String(session.roles[0] ?? 'Contabilidad')).query(`
        DECLARE @id BIGINT;

        SELECT @id = id_comentario
        FROM pro_uti.comentarios_reporte
        WHERE anio = @anio AND mes = @mes AND scope = @scope
          AND (seccion_id = @seccion_id OR (seccion_id IS NULL AND @seccion_id IS NULL))
          AND eliminado_en IS NULL;

        IF @id IS NOT NULL
        BEGIN
          UPDATE pro_uti.comentarios_reporte
          SET contenido_markdown = @contenido, editado_en = SYSUTCDATETIME()
          WHERE id_comentario = @id;
        END
        ELSE
        BEGIN
          INSERT INTO pro_uti.comentarios_reporte
            (anio, mes, scope, seccion_id, celda_id, contenido_markdown,
             autor_oid, autor_email, autor_nombre, autor_rol, estado)
          VALUES
            (@anio, @mes, @scope, @seccion_id, NULL, @contenido,
             @oid, @email, @nombre, @rol, 'borrador');
          SET @id = SCOPE_IDENTITY();
        END

        SELECT id_comentario, anio, mes, scope, seccion_id, celda_id,
               contenido_markdown, autor_nombre, autor_email, autor_rol,
               estado, creado_en, editado_en
        FROM pro_uti.comentarios_reporte
        WHERE id_comentario = @id;
      `);

    return NextResponse.json({ comentario: result.recordset[0] });
  } catch (e) {
    console.error('Error en POST /api/utilidades/comentarios:', e);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
