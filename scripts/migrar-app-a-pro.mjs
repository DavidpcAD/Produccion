#!/usr/bin/env node
/* ============================================================================
   Migra los DATOS del pool DB_* (auth + obras/proyectos/presupuesto + cuadrillas
   + marcaje h4) de AdelanteSBX a AdelantePRO.

   ⚠️ AdelantePRO es la base de PRODUCCIÓN del app de Digitación
   (app-adelante-prod). Regla dura de este script: **sus filas no se tocan**.
   Cuando un id choca, se adapta la fila que viene de SBX, nunca la de PRO.

   Las dos bases se bifurcaron de una semilla común, así que la identidad se
   resuelve por CLAVE NATURAL, no por id:
     Puesto ....... por nombre      (13 calzan con id distinto: 4→5, 13→4, …)
     Colaborador .. por cédula      (SBX 35 "USR-BRYAN" ≡ PRO 6)
     Usuario ...... por username    (SBX 34 bryan ≡ PRO 6 · SBX 70 alessandra ≡ PRO 7)
     Obra ......... por numeroObra  (ya sincronizadas desde BC)
   Los ids de las FKs se reescriben con esos mapas al insertar.

   NO se migra (a propósito):
     · usuario "carlos" / colaborador "Prueba Falso" (3-9999-9999) → datos de prueba
     · las 52 obras que están en SBX pero no en BC Production (origen LEDGER y
       pruebas tipo MM-1111 / POWER APP); nada las referencia
     · dbo.UsuarioAuditLog → bitácora de la instancia vieja; la auditoría vive en RH
     · dbo.OTPCodes → códigos de un solo uso, no tiene sentido moverlos
     · las Apps y Roles que NO son de Producción (idApp ≠ 10): son de otros
       sistemas y meterlos en la base de Digitación sería contaminarla

   USO
     node scripts/migrar-app-a-pro.mjs            # dry-run: plan + mapas
     node scripts/migrar-app-a-pro.mjs --confirm  # aplica
   ============================================================================ */
import sql from 'mssql';
import { readFileSync } from 'node:fs';

try {
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
} catch { /* env del entorno */ }

const CONFIRM = process.argv.includes('--confirm');
const base = {
  server: process.env.DB_SERVER, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT ?? '1433'),
  connectionTimeout: 90000, requestTimeout: 300000,
  options: { encrypt: true, trustServerCertificate: false },
};
const sbx = await new sql.ConnectionPool({ ...base, database: 'AdelanteSBX' }).connect();
const pro = await new sql.ConnectionPool({ ...base, database: 'AdelantePRO' }).connect();
const q = async (p, s) => (await p.request().query(s)).recordset;

const CEDULA_PRUEBA = '3-9999-9999';
const USER_PRUEBA = 'carlos';

// ------------------------------------------------------------------ helpers
function tipoSql(c) {
  const t = c.ty.toLowerCase(); const len = (n) => (c.ml === -1 ? sql.MAX : n);
  switch (t) {
    case 'int': return sql.Int(); case 'bigint': return sql.BigInt();
    case 'smallint': return sql.SmallInt(); case 'tinyint': return sql.TinyInt();
    case 'bit': return sql.Bit(); case 'decimal': case 'numeric': return sql.Decimal(c.prec, c.scale);
    case 'money': return sql.Money(); case 'float': return sql.Float(); case 'real': return sql.Real();
    case 'date': return sql.Date(); case 'datetime': return sql.DateTime();
    case 'smalldatetime': return sql.SmallDateTime(); case 'datetime2': return sql.DateTime2(c.scale);
    case 'datetimeoffset': return sql.DateTimeOffset(c.scale); case 'time': return sql.Time(c.scale);
    case 'uniqueidentifier': return sql.UniqueIdentifier();
    case 'nvarchar': return sql.NVarChar(len(c.ml / 2)); case 'nchar': return sql.NChar(c.ml / 2);
    case 'varchar': return sql.VarChar(len(c.ml)); case 'char': return sql.Char(c.ml);
    case 'varbinary': return sql.VarBinary(len(c.ml)); case 'binary': return sql.Binary(c.ml);
    default: return sql.NVarChar(sql.MAX);
  }
}
const colsDe = async (p, s, t) => (await p.request().query(`
  SELECT c.name, TYPE_NAME(c.user_type_id) ty, c.max_length ml, c.precision prec, c.scale,
         c.is_identity ident, c.is_computed comp
  FROM sys.columns c WHERE c.object_id=OBJECT_ID('${s}.${t}') ORDER BY c.column_id`)).recordset;
