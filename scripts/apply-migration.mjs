#!/usr/bin/env node
// Aplica un .sql de migración contra la DB de Compras (SQL_*), con guarda: SOLO SBX.
import { readFileSync } from 'node:fs';
import sql from 'mssql';

// Cargar .env.local sin dependencias.
try {
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* usar env del entorno */ }

const file = process.argv[2];
if (!file) { console.error('uso: apply-migration.mjs <archivo.sql>'); process.exit(1); }

const connStr = process.env.SQL_CONNECTION_STRING;
const config = connStr ? connStr : {
  server: process.env.SQL_SERVER || process.env.DB_SERVER,
  database: process.env.SQL_DATABASE || process.env.DB_DATABASE || process.env.DB_NAME,
  user: process.env.SQL_USER || process.env.DB_USER,
  password: process.env.SQL_PASSWORD || process.env.DB_PASSWORD,
  port: parseInt(process.env.SQL_PORT || process.env.DB_PORT || '1433'),
  options: { encrypt: true, trustServerCertificate: false },
};

const pool = await sql.connect(config);
const dbName = (await pool.request().query('SELECT DB_NAME() AS db')).recordset[0].db;
console.log('DB destino:', dbName);
if (!/sbx/i.test(dbName)) {
  console.error('ABORT: la DB no es SBX (' + dbName + '). No aplico migraciones fuera de SBX.');
  await pool.close(); process.exit(2);
}

const raw = readFileSync(file, 'utf8');
// Ejecutar por lotes separados por líneas "GO".
const batches = raw.split(/^\s*GO\s*$/im).map(b => b.trim()).filter(Boolean);
for (const [i, b] of batches.entries()) {
  await pool.request().batch(b);
  console.log(`  batch ${i + 1}/${batches.length} OK`);
}

// Verificar columnas nuevas.
const cols = (await pool.request().query(`
  SELECT name, TYPE_NAME(system_type_id) AS tipo, max_length
  FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PedidoCompraDet')
    AND name IN ('taskNo','taskDescr') ORDER BY name`)).recordset;
console.log('Columnas verificadas en dbo.PedidoCompraDet:', JSON.stringify(cols));
await pool.close();
console.log(cols.length === 2 ? 'MIGRACIÓN OK ✓' : 'FALTAN COLUMNAS ✗');
