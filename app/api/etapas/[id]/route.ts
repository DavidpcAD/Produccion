import { NextRequest, NextResponse } from 'next/server';
import { mensajeParaCliente } from '@/lib/errores';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getTipoObra, listarTiposObra } from '@/lib/partidas/tipos-obra';

// Corregir / eliminar un grupo del catálogo (dbo.Etapa, nivel 1 del árbol:
// etapa / sistema / área / proceso / torre). Solo Super Admin (nivel 4), igual
// que crearlo (POST /api/etapas).
//
// Por qué existe: antes un grupo mal creado no tenía arreglo desde la pantalla.
// Caso real: "Generales Castilla" se creó en la pestaña Obra Vivienda y cayó en el
// catálogo de Vivienda Construcción (como etapa) cuando era un área de Vivienda
// General, como GEN-BAR/GEN-ILIOS/GEN-NOVA. Acá se le puede cambiar el código, el
// nombre, el capítulo de BC y también el catálogo (tipo de obra) y la obra.

interface FilaEtapa {
  id: number; codigo: string; nombre: string; tipoObra: string;
  bcWorksNo: string | null; bcTaskNo: string | null;
}

async function leerEtapa(id: number): Promise<FilaEtapa | null> {
  const db = await getDb();
  const r = await db.request()
    .input('id', sql.Int, id)
    .query<FilaEtapa>(`SELECT id, codigo, nombre, tipoObra, bcWorksNo, bcTaskNo
                       FROM dbo.Etapa WHERE id = @id AND activo = 1`);
  return r.recordset[0] ?? null;
}