const pkDe = async (p, s, t) => {
  const r = await q(p, `SELECT c.name FROM sys.indexes i
    JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
    JOIN sys.columns c ON c.object_id=i.object_id AND c.column_id=ic.column_id
    WHERE i.object_id=OBJECT_ID('${s}.${t}') AND i.is_primary_key=1 ORDER BY ic.key_ordinal`);
  return r.map((x) => x.name);
};
/** FKs de una tabla: columna local → tabla referenciada (para reescribir ids). */
const fksDe = async (p, s, t) => (await q(p, `
  SELECT pc.name col, rs.name rsch, rt.name rtab
  FROM sys.foreign_keys fk
  JOIN sys.foreign_key_columns fc ON fc.constraint_object_id=fk.object_id
  JOIN sys.columns pc ON pc.object_id=fc.parent_object_id AND pc.column_id=fc.parent_column_id
  JOIN sys.tables rt ON rt.object_id=fk.referenced_object_id
  JOIN sys.schemas rs ON rs.schema_id=rt.schema_id
  WHERE fk.parent_object_id=OBJECT_ID('${s}.${t}')`));

// ------------------------------------------------------- mapas de identidad
const MAPAS = {};   // 'dbo.Colaborador' -> Map(idSBX -> idPRO)
const OMITIR = { 'dbo.Colaborador': new Set(), 'dbo.Usuario': new Set() };

