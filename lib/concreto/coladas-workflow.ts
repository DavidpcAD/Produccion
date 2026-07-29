import type sqlModule from 'mssql';
import { sql } from '@/lib/db-adelantedb';
import type { BatchHuerfano, ListarObrasParams, Obra, ResultadoWorkflow } from './tipos-workflow';

// Portado FIEL de la app original `adelante-control-concreto`:
//   - api/src/lib/transicionar-colada.ts       (helper de transición + lock optimista)
//   - api/src/functions/coladas-transiciones.ts (confirmar/desconfirmar/digitar/cerrar/anular/asignar-obra)
//   - api/src/functions/coladas-consolidar.ts   (consolidar coladas 'sugerida')
//   - api/src/functions/coladas-batches.ts       (excluir/agregar/restaurar/huérfanos)
//   - api/src/lib/agrupador-coladas.ts           (recalcularAgregadosColada)
//   - api/src/lib/consultar-obras.ts             (listarObras desde bi.dim_obra)
//
// Se conservan nombres de tabla/columna (schemas hor.*/bi.*) y las reglas de
// transición EXACTAS. La máquina de estados:
//
//   sugerida  ──confirmar──▶  confirmada  ──marcar-digitada──▶  digitada  ──cerrar──▶  cerrada (FINAL)
//   sugerida  ◀─desconfirmar─ confirmada  ◀─desmarcar-digitada─ digitada
//   * (no cerrada) ──anular──▶ anulada ──desanular──▶ sugerida
//
// El actor de auditoría (columnas *_por_oid del repo original, que allá era el
// Azure AD oid) se toma acá de la sesión del app (session.cedula). Va en un
// param @oid NVarChar(100) para respetar el esquema portado sin cambios.
//
// NOTA(concreto): el repo original, además del UPDATE, sincronizaba la muestra
// de laboratorio vinculada (sincronizar-muestra-con-colada.ts) en marcar-digitada
// y asignar-obra. Ese efecto es del módulo Laboratorio (otro dueño) y se difiere:
// el core del workflow de coladas queda correcto sin él.

type EjecutorSql = sqlModule.ConnectionPool | sqlModule.Transaction;

// ─── Helper de transición con lock optimista ────────────────────────────────
// UPDATE ... WHERE estado = @estado_esperado. Si nadie cambió el estado en el
// medio, afecta 1 fila → ok. Si 0 filas: o no existe la colada, o su estado ya
// cambió (conflicto → 409 para que el cliente recargue).

type ResultadoTransicion =
  | { tipo: 'ok' }
  | { tipo: 'no_encontrada' }
  | { tipo: 'conflicto'; estadoActual: string };

interface ArgsTransicion {
  ejecutor: EjecutorSql;
  idColada: number;
  estadoEsperado: string;
  estadoNuevo: string;
  /** Actor de auditoría; disponible como @oid (NVarChar 100) en los SETs. */
  actor: string;
  /** SETs adicionales sobre hor.coladas además de estado y actualizada_en. */
  setsAdicionales: string;
  paramsExtra?: Array<{
    nombre: string;
    tipo: sqlModule.ISqlType | (() => sqlModule.ISqlType);
    valor: unknown;
  }>;
}

async function transicionarColada(args: ArgsTransicion): Promise<ResultadoTransicion> {
  const { ejecutor, idColada, estadoEsperado, estadoNuevo, actor, setsAdicionales } = args;

  const req = ejecutor
    .request()
    .input('id', sql.Int, idColada)
    .input('estado_esperado', sql.NVarChar(20), estadoEsperado)
    .input('estado_nuevo', sql.NVarChar(20), estadoNuevo)
    .input('oid', sql.NVarChar(100), actor);

  for (const p of args.paramsExtra ?? []) {
    req.input(p.nombre, p.tipo as sqlModule.ISqlType, p.valor);
  }

  const r = await req.query<{ filas_afectadas: number }>(`
    UPDATE hor.coladas
    SET estado = @estado_nuevo,
        ${setsAdicionales},
        actualizada_en = SYSUTCDATETIME()
    WHERE id_colada = @id AND estado = @estado_esperado;

    SELECT @@ROWCOUNT AS filas_afectadas;
  `);

  const rowcount = r.recordset[0]?.filas_afectadas ?? 0;
  if (rowcount === 1) return { tipo: 'ok' };

  const rEstado = await ejecutor
    .request()
    .input('id', sql.Int, idColada)
    .query<{ estado: string }>('SELECT estado FROM hor.coladas WHERE id_colada = @id');
  const estadoActual = rEstado.recordset[0]?.estado;
  if (!estadoActual) return { tipo: 'no_encontrada' };
  return { tipo: 'conflicto', estadoActual };
}

