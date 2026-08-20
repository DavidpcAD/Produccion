import { NextRequest, NextResponse } from 'next/server';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

// Crear un grupo del catálogo (pro_obc.grupos_partida). En vivienda se llama
// "Etapa" y en infraestructura "Sistema" — es el mismo objeto, distinto rótulo
// según grupos_partida.tipo_obra. Solo Super Admin (nivel 4).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const body = await req.json().catch(() => ({}));

  const codigo = String(body.codigo ?? '').trim();
  const nombre = String(body.nombre ?? '').trim();
  const tipoObra = String(body.tipoObra ?? 'VIVIENDA').toUpperCase();
  const esInfra = tipoObra === 'INFRA';
  const termino = esInfra ? 'sistema' : 'etapa';

  if (tipoObra !== 'VIVIENDA' && tipoObra !== 'INFRA') {
    return NextResponse.json({ error: 'Tipo de obra inválido' }, { status: 400 });
  }
  if (!codigo) return NextResponse.json({ error: 'El código es requerido' }, { status: 400 });
  if (!nombre) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
  if (codigo.length > 20) return NextResponse.json({ error: 'El código no puede superar 20 caracteres' }, { status: 400 });
  if (nombre.length > 100) return NextResponse.json({ error: 'El nombre no puede superar 100 caracteres' }, { status: 400 });

  const db = await getAdelanteDb();
  try {
    // El código es único DENTRO del tipo de obra (vivienda e infra son catálogos
    // aparte y pueden repetir códigos entre sí).
    const dup = await db.request()
      .input('cod', sql.VarChar(20), codigo)
      .input('tipo', sql.VarChar(20), tipoObra)
      .query('SELECT 1 AS ok FROM pro_obc.grupos_partida WHERE codigo = @cod AND tipo_obra = @tipo');
    if (dup.recordset.length > 0) {
      return NextResponse.json({ error: `Ya existe un/a ${termino} con el código "${codigo}"` }, { status: 409 });
    }

    const ins = await db.request()
      .input('codigo', sql.VarChar(20), codigo)
      .input('nombre', sql.NVarChar(100), nombre)
      .input('tipo', sql.VarChar(20), tipoObra)
      .query(`
        INSERT INTO pro_obc.grupos_partida (codigo, nombre, tipo_obra, orden, activo, creado_en)
        OUTPUT INSERTED.id AS idEtapa
        VALUES (
          @codigo, @nombre, @tipo,
          (SELECT ISNULL(MAX(orden), 0) + 1 FROM pro_obc.grupos_partida WHERE tipo_obra = @tipo),
          1, SYSUTCDATETIME()
        )
      `);
    const idEtapa = ins.recordset[0].idEtapa;

    await logAudit({
      idColAccion: session.idCol,
      accion: 'CREAR_ETAPA',
      entidad: 'Etapa',
      idEntidad: idEtapa,
      detalleNuevo: { codigo, nombre, tipoObra },
      ip,
    });

    return NextResponse.json({ idEtapa }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/etapas POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