async function construirMapas() {
  // Puesto por nombre
  const pp = new Map((await q(pro, 'SELECT idPuesto, nombre FROM dbo.Puesto')).map((r) => [r.nombre.trim().toLowerCase(), r.idPuesto]));
  const mp = new Map();
  for (const r of await q(sbx, 'SELECT idPuesto, nombre FROM dbo.Puesto')) {
    const d = pp.get(r.nombre.trim().toLowerCase());
    if (d != null) mp.set(r.idPuesto, d);
  }
  MAPAS['dbo.Puesto'] = mp;

  // Colaborador por cédula (+ Alessandra, que tiene cédula distinta en cada base:
  // se resuelve por el username de su Usuario)
  const pc = new Map((await q(pro, 'SELECT idColaborador, cedula FROM dbo.Colaborador')).map((r) => [String(r.cedula ?? '').trim().toLowerCase(), r.idColaborador]));
  const mc = new Map();
  for (const r of await q(sbx, 'SELECT idColaborador, cedula FROM dbo.Colaborador')) {
    const ced = String(r.cedula ?? '').trim();
    if (ced === CEDULA_PRUEBA) { OMITIR['dbo.Colaborador'].add(r.idColaborador); continue; }
    const d = pc.get(ced.toLowerCase());
    if (d != null) mc.set(r.idColaborador, d);
  }
  // Usuario por username
  const pu = new Map((await q(pro, 'SELECT idUsuario, username, idColaborador FROM dbo.Usuario')).map((r) => [r.username.trim().toLowerCase(), r]));
  const mu = new Map();
  for (const r of await q(sbx, 'SELECT idUsuario, username, idColaborador FROM dbo.Usuario')) {
    const un = r.username.trim().toLowerCase();
    if (un === USER_PRUEBA) { OMITIR['dbo.Usuario'].add(r.idUsuario); continue; }
    const d = pu.get(un);
    if (d) {
      mu.set(r.idUsuario, d.idUsuario);
      // la misma persona ⇒ también amarra sus colaboradores
      if (r.idColaborador != null && d.idColaborador != null) mc.set(r.idColaborador, d.idColaborador);
    }
  }
  MAPAS['dbo.Colaborador'] = mc;
  MAPAS['dbo.Usuario'] = mu;

  // App por codigo. Clave para que idApp 1 de SBX ("ADMIN"/Administración) NO se
  // confunda con el idApp 1 de PRO ("DIG"/Digitación), que es OTRA app.
  const pa = new Map((await q(pro, 'SELECT idApp, codigo FROM dbo.App')).map((r) => [String(r.codigo).trim().toLowerCase(), r.idApp]));
  const ma = new Map();
  for (const r of await q(sbx, 'SELECT idApp, codigo FROM dbo.App')) {
    const d = pa.get(String(r.codigo).trim().toLowerCase());
    if (d != null) ma.set(r.idApp, d);
  }
  MAPAS['dbo.App'] = ma;

  // Rol por (app, nombre, tipo) — con el idApp YA traducido. Sin esto, un re-run
  // dejaría de saber que el rol 4 de SBX vive en otro id dentro de PRO y las
  // asignaciones de UsuarioRol apuntarían al rol equivocado.
  const pr = new Map((await q(pro, "SELECT idRol, idApp, nombre, ISNULL(tipo,'') tipo FROM dbo.Rol"))
    .map((r) => [`${r.idApp}|${r.nombre.trim().toLowerCase()}|${r.tipo.trim().toLowerCase()}`, r.idRol]));
  const mr = new Map();
  for (const r of await q(sbx, "SELECT idRol, idApp, nombre, ISNULL(tipo,'') tipo FROM dbo.Rol")) {
    const app = ma.get(r.idApp) ?? r.idApp;
    const d = pr.get(`${app}|${r.nombre.trim().toLowerCase()}|${r.tipo.trim().toLowerCase()}`);
    if (d != null) mr.set(r.idRol, d);
  }
  MAPAS['dbo.Rol'] = mr;

  // Obra por numeroObra (ya sincronizadas desde BC)
  const po = new Map((await q(pro, 'SELECT idObra, numeroObra FROM dbo.Obra')).map((r) => [String(r.numeroObra).trim(), r.idObra]));
  const mo = new Map();
  for (const r of await q(sbx, 'SELECT idObra, numeroObra FROM dbo.Obra')) {
    const d = po.get(String(r.numeroObra).trim());
    if (d != null) mo.set(r.idObra, d);      // sin entrada = obra que no está en BC ⇒ se omite la fila hija
  }
  MAPAS['dbo.Obra'] = mo;
}

/** Traduce un id de SBX al de PRO. null = la fila hija no se puede migrar. */
function traducir(refTabla, v) {
  if (v == null) return { ok: true, v: null };
  const m = MAPAS[refTabla];
  if (!m) return { ok: true, v };                       // ids iguales en ambas bases
  if (m.has(v)) return { ok: true, v: m.get(v) };
  if (refTabla === 'dbo.Obra') return { ok: false, v: null };  // obra fuera de BC
  return { ok: true, v };                               // se inserta con su id original
}

