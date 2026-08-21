import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getAdelanteDb, sql } from '@/lib/db-adelantedb';
import { getCierreDia } from '@/lib/reporte-h4/queries';
import { abreviarCRC } from '@/lib/utilidades/format';
import { MODULOS_TODOS, type Modulo } from '@/lib/permissions';
import { bcConstructionConfigured, getObrasConVersion } from '@/lib/bc-construction';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/ds/Icon/Icon';
import { PageShell } from '@/components/layout/Page';

// Cada métrica corre aislada: si su DB/consulta falla, cae al fallback y el resto
// del dashboard igual carga (no rompe la pantalla).
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

// El dashboard se scopea por MÓDULO (rol de Producción): cada persona ve solo las
// métricas de lo que toca. Super Admin (módulo `admin`) mantiene el resumen global
// de producción; los roles funcionales (ingeniería, presupuesto, concreto,
// desembolsos) ven su propio resumen. Las consultas se ejecutan SOLO para los
// módulos del usuario, así nadie paga el costo de datos de otros roles.
async function getStats(mods: string[]) {
  const has = (m: string) => mods.includes(m);
  const now = new Date();
  const ym = now.getFullYear() * 100 + (now.getMonth() + 1);
  const desde = new Date(now.getFullYear(), now.getMonth(), 1);            // 1° del mes
  const hasta = new Date(now.getFullYear(), now.getMonth() + 1, 1);        // 1° del mes siguiente (exclusivo)

  const needObrasEstado = has('admin') || has('ingenieria');
  const needObrasList   = has('admin') || has('ingenieria');
  const needCuadrillas  = has('admin') || has('ingenieria');
  const needH4          = has('admin');
  const needUtilidad    = has('admin');

  const [
    cuadrillas, obras, obrasList, h4, utilidadNeta, presupuesto, concreto, desembolsos, obrasSinPresup,
  ] = await Promise.all([
    // Cuadrillas activas (AdelanteSBX)
    needCuadrillas ? safe(async () => {
      const db = await getDb();
      const r = await db.request().query<{ total: number }>(`SELECT COUNT(*) AS total FROM dbo.Cuadrilla WHERE Activo=1`);
      return r.recordset[0]?.total ?? 0;
    }, 0) : Promise.resolve(0),
    // Obras por estado operativo (AdelanteDB)
    needObrasEstado ? safe(async () => {
      const db = await getAdelanteDb();
      const r = await db.request().query<{ enEjecucion: number; enEspera: number }>(`
        SELECT
          SUM(CASE WHEN estado = 'en_ejecucion' THEN 1 ELSE 0 END) AS enEjecucion,
          SUM(CASE WHEN estado = 'en_espera'    THEN 1 ELSE 0 END) AS enEspera
        FROM pro_obc.obra_estado`);
      return { enEjecucion: r.recordset[0]?.enEjecucion ?? 0, enEspera: r.recordset[0]?.enEspera ?? 0 };
    }, { enEjecucion: 0, enEspera: 0 }) : Promise.resolve({ enEjecucion: 0, enEspera: 0 }),
    // Lista corta de obras en ejecución (AdelanteDB)
    needObrasList ? safe(async () => {
      const db = await getAdelanteDb();
      const r = await db.request().query<{ codigo: string; sprint: number }>(`
        SELECT TOP 8 obra_codigo AS codigo, sprint_actual AS sprint
        FROM pro_obc.obra_estado WHERE estado = 'en_ejecucion' ORDER BY obra_codigo`);
      return r.recordset;
    }, [] as Array<{ codigo: string; sprint: number }>) : Promise.resolve([] as Array<{ codigo: string; sprint: number }>),
    // Reporte H4 — jornada de hoy (AdelanteSBX)
    needH4 ? safe(async () => {
      const c = await getCierreDia();
      return { anomalias: c.anomalias.length, sinMarcaje: c.kpis.sinMarcaje };
    }, { anomalias: 0, sinMarcaje: 0 }) : Promise.resolve({ anomalias: 0, sinMarcaje: 0 }),
    // Utilidad neta del mes en curso (AdelanteDB)
    needUtilidad ? safe(async () => {
      const db = await getAdelanteDb();
      const r = await db.request().input('ym', sql.Int, ym).query<{ neta: number }>(
        `SELECT SUM(utilidad_neta) AS neta FROM pro_uti.v_resumen_mensual WHERE (anio * 100 + mes) = @ym`);
      return r.recordset[0]?.neta ?? 0;
    }, 0) : Promise.resolve(0),
    // ── Presupuesto: catálogo de partidas (AdelanteDB) + obras/proyectos (AdelanteSBX) ──
    has('presupuesto') ? safe(async () => {
      const [cat, ob, pr] = await Promise.all([
        safe(async () => {
          const db = await getAdelanteDb();
          const r = await db.request().query<{ partidas: number; subpartidas: number }>(`
            SELECT
              (SELECT COUNT(*) FROM pro_obc.partidas)     AS partidas,
              (SELECT COUNT(*) FROM pro_obc.sub_partidas) AS subpartidas`);
          return { partidas: r.recordset[0]?.partidas ?? 0, subpartidas: r.recordset[0]?.subpartidas ?? 0 };
        }, { partidas: 0, subpartidas: 0 }),
        safe(async () => {
          const db = await getDb();
          const r = await db.request().query<{ total: number }>(`SELECT COUNT(*) AS total FROM dbo.Obra`);
          return r.recordset[0]?.total ?? 0;
        }, 0),
        safe(async () => {
          const db = await getDb();
          const r = await db.request().query<{ total: number }>(`SELECT COUNT(*) AS total FROM dbo.Proyecto`);
          return r.recordset[0]?.total ?? 0;
        }, 0),
      ]);
      return { partidas: cat.partidas, subpartidas: cat.subpartidas, obras: ob, proyectos: pr };
    }, { partidas: 0, subpartidas: 0, obras: 0, proyectos: 0 })
      : Promise.resolve({ partidas: 0, subpartidas: 0, obras: 0, proyectos: 0 }),
    // ── Concreto: coladas / batches del mes + muestras de lab (AdelanteDB) ──
    has('concreto') ? safe(async () => {
      const db = await getAdelanteDb();
      const r = await db.request()
        .input('desde', sql.DateTime2, desde)
        .input('hasta', sql.DateTime2, hasta)
        .query<{ coladasMes: number; pendientes: number; batchesMes: number; muestras: number }>(`
          SELECT
            (SELECT COUNT(*) FROM pro_hor.coladas
               WHERE fecha_inicio >= @desde AND fecha_inicio < @hasta)          AS coladasMes,
            (SELECT COUNT(*) FROM pro_hor.coladas
               WHERE estado IN ('sugerida','confirmada'))                        AS pendientes,
            (SELECT COUNT(*) FROM pro_hor.batches
               WHERE fecha_inicio >= @desde AND fecha_inicio < @hasta)          AS batchesMes,
            (SELECT COUNT(*) FROM pro_lab.muestras)                              AS muestras`);
      const row = r.recordset[0];
      return {
        coladasMes: row?.coladasMes ?? 0, pendientes: row?.pendientes ?? 0,
        batchesMes: row?.batchesMes ?? 0, muestras: row?.muestras ?? 0,
      };
    }, { coladasMes: 0, pendientes: 0, batchesMes: 0, muestras: 0 })
      : Promise.resolve({ coladasMes: 0, pendientes: 0, batchesMes: 0, muestras: 0 }),
    // ── Desembolsos: pendiente por recibir + casas por estado (AdelanteDB) ──
    has('desembolsos') ? safe(async () => {
      const db = await getAdelanteDb();
      const r = await db.request().query<{ pend: number; form: number; res: number }>(`
        SELECT
          SUM(Pendiente_CRC)                              AS pend,
          SUM(CASE WHEN EsReservado = 0 THEN 1 ELSE 0 END) AS form,
          SUM(CASE WHEN EsReservado = 1 THEN 1 ELSE 0 END) AS res
        FROM pro_app.vw_dashboard_caso`);
      const row = r.recordset[0];
      return { pendienteCRC: row?.pend ?? 0, casasFormalizadas: row?.form ?? 0, casasReservadas: row?.res ?? 0 };
    }, { pendienteCRC: 0, casasFormalizadas: 0, casasReservadas: 0 })
      : Promise.resolve({ pendienteCRC: 0, casasFormalizadas: 0, casasReservadas: 0 }),
    // ── Presupuesto: obras ACTIVAS sin presupuesto cargado (se consulta BC en vivo) ──
    // Obras en ejecución/espera que aún NO tienen versión de presupuesto en Business
    // Central → las que el presupuestista tiene que armar. La réplica BI puede estar
    // atrasada, por eso se pregunta a BC directo. Con timeout para no colgar el panel.
    has('presupuesto') ? safe(async () => {
      const db = await getAdelanteDb();
      const r = await db.request().query<{ codigo: string; sprint: number; idObra: number | null }>(`
        SELECT oe.obra_codigo AS codigo, oe.sprint_actual AS sprint, o.idObra
        FROM pro_obc.obra_estado oe
        LEFT JOIN dbo.Obra o ON o.numeroObra = oe.obra_codigo
        WHERE oe.estado IN ('en_ejecucion','en_espera') ORDER BY oe.obra_codigo`);
      const activas = r.recordset;
      if (!bcConstructionConfigured() || activas.length === 0) return [];
      const conVersion = await Promise.race([
        getObrasConVersion(),
        new Promise<Set<string>>((_, rej) => setTimeout(() => rej(new Error('BC timeout')), 6000)),
      ]);
      return activas.filter((o) => !conVersion.has((o.codigo ?? '').trim()));
    }, [] as Array<{ codigo: string; sprint: number; idObra: number | null }>)
      : Promise.resolve([] as Array<{ codigo: string; sprint: number; idObra: number | null }>),
  ]);

  return { cuadrillas, obras, obrasList, h4, utilidadNeta, presupuesto, concreto, desembolsos, obrasSinPresup };
}