/** Mapea el resultado del helper a ResultadoWorkflow (para la ruta HTTP). */
function mapearTransicion(
  r: ResultadoTransicion,
  idColada: number,
  estadoEsperado: string,
  estadoNuevo: string,
): ResultadoWorkflow {
  if (r.tipo === 'ok') return { ok: true };
  if (r.tipo === 'no_encontrada') {
    return { ok: false, status: 404, codigo: 'NO_ENCONTRADA', error: `Colada ${idColada}` };
  }
  return {
    ok: false,
    status: 409,
    codigo: 'CONFLICTO_ESTADO',
    error: `La colada está en estado "${r.estadoActual}", no se puede pasar a "${estadoNuevo}" (se esperaba "${estadoEsperado}").`,
    extra: { estadoActual: r.estadoActual, estadoEsperado },
  };
}

// ─── Recálculo de agregados de una colada ───────────────────────────────────
// Portado de agrupador-coladas.ts. Recalcula sobre TODOS los batches no
// excluidos: m³, conteos, alarmas, A/C ponderado por m³, fecha_inicio/fin.

async function recalcularAgregadosColada(ejecutor: EjecutorSql, idColada: number): Promise<void> {
  await ejecutor
    .request()
    .input('id_colada', sql.Int, idColada)
    .query(`
      WITH agg AS (
        SELECT
          COALESCE(SUM(b.m3_producidos), 0)               AS m3_producidos,
          COUNT(*)                                         AS cantidad_batches,
          COALESCE(SUM(b.cantidad_alarmas), 0)             AS cantidad_alarmas_total,
          MIN(b.fecha_inicio)                              AS fecha_inicio,
          MAX(b.fecha_fin)                                 AS fecha_fin
        FROM hor.batches b
        JOIN hor.colada_batches cb ON cb.id_batch = b.id
        WHERE cb.id_colada = @id_colada AND cb.excluido = 0
      ),
      ac AS (
        SELECT
          SUM(b.relacion_agua_cemento * b.m3_producidos)
            / NULLIF(SUM(b.m3_producidos), 0)             AS ac_promedio
        FROM hor.batches b
        JOIN hor.colada_batches cb ON cb.id_batch = b.id
        WHERE cb.id_colada = @id_colada
          AND cb.excluido = 0
          AND b.relacion_agua_cemento IS NOT NULL
          AND b.m3_producidos > 0
      )
      UPDATE c
      SET m3_producidos                  = agg.m3_producidos,
          cantidad_batches               = agg.cantidad_batches,
          cantidad_alarmas_total         = agg.cantidad_alarmas_total,
          tuvo_alarma                    = CASE WHEN agg.cantidad_alarmas_total > 0 THEN 1 ELSE 0 END,
          relacion_agua_cemento_promedio = ac.ac_promedio,
          fecha_inicio                   = COALESCE(agg.fecha_inicio, c.fecha_inicio),
          fecha_fin                      = COALESCE(agg.fecha_fin, c.fecha_fin),
          actualizada_en                 = SYSUTCDATETIME()
      FROM hor.coladas c
      CROSS JOIN agg
      CROSS JOIN ac
      WHERE c.id_colada = @id_colada
    `);
}

// =============================================================================
// 1. CONFIRMAR — sugerida → confirmada
// =============================================================================

export async function confirmar(
  pool: sqlModule.ConnectionPool,
  idColada: number,
  actor: string,
): Promise<ResultadoWorkflow> {
  const r = await transicionarColada({
    ejecutor: pool,
    idColada,
    estadoEsperado: 'sugerida',
    estadoNuevo: 'confirmada',
    actor,
    setsAdicionales: 'fecha_confirmada = SYSUTCDATETIME(), confirmada_por_oid = @oid',
  });
  return mapearTransicion(r, idColada, 'sugerida', 'confirmada');
}

// =============================================================================
// 2. DESCONFIRMAR — confirmada → sugerida (limpia audit de confirmación)
// =============================================================================

