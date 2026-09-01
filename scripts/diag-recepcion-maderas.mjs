// Los tres alcances de "Recepción de facturas", medidos contra la base real.
//
// Historia (01/09/2026): la Fábrica de Maderas estaba encerrada en "las órdenes de
// MIS solicitudes" y no encontraba las facturas que tenía que registrar. Ese criterio
// falla en las dos direcciones —en la fábrica digitan varias personas, y la misma
// persona digita para otras fábricas—, así que se pasó a acotar por BODEGA; y como
// aun así seguían llegando facturas que no salían, lo que pidieron fue ver TODAS con
// un selector para acotar. Este script mide los tres alcances tal como los calcula
// `ordenesDelAlcance` (lib/compras/helpers.ts).
//
//   node scripts/diag-recepcion-maderas.mjs [usuario] [base]
import sql from 'mssql';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
for (const l of env.split('\n')) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim(); }
const USER = process.argv[2] ?? 'alessandra';
const DB   = process.argv[3] ?? 'AdelantePRO';
// Los códigos de la fábrica, que en los datos aparecen como ALMACÉN y como OBRA.
const FABRICA = ['F-MADERAS', 'F-MAD-NUE'];
const inFab = (col) => `UPPER(LTRIM(RTRIM(ISNULL(${col},'')))) IN ('${FABRICA.join("','")}')`;

const pool = await new sql.ConnectionPool({
  server: process.env.DB_SERVER, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: DB, port: 1433, connectionTimeout: 90000, requestTimeout: 180000,
  options: { encrypt: true, trustServerCertificate: false },
}).connect();

const filas = (await pool.request().input('u', sql.NVarChar(100), USER).query(`
  SELECT o.ordenNo, o.bcNo, e.estado, o.proveedorNombre,
         CASE WHEN EXISTS (SELECT 1 FROM dbo.OrdenCompraDet d
                           JOIN dbo.PedidoCompraDet pd ON pd.idPedidoCompraDet = d.idPedidoCompraDet
                           JOIN dbo.PedidoCompra pc ON pc.idPedidoCompra = pd.idPedidoCompra AND pc.esEliminada = 0
                           WHERE d.idOrdenCompra = o.idOrdenCompra AND pc.creadoPor = @u) THEN 1 ELSE 0 END AS mia,
         -- "De mi fábrica" mira el ALMACÉN de la línea Y la OBRA del pedido origen:
         -- F-MAD-NUE se usa de las dos formas, y hay material PARA la fábrica que
         -- entra al Almacén General (PED-000023 → CP-005192).
         CASE WHEN EXISTS (SELECT 1 FROM dbo.OrdenCompraDet d
                           LEFT JOIN dbo.PedidoCompraDet pd ON pd.idPedidoCompraDet = d.idPedidoCompraDet
                           WHERE d.idOrdenCompra = o.idOrdenCompra
                             AND (${inFab('d.locationCode')} OR ${inFab('pd.obra')})) THEN 1 ELSE 0 END AS fabrica,
         CASE WHEN EXISTS (SELECT 1 FROM dbo.OrdenCompraDet d
                           WHERE d.idOrdenCompra = o.idOrdenCompra AND ${inFab('d.locationCode')}) THEN 1 ELSE 0 END AS fabricaSoloAlmacen,
         (SELECT COUNT(*) FROM dbo.RecepcionCompra r WHERE r.idOrdenCompra = o.idOrdenCompra) AS recepciones
  FROM dbo.OrdenCompra o
  JOIN dbo.Estado e ON e.idEstado = o.idEstado
  WHERE o.esEliminada = 0 AND e.estado IN ('Lanzado','Completado')
  ORDER BY o.bcNo`)).recordset;

const fab = filas.filter((f) => f.fabrica);
const mias = filas.filter((f) => f.mia);
console.log(`\n== ${DB} · ${USER} ==`);
console.log(`  Todas ................. ${filas.length}`);
console.log(`  De mi fábrica ......... ${fab.length}   (${fab.filter((f) => !f.mia).length} las digitó otra persona)`);
console.log(`  De mis solicitudes .... ${mias.length}   (${mias.filter((f) => !f.fabrica).length} NO son de la fábrica)`);

// Las que "De mi fábrica" solo agarra por la OBRA: si esto crece, es que se está
// pidiendo material para la fábrica que entra a otra bodega.
const porObra = fab.filter((f) => !f.fabricaSoloAlmacen);
console.log(`\nDe la fábrica por OBRA pero en otra bodega (${porObra.length}):`);
console.table(porObra.map((f) => ({ bcNo: f.bcNo, ordenNo: f.ordenNo, estado: f.estado, proveedor: (f.proveedorNombre ?? '').slice(0, 34), recepciones: f.recepciones })));

await pool.close();
