#!/usr/bin/env node
/* ============================================================================
   Sincroniza dbo.Obra desde los Jobs de Business Central.

   POR QUÉ: la lista real de obras vive en BC. `dbo.Obra` es una copia local que
   alimenta la Matriz por obra de Compras (vista vw_MatrizObraClasificacion, que
   une por numeroObra) y los selectores de obras/cuadrillas/presupuesto. En
   AdelantePRO arrancó vacía a propósito, así que la Matriz sale en blanco hasta
   que se corra esto.

   USO
     node scripts/sync-obras-bc.mjs                        # dry-run: qué haría
     node scripts/sync-obras-bc.mjs --confirm              # aplica
     node scripts/sync-obras-bc.mjs --solo-nuevas --confirm   # solo inserta
     node scripts/sync-obras-bc.mjs --destino=AdelanteSBX --confirm

   FLAGS
     --confirm        escribe de verdad (sin él, TODO es dry-run)
     --solo-nuevas    inserta las obras que faltan y NO actualiza las existentes
     --origen=X       valor de origenPrincipal al INSERTAR (default 'BC')
     --destino=X      base destino (default AdelantePRO)

   QUÉ TOCA Y QUÉ NO
     Campos de BC (los sincroniza)....... nombreMostrado, estado, fechaInicio,
                                          fechaFin, fechaCreacionObra, esBC=1,
                                          areaProrrateadaM2 (solo si BC > 0),
                                          idEncargado / gerenteProyecto (solo si
                                          BC los trae no vacíos)
     Campos de la app (NUNCA los pisa)... centroCosto, areaCosteo, proyectoPadre,
                                          idProyecto, ubicacion, descripcion,
                                          precioNormalMaquinaria,
                                          precioConcretoMaquinaria, esProcore,
                                          origenPrincipal (solo se pone al insertar)
     Nunca BORRA: si una obra dejó de estar en BC solo la reporta — puede tener
     pedidos históricos que la referencian por numeroObra.

   Notas:
     - `areaProrrateadaM2` también la escribe /api/presupuesto, por eso solo se
       pisa cuando BC manda un valor > 0 (BC devuelve 0 cuando no la tiene).
     - BC usa `0001-01-01` como "sin fecha" → se guarda NULL.
     - El entorno sale de BC_BASE_URL (o BC_TENANT_ID + BC_ENVIRONMENT). Acá el
       parseo SÍ tolera la URL sin `/api` al final, a diferencia de
       lib/compras/bc.ts::tenantYEntorno().
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
const val = (f, d) => args.find((a) => a.startsWith(f + '='))?.split('=')[1] ?? d;
const CONFIRM = has('--confirm');
const SOLO_NUEVAS = has('--solo-nuevas');
const ORIGEN = val('--origen', 'BC');
const DESTINO = val('--destino', 'AdelantePRO');

// ------------------------------------------------------------ entorno de BC
function tenantYEntorno() {
  const base = (process.env.BC_BASE_URL ?? '').trim();
  const m = base.match(/\/v2\.0\/([^/]+)\/([^/?#]+)/i); // tolera con o sin /api… al final
  if (m) return { tenant: m[1], environment: m[2] };
  return { tenant: process.env.BC_TENANT_ID, environment: process.env.BC_ENVIRONMENT ?? 'Sandbox' };
}

async function bcToken() {
  const r = await fetch(`https://login.microsoftonline.com/${process.env.BC_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.BC_CLIENT_ID,
      client_secret: process.env.BC_CLIENT_SECRET,
      scope: 'https://api.businesscentral.dynamics.com/.default',
    }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error(`OAuth falló: ${d.error_description ?? d.error ?? r.status}`);
  return d.access_token;
}

async function bcJobs() {
  const { tenant, environment } = tenantYEntorno();
  const cid = process.env.BC_COMPANY_ID;
  const token = await bcToken();
  let url = `https://api.businesscentral.dynamics.com/v2.0/${tenant}/${environment}/api/adelante/project/v1.0/companies(${cid})/jobs`;
  const out = [];
  let guard = 0;
  while (url && guard++ < 50) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!res.ok) throw new Error(`BC ${res.status} en ${url}: ${(await res.text()).slice(0, 250)}`);
    const d = await res.json();
    out.push(...(d.value ?? []));
    url = d['@odata.nextLink'] ?? null;
  }
  return { jobs: out, environment, cid };
}

// ------------------------------------------------------------------ helpers
const SENTINELA = /^0001-01-01/;                       // "sin fecha" en BC
const fecha = (v) => (!v || SENTINELA.test(String(v)) ? null : String(v).slice(0, 10));
const texto = (v) => { const s = String(v ?? '').trim(); return s === '' ? null : s; };
const mismaFecha = (a, b) => (a instanceof Date ? a.toISOString().slice(0, 10) : a ? String(a).slice(0, 10) : null) === b;

/** Campos de BC que el sync mantiene, ya normalizados a la forma de dbo.Obra. */
function deBC(j) {
  const area = Number(j.areaProrrateada ?? 0);
  return {
    numeroObra: texto(j.no),
    nombreMostrado: texto(j.description),
    estado: texto(j.status),
    fechaInicio: fecha(j.startingDate),
    fechaFin: fecha(j.endingDate),
    fechaCreacionObra: fecha(j.creationDate),
    areaProrrateadaM2: area > 0 ? area : null,          // null = no pisar
    idEncargado: texto(j.idEncargadoText),
    gerenteProyecto: texto(j.personResponsible),
  };
}