export async function desconfirmar(
  pool: sqlModule.ConnectionPool,
  idColada: number,
  actor: string,
): Promise<ResultadoWorkflow> {
  const r = await transicionarColada({
    ejecutor: pool,
    idColada,
    estadoEsperado: 'confirmada',
    estadoNuevo: 'sugerida',
    actor,
    setsAdicionales: 'fecha_confirmada = NULL, confirmada_por_oid = NULL',
  });
  return mapearTransicion(r, idColada, 'confirmada', 'sugerida');
}

// =============================================================================
// 3. MARCAR DIGITADA — confirmada → digitada (exige nº pedido BC)
// =============================================================================

export async function marcarDigitada(
  pool: sqlModule.ConnectionPool,
  idColada: number,
  actor: string,
  numeroPedidoBc: string,
  obraWorksNo?: string | null,
): Promise<ResultadoWorkflow> {
  const r = await transicionarColada({
    ejecutor: pool,
    idColada,
    estadoEsperado: 'confirmada',
    estadoNuevo: 'digitada',
    actor,
    // Si el body trae obra_works_no la pisa; si es NULL, mantiene la actual
    // (NULL del body significa "no especificado", no "borrar").
    setsAdicionales: `fecha_digitada = SYSUTCDATETIME(),
             digitada_por_oid = @oid,
             numero_pedido_ensamblado_bc = @num_pedido,
             obra_works_no = CASE
               WHEN @obra_works_no IS NULL THEN obra_works_no
               ELSE @obra_works_no
             END`,
    paramsExtra: [
      { nombre: 'num_pedido', tipo: sql.NVarChar(50), valor: numeroPedidoBc },
      { nombre: 'obra_works_no', tipo: sql.NVarChar(20), valor: obraWorksNo ?? null },
    ],
  });
  return mapearTransicion(r, idColada, 'confirmada', 'digitada');
}

// =============================================================================
// 4. DESMARCAR DIGITADA — digitada → confirmada (limpia audit + nº pedido)
// =============================================================================

export async function desmarcarDigitada(
  pool: sqlModule.ConnectionPool,
  idColada: number,
  actor: string,
): Promise<ResultadoWorkflow> {
  const r = await transicionarColada({
    ejecutor: pool,
    idColada,
    estadoEsperado: 'digitada',
    estadoNuevo: 'confirmada',
    actor,
    setsAdicionales: `fecha_digitada = NULL,
             digitada_por_oid = NULL,
             numero_pedido_ensamblado_bc = NULL`,
  });
  return mapearTransicion(r, idColada, 'digitada', 'confirmada');
}

// =============================================================================
// 5. CERRAR — digitada → cerrada (FINAL)
// =============================================================================

export async function cerrar(
  pool: sqlModule.ConnectionPool,
  idColada: number,
  actor: string,
): Promise<ResultadoWorkflow> {
  const r = await transicionarColada({
    ejecutor: pool,
    idColada,
    estadoEsperado: 'digitada',
    estadoNuevo: 'cerrada',
    actor,
    setsAdicionales: 'fecha_cerrada = SYSUTCDATETIME(), cerrada_por_oid = @oid',
  });
  return mapearTransicion(r, idColada, 'digitada', 'cerrada');
}

// =============================================================================
// 6. ANULAR — sugerida/confirmada/digitada → anulada (exige motivo, solo admin)
// =============================================================================
// UPDATE propio con CHECK explícito porque acepta venir de 3 estados distintos.

export async function anular(
  pool: sqlModule.ConnectionPool,
  idColada: number,
  actor: string,
  motivo: string,
): Promise<ResultadoWorkflow> {
  const r = await pool
    .request()
    .input('id', sql.Int, idColada)
    .input('oid', sql.NVarChar(100), actor)
    .input('motivo', sql.NVarChar(sql.MAX), motivo)
    .query<{ filas_afectadas: number }>(`
      UPDATE hor.coladas
      SET estado = 'anulada',
          fecha_anulada = SYSUTCDATETIME(),
          anulada_por_oid = @oid,
          motivo_anulacion = @motivo,
          actualizada_en = SYSUTCDATETIME()
      WHERE id_colada = @id
        AND estado IN ('sugerida', 'confirmada', 'digitada');

      SELECT @@ROWCOUNT AS filas_afectadas;
    `);

  if ((r.recordset[0]?.filas_afectadas ?? 0) === 0) {
    const rEstado = await pool
      .request()
      .input('id', sql.Int, idColada)
      .query<{ estado: string }>('SELECT estado FROM hor.coladas WHERE id_colada = @id');
    const estadoActual = rEstado.recordset[0]?.estado;
    if (!estadoActual) {
      return { ok: false, status: 404, codigo: 'NO_ENCONTRADA', error: `Colada ${idColada}` };
    }
    return {
      ok: false,
      status: 409,
      codigo: 'CONFLICTO_ESTADO',
      error: `La colada está en estado "${estadoActual}", no se puede anular (estados anulables: sugerida, confirmada, digitada).`,
      extra: { estadoActual, estadosAnulables: ['sugerida', 'confirmada', 'digitada'] },
    };
  }
  return { ok: true };
}

