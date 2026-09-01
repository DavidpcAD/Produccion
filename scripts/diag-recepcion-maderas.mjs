// Comprobación del arreglo del 01/09/2026 en "Recepción de facturas".
//
// Fábrica de Maderas reportó que no le aparecen las facturas que busca ("solo me
// salen las que yo pedí"). El filtro viejo era "las órdenes que salieron de MIS
// solicitudes"; el nuevo es "las órdenes cuyo material entra a MIS bodegas
// (F-MADERAS / F-MAD-NUE) + las de mis solicitudes" — ver lib/compras/helpers.ts
// (ordenesQueRecibe) y lib/permissions.ts (almacenesQueRecibe).
//
// Este script corre los dos filtros contra la base real y lista lo que gana.
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
  SELECT o.ordenNo, e.estado, o.proveedorNombre, CONVERT(varchar(10),o.fechaEmision,120) AS fecha,
         CASE WHEN EXISTS (SELECT 1 FROM dbo.OrdenCompraDet d
                           JOIN dbo.PedidoCompraDet pd ON pd.idPedidoCompraDet = d.idPedidoCompraDet
                           JOIN dbo.PedidoCompra pc ON pc.idPedidoCompra = pd.idPedidoCompra AND pc.esEliminada = 0
                           WHERE d.idOrdenCompra = o.idOrdenCompra AND pc.creadoPor = @u) THEN 1 ELSE 0 END AS esMiSolicitud,
         CASE WHEN EXISTS (SELECT 1 FROM dbo.OrdenCompraDet d
                           WHERE d.idOrdenCompra = o.idOrdenCompra
                             AND UPPER(LTRIM(RTRIM(d.locationCode))) IN ('${ALMACENES.join("','")}')) THEN 1 ELSE 0 END AS esDeMiFabrica,
         (SELECT COUNT(*) FROM dbo.RecepcionCompra r WHERE r.idOrdenCompra = o.idOrdenCompra) AS recepciones
  FROM dbo.OrdenCompra o
  JOIN dbo.Estado e ON e.idEstado = o.idEstado
  WHERE o.esEliminada = 0 AND e.estado IN ('Lanzado','Completado')
  ORDER BY o.ordenNo`)).recordset;

const antes   = filas.filter((f) => f.esMiSolicitud);
const despues = filas.filter((f) => f.esMiSolicitud || f.esDeMiFabrica);
const nuevas  = filas.filter((f) => !f.esMiSolicitud && f.esDeMiFabrica);

console.log(`\n== ${DB} · ${USER} · órdenes lanzadas/completadas: ${filas.length} ==`);
console.log(`   filtro viejo (solo mis solicitudes): ${antes.length}`);
console.log(`   filtro nuevo (mi fábrica + mis solicitudes): ${despues.length}`);
console.log(`\nÓrdenes que RECUPERA (material a su fábrica, pedidas por otra persona o sin solicitud):`);
console.table(nuevas.map(({ ordenNo, estado, proveedorNombre, fecha, recepciones }) => ({ ordenNo, estado, proveedor: (proveedorNombre ?? '').slice(0, 40), fecha, recepciones })));
console.log(`   ${nuevas.length} órdenes · ${nuevas.reduce((s, f) => s + f.recepciones, 0)} recepciones que antes no veía\n`);

await pool.close();
