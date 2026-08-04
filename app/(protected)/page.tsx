import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getCierreDia } from '@/lib/reporte-h4/queries';
import { abreviarCRC } from '@/lib/utilidades/format';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/ds/Icon/Icon';
import { PageShell } from '@/components/layout/Page';

// Cada métrica corre aislada: si su DB/consulta falla, cae al fallback y el resto
// del dashboard igual carga (no rompe la pantalla).
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

async function getStats() {
  const now = new Date();
  const ym = now.getFullYear() * 100 + (now.getMonth() + 1);

  const [cuadrillas, obras, obrasList, h4, utilidadNeta] = await Promise.all([
    // Cuadrillas activas (AdelanteSBX)
    safe(async () => {
      const db = await getDb();
      const r = await db.request().query<{ total: number }>(`SELECT COUNT(*) AS total FROM dbo.Cuadrilla WHERE Activo=1`);
      return r.recordset[0]?.total ?? 0;
    }, 0),
    // Obras por estado operativo (AdelanteDB)
    safe(async () => {
      const db = await getAdelanteDb();
      const r = await db.request().query<{ enEjecucion: number; enEspera: number }>(`
        SELECT
          SUM(CASE WHEN estado = 'en_ejecucion' THEN 1 ELSE 0 END) AS enEjecucion,
          SUM(CASE WHEN estado = 'en_espera'    THEN 1 ELSE 0 END) AS enEspera
        FROM pro_obc.obra_estado`);
      return { enEjecucion: r.recordset[0]?.enEjecucion ?? 0, enEspera: r.recordset[0]?.enEspera ?? 0 };
    }, { enEjecucion: 0, enEspera: 0 }),
    // Lista corta de obras en ejecución (AdelanteDB)
    safe(async () => {
      const db = await getAdelanteDb();
      const r = await db.request().query<{ codigo: string; sprint: number }>(`
        SELECT TOP 8 obra_codigo AS codigo, sprint_actual AS sprint
        FROM pro_obc.obra_estado WHERE estado = 'en_ejecucion' ORDER BY obra_codigo`);
      return r.recordset;
    }, [] as Array<{ codigo: string; sprint: number }>),
    // Reporte H4 — jornada de hoy (AdelanteSBX)
    safe(async () => {
      const c = await getCierreDia();
      return { anomalias: c.anomalias.length, sinMarcaje: c.kpis.sinMarcaje };
    }, { anomalias: 0, sinMarcaje: 0 }),
    // Utilidad neta del mes en curso (AdelanteDB)
    safe(async () => {
      const db = await getAdelanteDb();
      const r = await db.request().input('ym', sql.Int, ym).query<{ neta: number }>(
        `SELECT SUM(utilidad_neta) AS neta FROM pro_uti.v_resumen_mensual WHERE (anio * 100 + mes) = @ym`);
      return r.recordset[0]?.neta ?? 0;
    }, 0),
  ]);

  return { cuadrillas, obras, obrasList, h4, utilidadNeta };
}

