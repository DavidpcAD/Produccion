// Comprobación del arreglo del 01/09/2026 en "Recepción de facturas".
//
// Fábrica de Maderas reportó que no le aparecían las facturas que busca. El filtro
// viejo era "las órdenes que salieron de MIS solicitudes"; el nuevo es "las órdenes
// cuyo material entra a MIS bodegas (F-MADERAS / F-MAD-NUE)" — ver
// lib/compras/helpers.ts (ordenesQueRecibe) y lib/permissions.ts (almacenesQueRecibe).
//
// Quién digitó la solicitud fallaba en las DOS direcciones, y el script las mide:
//   B = a su fábrica pero pedidas por otro → el filtro viejo se las escondía;
//   C = suyas pero a otra fábrica → el filtro viejo se las mostraba de más.
//   node scripts/diag-recepcion-maderas.mjs [usuario] [base]
import sql from 'mssql';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
for (const l of env.split('\n')) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim(); }
const USER = process.argv[2] ?? 'alessandra';
const DB   = process.argv[3] ?? 'AdelantePRO';
const ALMACENES = ['F-MADERAS', 'F-MAD-NUE'];

const pool = await new sql.ConnectionPool({
  server: process.env.DB_SERVER, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: DB, port: 1433, connectionTimeout: 90000, requestTimeout: 180000,
  options: { encrypt: true, trustServerCertificate: false },
}).connect();

// Una fila por orden lanzada/completada, con los dos criterios resueltos.
const filas = (await pool.request().input('u', sql.NVarChar(100), USER).query(`
  SELECT o.ordenNo, o.bcNo, e.estado, o.proveedorNombre, CONVERT(varchar(10),o.fechaEmision,120) AS fecha,
         CASE WHEN EXISTS (SELECT 1 FROM dbo.OrdenCompraDet d
                           JOIN dbo.PedidoCompraDet pd ON pd.idPedidoCompraDet = d.idPedidoCompraDet
                           JOIN dbo.PedidoCompra pc ON pc.idPedidoCompra = pd.idPedidoCompra AND pc.esEliminada = 0
                           WHERE d.idOrdenCompra = o.idOrdenCompra AND pc.creadoPor = @u) THEN 1 ELSE 0 END AS mia,
         CASE WHEN EXISTS (SELECT 1 FROM dbo.OrdenCompraDet d
                           WHERE d.idOrdenCompra = o.idOrdenCompra
                             AND UPPER(LTRIM(RTRIM(d.locationCode))) IN ('${ALMACENES.join("','")}')) THEN 1 ELSE 0 END AS fabrica,
         STUFF((SELECT DISTINCT ', '+d2.locationCode FROM dbo.OrdenCompraDet d2
                 WHERE d2.idOrdenCompra = o.idOrdenCompra FOR XML PATH('')),1,2,'') AS almacenes,
         (SELECT COUNT(*) FROM dbo.RecepcionCompra r WHERE r.idOrdenCompra = o.idOrdenCompra) AS recepciones
  FROM dbo.OrdenCompra o
  JOIN dbo.Estado e ON e.idEstado = o.idEstado
  WHERE o.esEliminada = 0 AND e.estado IN ('Lanzado','Completado')
  ORDER BY o.bcNo`)).recordset;

const A = filas.filter((f) => f.mia && f.fabrica);
const B = filas.filter((f) => !f.mia && f.fabrica);
const C = filas.filter((f) => f.mia && !f.fabrica);
const cols = (f) => ({ bcNo: f.bcNo, ordenNo: f.ordenNo, estado: f.estado, almacenes: f.almacenes, proveedor: (f.proveedorNombre ?? '').slice(0, 34), recepciones: f.recepciones });

console.log(`\n== ${DB} · ${USER} · órdenes lanzadas/completadas en el sistema: ${filas.length} ==`);
console.log(`   filtro viejo (mis solicitudes) ......... ${A.length + C.length}`);
console.log(`   filtro nuevo (mis bodegas) ............. ${A.length + B.length}`);
console.log(`     A · suyas Y a su fábrica ............ ${A.length}`);
console.log(`     B · a su fábrica, pedidas por otro .. ${B.length}  (el viejo las escondía)`);
console.log(`     C · suyas, a OTRA fábrica ........... ${C.length}  (el viejo las mostraba de más)`);

console.log(`\nB · las que RECUPERA (${B.reduce((s, f) => s + f.recepciones, 0)} recepciones que no veía):`);
console.table(B.map(cols));
console.log(`\nC · las que DEJA de ver (no las recibe ella):`);
console.table(C.map(cols));

// Red de seguridad: si un pedido pidió Maderas y su orden acabó en otro almacén, el
// filtro por bodega lo perdería. Al 01/09/2026 no hay ninguno; si aparece, sale acá.
const perdidas = (await pool.request().query(`
  SELECT o.bcNo, pc.pedidoNo, pc.creadoPor, ISNULL(NULLIF(d.locationCode,''),'(vacío)') AS ordenAlm, d.descripcion
  FROM dbo.OrdenCompraDet d
  JOIN dbo.OrdenCompra o ON o.idOrdenCompra = d.idOrdenCompra AND o.esEliminada = 0
  JOIN dbo.PedidoCompraDet pd ON pd.idPedidoCompraDet = d.idPedidoCompraDet
  JOIN dbo.PedidoCompra pc ON pc.idPedidoCompra = pd.idPedidoCompra AND pc.esEliminada = 0
  WHERE UPPER(LTRIM(RTRIM(pd.locationCode))) IN ('${ALMACENES.join("','")}')
    AND UPPER(LTRIM(RTRIM(ISNULL(d.locationCode,'')))) NOT IN ('${ALMACENES.join("','")}')`)).recordset;
console.log(`\nLíneas pedidas para la fábrica que la orden mandó a otro almacén: ${perdidas.length}`);
if (perdidas.length) console.table(perdidas);

await pool.close();
