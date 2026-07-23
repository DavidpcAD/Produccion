import sql from 'mssql';

// Conexión a AdelanteDB — base del Grupo B (módulos avance / concreto / utilidades),
// distinta de la del resto del app (AdelanteSBX, en lib/db.ts). Vive en el MISMO servidor
// Azure SQL y usa las MISMAS credenciales; solo cambia el nombre de base.
//
// Importante: usamos un ConnectionPool PROPIO (no el `sql.connect` global de mssql) para
// que esta conexión no choque con el pool global que usa getDb() de lib/db.ts.
const config: sql.config = {
  server: (process.env.ADELANTEDB_SERVER || process.env.DB_SERVER || process.env.SQL_SERVER)!,
  database: process.env.ADELANTEDB_NAME || 'AdelanteDB',
  user: (process.env.ADELANTEDB_USER || process.env.DB_USER || process.env.SQL_USER)!,
  password: (process.env.ADELANTEDB_PASSWORD || process.env.DB_PASSWORD || process.env.SQL_PASSWORD)!,
  port: parseInt(process.env.DB_PORT || '1433'),
  // Mismo criterio que AdelanteSBX: serverless con auto-pausa, timeouts amplios.
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

export async function getAdelanteDb(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) return pool;
  if (pool && !pool.connected) {
    try { await pool.close(); } catch { /* ignorar */ }
    pool = null;
  }
  pool = await new sql.ConnectionPool(config).connect();
  return pool;
}

export { sql };
