import type { ConnectionPool, Transaction } from 'mssql';
import { sql } from '@/lib/db-adelantedb';

/**
 * Pesos efectivos y congelado por obra. Cada obra "congela" su copia de pesos
 * (obc.obra_pesos) al registrar su primer avance > 0 en un sprint/partida; a
 * partir de ahí usa SU copia, inmune a cambios posteriores del catálogo. Si
 * nunca inició el scope, usa el catálogo vigente.
 *
 * Ámbitos: 'sprint' (scope_id = sprint_numero) y 'partida' (scope_id = partida_id).
 */

export type Ambito = 'sprint' | 'partida';

export interface PesoEfectivo {
  sub_partida_id: number;
  peso: number;
  congelado: boolean;
}

export async function obtenerPesosEfectivos(
  db: ConnectionPool,
  obraCodigo: string,
  ambito: Ambito,
  scopeId: number,
  tipoCasa: string,
): Promise<PesoEfectivo[]> {
  const congelados = await db
    .request()
    .input('obra', sql.NVarChar(20), obraCodigo)
    .input('ambito', sql.VarChar(10), ambito)
    .input('scope', sql.Int, scopeId)
    .query<{ sub_partida_id: number; peso: number }>(`
      SELECT sub_partida_id, peso
      FROM obc.obra_pesos
      WHERE obra_codigo = @obra AND ambito = @ambito AND scope_id = @scope
    `);

  if (congelados.recordset.length > 0) {
    return congelados.recordset.map((r) => ({
      sub_partida_id: r.sub_partida_id,
      peso: Number(r.peso),
      congelado: true,
    }));
  }

  const tabla =
    ambito === 'sprint' ? 'obc.sub_partida_pesos_sprint' : 'obc.sub_partida_pesos_partida';
  const col = ambito === 'sprint' ? 'sprint_numero' : 'partida_id';

  const catalogo = await db
    .request()
    .input('scope', sql.Int, scopeId)
    .input('tc', sql.VarChar(20), tipoCasa)
    .query<{ sub_partida_id: number; peso: number }>(`
      SELECT sub_partida_id, peso
      FROM ${tabla}
      WHERE ${col} = @scope AND tipo_casa = @tc
    `);

  return catalogo.recordset.map((r) => ({
    sub_partida_id: r.sub_partida_id,
    peso: Number(r.peso),
    congelado: false,
  }));
}

/**
 * Congela los pesos de un scope para una obra si aún no lo hizo (copia del
 * catálogo vigente a obc.obra_pesos). Idempotente y a prueba de carreras vía
 * NOT EXISTS con UPDLOCK+HOLDLOCK. Debe correr dentro de la transacción del avance.
 */
export async function congelarScopeSiHaceFalta(
  tx: Transaction,
  obraCodigo: string,
  ambito: Ambito,
  scopeId: number,
  tipoCasa: string,
): Promise<boolean> {
  const tabla =
    ambito === 'sprint' ? 'obc.sub_partida_pesos_sprint' : 'obc.sub_partida_pesos_partida';
  const col = ambito === 'sprint' ? 'sprint_numero' : 'partida_id';

  const r = await new sql.Request(tx)
    .input('obra', sql.NVarChar(20), obraCodigo)
    .input('ambito', sql.VarChar(10), ambito)
    .input('scope', sql.Int, scopeId)
    .input('tc', sql.VarChar(20), tipoCasa)
    .query(`
      INSERT INTO obc.obra_pesos (obra_codigo, ambito, scope_id, sub_partida_id, tipo_casa, peso)
      SELECT @obra, @ambito, @scope, c.sub_partida_id, c.tipo_casa, c.peso
      FROM ${tabla} c
      WHERE c.${col} = @scope AND c.tipo_casa = @tc
        AND NOT EXISTS (
          SELECT 1 FROM obc.obra_pesos op WITH (UPDLOCK, HOLDLOCK)
          WHERE op.obra_codigo = @obra AND op.ambito = @ambito
            AND op.scope_id = @scope AND op.sub_partida_id = c.sub_partida_id
        )
    `);

  return (r.rowsAffected[0] ?? 0) > 0;
}