// =============================================================================
// 6b. DESANULAR — anulada → sugerida (safety net para admin)
// =============================================================================

export async function desanular(
  pool: sqlModule.ConnectionPool,
  idColada: number,
): Promise<ResultadoWorkflow> {
  const r = await pool
    .request()
    .input('id', sql.Int, idColada)
    .query<{ filas_afectadas: number }>(`
      UPDATE hor.coladas
      SET estado            = 'sugerida',
          fecha_anulada     = NULL,
          anulada_por_oid   = NULL,
          motivo_anulacion  = NULL,
          actualizada_en    = SYSUTCDATETIME()
      WHERE id_colada = @id
        AND estado = 'anulada';

      SELECT @@ROWCOUNT AS filas_afectadas;
    `);

  if ((r.recordset[0]?.filas_afectadas ?? 0) === 0) {
    const rEstado = await pool
      .request()
      .input('id', sql.Int, idColada)
      .query<{ estado: string }>('SELECT estado FROM hor.coladas WHERE id_colada = @id');
    const estadoActual = rEstado.recordset[0]?.estado;
    if (!estadoActual) {
      return { ok: false, status: 404, codigo: 'NO_ENCONTRADA', error: `Colada ${idColada}` };
    }
    return {
      ok: false,
      status: 409,
      codigo: 'CONFLICTO_ESTADO',
      error: `La colada está en estado "${estadoActual}", solo se pueden desanular coladas en estado "anulada".`,
      extra: { estadoActual },
    };
  }
  return { ok: true };
}

// =============================================================================
// 7. ASIGNAR OBRA — set obra_works_no mientras estado ≠ anulada
// =============================================================================
// No es transición de estado. Valida que la obra exista en bi.dim_obra (salvo
// null, que la limpia). Permitido incluso en 'cerrada' (la obra es metadata).

export async function asignarObra(
  pool: sqlModule.ConnectionPool,
  idColada: number,
  obraWorksNo: string | null,
): Promise<ResultadoWorkflow> {
  // 1) Verificar estado (bloqueado solo en 'anulada').
  const rEstado = await pool
    .request()
    .input('id', sql.Int, idColada)
    .query<{ estado: string; destino_raw: string | null }>(
      'SELECT estado, destino_raw FROM hor.coladas WHERE id_colada = @id',
    );
  const fila = rEstado.recordset[0];
  if (!fila) {
    return { ok: false, status: 404, codigo: 'NO_ENCONTRADA', error: `Colada ${idColada}` };
  }
  if (fila.estado === 'anulada') {
    return {
      ok: false,
      status: 409,
      codigo: 'COLADA_NO_EDITABLE',
      error: 'La colada está anulada, no se puede asignar/cambiar obra.',
      extra: { estadoActual: fila.estado },
    };
  }

  // 2) Si se asigna una obra (no null), validar que exista.
  if (obraWorksNo !== null) {
    const rObra = await pool
      .request()
      .input('w', sql.NVarChar(20), obraWorksNo)
      .query<{ existe: number }>(
        `SELECT COUNT(*) AS existe
         FROM bi.dim_obra
         WHERE works_no COLLATE DATABASE_DEFAULT = @w COLLATE DATABASE_DEFAULT`,
      );
    if ((rObra.recordset[0]?.existe ?? 0) === 0) {
      return {
        ok: false,
        status: 404,
        codigo: 'OBRA_NO_ENCONTRADA',
        error: `La obra "${obraWorksNo}" no existe en bi.dim_obra.`,
      };
    }
  }

  // 3) UPDATE de la obra.
  await pool
    .request()
    .input('id', sql.Int, idColada)
    .input('obra', sql.NVarChar(20), obraWorksNo)
    .query(`
      UPDATE hor.coladas
      SET obra_works_no = @obra, actualizada_en = SYSUTCDATETIME()
      WHERE id_colada = @id
    `);

  // NOTA(concreto): el repo original propagaba la obra a la muestra de
  // laboratorio vinculada (sincronizar-muestra-con-colada). Diferido: es del
  // módulo Laboratorio.

  return { ok: true };
}

