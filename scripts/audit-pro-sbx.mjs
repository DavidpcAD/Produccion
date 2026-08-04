// Auditoría de la réplica pro_* en AdelanteSBX.
// Compara AdelanteDB (fuente) vs AdelanteSBX (schemas pro_*) y reporta:
//   1) Tablas: que estén todas las que usa el Grupo B.
//   2) Datos: conteo de filas fuente vs destino (por tabla).
//   3) FKs: cuántas hay en pro_* (creadas WITH NOCHECK).
// Uso:  node scripts/audit-pro-sbx.mjs
// Lee credenciales de .env.local (DB_SERVER / DB_USER / DB_PASSWORD).
import sql from 'mssql';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
for (const l of env.split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim(); }
const base = { server: process.env.DB_SERVER, user: process.env.DB_USER, password: process.env.DB_PASSWORD, port: 1433, connectionTimeout: 90000, requestTimeout: 180000, options: { encrypt: true, trustServerCertificate: false } };

const map = { obc: 'pro_obc', hor: 'pro_hor', lab: 'pro_lab', uti: 'pro_uti', app: 'pro_app', bi: 'pro_bi' };
const dsch = s => s === 'dbo' ? 'pro_ventas' : map[s];
const BI = ['dim_obra', 'stg_job_budgets', 'fact_presupuesto'];
const VENTAS = ['Casos', 'Lotes', 'Movimientos', 'UtilidadMovimiento', 'Proyecto', 'Bloques', 'Modelos', 'Bancos', 'Clientes', 'Estados', 'TipMovi', 'TipoCambio', 'ActividadObra', 'BitacoraVentas', 'Colaboradores', 'FaseAD'];

const src = await new sql.ConnectionPool({ ...base, database: 'AdelanteDB' }).connect();
const dst = await new sql.ConnectionPool({ ...base, database: 'AdelanteSBX' }).connect();

// tablas en scope (fuente)
const tbls = (await src.request().query(`SELECT s.name sch, t.name obj FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
  WHERE s.name IN ('obc','hor','lab','uti','app') OR (s.name='bi' AND t.name IN ('${BI.join("','")}')) OR (s.name='dbo' AND t.name IN ('${VENTAS.join("','")}'))
  ORDER BY s.name,t.name`)).recordset;

// tablas existentes en destino
const dstTables = new Set((await dst.request().query("SELECT s.name+'.'+t.name AS n FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name LIKE 'pro[_]%'")).recordset.map(r => r.n));

let missing = [], diffs = [], totS = 0, totD = 0, okRows = 0;
for (const t of tbls) {
  const d = `${dsch(t.sch)}.${t.obj}`;
  if (!dstTables.has(d)) { missing.push(`${t.sch}.${t.obj} → ${d}`); continue; }
  const cs = (await src.request().query(`SELECT COUNT(*) c FROM [${t.sch}].[${t.obj}]`)).recordset[0].c;
  const cd = (await dst.request().query(`SELECT COUNT(*) c FROM [${dsch(t.sch)}].[${t.obj}]`)).recordset[0].c;
  totS += cs; totD += cd;
  if (cs !== cd) diffs.push(`${d}: fuente=${cs} destino=${cd} (Δ ${cd - cs})`); else okRows++;
}

// inventario destino (objetos + FKs)
const inv = (await dst.request().query(`SELECT s.name sch,
  SUM(CASE WHEN o.type='U' THEN 1 ELSE 0 END) tablas,
  SUM(CASE WHEN o.type='V' THEN 1 ELSE 0 END) vistas,
  SUM(CASE WHEN o.type IN ('FN','IF','TF') THEN 1 ELSE 0 END) funcs,
  SUM(CASE WHEN o.type='P' THEN 1 ELSE 0 END) procs
  FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
  WHERE s.name LIKE 'pro[_]%' AND o.type IN ('U','V','FN','IF','TF','P') GROUP BY s.name ORDER BY s.name`)).recordset;
const fkRow = (await dst.request().query("SELECT COUNT(*) c, SUM(CAST(fk.is_not_trusted AS int)) nc FROM sys.foreign_keys fk JOIN sys.tables t ON t.object_id=fk.parent_object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name LIKE 'pro[_]%'")).recordset[0];

console.log('\n════════ AUDITORÍA RÉPLICA pro_* EN AdelanteSBX ════════\n');
console.log('── Inventario de objetos en SBX ──');
console.table(inv);
console.log(`Foreign keys en pro_*: ${fkRow.c} (WITH NOCHECK/is_not_trusted: ${fkRow.nc})\n`);

console.log('── 1) TABLAS ──');
console.log(missing.length ? `❌ FALTAN ${missing.length}:\n  ${missing.join('\n  ')}` : `✅ Las ${tbls.length} tablas del Grupo B están en SBX`);

console.log('\n── 2) DATOS (conteo de filas fuente vs destino) ──');
console.log(`Filas fuente: ${totS.toLocaleString()} | destino: ${totD.toLocaleString()} | tablas con conteo idéntico: ${okRows}/${tbls.length - missing.length}`);
console.log(diffs.length ? `⚠️ DIFERENCIAS (${diffs.length}):\n  ${diffs.join('\n  ')}` : '✅ Todos los conteos coinciden');

console.log('\n── 3) FOREIGN KEYS ──');
console.log(fkRow.c >= 100 ? `✅ ${fkRow.c} FKs presentes (esperado ~102)` : `⚠️ Solo ${fkRow.c} FKs (esperado ~102)`);

const pass = missing.length === 0 && diffs.length === 0 && fkRow.c >= 100;
console.log(`\n${pass ? '✅ TODO OK' : '⚠️ REVISAR PENDIENTES ARRIBA'}\n`);
await src.close(); await dst.close();