// --------------------------------------------------------------------- main
const { jobs, environment, cid } = await bcJobs();
console.log(`\nBC       = ${environment}  ·  compañía ${cid}`);
console.log(`DESTINO  = ${DESTINO}`);
console.log(`MODO     = ${CONFIRM ? '*** ESCRITURA REAL ***' : 'dry-run (agregá --confirm para escribir)'}${SOLO_NUEVAS ? '  ·  solo inserta' : ''}`);
console.log(`\nJobs en BC: ${jobs.length}`);

// Guarda: nunca meter obras del Sandbox de BC en la base de producción. Es
// justo el error silencioso que ya nos mordió con BC_ENVIRONMENT.
if (/pro/i.test(DESTINO) && !/^production$/i.test(environment) && !has('--forzar-entorno')) {
  console.error(`\nABORT: el destino "${DESTINO}" es producción pero BC resolvió el entorno "${environment}".`);
  console.error('       Corré con BC_BASE_URL=.../Production BC_ENVIRONMENT=Production, o pasá --forzar-entorno si de verdad es lo que querés.\n');
  process.exit(2);
}

const pool = await new sql.ConnectionPool({
  server: process.env.DB_SERVER, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: DESTINO, port: parseInt(process.env.DB_PORT ?? '1433'),
  connectionTimeout: 90000, requestTimeout: 300000,
  options: { encrypt: true, trustServerCertificate: false },
}).connect();

const existentes = new Map();
for (const r of (await pool.request().query(`
  SELECT idObra, numeroObra, nombreMostrado, estado, fechaInicio, fechaFin, fechaCreacionObra,
         areaProrrateadaM2, idEncargado, gerenteProyecto, esBC
  FROM dbo.Obra`)).recordset) existentes.set(String(r.numeroObra).trim(), r);

const nuevas = [], cambios = [];
const vistos = new Set();
for (const j of jobs) {
  const b = deBC(j);
  if (!b.numeroObra) continue;
  vistos.add(b.numeroObra);
  const cur = existentes.get(b.numeroObra);
  if (!cur) { nuevas.push(b); continue; }
  if (SOLO_NUEVAS) continue;
  const diff = [];
  if (b.nombreMostrado !== null && b.nombreMostrado !== cur.nombreMostrado) diff.push(['nombreMostrado', cur.nombreMostrado, b.nombreMostrado]);
  if (b.estado !== null && b.estado !== cur.estado) diff.push(['estado', cur.estado, b.estado]);
  if (!mismaFecha(cur.fechaInicio, b.fechaInicio)) diff.push(['fechaInicio', cur.fechaInicio, b.fechaInicio]);
  if (!mismaFecha(cur.fechaFin, b.fechaFin)) diff.push(['fechaFin', cur.fechaFin, b.fechaFin]);
  if (!mismaFecha(cur.fechaCreacionObra, b.fechaCreacionObra)) diff.push(['fechaCreacionObra', cur.fechaCreacionObra, b.fechaCreacionObra]);
  if (b.areaProrrateadaM2 !== null && Number(cur.areaProrrateadaM2 ?? 0) !== b.areaProrrateadaM2) diff.push(['areaProrrateadaM2', cur.areaProrrateadaM2, b.areaProrrateadaM2]);
  if (b.idEncargado !== null && b.idEncargado !== cur.idEncargado) diff.push(['idEncargado', cur.idEncargado, b.idEncargado]);
  if (b.gerenteProyecto !== null && b.gerenteProyecto !== cur.gerenteProyecto) diff.push(['gerenteProyecto', cur.gerenteProyecto, b.gerenteProyecto]);
  if (!cur.esBC) diff.push(['esBC', cur.esBC, true]);
  if (diff.length) cambios.push({ id: cur.idObra, numeroObra: b.numeroObra, b, diff });
}
const huerfanas = [...existentes.keys()].filter((k) => !vistos.has(k));

