import { getDb } from '@/lib/db';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Auto-aplicación de migraciones en PRODUCCIÓN, al arrancar la app (ver
// instrumentation.ts). La app ya tiene acceso a la base (AdelantePRO en prod),
// así que NO hace falta un secret ni abrir el firewall de Azure SQL a GitHub.
//
// Para que esto encaje con el flujo de Steven (migración dentro del PR → al
// aprobar/desplegar, las tablas quedan en prod) sin riesgo sobre lo ya existente:
//
//   · CORTE POR FECHA: solo se auto-aplican las migraciones cuyo nombre (que va
//     como AAAA-MM-DD_...) sea >= CUTOFF. TODO lo anterior —incluida la de `mant`
//     (2026-10-13)— lo sigue aplicando David a mano, como siempre. Así esta
//     automatización NUNCA corre sola las ~40 migraciones viejas en prod.
//   · TABLA DE CONTROL dbo.MigracionAplicada: cada archivo se corre UNA sola vez.
//   · Si una migración falla, se loguea y se corta (no se marca aplicada → se
//     reintenta en el próximo arranque); instrumentation.ts lo envuelve para que
//     un error acá NUNCA tumbe el arranque del resto del app.
//
// Nota: pensado para 1 instancia (es el caso de usuarios-ad). Con varias
// instancias habría que agregar un lock; la PK de archivo evita el doble-insert,
// y las migraciones van con IF NOT EXISTS, así que el riesgo real es bajo igual.
const CUTOFF = '2026-10-15';

const DIR = path.join(process.cwd(), 'migrations');

function listarArchivos(): string[] {
  try {
    return readdirSync(DIR)
      .filter((f) => f.toLowerCase().endsWith('.sql'))
      .filter((f) => f >= CUTOFF) // AAAA-MM-DD… ⇒ orden lexical == cronológico
      .sort();
  } catch {
    return []; // sin carpeta migrations (ej. build sin empaquetarla): no-op seguro
  }
}

export async function aplicarMigracionesPendientes(): Promise<void> {
  const candidatas = listarArchivos();
  if (!candidatas.length) return;

  const pool = await getDb();
  await pool.request().query(
    "IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name='dbo' AND t.name='MigracionAplicada') " +
    'CREATE TABLE dbo.MigracionAplicada (archivo NVARCHAR(260) NOT NULL PRIMARY KEY, ' +
    'aplicadaEn DATETIME2 NOT NULL CONSTRAINT DF_MigracionAplicada_fecha DEFAULT SYSUTCDATETIME());',
  );

  const aplicadas = new Set(
    (await pool.request().query<{ archivo: string }>('SELECT archivo FROM dbo.MigracionAplicada')).recordset.map((r) => r.archivo),
  );
  const pendientes = candidatas.filter((a) => !aplicadas.has(a));
  if (!pendientes.length) return;

  for (const archivo of pendientes) {
    const texto = readFileSync(path.join(DIR, archivo), 'utf8');
    // Los .sql de este repo separan lotes con líneas "GO" (directiva del cliente,
    // no T-SQL). Hay que correr cada lote por separado con .batch().
    const lotes = texto.split(/^\s*GO\s*$/im).map((b) => b.trim()).filter(Boolean);
    for (const lote of lotes) {
      await pool.request().batch(lote);
    }
    await pool.request().input('a', archivo).query('INSERT INTO dbo.MigracionAplicada (archivo) VALUES (@a)');
    console.log(`[migraciones] aplicada en prod: ${archivo}`);
  }
}