// ------------------------------------------------------------------- copiar
async function copiar(schema, tabla, opts = {}) {
  const { where = '', clave = null, etiqueta = null, reasignar = false } = opts;
  const claves = clave ? (Array.isArray(clave) ? clave : [clave]) : null;
  const full = `${schema}.${tabla}`;
  const cols = (await colsDe(sbx, schema, tabla)).filter((c) => !c.comp);
  const colsDstRaw = await colsDe(pro, schema, tabla);
  const colsDst = new Set(colsDstRaw.map((c) => c.name.toLowerCase()));
  const usar = cols.filter((c) => colsDst.has(c.name.toLowerCase()));
  // Columnas que en PRO son NOT NULL: si SBX las trae en null hay que rellenarlas
  // (las dos bases divergieron también en nulabilidad, p.ej. Proyecto.linkUbicacion).
  const obligatorias = await (async () => {
    const r = await q(pro, `SELECT c.name, c.is_nullable n, TYPE_NAME(c.user_type_id) ty
      FROM sys.columns c WHERE c.object_id=OBJECT_ID('${schema}.${tabla}') AND c.is_nullable=0 AND c.is_identity=0`);
    return new Map(r.map((x) => [x.name.toLowerCase(), x.ty.toLowerCase()]));
  })();
  // Largos del destino: si PRO tiene la columna más angosta que SBX (p.ej.
  // dbo.Rol.descripcion nvarchar(50) vs 255) se recorta el texto en vez de
  // ensanchar la tabla, que es de otro app.
  const largos = new Map(colsDstRaw.filter((c) => /char/.test(c.ty) && c.ml !== -1)
    .map((c) => [c.name.toLowerCase(), /^n/.test(c.ty) ? c.ml / 2 : c.ml]));
  const recortes = new Set();
  const rellenos = new Set();
  const rellenar = (nombre, ty, v) => {
    if (v != null) return v;
    const t = obligatorias.get(nombre.toLowerCase());
    if (!t) return null;
    rellenos.add(nombre);
    if (/char|text/.test(t)) return '';
    if (/int|decimal|numeric|money|float|real|bit/.test(t)) return 0;
    if (/date|time/.test(t)) return new Date();
    return '';
  };
  const ajustar = (nombre, v) => {
    if (typeof v !== 'string') return v;
    const max = largos.get(nombre.toLowerCase());
    if (max == null || v.length <= max) return v;
    recortes.add(`${nombre}(${v.length}→${max})`);
    return v.slice(0, max);
  };
  const pk = await pkDe(sbx, schema, tabla);
  const fks = await fksDe(sbx, schema, tabla);
  const fkPorCol = new Map(fks.map((f) => [f.col.toLowerCase(), `${f.rsch}.${f.rtab}`]));
  const hayIdentity = usar.some((c) => c.ident);

  const filas = await q(sbx, `SELECT ${usar.map((c) => `[${c.name}]`).join(',')} FROM ${full}${where ? ` WHERE ${where}` : ''}`);
  // qué ya existe en destino (por PK simple o por clave natural)
  const claveDe = (r) => (claves ? claves.map((k) => String(r[k] ?? '').trim().toLowerCase()).join('|') : (pk.length === 1 ? String(r[pk[0]]) : pk.map((k) => r[k]).join('|')));
  const yaEstan = new Set((await q(pro, `SELECT ${(claves ?? pk).map((k) => `[${k}]`).join(',')} FROM ${full}`)).map(claveDe));

  // Para poder reasignar ids cuando la PK choca con OTRA entidad de PRO.
  const pkCol = pk.length === 1 ? pk[0] : null;
  const pkEsIdentity = pkCol && usar.find((c) => c.name === pkCol)?.ident;
  const pkOcupadas = pkCol ? new Set((await q(pro, `SELECT [${pkCol}] k FROM ${full}`)).map((r) => String(r.k))) : new Set();
  // El id nuevo tiene que quedar por encima del máximo de AMBAS bases: si solo
  // mirara el de PRO podría chocar con una fila de SBX que aún no se ha insertado
  // en este mismo lote (p.ej. reasignar a 8 cuando SBX ya trae un id 8).
  let siguienteId = pkEsIdentity
    ? Math.max(
        Number((await q(pro, `SELECT ISNULL(MAX([${pkCol}]),0) m FROM ${full}`))[0].m),
        ...filas.map((r) => Number(r[pkCol]) || 0),
      ) + 1
    : null;

  const listas = [], omitidas = [], reasignados = [];
  for (const r of filas) {
    const propio = MAPAS[full];
    if (OMITIR[full]?.has(r[pk[0]])) { omitidas.push(`${r[pk[0]]} (prueba)`); continue; }
    // ¿esta fila YA es alguien en PRO? (misma persona/puesto/obra por clave natural)
    if (propio && pkCol && propio.has(r[pkCol])) { omitidas.push(`${r[pkCol]} (ya existe como ${propio.get(r[pkCol])})`); continue; }
    const fila = { ...r };
    let ok = true;
    for (const c of usar) {
      const ref = fkPorCol.get(c.name.toLowerCase());
      if (!ref) continue;
      const t = traducir(ref, fila[c.name]);
      if (!t.ok) { ok = false; break; }
      fila[c.name] = t.v;
    }
    if (!ok) { omitidas.push(`${r[pk[0]]} (padre fuera de alcance)`); continue; }
    // Orden importante: cuando la tabla se compara por CLAVE NATURAL (nombre,
    // código…), esa comparación manda — si la fila ya está en PRO con otro id,
    // se omite. Solo las tablas que se comparan por PK llegan a reasignar id.
    if (claves && yaEstan.has(claveDe(fila))) { omitidas.push(`${claveDe(fila)} (ya existe)`); continue; }
    // PK ocupada en PRO por OTRA entidad → id nuevo, registrado en el mapa para
    // que las filas hijas apunten al id correcto. Nunca se descarta una fila en
    // silencio ni se pisa la de PRO.
    if (reasignar && pkEsIdentity && pkOcupadas.has(String(fila[pkCol]))) {
      const nuevo = siguienteId++;
      (MAPAS[full] ??= new Map()).set(r[pkCol], nuevo);
      reasignados.push(`${r[pkCol]}→${nuevo}`);
      fila[pkCol] = nuevo;
    } else if (!claves && yaEstan.has(claveDe(fila))) { omitidas.push(`${claveDe(fila)} (ya existe)`); continue; }
    listas.push(fila);
  }
  const nom = etiqueta ?? full;
  console.log(`  ${nom.padEnd(32)} SBX=${String(filas.length).padStart(5)} → insertar ${String(listas.length).padStart(5)}${omitidas.length ? `  (omitidas ${omitidas.length})` : ''}${reasignados.length ? `  ⟳ id reasignado: ${reasignados.join(' ')}` : ''}`);
  if (CONFIRM && rellenos.size) console.log(`      ↳ NOT NULL en PRO, se rellenó vacío: ${[...rellenos].join(', ')}`);
  if (CONFIRM && recortes.size) console.log(`      ↳ columna más angosta en PRO, texto recortado: ${[...recortes].join(', ')}`);
  if (!CONFIRM || !listas.length) return { insertadas: 0, omitidas: omitidas.length };

  const porLote = Math.max(1, Math.floor(1900 / usar.length));
  if (hayIdentity) await pro.request().batch(`SET IDENTITY_INSERT ${full} ON`);
  try {
    for (let i = 0; i < listas.length; i += porLote) {
      const chunk = listas.slice(i, i + porLote);
      const rq = pro.request();
      const values = chunk.map((row, ri) => `(${usar.map((c, ci) => {
        const pnm = `p${ri}_${ci}`; rq.input(pnm, tipoSql(c), ajustar(c.name, rellenar(c.name, c.ty, row[c.name] ?? null))); return `@${pnm}`;
      }).join(',')})`);
      await rq.query(`INSERT INTO ${full} (${usar.map((c) => `[${c.name}]`).join(',')}) VALUES ${values.join(',')}`);
    }
  } finally {
    if (hayIdentity) await pro.request().batch(`SET IDENTITY_INSERT ${full} OFF`);
  }
  return { insertadas: listas.length, omitidas: omitidas.length };
}