console.log(`\n── Plan ──`);
console.log(`  nuevas a insertar : ${nuevas.length}`);
console.log(`  a actualizar      : ${cambios.length}${SOLO_NUEVAS ? '  (omitido por --solo-nuevas)' : ''}`);
console.log(`  sin cambios       : ${jobs.length - nuevas.length - cambios.length}`);
console.log(`  en la tabla y YA NO en BC: ${huerfanas.length}${huerfanas.length ? ' → ' + huerfanas.slice(0, 15).join(', ') + (huerfanas.length > 15 ? ` … (+${huerfanas.length - 15})` : '') : ''}`);
if (huerfanas.length) console.log('    (no se borran: pueden tener pedidos históricos que las referencian)');
if (nuevas.length) console.log(`\n  muestra de nuevas: ${nuevas.slice(0, 8).map((n) => n.numeroObra).join(', ')}${nuevas.length > 8 ? ` … (+${nuevas.length - 8})` : ''}`);
for (const c of cambios.slice(0, 10)) console.log(`  ~ ${c.numeroObra}: ${c.diff.map(([k, a, b2]) => `${k} "${a ?? ''}" → "${b2 ?? ''}"`).join(' · ')}`);
if (cambios.length > 10) console.log(`  … y ${cambios.length - 10} más`);

if (!CONFIRM) { console.log('\n(dry-run: no se escribió nada)\n'); await pool.close(); process.exit(0); }

const tx = new sql.Transaction(pool);
await tx.begin();
try {
  for (const b of nuevas) {
    await new sql.Request(tx)
      .input('numeroObra', sql.NVarChar(20), b.numeroObra)
      .input('nombreMostrado', sql.NVarChar(250), b.nombreMostrado)
      .input('estado', sql.NVarChar(50), b.estado)
      .input('fechaInicio', sql.Date, b.fechaInicio)
      .input('fechaFin', sql.Date, b.fechaFin)
      .input('fechaCreacionObra', sql.Date, b.fechaCreacionObra)
      .input('areaProrrateadaM2', sql.Decimal(20, 5), b.areaProrrateadaM2)
      .input('idEncargado', sql.NVarChar(100), b.idEncargado)
      .input('gerenteProyecto', sql.NVarChar(100), b.gerenteProyecto)
      .input('origenPrincipal', sql.NVarChar(20), ORIGEN)
      .query(`INSERT INTO dbo.Obra
        (numeroObra, nombreMostrado, estado, fechaInicio, fechaFin, fechaCreacionObra,
         areaProrrateadaM2, idEncargado, gerenteProyecto, origenPrincipal, esBC, esProcore,
         fechaCreacion, creadoPor)
        VALUES (@numeroObra, @nombreMostrado, @estado, @fechaInicio, @fechaFin, @fechaCreacionObra,
         @areaProrrateadaM2, @idEncargado, @gerenteProyecto, @origenPrincipal, 1, 0,
         SYSUTCDATETIME(), N'sync-bc')`);
  }
  for (const c of cambios) {
    const set = [];
    const rq = new sql.Request(tx).input('id', sql.BigInt, c.id);
    for (const [campo] of c.diff) {
      if (campo === 'esBC') { set.push('esBC = 1'); continue; }
      set.push(`${campo} = @${campo}`);
      const v = c.b[campo];
      if (campo.startsWith('fecha')) rq.input(campo, sql.Date, v);
      else if (campo === 'areaProrrateadaM2') rq.input(campo, sql.Decimal(20, 5), v);
      else rq.input(campo, sql.NVarChar(250), v);
    }
    set.push('fechaModificacion = SYSUTCDATETIME()', "modificadoPor = N'sync-bc'");
    await rq.query(`UPDATE dbo.Obra SET ${set.join(', ')} WHERE idObra = @id`);
  }
  await tx.commit();
  const total = (await pool.request().query('SELECT COUNT(*) c FROM dbo.Obra')).recordset[0].c;
  console.log(`\n✓ ${nuevas.length} insertadas · ${cambios.length} actualizadas · dbo.Obra queda con ${total} filas\n`);
} catch (e) {
  await tx.rollback();
  console.error(`\n✗ rollback: ${e.message}\n`);
  process.exitCode = 1;
}
await pool.close();
