#!/usr/bin/env node
/* ============================================================================
   Aplica un .sql de migración contra CUALQUIERA de las bases del app.

   POR QUÉ existe además de apply-migration.mjs: ese solo corre contra SBX y
   termina con una verificación fija de la migración de Compras. Este es genérico
   (dry-run por defecto, elegís la base, imprime lo que devuelvan los SELECT del
   propio .sql, que es como verifican las migraciones de este repo).

   USO
     node scripts/aplicar-sql.mjs migrations/2026-08-20_algo.sql                    # dry-run
     node scripts/aplicar-sql.mjs migrations/2026-08-20_algo.sql --confirm          # aplica en SBX
     node scripts/aplicar-sql.mjs migrations/… --destino=AdelantePRO --confirm --si-es-produccion

   FLAGS
     --confirm            ejecuta de verdad (sin él solo lista los lotes)
     --destino=X          base destino (default AdelanteSBX)
     --si-es-produccion   obligatorio si el destino tiene "PRO" en el nombre
   ============================================================================ */
import sql from 'mssql';
import { readFileSync } from 'node:fs';

try {
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
} catch { /* usar env del entorno */ }

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const has = (f) => args.includes(f);
const val = (f, d) => args.find((a) => a.startsWith(f + '='))?.split('=')[1] ?? d;
const CONFIRM = has('--confirm');
const DESTINO = val('--destino', 'AdelanteSBX');

if (!file) {
  console.error('uso: aplicar-sql.mjs <archivo.sql> [--destino=AdelanteSBX] [--confirm]');
  process.exit(1);
}
if (/pro/i.test(DESTINO) && !has('--si-es-produccion')) {
  console.error(`ABORT: "${DESTINO}" es una base de producción. Agregá --si-es-produccion si de verdad va ahí.`);
  process.exit(2);
}

const raw = readFileSync(file, 'utf8');
// Los .sql de este repo separan lotes con líneas "GO" (no es T-SQL, es del cliente).
const batches = raw.split(/^\s*GO\s*$/im).map((b) => b.trim()).filter(Boolean);

console.log(`\nARCHIVO  = ${file}`);
console.log(`DESTINO  = ${DESTINO}`);
console.log(`LOTES    = ${batches.length}`);
console.log(`MODO     = ${CONFIRM ? '*** EJECUCIÓN REAL ***' : 'dry-run (agregá --confirm para ejecutar)'}\n`);

if (!CONFIRM) {
  batches.forEach((b, i) => console.log(`  ${i + 1}. ${b.split('\n').find((l) => l.trim() && !l.trim().startsWith('--')) ?? '(comentarios)'}`));
  console.log('\n(dry-run: no se ejecutó nada)\n');
  process.exit(0);
}

const pool = await new sql.ConnectionPool({
  server: process.env.DB_SERVER, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: DESTINO, port: parseInt(process.env.DB_PORT ?? '1433'),
  connectionTimeout: 90000, requestTimeout: 300000,
  options: { encrypt: true, trustServerCertificate: false },
}).connect();

const db = (await pool.request().query('SELECT DB_NAME() AS db')).recordset[0].db;
console.log(`Conectado a ${db}\n`);

let falló = false;
for (const [i, b] of batches.entries()) {
  try {
    const res = await pool.request().query(b);
    // Si el lote devolvió filas (los SELECT de verificación), mostrarlas.
    const sets = res.recordsets ?? [];
    console.log(`  lote ${i + 1}/${batches.length} OK`);
    for (const rs of sets) if (rs.length) console.table(rs);
  } catch (e) {
    falló = true;
    console.error(`  lote ${i + 1}/${batches.length} ✗ ${e.message}`);
    break;
  }
}
await pool.close();
console.log(falló ? '\n✗ La migración se detuvo en el lote que falló.\n' : '\n✓ Migración aplicada.\n');
process.exitCode = falló ? 1 : 0;
