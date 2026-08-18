import { NextRequest, NextResponse } from 'next/server';
import { getDb, sql } from '@/lib/db';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';

interface FilaIn { codigoObra?: unknown; codigoSubpartida?: unknown; cantidad?: unknown; horas?: unknown }

// Guarda el presupuesto de horas/cantidades en h4:
//   1. upsert h4.ObraSubpartida (crea el par obra×subpartida si no existe)
//   2. nueva versión VIGENTE en h4.ObraSubpartidaPresupuesto (desactiva la anterior)
// Todo set-based en una sola transacción. Cada carga deja historial (version += 1).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.nivelAdmin < 2) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }
  const user = (session.username ?? session.cedula ?? String(session.idCol)).slice(0, 100);

  const body = await req.json().catch(() => ({}));
  const filasRaw: FilaIn[] = Array.isArray(body?.filas) ? body.filas : [];
  if (filasRaw.length === 0) return NextResponse.json({ error: 'No hay filas para guardar' }, { status: 400 });
  if (filasRaw.length > 1000) return NextResponse.json({ error: 'Máximo 1000 filas por carga' }, { status: 400 });

  const filas = filasRaw.map((f) => ({
    codigoObra: String(f.codigoObra ?? '').trim(),
    codigoSubpartida: String(f.codigoSubpartida ?? '').trim(),
    cantidad: f.cantidad == null || f.cantidad === '' ? null : Number(f.cantidad),
    horas: Number(f.horas),
  }));

  const db = await getDb();
  const [obrasRes, subsRes] = await Promise.all([
    db.request().query<{ idObra: number; numeroObra: string }>('SELECT idObra, numeroObra FROM dbo.Obra'),
    db.request().query<{ idSubPartida: number; codigo: string }>('SELECT idSubPartida, codigo FROM dbo.SubPartida WHERE esActivo = 1'),
  ]);
  const obraByNum = new Map(obrasRes.recordset.map((o) => [o.numeroObra.toLowerCase(), o.idObra]));
  const subByCod = new Map(subsRes.recordset.map((s) => [s.codigo.toLowerCase(), s.idSubPartida]));

  // Re-validar en el servidor (no confiar en el cliente): resolver ids, horas>0, sin duplicados.
  const errores: string[] = [];
  const vistos = new Set<string>();
  const resueltas: { idObra: number; idSubpartida: number; cantidad: number | null; horas: number }[] = [];
  filas.forEach((f, i) => {
    const idObra = obraByNum.get(f.codigoObra.toLowerCase());
    const idSub = subByCod.get(f.codigoSubpartida.toLowerCase());
    const n = i + 1;
    if (idObra == null) { errores.push(`Fila ${n}: obra desconocida (${f.codigoObra || '—'})`); return; }
    if (idSub == null) { errores.push(`Fila ${n}: subpartida desconocida (${f.codigoSubpartida || '—'})`); return; }
    if (!Number.isFinite(f.horas) || f.horas <= 0) { errores.push(`Fila ${n}: horas inválidas`); return; }
    if (f.cantidad != null && (!Number.isFinite(f.cantidad) || f.cantidad < 0)) { errores.push(`Fila ${n}: cantidad inválida`); return; }
    const clave = `${idObra}:${idSub}`;
    if (vistos.has(clave)) { errores.push(`Fila ${n}: duplicada (misma obra+subpartida)`); return; }
    vistos.add(clave);
    resueltas.push({ idObra, idSubpartida: idSub, cantidad: f.cantidad, horas: f.horas });
  });

  if (errores.length > 0) {
    return NextResponse.json({ error: 'Hay filas inválidas; corregí la plantilla y volvé a subir.', detalles: errores.slice(0, 50) }, { status: 400 });
  }

  const json = JSON.stringify(resueltas.map((r) => ({ o: r.idObra, s: r.idSubpartida, c: r.cantidad, h: r.horas })));

  // Batch set-based, atómico. XACT_ABORT ON → cualquier error revierte todo.
  const batch = `
    SET XACT_ABORT ON;
    BEGIN TRAN;

    DECLARE @res TABLE (idObra bigint, idSubpartida int, cantidad decimal(18,2) NULL, horas decimal(18,2) NOT NULL);
    INSERT INTO @res (idObra, idSubpartida, cantidad, horas)
    SELECT j.o, j.s, j.c, j.h
    FROM OPENJSON(@json) WITH (o bigint '$.o', s int '$.s', c decimal(18,2) '$.c', h decimal(18,2) '$.h') j;

    -- 1) Crear los pares obra×subpartida que falten.
    INSERT INTO h4.ObraSubpartida (idObra, idSubpartida, creadoPor)
    SELECT DISTINCT r.idObra, r.idSubpartida, @user
    FROM @res r
    WHERE NOT EXISTS (
      SELECT 1 FROM h4.ObraSubpartida os WHERE os.idObra = r.idObra AND os.idSubpartida = r.idSubpartida
    );

    -- 2) Mapear a idObraSubpartida.
    DECLARE @map TABLE (idObraSubpartida bigint PRIMARY KEY, cantidad decimal(18,2) NULL, horas decimal(18,2) NOT NULL);
    INSERT INTO @map (idObraSubpartida, cantidad, horas)
    SELECT os.idObraSubpartida, r.cantidad, r.horas
    FROM @res r
    JOIN h4.ObraSubpartida os ON os.idObra = r.idObra AND os.idSubpartida = r.idSubpartida;

    -- 3) Desactivar la versión vigente anterior de esas subpartidas.
    UPDATE p SET esVigente = 0, fechaModificacion = sysutcdatetime(), modificadoPor = @user
    FROM h4.ObraSubpartidaPresupuesto p
    JOIN @map m ON m.idObraSubpartida = p.idObraSubpartida
    WHERE p.esVigente = 1;

    -- 4) Insertar la nueva versión vigente (version = max + 1).
    INSERT INTO h4.ObraSubpartidaPresupuesto
      (idObraSubpartida, version, hhPresupuestadas, cantidadPresupuestada, esVigente, creadoPor)
    SELECT m.idObraSubpartida, ISNULL(mx.mxv, 0) + 1, m.horas, m.cantidad, 1, @user
    FROM @map m
    OUTER APPLY (SELECT MAX(version) AS mxv FROM h4.ObraSubpartidaPresupuesto WHERE idObraSubpartida = m.idObraSubpartida) mx;

    SELECT
      (SELECT COUNT(*) FROM @map) AS guardadas,
      (SELECT COUNT(*) FROM @res r WHERE NOT EXISTS (
         SELECT 1 FROM h4.ObraSubpartida os2 WHERE os2.idObra = r.idObra AND os2.idSubpartida = r.idSubpartida)) AS paresFaltantesRestantes;

    COMMIT;`;

  try {
    const res = await db.request()
      .input('json', sql.NVarChar(sql.MAX), json)
      .input('user', sql.NVarChar(100), user)
      .query<{ guardadas: number }>(batch);
    const guardadas = res.recordset?.[0]?.guardadas ?? resueltas.length;
    const obras = new Set(resueltas.map((r) => r.idObra)).size;
    return NextResponse.json({ ok: true, guardadas, obras });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('/api/presupuesto/horas POST error:', err);
    return NextResponse.json({ error: `No se pudo guardar: ${msg}` }, { status: 500 });
  }
}
