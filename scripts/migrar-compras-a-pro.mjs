#!/usr/bin/env node
/* ============================================================================
   Migra el bloque de COMPRAS (Ingeniería + Aprobación de OC) de AdelanteSBX a
   AdelantePRO: estructura (DDL) + datos de catálogo + (opcional) historial.

   Azure SQL NO permite consultas cross-database, así que la copia pasa por el
   cliente: se lee de SBX y se inserta en PRO preservando los ids (IDENTITY_INSERT).

   USO
     node scripts/migrar-compras-a-pro.mjs                    # dry-run: qué falta
     node scripts/migrar-compras-a-pro.mjs --ddl --confirm    # crea tablas/vista/estados
     node scripts/migrar-compras-a-pro.mjs --catalogos --confirm
     node scripts/migrar-compras-a-pro.mjs --historial --confirm
     node scripts/migrar-compras-a-pro.mjs --verificar        # conteos fuente vs destino

   FLAGS
     --confirm     escribe de verdad (sin él, TODO es dry-run)
     --ddl         aplica migrations/2026-08-19_compras_a_pro.sql
     --catalogos   copia Etapa, Partida, SubPartida, clasificacion, Obra,
                   PlantillaSolicitud, TablaVista
     --historial   copia Movimiento, PedidoCompra(+Det), OrdenCompra(+Det),
                   RecepcionCompra(+Det), NotaCreditoDet
     --sin-obras   excluye dbo.Obra del grupo de catálogos (la lista de obras
                   real vive en BC; dbo.Obra solo alimenta la Matriz)
     --solo-activos  copia únicamente filas vivas (Etapa/Partida/SubPartida
                   activo=1, clasificacion activo=1, Plantilla/TablaVista
                   esEliminada=0). NO combinar con --historial: un pedido viejo
                   puede apuntar a un catálogo inactivo y la FK quedaría colgando.
     --limpiar     aplica en el DESTINO la limpieza de datos de prueba
                   (migrations/2026-08-19_limpiar_pruebas_compras.sql)
     --forzar      copia aunque la tabla destino ya tenga filas (no borra: inserta
                   solo los ids que no existan)
     --destino=X   base destino (default AdelantePRO)

   Credenciales: DB_SERVER / DB_USER / DB_PASSWORD de .env.local.
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
const has = (f) => args.includes(f);
const CONFIRM = has('--confirm');
const FORZAR = has('--forzar');
const DESTINO = (args.find((a) => a.startsWith('--destino='))?.split('=')[1]) ?? 'AdelantePRO';
const ORIGEN = process.env.SQL_DATABASE ?? process.env.DB_DATABASE ?? 'AdelanteSBX';

const SIN_OBRAS = has('--sin-obras');
const SOLO_ACTIVOS = has('--solo-activos');

// Filtros de fila para NO arrastrar catálogo muerto a producción. Solo se aplican
// con --solo-activos. Ojo: si se copian pedidos/órdenes históricos, filtrar acá
// puede dejar FKs colgando (un pedido que apunta a una clasificación inactiva),
// así que --solo-activos y --historial no se combinan bien.
const FILTROS = {
  Etapa: 'activo = 1',
  Partida: 'esActivo = 1',
  SubPartida: 'esActivo = 1',
  clasificacion: 'activo = 1',
  PlantillaSolicitud: 'esEliminada = 0',
  TablaVista: 'esEliminada = 0',
};

const CATALOGOS = ['Etapa', 'Partida', 'SubPartida', 'clasificacion', 'Obra', 'PlantillaSolicitud', 'TablaVista']
  .filter((t) => !(SIN_OBRAS && t === 'Obra'));
const HISTORIAL = ['Movimiento', 'PedidoCompra', 'PedidoCompraDet', 'OrdenCompra', 'OrdenCompraDet',
  'RecepcionCompra', 'RecepcionCompraDet', 'NotaCreditoDet'];
const TODAS = [...CATALOGOS, ...HISTORIAL];

const base = {
  server: process.env.DB_SERVER, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT ?? '1433'),
  connectionTimeout: 90000, requestTimeout: 300000,
  options: { encrypt: true, trustServerCertificate: false },
};

// ------------------------------------------------------------------ helpers
function tipoSql(c) {
  const t = c.ty.toLowerCase();
  const len = (n) => (c.ml === -1 ? sql.MAX : n);
  switch (t) {
    case 'int': return sql.Int();
    case 'bigint': return sql.BigInt();
    case 'smallint': return sql.SmallInt();
    case 'tinyint': return sql.TinyInt();
    case 'bit': return sql.Bit();
    case 'decimal': case 'numeric': return sql.Decimal(c.prec, c.scale);
    case 'money': return sql.Money();
    case 'float': return sql.Float();
    case 'real': return sql.Real();
    case 'date': return sql.Date();
    case 'datetime': return sql.DateTime();
    case 'smalldatetime': return sql.SmallDateTime();
    case 'datetime2': return sql.DateTime2(c.scale);
    case 'datetimeoffset': return sql.DateTimeOffset(c.scale);
    case 'time': return sql.Time(c.scale);
    case 'uniqueidentifier': return sql.UniqueIdentifier();
    case 'nvarchar': return sql.NVarChar(len(c.ml / 2));
    case 'nchar': return sql.NChar(c.ml / 2);
    case 'varchar': return sql.VarChar(len(c.ml));
    case 'char': return sql.Char(c.ml);
    case 'varbinary': return sql.VarBinary(len(c.ml));
    case 'binary': return sql.Binary(c.ml);
    default: return sql.NVarChar(sql.MAX);
  }
}

async function columnas(pool, tabla) {
  const r = await pool.request().query(`
    SELECT c.name, TYPE_NAME(c.user_type_id) ty, c.max_length ml, c.precision prec, c.scale,
           c.is_identity ident, c.is_computed comp
    FROM sys.columns c WHERE c.object_id = OBJECT_ID('dbo.${tabla}') ORDER BY c.column_id`);
  return r.recordset;
}
async function conteo(pool, tabla) {
  try { return (await pool.request().query(`SELECT COUNT(*) c FROM dbo.[${tabla}]`)).recordset[0].c; }
  catch { return null; } // tabla inexistente
}
async function pkCol(pool, tabla) {
  const r = await pool.request().query(`
    SELECT c.name FROM sys.indexes i
    JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
    JOIN sys.columns c ON c.object_id=i.object_id AND c.column_id=ic.column_id
    WHERE i.object_id=OBJECT_ID('dbo.${tabla}') AND i.is_primary_key=1 ORDER BY ic.key_ordinal`);
  return r.recordset.length === 1 ? r.recordset[0].name : null;
}

// ----------------------------------------------------------------- limpieza
// Aplica la misma limpieza de datos de prueba que se corrió en SBX, por si los
// catálogos se copiaron ANTES de limpiar el origen (fue el caso el 2026-08-19).
async function limpiar(dst) {
  const file = new URL('../migrations/2026-08-19_limpiar_pruebas_compras.sql', import.meta.url);
  const lotes = readFileSync(file, 'utf8').split(/^\s*GO\s*$/im).map((b) => b.trim()).filter(Boolean);
  console.log(`\n── Limpieza de datos de prueba en ${DESTINO} (${lotes.length} lotes)`);
  if (!CONFIRM) { console.log('   (dry-run: no se aplica nada)'); return; }
  for (const b of lotes) await dst.request().batch(b);
  const p = (await dst.request().query("SELECT COUNT(*) c FROM dbo.Partida WHERE codigo='9.9'")).recordset[0].c;
  const c = (await dst.request().query('SELECT COUNT(*) c FROM dbo.clasificacion WHERE id IN (2,11)')).recordset[0].c;
  console.log(`   ✓ limpieza aplicada — partida 9.9 restante: ${p} · clasificaciones 2/11 restantes: ${c}`);
}

// --------------------------------------------------------------------- DDL
async function aplicarDdl(dst) {
  const file = new URL('../migrations/2026-08-19_compras_a_pro.sql', import.meta.url);
  const lotes = readFileSync(file, 'utf8').split(/^\s*GO\s*$/im).map((b) => b.trim()).filter(Boolean);
  console.log(`\n── DDL: ${lotes.length} lotes de migrations/2026-08-19_compras_a_pro.sql`);
  if (!CONFIRM) { console.log('   (dry-run: no se aplica nada)'); return; }
  for (const [i, b] of lotes.entries()) {
    try { await dst.request().batch(b); process.stdout.write(`\r   aplicados ${i + 1}/${lotes.length}`); }
    catch (e) { console.error(`\n   ✗ lote ${i + 1}: ${e.message}\n${b.slice(0, 300)}`); throw e; }
  }
  console.log('\n   ✓ DDL aplicado');
}

// -------------------------------------------------------------------- datos
async function copiar(src, dst, tabla) {
  const colsSrc = await columnas(src, tabla);
  const colsDst = await columnas(dst, tabla);
  if (!colsDst.length) { console.log(`   ✗ ${tabla}: no existe en ${DESTINO} (corré --ddl primero)`); return; }
  const nombresDst = new Set(colsDst.map((c) => c.name.toLowerCase()));
  const cols = colsSrc.filter((c) => !c.comp && nombresDst.has(c.name.toLowerCase()));
  const faltan = colsSrc.filter((c) => !c.comp && !nombresDst.has(c.name.toLowerCase())).map((c) => c.name);
  const hayIdentity = cols.some((c) => c.ident);

  const cSrc = await conteo(src, tabla);
  const cDst = await conteo(dst, tabla);
  if (cDst > 0 && !FORZAR) {
    console.log(`   • ${tabla}: destino ya tiene ${cDst} filas → se omite (usá --forzar para completar)`);
    return;
  }
  const pk = await pkCol(dst, tabla);
  const filtro = SOLO_ACTIVOS && FILTROS[tabla] ? ` WHERE ${FILTROS[tabla]}` : '';
  const rows = (await src.request().query(`SELECT ${cols.map((c) => `[${c.name}]`).join(',')} FROM dbo.[${tabla}]${filtro}`)).recordset;
  const existentes = new Set();
  if (cDst > 0 && pk) {
    for (const r of (await dst.request().query(`SELECT [${pk}] k FROM dbo.[${tabla}]`)).recordset) existentes.add(String(r.k));
  }
  const pend = pk ? rows.filter((r) => !existentes.has(String(r[pk]))) : rows;
  console.log(`   • ${tabla}: fuente=${cSrc}${filtro ? ` (${rows.length} tras filtro «${FILTROS[tabla]}»)` : ''} destino=${cDst} → insertar ${pend.length}` +
    (faltan.length ? `  [columnas sin equivalente en destino, se omiten: ${faltan.join(', ')}]` : ''));
  if (!CONFIRM || !pend.length) return;

  const porLote = Math.max(1, Math.floor(1900 / cols.length));
  const tx = new sql.Transaction(dst);
  await tx.begin();
  try {
    if (hayIdentity) await new sql.Request(tx).batch(`SET IDENTITY_INSERT dbo.[${tabla}] ON`);
    for (let i = 0; i < pend.length; i += porLote) {
      const chunk = pend.slice(i, i + porLote);
      const rq = new sql.Request(tx);
      const values = chunk.map((row, ri) => {
        const ps = cols.map((c, ci) => {
          const p = `p${ri}_${ci}`;
          rq.input(p, tipoSql(c), row[c.name] ?? null);
          return `@${p}`;
        });
        return `(${ps.join(',')})`;
      });
      await rq.query(`INSERT INTO dbo.[${tabla}] (${cols.map((c) => `[${c.name}]`).join(',')}) VALUES ${values.join(',')}`);
      process.stdout.write(`\r     insertadas ${Math.min(i + porLote, pend.length)}/${pend.length}`);
    }
    if (hayIdentity) await new sql.Request(tx).batch(`SET IDENTITY_INSERT dbo.[${tabla}] OFF`);
    await tx.commit();
    console.log(`\r     ✓ ${pend.length} filas copiadas`.padEnd(60));
  } catch (e) {
    await tx.rollback();
    console.error(`\n     ✗ ${tabla}: ${e.message}`);
    throw e;
  }
}

// ---------------------------------------------------------------------- main
const src = await new sql.ConnectionPool({ ...base, database: ORIGEN }).connect();
const dst = await new sql.ConnectionPool({ ...base, database: DESTINO }).connect();
console.log(`\nORIGEN  = ${ORIGEN}\nDESTINO = ${DESTINO}\nMODO    = ${CONFIRM ? '*** ESCRITURA REAL ***' : 'dry-run (agregá --confirm para escribir)'}`);

if (!/pro/i.test(DESTINO) && !has('--destino-libre')) {
  console.error(`ABORT: destino "${DESTINO}" no parece la base de producción. Usá --destino=AdelantePRO.`);
  process.exit(2);
}

if (has('--verificar') || (!has('--ddl') && !has('--limpiar') && !has('--catalogos') && !has('--historial'))) {
  console.log('\n── Estado actual (filas: fuente → destino) ──');
  for (const t of TODAS) {
    const a = await conteo(src, t), b = await conteo(dst, t);
    const grupo = CATALOGOS.includes(t) ? 'catálogo ' : 'historial';
    console.log(`   ${grupo} ${t.padEnd(20)} ${String(a).padStart(6)} → ${b === null ? 'TABLA NO EXISTE' : String(b).padStart(6)}`);
  }
  const modulo = (await dst.request().query("SELECT COL_LENGTH('dbo.Estado','modulo') c")).recordset[0].c;
  const est = modulo
    ? (await dst.request().query("SELECT COUNT(*) c FROM dbo.Estado WHERE ISNULL(modulo,'')='Compras'")).recordset[0].c
    : 0;
  const vista = (await dst.request().query("SELECT OBJECT_ID('dbo.vw_MatrizObraClasificacion','V') o")).recordset[0].o;
  console.log(`\n   dbo.Estado.modulo: ${modulo ? 'existe' : 'FALTA'} | estados de Compras en destino: ${est}/13 | vista matriz: ${vista ? 'existe' : 'FALTA'}`);
}

if (has('--ddl')) await aplicarDdl(dst);
if (has('--limpiar')) await limpiar(dst);
if (has('--catalogos')) { console.log('\n── Catálogos ──'); for (const t of CATALOGOS) await copiar(src, dst, t); }
if (has('--historial')) { console.log('\n── Historial de compras ──'); for (const t of HISTORIAL) await copiar(src, dst, t); }

await src.close(); await dst.close();
console.log('');
