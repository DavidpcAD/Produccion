import { NextRequest, NextResponse } from 'next/server';
import { mensajeParaCliente } from '@/lib/errores';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

const TIPOS_CASA = new Set(['1N-Techo', '1N-Azotea', '2N-Techo', '2N-Azotea']);

// Crear una subpartida en el catálogo unificado (dbo.SubPartida +
// sub_partida_tipos). Amarrada a una partida existente. Solo Super Admin (nivel 4).
//
// Las subpartidas son el ÚNICO nivel que no existe en Business Central: BC llega
// hasta la partida ("Posting"). Este nivel es 100% de SQL.
//
// El TIPO DE OBRA sale de la partida (Etapa.tipoObra), no del cliente, y
// con él las dos reglas que trae dbo.TipoObra:
//   usa_sprints    -> sprint obligatorio (hoy solo vivienda: es lo que usa Avance).
//   usa_tipos_casa -> al menos un tipo de casa (hoy solo vivienda).
// Los demás tipos (infra, administrativas, fábrica, torres) guardan sprint NULL y
// sin tipos de casa: no se planifican por sprint ni por tipo de casa.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 4) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const body = await req.json().catch(() => ({}));

  const idPartida = Number(body.idPartida) || 0;
  const codigo = String(body.codigo ?? '').trim();
  const nombre = String(body.nombre ?? '').trim();
  const numSprint = Number.isFinite(Number(body.numSprint)) ? Number(body.numSprint) : 1;
  const esCritica = !!body.esCritica;
  const activo = body.activo === undefined ? true : !!body.activo;
  const descripcion = String(body.descripcion ?? '').trim() || null;
  const tiposCasa: string[] = Array.isArray(body.tiposCasa)
    ? body.tiposCasa.filter((t: unknown) => TIPOS_CASA.has(String(t)))
    : [];

  if (!idPartida) return NextResponse.json({ error: 'Elegí la partida a la que pertenece' }, { status: 400 });
  if (!codigo) return NextResponse.json({ error: 'El código es requerido' }, { status: 400 });
  if (!nombre) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
  if (codigo.length > 50) return NextResponse.json({ error: 'El código no puede superar 50 caracteres' }, { status: 400 });
  if (nombre.length > 150) return NextResponse.json({ error: 'El nombre no puede superar 150 caracteres' }, { status: 400 });

  const db = await getDb();
  try {
    const p = await db.request()
      .input('idP', sql.Int, idPartida)
      .query(`SELECT p.idPartida AS id, g.tipoObra, g.bcWorksNo,
                     t.usaSprints, t.usaTiposCasa
              FROM dbo.Partida p
              JOIN dbo.Etapa g ON g.id = p.idEtapa
              JOIN dbo.TipoObra t ON t.codigo = g.tipoObra
              WHERE p.idPartida = @idP`);
    if (p.recordset.length === 0) {
      return NextResponse.json({ error: 'La partida no existe' }, { status: 400 });
    }
    const tipoObra = String(p.recordset[0].tipoObra ?? 'VIVIENDA').toUpperCase();
    const bcWorksNo: string | null = p.recordset[0].bcWorksNo ?? null;
    const usaSprints = !!p.recordset[0].usaSprints;
    const usaTiposCasa = !!p.recordset[0].usaTiposCasa;

    if (usaSprints && (numSprint < 1 || numSprint > 50)) {
      return NextResponse.json({ error: 'Sprint inválido (1–50)' }, { status: 400 });
    }
    if (usaTiposCasa && tiposCasa.length === 0) {
      return NextResponse.json({ error: 'Elegí al menos un tipo de casa' }, { status: 400 });
    }
    const sprintGuardado = usaSprints ? numSprint : null;
    const tiposGuardados = usaTiposCasa ? tiposCasa : [];

    // Códigos únicos DENTRO del catálogo que se está viendo: el tipo de obra y —en
    // administrativas y fábricas— la obra de BC dueña de la estructura. Infra
    // repite a propósito los códigos de vivienda (1.1.1, 2.1.1…) y cada casa de
    // socio repite los suyos (G1.1.1) — son catálogos aparte.
    const dup = await db.request()
      .input('cod', sql.VarChar(50), codigo)
      .input('tipo', sql.VarChar(20), tipoObra)
      .input('obra', sql.VarChar(20), bcWorksNo)
      .query(`SELECT 1 AS ok FROM dbo.SubPartida sp
              JOIN dbo.Partida p ON p.idPartida = sp.idPartida
              JOIN dbo.Etapa g ON g.id = p.idEtapa
              WHERE sp.codigo = @cod AND g.tipoObra = @tipo
                AND ISNULL(g.bcWorksNo, '') = ISNULL(@obra, '')`);
    if (dup.recordset.length > 0) {
      return NextResponse.json({ error: `Ya existe una subpartida con el código "${codigo}"` }, { status: 409 });
    }

    const tx = new sql.Transaction(db);
    await tx.begin();
    let idSubPartida: number;
    try {
      const ins = await new sql.Request(tx)
        .input('codigo', sql.VarChar(50), codigo)
        .input('nombre', sql.NVarChar(150), nombre)
        .input('idPartida', sql.Int, idPartida)
        .input('numSprint', sql.SmallInt, sprintGuardado)
        .input('esCritica', sql.Bit, esCritica)
        .input('descripcion', sql.NVarChar(sql.MAX), descripcion)
        .input('activo', sql.Bit, activo)
        .query(`
          INSERT INTO dbo.SubPartida
            (codigo, nombre, idPartida, numSprint, esCritica, descripcion, esActivo)
          OUTPUT INSERTED.idSubPartida AS idSubPartida
          VALUES (@codigo, @nombre, @idPartida, @numSprint, @esCritica, @descripcion, @activo)
        `);
      idSubPartida = ins.recordset[0].idSubPartida;

      for (const tc of tiposGuardados) {
        await new sql.Request(tx)
          .input('id', sql.Int, idSubPartida)
          .input('tc', sql.VarChar(20), tc)
          .query('INSERT INTO dbo.SubPartidaTipoCasa (idSubPartida, tipoCasa) VALUES (@id, @tc)');
      }
      await tx.commit();
    } catch (e) {
      try { await tx.rollback(); } catch { /* ignorar */ }
      throw e;
    }

    await logAudit({
      idColAccion: session.idCol,
      accion: 'CREAR_SUBPARTIDA',
      entidad: 'SubPartida',
      idEntidad: idSubPartida,
      detalleNuevo: { codigo, nombre, idPartida, tipoObra, numSprint: sprintGuardado, esCritica, descripcion, tiposCasa: tiposGuardados, activo },
      ip,
    });

    return NextResponse.json({ idSubPartida }, { status: 201 });
  } catch (err: unknown) {
    const msg = mensajeParaCliente(err);
    console.error('/api/subpartidas POST error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
