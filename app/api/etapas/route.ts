import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getTipoObra, listarTiposObra } from '@/lib/partidas/tipos-obra';

// Crear un grupo del catálogo (pro_obc.grupos_partida). Es el nivel 1 del árbol y
// cambia de nombre según el tipo de obra: "Etapa" en vivienda, "Sistema" en
// infraestructura, "Área" en administrativas, "Proceso" en fábrica, "Torre" en
// torres (pro_obc.tipos_obra.termino_grupo). Solo Super Admin (nivel 4).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const body = await req.json().catch(() => ({}));

  const codigo = String(body.codigo ?? '').trim();
  const nombre = String(body.nombre ?? '').trim();
  const tipoParam = String(body.tipoObra ?? 'VIVIENDA').toUpperCase();
  // Obra de BC dueña de este grupo. Vacío = catálogo compartido por todas las
  // obras del tipo (así funcionan vivienda e infra).
  const bcWorksNo = String(body.bcWorksNo ?? '').trim() || null;
  const bcTaskNo = String(body.bcTaskNo ?? '').trim() || null;

  const tipo = await getTipoObra(tipoParam);
  if (!tipo) {
    const validos = (await listarTiposObra()).map((t) => t.codigo).join(', ');
    return NextResponse.json(
      { error: `Tipo de obra desconocido "${tipoParam}". Válidos: ${validos}` },
      { status: 400 },
    );
  }
  const termino = tipo.terminoGrupo.toLowerCase();
  const un = tipo.genero === 'M' ? 'un' : 'una';

  if (!codigo) return NextResponse.json({ error: 'El código es requerido' }, { status: 400 });
  if (!nombre) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
  if (codigo.length > 50) return NextResponse.json({ error: 'El código no puede superar 50 caracteres' }, { status: 400 });
  if (nombre.length > 150) return NextResponse.json({ error: 'El nombre no puede superar 150 caracteres' }, { status: 400 });
  if (bcWorksNo && bcWorksNo.length > 20) return NextResponse.json({ error: 'La obra de BC no puede superar 20 caracteres' }, { status: 400 });

  const db = await getAdelanteDb();
  try {
    // El código es único DENTRO del tipo de obra Y de la obra de BC: vivienda e
    // infra son catálogos aparte y pueden repetir códigos entre sí, y cada obra
    // administrativa/fábrica tiene su propio espacio de códigos.
    const dup = await db.request()
      .input('cod', sql.VarChar(50), codigo)
      .input('tipo', sql.VarChar(20), tipo.codigo)
      .input('obra', sql.VarChar(20), bcWorksNo)
      .query(`SELECT 1 AS ok FROM pro_obc.grupos_partida
              WHERE codigo = @cod AND tipo_obra = @tipo
                AND ISNULL(bc_works_no, '') = ISNULL(@obra, '')`);
    if (dup.recordset.length > 0) {
      const donde = bcWorksNo ? ` en la obra ${bcWorksNo}` : '';
      return NextResponse.json({ error: `Ya existe ${un} ${termino} con el código "${codigo}"${donde}` }, { status: 409 });
    }

    const ins = await db.request()
      .input('codigo', sql.VarChar(50), codigo)
      .input('nombre', sql.NVarChar(150), nombre)
      .input('tipo', sql.VarChar(20), tipo.codigo)
      .input('obra', sql.VarChar(20), bcWorksNo)
      .input('task', sql.VarChar(50), bcTaskNo)
      .query(`
        INSERT INTO pro_obc.grupos_partida (codigo, nombre, tipo_obra, orden, activo, creado_en, bc_works_no, bc_task_no)
        OUTPUT INSERTED.id AS idEtapa
        VALUES (
          @codigo, @nombre, @tipo,
          (SELECT ISNULL(MAX(orden), 0) + 1 FROM pro_obc.grupos_partida
            WHERE tipo_obra = @tipo AND ISNULL(bc_works_no, '') = ISNULL(@obra, '')),
          1, SYSUTCDATETIME(), @obra, @task
        )
      `);
    const idEtapa = ins.recordset[0].idEtapa;

    await logAudit({
      idColAccion: session.idCol,
      accion: 'CREAR_ETAPA',
      entidad: 'Etapa',
      idEntidad: idEtapa,
      detalleNuevo: { codigo, nombre, tipoObra: tipo.codigo, bcWorksNo, bcTaskNo },
      ip,
    });

    return NextResponse.json({ idEtapa }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/etapas POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