// ---------------------------------------------------------------------- main
console.log(`\nORIGEN  = AdelanteSBX\nDESTINO = AdelantePRO\nMODO    = ${CONFIRM ? '*** ESCRITURA REAL ***' : 'dry-run (agregá --confirm)'}`);

// Los catálogos base van primero: Puesto se necesita para mapear Colaborador.
console.log('\n── 1) Catálogos base ──');
await copiar('dbo', 'Provincia', { clave: 'codigoINEC' });
await copiar('dbo', 'Canton', { clave: 'codigoINEC' });
await copiar('dbo', 'Distrito', { clave: 'codigoINEC' });
await copiar('dbo', 'Puesto', { clave: 'nombre' });

await construirMapas();
console.log('\n── Mapas de identidad (solo los ids que CAMBIAN) ──');
for (const [t, m] of Object.entries(MAPAS)) {
  const cambian = [...m.entries()].filter(([a, b]) => a !== b);
  console.log(`  ${t.padEnd(18)} ${m.size} resueltos · ${cambian.length} con id distinto${cambian.length ? ': ' + cambian.slice(0, 12).map(([a, b]) => `${a}→${b}`).join(' ') + (cambian.length > 12 ? ' …' : '') : ''}`);
}
console.log(`  omitidos por ser prueba: colaborador ${[...OMITIR['dbo.Colaborador']].join(',') || '—'} · usuario ${[...OMITIR['dbo.Usuario']].join(',') || '—'}`);