// =============================================================================
// 8. CONSOLIDAR — fusiona 2..20 coladas 'sugerida' de la misma planta en 1
// =============================================================================
// La principal = id_colada más bajo. Las demás → 'anulada' con motivo. Devuelve
// el id de la colada principal para que la ruta recargue su detalle.

export async function consolidar(
  pool: sqlModule.ConnectionPool,
  idsEntrada: number[],
  actor: string,
): Promise<ResultadoWorkflow & { idPrincipal?: number }> {
  // Dedup defensivo.
  const ids = Array.from(new Set(idsEntrada)).sort((a, b) => a - b);
  if (ids.length < 2) {
    return {
      ok: false,
      status: 400,
      codigo: 'BODY_INVALIDO',
      error: 'Se requieren al menos 2 coladas distintas para consolidar.',
    };
  }
  if (ids.length > 20) {
    return {
      ok: false,
      status: 400,
      codigo: 'BODY_INVALIDO',
      error: 'No se pueden consolidar más de 20 coladas a la vez.',
    };
  }

  // 1) Cargar las coladas (usamos params para evitar inyección; ids ya son enteros).
  const listaIds = ids.join(',');
  const rColadas = await pool.request().query<{
    id_colada: number;
    codigo_interno: number;
    estado: string;
    id_planta: number;
  }>(`
    SELECT id_colada, codigo_interno, estado, id_planta
    FROM hor.coladas
    WHERE id_colada IN (${listaIds})
  `);
  const filas = rColadas.recordset;

  // 2) Validar que existen todas.
  if (filas.length !== ids.length) {
    const encontradas = new Set(filas.map((f) => f.id_colada));
    const faltantes = ids.filter((id) => !encontradas.has(id));
    return {
      ok: false,
      status: 404,
      codigo: 'NO_ENCONTRADA',
      error: `Coladas no encontradas: ${faltantes.join(', ')}`,
    };
  }

  // 3) Validar que todas están en 'sugerida'.
  const noSugeridas = filas.filter((f) => f.estado !== 'sugerida');
  if (noSugeridas.length > 0) {
    return {
      ok: false,
      status: 409,
      codigo: 'ESTADO_INVALIDO',
      error: `Solo se pueden consolidar coladas en estado 'sugerida'. Coladas con otro estado: ${noSugeridas
        .map((f) => `#${f.codigo_interno} (${f.estado})`)
        .join(', ')}.`,
      extra: { coladasNoConsolidables: noSugeridas },
    };
  }

  // 4) Validar misma planta.
  const plantas = new Set(filas.map((f) => f.id_planta));
  if (plantas.size > 1) {
    return {
      ok: false,
      status: 409,
      codigo: 'PLANTAS_DISTINTAS',
      error: `Las coladas pertenecen a plantas distintas (${plantas.size}). Solo se pueden consolidar coladas de la misma planta.`,
      extra: { idsPlantasDistintas: Array.from(plantas) },
    };
  }

  // 5) Principal = id más bajo.
  const idPrincipal = Math.min(...ids);
  const principal = filas.find((f) => f.id_colada === idPrincipal);
  if (!principal) {
    throw new Error(`Inconsistencia: principal id=${idPrincipal} no encontrada en recordset.`);
  }
  const idsAbsorbidas = ids.filter((id) => id !== idPrincipal);
  const motivo = `Consolidada en colada #${principal.codigo_interno}`;

  // 6) Cambios en transacción explícita (atomicidad).
  const tx = pool.transaction();
  await tx.begin();
  try {
    const listaAbs = idsAbsorbidas.join(',');
    // 6a) Mover batches NO excluidos de las absorbidas → principal.
    await tx
      .request()
      .input('id_principal', sql.Int, idPrincipal)
      .query(`
        UPDATE hor.colada_batches
        SET id_colada = @id_principal,
            agregado_en = SYSUTCDATETIME()
        WHERE id_colada IN (${listaAbs})
          AND excluido = 0
      `);

    // 6b) Anular las absorbidas.
    await tx
      .request()
      .input('oid', sql.NVarChar(100), actor)
      .input('motivo', sql.NVarChar(sql.MAX), motivo)
      .query(`
        UPDATE hor.coladas
        SET estado = 'anulada',
            fecha_anulada = SYSUTCDATETIME(),
            anulada_por_oid = @oid,
            motivo_anulacion = @motivo,
            actualizada_en = SYSUTCDATETIME()
        WHERE id_colada IN (${listaAbs})
      `);

    // 6c) Recalcular agregados de la principal.
    await recalcularAgregadosColada(tx, idPrincipal);

    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }

  return { ok: true, idPrincipal };
}

// =============================================================================
// 9. EXCLUIR BATCH — marca un batch como excluido del agregado de la colada
// =============================================================================
// Solo permitido en 'sugerida' o 'confirmada'. El batch queda huérfano.

export async function excluirBatch(
  pool: sqlModule.ConnectionPool,
  idColada: number,
  idBatch: number,
  motivo: string,
  actor: string,
): Promise<ResultadoWorkflow> {
  // 1) Verificar estado.
  const rEstado = await pool
    .request()
    .input('id', sql.Int, idColada)
    .query<{ estado: string }>('SELECT estado FROM hor.coladas WHERE id_colada = @id');
  const estado = rEstado.recordset[0]?.estado;
  if (!estado) {
    return { ok: false, status: 404, codigo: 'NO_ENCONTRADA', error: `Colada ${idColada}` };
  }
  if (estado !== 'sugerida' && estado !== 'confirmada') {
    return {
      ok: false,
      status: 409,
      codigo: 'ESTADO_NO_MODIFICABLE',
      error: `La colada está en estado "${estado}", no se puede excluir batches (solo permitido en sugerida o confirmada).`,
      extra: { estadoActual: estado, estadosPermitidos: ['sugerida', 'confirmada'] },
    };
  }

  // 2) UPDATE atómico: solo si el batch está en esta colada y NO excluido.
  const rUpdate = await pool
    .request()
    .input('id_colada', sql.Int, idColada)
    .input('id_batch', sql.BigInt, idBatch)
    .input('motivo', sql.NVarChar(500), motivo)
    .input('oid', sql.NVarChar(100), actor)
    .query<{ filas_afectadas: number }>(`
      UPDATE hor.colada_batches
      SET excluido = 1,
          excluido_motivo = @motivo,
          excluido_por_oid = @oid,
          excluido_en = SYSUTCDATETIME()
      WHERE id_colada = @id_colada
        AND id_batch = @id_batch
        AND excluido = 0;

      SELECT @@ROWCOUNT AS filas_afectadas;
    `);

  if ((rUpdate.recordset[0]?.filas_afectadas ?? 0) === 0) {
    const rExiste = await pool
      .request()
      .input('id_colada', sql.Int, idColada)
      .input('id_batch', sql.BigInt, idBatch)
      .query<{ excluido: boolean }>(
        'SELECT excluido FROM hor.colada_batches WHERE id_colada = @id_colada AND id_batch = @id_batch',
      );
    const f = rExiste.recordset[0];
    if (!f) {
      return {
        ok: false,
        status: 404,
        codigo: 'NO_ENCONTRADA',
        error: `Batch ${idBatch} en colada ${idColada}`,
      };
    }
    return {
      ok: false,
      status: 409,
      codigo: 'BATCH_YA_EXCLUIDO',
      error: `El batch ${idBatch} ya está excluido de la colada ${idColada}.`,
    };
  }

  // 3) Recalcular agregados.
  await recalcularAgregadosColada(pool, idColada);
  return { ok: true };
}

// =============================================================================
// 10. AGREGAR BATCH HUÉRFANO — mueve un batch excluido a otra colada 'sugerida'
// =============================================================================
// Recalcula agregados de origen y destino.

export async function agregarBatch(
  pool: sqlModule.ConnectionPool,
  idColadaDestino: number,
  idBatch: number,
): Promise<ResultadoWorkflow> {
  // 1) Verificar estado de la colada destino (debe ser 'sugerida').
  const rEstado = await pool
    .request()
    .input('id', sql.Int, idColadaDestino)
    .query<{ estado: string }>('SELECT estado FROM hor.coladas WHERE id_colada = @id');
  const estado = rEstado.recordset[0]?.estado;
  if (!estado) {
    return {
      ok: false,
      status: 404,
      codigo: 'NO_ENCONTRADA',
      error: `Colada destino ${idColadaDestino}`,
    };
  }
  if (estado !== 'sugerida') {
    return {
      ok: false,
      status: 409,
      codigo: 'COLADA_DESTINO_NO_RECIBE',
      error: `La colada destino está en estado "${estado}", solo se puede agregar batches a coladas en "sugerida".`,
      extra: { estadoActual: estado },
    };
  }

  // 2) El batch debe existir en colada_batches con excluido = 1.
  const rBatch = await pool
    .request()
    .input('id_batch', sql.BigInt, idBatch)
    .query<{ id_colada_origen: number; excluido: boolean }>(`
      SELECT id_colada AS id_colada_origen, excluido
      FROM hor.colada_batches
      WHERE id_batch = @id_batch
    `);
  const fila = rBatch.recordset[0];
  if (!fila) {
    return {
      ok: false,
      status: 404,
      codigo: 'NO_ENCONTRADA',
      error: `Batch ${idBatch} no está vinculado a ninguna colada (no se puede agregar)`,
    };
  }
  if (!fila.excluido) {
    return {
      ok: false,
      status: 409,
      codigo: 'BATCH_NO_HUERFANO',
      error: `El batch ${idBatch} pertenece a la colada ${fila.id_colada_origen} y NO está excluido. Primero hay que excluirlo de esa colada para liberarlo.`,
      extra: { idColadaOrigen: fila.id_colada_origen },
    };
  }
  if (fila.id_colada_origen === idColadaDestino) {
    return {
      ok: false,
      status: 409,
      codigo: 'BATCH_EXCLUIDO_EN_DESTINO',
      error: `El batch ${idBatch} está excluido en la colada destino ${idColadaDestino}. No se puede "agregar" a la misma colada de la que viene como excluido (usá restaurar).`,
    };
  }

  // 3) Mover: UPDATE id_colada + limpiar columnas de exclusión.
  const idColadaOrigen = fila.id_colada_origen;
  await pool
    .request()
    .input('id_colada_destino', sql.Int, idColadaDestino)
    .input('id_batch', sql.BigInt, idBatch)
    .query(`
      UPDATE hor.colada_batches
      SET id_colada = @id_colada_destino,
          excluido = 0,
          excluido_motivo = NULL,
          excluido_por_oid = NULL,
          excluido_en = NULL,
          agregado_en = SYSUTCDATETIME()
      WHERE id_batch = @id_batch
    `);

  // 4) Recalcular agregados de origen y destino.
  await recalcularAgregadosColada(pool, idColadaOrigen);
  await recalcularAgregadosColada(pool, idColadaDestino);
  return { ok: true };
}

// =============================================================================
// 11. RESTAURAR BATCH — inverso de excluir, en la MISMA colada original
// =============================================================================
// Solo permitido en 'sugerida' o 'confirmada'.

export async function restaurarBatch(
  pool: sqlModule.ConnectionPool,
  idColada: number,
  idBatch: number,
): Promise<ResultadoWorkflow> {
  // 1) Verificar estado.
  const rEstado = await pool
    .request()
    .input('id', sql.Int, idColada)
    .query<{ estado: string }>('SELECT estado FROM hor.coladas WHERE id_colada = @id');
  const estado = rEstado.recordset[0]?.estado;
  if (!estado) {
    return { ok: false, status: 404, codigo: 'NO_ENCONTRADA', error: `Colada ${idColada}` };
  }
  if (estado !== 'sugerida' && estado !== 'confirmada') {
    return {
      ok: false,
      status: 409,
      codigo: 'ESTADO_NO_MODIFICABLE',
      error: `La colada está en estado "${estado}", no se puede restaurar batches (solo permitido en sugerida o confirmada).`,
      extra: { estadoActual: estado, estadosPermitidos: ['sugerida', 'confirmada'] },
    };
  }

  // 2) UPDATE atómico: solo si el batch está en esta colada Y excluido.
  const rUpdate = await pool
    .request()
    .input('id_colada', sql.Int, idColada)
    .input('id_batch', sql.BigInt, idBatch)
    .query<{ filas_afectadas: number }>(`
      UPDATE hor.colada_batches
      SET excluido = 0,
          excluido_motivo = NULL,
          excluido_por_oid = NULL,
          excluido_en = NULL,
          agregado_en = SYSUTCDATETIME()
      WHERE id_colada = @id_colada
        AND id_batch = @id_batch
        AND excluido = 1;

      SELECT @@ROWCOUNT AS filas_afectadas;
    `);

  if ((rUpdate.recordset[0]?.filas_afectadas ?? 0) === 0) {
    const rExiste = await pool
      .request()
      .input('id_colada', sql.Int, idColada)
      .input('id_batch', sql.BigInt, idBatch)
      .query<{ excluido: boolean }>(
        'SELECT excluido FROM hor.colada_batches WHERE id_colada = @id_colada AND id_batch = @id_batch',
      );
    const f = rExiste.recordset[0];
    if (!f) {
      return {
        ok: false,
        status: 404,
        codigo: 'NO_ENCONTRADA',
        error: `Batch ${idBatch} en colada ${idColada}`,
      };
    }
    return {
      ok: false,
      status: 409,
      codigo: 'BATCH_NO_EXCLUIDO',
      error: `El batch ${idBatch} ya está activo en la colada ${idColada} (no es un huérfano para restaurar).`,
    };
  }

  // 3) Recalcular agregados.
  await recalcularAgregadosColada(pool, idColada);
  return { ok: true };
}

// =============================================================================
// 12. LISTAR BATCHES HUÉRFANOS — todos los colada_batches.excluido = 1
// =============================================================================

export async function listarBatchesHuerfanos(
  pool: sqlModule.ConnectionPool,
): Promise<BatchHuerfano[]> {
  const r = await pool.request().query<{
    id_batch: number;
    record_no: number;
    fecha_inicio: Date;
    m3_producidos: number;
    cliente_raw: string | null;
    recipe_name_raw: string | null;
    planta_codigo: string;
    id_colada_actual: number;
    codigo_interno_actual: number;
    motivo_exclusion: string | null;
    excluido_en: Date | null;
    excluido_por_oid: string | null;
  }>(`
    SELECT
      b.id              AS id_batch,
      b.record_no,
      b.fecha_inicio,
      b.m3_producidos,
      b.cliente_raw,
      b.recipe_name_raw,
      p.codigo          AS planta_codigo,
      cb.id_colada      AS id_colada_actual,
      c.codigo_interno  AS codigo_interno_actual,
      cb.excluido_motivo AS motivo_exclusion,
      cb.excluido_en,
      cb.excluido_por_oid
    FROM hor.colada_batches cb
    JOIN hor.batches b      ON b.id = cb.id_batch
    JOIN hor.coladas c      ON c.id_colada = cb.id_colada
    JOIN hor.plantas p      ON p.id = b.id_planta
    WHERE cb.excluido = 1
    ORDER BY cb.excluido_en DESC, b.fecha_inicio DESC
  `);

  return r.recordset.map((row) => ({
    id_batch: row.id_batch,
    record_no: row.record_no,
    fecha_inicio:
      row.fecha_inicio instanceof Date ? row.fecha_inicio.toISOString() : String(row.fecha_inicio),
    m3_producidos: Number(row.m3_producidos),
    cliente_raw: row.cliente_raw ?? '',
    recipe_name_raw: row.recipe_name_raw,
    planta_codigo: row.planta_codigo,
    id_colada_actual: row.id_colada_actual,
    codigo_interno_actual: row.codigo_interno_actual,
    motivo_exclusion: row.motivo_exclusion,
    excluido_en:
      row.excluido_en instanceof Date ? row.excluido_en.toISOString() : row.excluido_en,
    excluido_por_oid: row.excluido_por_oid,
  }));
}

// =============================================================================
// 13. LISTAR OBRAS — bi.dim_obra (picker de asignación)
// =============================================================================
// Portado de consultar-obras.ts. Solo SELECT sobre el datawarehouse.

export async function listarObras(
  pool: sqlModule.ConnectionPool,
  params: ListarObrasParams,
): Promise<Obra[]> {
  const { q, solo_activas = true, limite = 200 } = params;

  const filtros: string[] = [];
  if (solo_activas) filtros.push("status = 'Open'");
  if (q !== undefined) {
    filtros.push('(works_no LIKE @q OR display_name LIKE @q OR description LIKE @q)');
  }
  const whereClause = filtros.length > 0 ? `WHERE ${filtros.join(' AND ')}` : '';

  const req = pool.request().input('limite', sql.Int, limite);
  if (q !== undefined) req.input('q', sql.NVarChar(102), `%${q}%`);

  const r = await req.query<{
    works_no: string;
    display_name: string | null;
    description: string | null;
    status: string | null;
    centro_costo: string | null;
  }>(`
    SELECT TOP (@limite)
      works_no,
      display_name,
      description,
      status,
      centro_costo
    FROM bi.dim_obra
    ${whereClause}
    ORDER BY display_name, works_no
  `);

  return r.recordset.map((row) => ({
    works_no: row.works_no,
    display_name: row.display_name,
    description: row.description,
    status: row.status,
    centro_costo: row.centro_costo,
  }));
}