async function partidasActivas(id: number): Promise<number> {
  const db = await getDb();
  const r = await db.request()
    .input('id', sql.Int, id)
    .query<{ n: number }>('SELECT COUNT(*) AS n FROM dbo.Partida WHERE idEtapa = @id AND esActivo = 1');
  return Number(r.recordset[0]?.n) || 0;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const idEtapa = Number((await params).id) || 0;
  if (!idEtapa) return NextResponse.json({ error: 'Etapa inválida' }, { status: 400 });

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const body = await req.json().catch(() => ({}));
  const codigo = String(body.codigo ?? '').trim();
  const nombre = String(body.nombre ?? '').trim();
  const bcTaskNo = String(body.bcTaskNo ?? '').trim() || null;

  if (!codigo) return NextResponse.json({ error: 'El código es requerido' }, { status: 400 });
  if (!nombre) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
  if (codigo.length > 50) return NextResponse.json({ error: 'El código no puede superar 50 caracteres' }, { status: 400 });
  if (nombre.length > 150) return NextResponse.json({ error: 'El nombre no puede superar 150 caracteres' }, { status: 400 });
  if (bcTaskNo && bcTaskNo.length > 50) return NextResponse.json({ error: 'El capítulo de BC no puede superar 50 caracteres' }, { status: 400 });

  try {
    const antes = await leerEtapa(idEtapa);
    if (!antes) return NextResponse.json({ error: 'La etapa no existe' }, { status: 404 });

    // Catálogo destino: si no lo mandan, se queda en el que está.
    const tipoParam = String(body.tipoObra ?? antes.tipoObra).toUpperCase();
    const tipo = await getTipoObra(tipoParam);
    if (!tipo) {
      const validos = (await listarTiposObra()).map((t) => t.codigo).join(', ');
      return NextResponse.json({ error: `Tipo de obra desconocido "${tipoParam}". Válidos: ${validos}` }, { status: 400 });
    }
    // Obra de BC dueña del grupo. En un catálogo compartido (vivienda, infra) no hay
    // obra: el grupo es de todas. Si no la mandan, se queda la que tenía.
    const obraParam = body.bcWorksNo === undefined ? (antes.bcWorksNo ?? '') : String(body.bcWorksNo ?? '');
    const bcWorksNo = tipo.catalogoCompartido ? null : (obraParam.trim() || null);
    if (bcWorksNo && bcWorksNo.length > 20) return NextResponse.json({ error: 'La obra de BC no puede superar 20 caracteres' }, { status: 400 });

    const termino = tipo.terminoGrupo.toLowerCase();
    const un = tipo.genero === 'M' ? 'un' : 'una';

    // Mudarlo de catálogo o de obra con partidas adentro arrastraría esas partidas a
    // otro árbol (y en vivienda compartida cambia cómo las ve H4 por esPosting). Eso
    // no es una corrección: se pide vaciarlo antes.
    const cambiaDeLugar = tipo.codigo !== antes.tipoObra || (bcWorksNo ?? '') !== (antes.bcWorksNo ?? '');
    if (cambiaDeLugar) {
      const n = await partidasActivas(idEtapa);
      if (n > 0) {
        return NextResponse.json({
          error: `No se puede mover a otro catálogo u obra porque tiene ${n} partida${n === 1 ? '' : 's'}. Movelas o eliminalas primero.`,
        }, { status: 409 });
      }
    }

    const db = await getDb();
    // Mismo único que al crear: (tipoObra, bcWorksNo, codigo).
    const dup = await db.request()
      .input('cod', sql.VarChar(50), codigo)
      .input('tipo', sql.VarChar(20), tipo.codigo)
      .input('obra', sql.VarChar(20), bcWorksNo)
      .input('id', sql.Int, idEtapa)
      .query(`SELECT 1 AS ok FROM dbo.Etapa
              WHERE codigo = @cod AND tipoObra = @tipo AND id <> @id
                AND ISNULL(bcWorksNo, '') = ISNULL(@obra, '')`);
    if (dup.recordset.length > 0) {
      const donde = bcWorksNo ? ` en la obra ${bcWorksNo}` : ` en ${tipo.nombre}`;
      return NextResponse.json({ error: `Ya existe ${un} ${termino} con el código "${codigo}"${donde}` }, { status: 409 });
    }

    // Al cambiar de catálogo u obra va al final del orden de su nuevo lugar.
    await db.request()
      .input('id', sql.Int, idEtapa)
      .input('codigo', sql.VarChar(50), codigo)
      .input('nombre', sql.NVarChar(150), nombre)
      .input('tipo', sql.VarChar(20), tipo.codigo)
      .input('obra', sql.VarChar(20), bcWorksNo)
      .input('task', sql.VarChar(50), bcTaskNo)
      .input('mueve', sql.Bit, cambiaDeLugar)
      .query(`
        UPDATE dbo.Etapa
        SET codigo = @codigo, nombre = @nombre, tipoObra = @tipo,
            bcWorksNo = @obra, bcTaskNo = @task,
            orden = CASE WHEN @mueve = 1 THEN
                      (SELECT ISNULL(MAX(e2.orden), 0) + 1 FROM dbo.Etapa e2
                        WHERE e2.tipoObra = @tipo AND ISNULL(e2.bcWorksNo, '') = ISNULL(@obra, '') AND e2.id <> @id)
                    ELSE orden END
        WHERE id = @id
      `);

    await logAudit({
      idColAccion: session.idCol,
      accion: 'EDITAR_ETAPA',
      entidad: 'Etapa',
      idEntidad: idEtapa,
      detallePrevio: {
        codigo: antes.codigo, nombre: antes.nombre, tipoObra: antes.tipoObra,
        bcWorksNo: antes.bcWorksNo, bcTaskNo: antes.bcTaskNo,
      },
      detalleNuevo: { codigo, nombre, tipoObra: tipo.codigo, bcWorksNo, bcTaskNo },
      ip,
    });
    return NextResponse.json({ ok: true, tipoObra: tipo.codigo, bcWorksNo });
  } catch (err: unknown) {
    const msg = mensajeParaCliente(err);
    console.error('/api/etapas/[id] PUT error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Eliminar = desactivar (activo = 0), como las partidas. Solo si ya no le quedan
// partidas activas: las subpartidas cuelgan de ellas y H4 marca contra subpartidas.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const idEtapa = Number((await params).id) || 0;
  if (!idEtapa) return NextResponse.json({ error: 'Etapa inválida' }, { status: 400 });
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';

  try {
    const antes = await leerEtapa(idEtapa);
    if (!antes) return NextResponse.json({ error: 'La etapa no existe o ya se eliminó' }, { status: 404 });
    const n = await partidasActivas(idEtapa);
    if (n > 0) {
      return NextResponse.json({
        error: `Tiene ${n} partida${n === 1 ? '' : 's'}. Eliminalas o movelas primero.`,
      }, { status: 409 });
    }
    const db = await getDb();
    await db.request()
      .input('id', sql.Int, idEtapa)
      .query('UPDATE dbo.Etapa SET activo = 0 WHERE id = @id AND activo = 1');
    await logAudit({
      idColAccion: session.idCol,
      accion: 'ELIMINAR_ETAPA',
      entidad: 'Etapa',
      idEntidad: idEtapa,
      detallePrevio: {
        codigo: antes.codigo, nombre: antes.nombre, tipoObra: antes.tipoObra,
        bcWorksNo: antes.bcWorksNo, bcTaskNo: antes.bcTaskNo,
      },
      ip,
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = mensajeParaCliente(err);
    console.error('/api/etapas/[id] DELETE error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