// Apps que se migran. Se EXCLUYEN a propósito la 1 (ADMIN) y la 9 (DIGITACION):
// su id choca / sus roles "Digitacion general|maderas" son los mismos que los
// idRol 4 y 5 que el app de Digitación YA tiene en PRO. Consolidar esos roles
// cambiaría quién entra a SU app, así que es decisión de ellos, no de este script.
// Se migra también la 1 (ADMIN/"Administración") pero SIN sus roles 8 y 9
// ("Digitacion general|maderas"): Digitación es su propia app y sus roles son los
// que YA tiene PRO (idApp 1 DIG, roles 4 y 5). Tampoco se migra la 9 (DIGITACION),
// que es un tercer juego duplicado dentro de SBX.
const APPS = '(1, 3, 4, 5, 6, 7, 8, 10, 11)';
const ROLES_DIGITACION = '(8, 9)';
console.log(`\n── 2) Identidad (apps ${APPS}; fuera: idApp 9 y los roles ${ROLES_DIGITACION} de Digitación) ──`);
await copiar('dbo', 'App', { where: `idApp IN ${APPS}`, clave: 'codigo', reasignar: true });
await copiar('dbo', 'Rol', { where: `idApp IN ${APPS} AND idRol NOT IN ${ROLES_DIGITACION}`, clave: ['idApp', 'nombre', 'tipo'], reasignar: true });
await copiar('dbo', 'Compania', { clave: 'codigo' });   // padre de Proyecto; en PRO la tabla existe pero vacía
await copiar('dbo', 'Proyecto', { clave: 'abreviatura' });   // ux_Proyecto_codigo está sobre abreviatura
await copiar('dbo', 'Colaborador', { clave: 'cedula' });
await copiar('dbo', 'Usuario', { clave: 'username', reasignar: true });
await copiar('dbo', 'UsuarioRol', { where: `idRol IN (SELECT idRol FROM dbo.Rol WHERE idApp IN ${APPS} AND idRol NOT IN ${ROLES_DIGITACION})`, clave: ['idUsuario', 'idRol'], reasignar: true });
await copiar('dbo', 'UsuarioProyecto');
await copiar('dbo', 'UsuarioApp');

console.log('\n── 3) RH (rh.adelante.cr) ──');
await copiar('dbo', 'ContratoColaborador');
await copiar('dbo', 'solicitudes');
await copiar('h4', 'ColaboradorDiasMarca');
await copiar('h4', 'AsistenciaDia');

console.log('\n── 4) Presupuesto y partidas ──');
await copiar('dbo', 'PresupuestoPlantilla');
await copiar('dbo', 'PresupuestoBorrador');
await copiar('dbo', 'EncargadoPartida');

console.log('\n── 5) Cuadrillas ──');
await copiar('dbo', 'Cuadrilla');
await copiar('dbo', 'CuadrillaMiembro');
await copiar('dbo', 'CuadrillaObra');
await copiar('dbo', 'CuadrillaSubPartida');

console.log('\n── 6) Marcaje (h4) ──');
// Orden topológico dentro de h4 (Dispositivo depende de Zona, Biometria de
// Dispositivo, EventoActividad de EventoActividadTipo + ObraSubpartida…).
for (const t of ['EventoActividadTipo', 'Zona', 'ObraSubpartida', 'ObraSubpartidaPresupuesto',
  'EventoActividad', 'Jornada', 'MarcajeEvento', 'ZonaColaborador', 'Dispositivo', 'DispositivoBiometria']) {
  await copiar('h4', t);
}

if (!CONFIRM) console.log('\n(dry-run: no se escribió nada)\n');
else console.log('\n✓ migración de datos terminada\n');
await sbx.close(); await pro.close();