export default async function DashboardPage() {
  const session = await getSession();
  const stats = await getStats();

  // Tarjetas del dashboard de PRODUCCIÓN: obra, jornada (H4) y utilidades.
  // El personal se administra en Recursos Humanos; acá solo Cuadrillas (donde se
  // asignan colaboradores a la obra).
  const cards: { label: string; value: string | number; sub: string; icon: IconName; href: string; accent: string }[] = [
    {
      label: 'Obras en ejecución',
      value: stats.obras.enEjecucion,
      sub: `${stats.obras.enEspera} en espera`,
      icon: 'place',
      href: '/avance',
      accent: 'bg-brand',
    },
    {
      label: 'Anomalías H4 (hoy)',
      value: stats.h4.anomalias,
      sub: `${stats.h4.sinMarcaje} sin marcaje hoy`,
      icon: 'reloj',
      href: '/reporte-h4',
      accent: stats.h4.anomalias > 0 ? 'bg-ds-red' : 'bg-ds-gray-500',
    },
    {
      label: 'Utilidad del mes',
      value: abreviarCRC(stats.utilidadNeta),
      sub: 'utilidad neta acumulada del mes',
      icon: 'boleta',
      href: '/utilidades',
      accent: 'bg-black',
    },
    {
      label: 'Cuadrillas activas',
      value: stats.cuadrillas,
      sub: 'en campo · acá se asignan colaboradores',
      icon: 'cuadrillas',
      href: '/cuadrillas',
      accent: 'bg-ds-gray-500',
    },
  ];

  const quickActions: { href: string; label: string; icon: IconName; minLevel: number }[] = [
    { href: '/reporte-h4', label: 'Cerrar día (Reporte H4)', icon: 'reloj',      minLevel: 2 },
    { href: '/avance',     label: 'Ver avance de obra',      icon: 'completado', minLevel: 2 },
    { href: '/utilidades', label: 'Ver utilidades',          icon: 'boleta',     minLevel: 2 },
    { href: '/cuadrillas', label: 'Gestionar cuadrillas',    icon: 'cuadrillas', minLevel: 2 },
  ];

  return (
    <PageShell className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-heading sm:text-4xl font-bold text-ds-ink tracking-tight">
          Hola, {session?.nombre.split(' ')[0]}
        </h1>
        <p className="text-ds-gray-400 mt-1.5 text-body">Resumen de producción: obra, jornada (H4) y utilidades.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(card => (
          <Link key={card.label} href={card.href} className="group block">
            <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 p-5 shadow-ds-01 hover:shadow-ds-03 transition-all duration-200 hover:-translate-y-0.5">
              <div className="flex items-start justify-between mb-4">
                <div className={`w-10 h-10 rounded-ds ${card.accent} flex items-center justify-center shadow-ds-02`}>
                  <Icon name={card.icon} size="md" color="currentColor" className={card.accent === 'bg-brand' ? 'text-black' : 'text-white'} />
                </div>
                <Icon name="arrow-right" size="sm" color="currentColor" className="text-ds-gray-300 group-hover:text-ds-ink transition-colors mt-1" />
              </div>
              <div className="text-heading sm:text-4xl font-bold text-ds-ink mb-1">{card.value}</div>
              <div className="text-sm font-semibold text-ds-ink">{card.label}</div>
              <div className="text-xs text-ds-gray-400 mt-0.5">{card.sub}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Acciones rápidas + Obras en ejecución */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Acciones rápidas */}
        <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5">
          <h2 className="font-bold text-ds-ink mb-4 text-sub-sm">Acciones rápidas</h2>
          <div className="space-y-1">
            {quickActions
              .filter(a => (session?.nivelAdmin ?? 0) >= a.minLevel)
              .map(({ href, label, icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-ds hover:bg-ds-gray-100 transition-colors group"
                >
                  <div className="w-7 h-7 rounded-ds bg-ds-gray-100 group-hover:bg-brand group-hover:shadow-ds-02 flex items-center justify-center transition-all shrink-0">
                    <Icon name={icon} size="sm" color="currentColor" className="text-ds-gray-500 group-hover:text-ds-ink" />
                  </div>
                  <span className="text-sm font-semibold text-ds-ink">{label}</span>
                  <Icon name="arrow-right" size="sm" color="currentColor" className="text-ds-gray-300 group-hover:text-ds-ink ml-auto transition-colors" />
                </Link>
              ))}
          </div>
        </div>

        {/* Obras en ejecución */}
        <div className="lg:col-span-2 bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-bold text-ds-ink text-sub-sm">Obras en ejecución</h2>
            <Link href="/avance" className="ml-auto text-xs font-semibold text-ds-gray-400 hover:text-ds-ink transition-colors">Ver todas →</Link>
          </div>
          {stats.obrasList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-ds-gray-300">
              <Icon name="place" size="lg" color="currentColor" className="mb-2" />
              <span className="text-sm">No hay obras en ejecución</span>
            </div>
          ) : (
            <div className="space-y-2.5">
              {stats.obrasList.map((o) => (
                <Link key={o.codigo} href="/avance" className="flex items-center gap-3 px-2 -mx-2 py-1.5 rounded-ds hover:bg-ds-gray-100 transition-colors">
                  <span className="font-mono text-xs font-semibold text-ds-gray-500 shrink-0">{o.codigo}</span>
                  <span className="flex-1" />
                  <span className="text-xs px-2 py-0.5 rounded-full bg-ds-gray-100 text-ds-gray-500 shrink-0">Sprint {o.sprint}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