// `href` opcional: si el módulo destino está apagado (Avance de obra), la
// tarjeta muestra el dato pero no enlaza a ningún lado.
type Card = { label: string; value: string | number; sub: string; icon: IconName; href?: string; accent: string };
type Action = { href: string; label: string; icon: IconName };

const SUBTITULO: Record<Modulo, string> = {
  admin: 'Resumen de producción: obra, jornada (H4) y utilidades.',
  ingenieria: 'Resumen de obra: ejecución y cuadrillas en campo.',
  avance: 'Resumen de avance de obra: ejecución en campo.',
  presupuesto: 'Resumen de presupuesto: partidas, obras y proyectos.',
  concreto: 'Resumen de concreto: coladas, batches y laboratorio.',
  desembolsos: 'Resumen de desembolsos: casas y montos pendientes.',
  bodega: 'Resumen de pedidos: material que pedís al stock.',
  recepcion: 'Resumen de bodega: material por recibir.',
  dashboard: 'Resumen de producción.',
};

export default async function DashboardPage() {
  const session = await getSession();
  // Sin rol de Producción (legacy/undefined) → se muestra todo (fallback seguro,
  // igual que el sidebar cae al filtro por nivel). Con rol, solo sus módulos.
  const mods = session?.modules?.length ? session.modules : [...MODULOS_TODOS];
  const has = (m: Modulo) => mods.includes(m);
  const stats = await getStats(mods);

  // Módulo "principal" para el subtítulo (Super Admin manda; luego el funcional).
  const primary: Modulo =
    has('admin') ? 'admin' :
    has('ingenieria') ? 'ingenieria' :
    has('avance') ? 'avance' :
    has('presupuesto') ? 'presupuesto' :
    has('concreto') ? 'concreto' :
    has('desembolsos') ? 'desembolsos' :
    has('bodega') ? 'bodega' :
    has('recepcion') ? 'recepcion' : 'admin';

  // Tarjetas por módulo. Super Admin ve el resumen global de producción; cada rol
  // funcional ve solo lo suyo.
  const cards: Card[] = [];
  const quickActions: Action[] = [];

  if (has('admin')) {
    cards.push(
      { label: 'Obras en ejecución', value: stats.obras.enEjecucion, sub: `${stats.obras.enEspera} en espera`, icon: 'place', href: has('avance') ? '/avance' : '/obras', accent: 'bg-brand' },
      { label: 'Anomalías H4 (hoy)', value: stats.h4.anomalias, sub: `${stats.h4.sinMarcaje} sin marcaje hoy`, icon: 'reloj', href: '/reporte-h4', accent: stats.h4.anomalias > 0 ? 'bg-ds-red' : 'bg-ds-gray-500' },
      { label: 'Utilidad del mes', value: abreviarCRC(stats.utilidadNeta), sub: 'utilidad neta acumulada del mes', icon: 'boleta', href: '/utilidades', accent: 'bg-black' },
      { label: 'Cuadrillas activas', value: stats.cuadrillas, sub: 'en campo · acá se asignan colaboradores', icon: 'cuadrillas', href: '/cuadrillas', accent: 'bg-ds-gray-500' },
    );
    quickActions.push(
      { href: '/reporte-h4', label: 'Cerrar día (Reporte H4)', icon: 'reloj' },
      ...(has('avance') ? [{ href: '/avance', label: 'Ver avance de obra', icon: 'completado' as IconName }] : []),
      { href: '/utilidades', label: 'Ver utilidades', icon: 'boleta' },
      { href: '/cuadrillas', label: 'Gestionar cuadrillas', icon: 'cuadrillas' },
    );
  } else {
    if (has('ingenieria')) {
      const hrefObras = has('avance') ? '/avance' : undefined;
      cards.push(
        { label: 'Obras en ejecución', value: stats.obras.enEjecucion, sub: 'obras activas en campo', icon: 'place', href: hrefObras, accent: 'bg-brand' },
        { label: 'Obras en espera', value: stats.obras.enEspera, sub: 'por arrancar', icon: 'place', href: hrefObras, accent: 'bg-ds-gray-500' },
        { label: 'Cuadrillas activas', value: stats.cuadrillas, sub: 'en campo · acá se asignan colaboradores', icon: 'cuadrillas', href: '/cuadrillas', accent: 'bg-black' },
      );
      quickActions.push(
        ...(has('avance') ? [{ href: '/avance', label: 'Ver avance de obra', icon: 'completado' as IconName }] : []),
        { href: '/cuadrillas', label: 'Gestionar cuadrillas', icon: 'cuadrillas' },
        { href: '/compras/ingenieria', label: 'Órdenes de compra', icon: 'entrega' },
      );
    }
    // Bodega: no tiene tablero propio, solo la puerta a sus pedidos.
    if (has('bodega') && !has('ingenieria')) {
      quickActions.push(
        { href: '/compras/ingenieria', label: 'Hacer un pedido de material', icon: 'entrega' },
      );
    }
    // Recepción (Fábrica de Maderas): la puerta a lo que está por recibir.
    if (has('recepcion') && !has('ingenieria')) {
      quickActions.push(
        { href: '/compras/facturacion', label: 'Recibir material (órdenes por recibir)', icon: 'entrega' },
      );
    }
    if (has('presupuesto')) {
      cards.push(
        { label: 'Partidas', value: stats.presupuesto.partidas, sub: `${stats.presupuesto.subpartidas} subpartidas en catálogo`, icon: 'calculator', href: '/partidas', accent: 'bg-brand' },
        { label: 'Subpartidas', value: stats.presupuesto.subpartidas, sub: 'del catálogo de producción', icon: 'calculator', href: '/partidas', accent: 'bg-ds-gray-500' },
        { label: 'Obras', value: stats.presupuesto.obras, sub: 'obras registradas', icon: 'place', href: '/obras', accent: 'bg-black' },
        { label: 'Proyectos', value: stats.presupuesto.proyectos, sub: 'proyectos registrados', icon: 'folder', href: '/proyectos', accent: 'bg-ds-gray-500' },
      );
      quickActions.push(
        { href: '/partidas', label: 'Ver partidas', icon: 'calculator' },
        { href: '/presupuesto', label: 'Cargar presupuesto', icon: 'boleta' },
        { href: '/obras', label: 'Ver obras', icon: 'place' },
        { href: '/proyectos', label: 'Ver proyectos', icon: 'folder' },
      );
    }
    if (has('concreto')) {
      cards.push(
        { label: 'Coladas del mes', value: stats.concreto.coladasMes, sub: 'registradas este mes', icon: 'traslado', href: '/concreto/coladas', accent: 'bg-brand' },
        { label: 'Pendientes de digitar', value: stats.concreto.pendientes, sub: 'sugeridas y confirmadas', icon: 'reloj', href: '/concreto/coladas', accent: stats.concreto.pendientes > 0 ? 'bg-ds-red' : 'bg-ds-gray-500' },
        { label: 'Batches del mes', value: stats.concreto.batchesMes, sub: 'importados este mes', icon: 'traslado', href: '/concreto/batches', accent: 'bg-black' },
        { label: 'Muestras de lab', value: stats.concreto.muestras, sub: 'en laboratorio', icon: 'boleta', href: '/concreto/laboratorio', accent: 'bg-ds-gray-500' },
      );
      quickActions.push(
        { href: '/concreto/dashboard', label: 'Dashboard de concreto', icon: 'traslado' },
        { href: '/concreto/coladas', label: 'Ver coladas', icon: 'traslado' },
        { href: '/concreto/batches', label: 'Ver batches', icon: 'traslado' },
        { href: '/concreto/laboratorio', label: 'Laboratorio', icon: 'boleta' },
      );
    }
    if (has('desembolsos')) {
      cards.push(
        { label: 'Pendiente por recibir', value: abreviarCRC(stats.desembolsos.pendienteCRC), sub: 'saldo pendiente total', icon: 'boleta', href: '/desembolsos/dashboard', accent: 'bg-brand' },
        { label: 'Casas formalizadas', value: stats.desembolsos.casasFormalizadas, sub: 'con caso formalizado', icon: 'place', href: '/desembolsos/matriz', accent: 'bg-black' },
        { label: 'Casas reservadas', value: stats.desembolsos.casasReservadas, sub: 'en reserva', icon: 'folder', href: '/desembolsos/matriz', accent: 'bg-ds-gray-500' },
      );
      quickActions.push(
        { href: '/desembolsos/dashboard', label: 'Dashboard de desembolsos', icon: 'boleta' },
        { href: '/desembolsos/matriz', label: 'Ver matriz', icon: 'place' },
        { href: '/desembolsos/movimientos', label: 'Movimientos', icon: 'traslado' },
      );
    }
  }

  // Panel derecho según el rol: obra (en ejecución) para admin/ingeniería; para el
  // presupuestista, las obras activas que le faltan presupuestar. Los demás roles
  // (concreto/desembolsos) no llevan panel derecho (las acciones ocupan el ancho).
  const rightPanel: 'ejecucion' | 'sinPresup' | null =
    has('admin') || has('ingenieria') ? 'ejecucion' :
    has('presupuesto') ? 'sinPresup' : null;

  return (
    <PageShell className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-heading sm:text-4xl font-bold text-ds-ink tracking-tight">
          Hola, {session?.nombre.split(' ')[0]}
        </h1>
        <p className="text-ds-gray-400 mt-1.5 text-body">{SUBTITULO[primary]}</p>
      </div>

      {/* Stat cards */}
      {cards.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map(card => {
            const cuerpo = (
              <div className={`bg-ds-surface rounded-ds-lg border border-ds-gray-200 p-5 shadow-ds-01 transition-all duration-200${card.href ? ' hover:shadow-ds-03 hover:-translate-y-0.5' : ''}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-10 h-10 rounded-ds ${card.accent} flex items-center justify-center shadow-ds-02`}>
                    <Icon name={card.icon} size="md" color="currentColor" className={card.accent === 'bg-brand' ? 'text-black' : 'text-white'} />
                  </div>
                  {card.href && (
                    <Icon name="arrow-right" size="sm" color="currentColor" className="text-ds-gray-300 group-hover:text-ds-ink transition-colors mt-1" />
                  )}
                </div>
                <div className="text-heading sm:text-4xl font-bold text-ds-ink mb-1">{card.value}</div>
                <div className="text-sm font-semibold text-ds-ink">{card.label}</div>
                <div className="text-xs text-ds-gray-400 mt-0.5">{card.sub}</div>
              </div>
            );
            return card.href
              ? <Link key={card.label} href={card.href} className="group block">{cuerpo}</Link>
              : <div key={card.label} className="block">{cuerpo}</div>;
          })}
        </div>
      )}

      {/* Acciones rápidas + Obras en ejecución */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Acciones rápidas */}
        <div className={rightPanel ? '' : 'lg:col-span-3'}>
          <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5 h-full">
            <h2 className="font-bold text-ds-ink mb-4 text-sub-sm">Acciones rápidas</h2>
            <div className="space-y-1">
              {quickActions.map(({ href, label, icon }) => (
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
        </div>

        {/* Obras en ejecución (admin / ingeniería) */}
        {rightPanel === 'ejecucion' && (
          <div className="lg:col-span-2 bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="font-bold text-ds-ink text-sub-sm">Obras en ejecución</h2>
              {has('avance') && (
                <Link href="/avance" className="ml-auto text-xs font-semibold text-ds-gray-400 hover:text-ds-ink transition-colors">Ver todas →</Link>
              )}
            </div>
            {stats.obrasList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-ds-gray-300">
                <Icon name="place" size="lg" color="currentColor" className="mb-2" />
                <span className="text-sm">No hay obras en ejecución</span>
              </div>
            ) : (
              <div className="space-y-2.5">
                {stats.obrasList.map((o) => {
                  const fila = (
                    <>
                      <span className="font-mono text-xs font-semibold text-ds-gray-500 shrink-0">{o.codigo}</span>
                      <span className="flex-1" />
                      <span className="text-xs px-2 py-0.5 rounded-full bg-ds-gray-100 text-ds-gray-500 shrink-0">Sprint {o.sprint}</span>
                    </>
                  );
                  // Sin Avance de obra publicado la lista es informativa (no navega).
                  return has('avance') ? (
                    <Link key={o.codigo} href="/avance" className="flex items-center gap-3 px-2 -mx-2 py-1.5 rounded-ds hover:bg-ds-gray-100 transition-colors">{fila}</Link>
                  ) : (
                    <div key={o.codigo} className="flex items-center gap-3 px-2 -mx-2 py-1.5 rounded-ds">{fila}</div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Obras sin presupuesto cargado (presupuestista) — activas que faltan por presupuestar (BC) */}
        {rightPanel === 'sinPresup' && (
          <div className="lg:col-span-2 bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="font-bold text-ds-ink text-sub-sm">Obras sin presupuesto</h2>
              <span className="ml-auto text-xs font-semibold text-ds-gray-400">{stats.obrasSinPresup.length} activa{stats.obrasSinPresup.length === 1 ? '' : 's'}</span>
            </div>
            {stats.obrasSinPresup.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-ds-gray-300">
                <Icon name="check" size="lg" color="currentColor" className="mb-2" />
                <span className="text-sm">Todas las obras activas tienen presupuesto</span>
              </div>
            ) : (
              <div className="space-y-2.5">
                {stats.obrasSinPresup.map((o) => (
                  <Link key={o.codigo} href={o.idObra ? `/obras/${o.idObra}` : '/presupuesto'} className="flex items-center gap-3 px-2 -mx-2 py-1.5 rounded-ds hover:bg-ds-gray-100 transition-colors">
                    <span className="font-mono text-xs font-semibold text-ds-gray-500 shrink-0">{o.codigo}</span>
                    <span className="flex-1" />
                    <span className="text-xs px-2 py-0.5 rounded-full bg-brand-soft text-ds-ink shrink-0">Cargar presupuesto</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}
