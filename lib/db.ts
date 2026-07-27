import sql from 'mssql';

// Acepta las dos convenciones de nombres que hay en los App Services de
// Adelante: DB_* (este repo) y DB_DATABASE / SQL_* (otros servicios).
const config: sql.config = {
  server: (process.env.DB_SERVER || process.env.SQL_SERVER)!,
  database: (process.env.DB_NAME || process.env.DB_DATABASE || process.env.SQL_DATABASE)!,
  user: (process.env.DB_USER || process.env.SQL_USER)!,
  password: (process.env.DB_PASSWORD || process.env.SQL_PASSWORD)!,
  port: parseInt(process.env.DB_PORT || '1433'),
  // AdelanteSBX es SQL Serverless con auto-pausa: al despertar tarda ~30-60s.
  // Subimos el timeout de conexión para esperar el "resume" en vez de fallar a
  // los 15s (default). requestTimeout también algo mayor por si la 1a query cae
  // mientras la base termina de arrancar.
  connectionTimeout: 60000,
  requestTimeout: 45000,
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool: sql.ConnectionPool | null = null;
// Promesa de conexión en curso: si varias requests llegan en frío a la vez,
// comparten la MISMA conexión en vez de abrir un pool cada una (importante con
// la DB serverless que tarda en despertar).
let poolPromise: Promise<sql.ConnectionPool> | null = null;

export async function getDb(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) return pool;
  if (poolPromise) return poolPromise;
  if (pool && !pool.connected) {
    try { await pool.close(); } catch { /* ignorar */ }
    pool = null;
  }
  poolPromise = sql.connect(config)
    .then((p) => { pool = p; poolPromise = null; return p; })
    .catch((err) => { poolPromise = null; throw err; });
  return poolPromise;
}

export { sql };
