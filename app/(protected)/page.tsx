import { getSession } from '@/lib/auth';
import { getDb } from '@/lib/db';
import Link from 'next/link';
import { Icon } from '@/components/ds/Icon/Icon';

async function getStats() {
  const q = async <T,>(query: string, fallback: T): Promise<T> => {
    try {
      const db = await getDb();
      const r = await db.request().query(query);
      return r.recordset as T;
    } catch {
      return fallback;
    }
  };

  const [col, usuarios, pendMarcaje, cuad, actividad] = await Promise.all([
    q<Array<{ total: number; activos: number }>>(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN esActivo=1 THEN 1 ELSE 0 END) AS activos FROM dbo.Colaborador`,
      [{ total: 0, activos: 0 }],
    ),
    q<Array<{ total: number }>>(`SELECT COUNT(*) AS total FROM dbo.Usuario`, [{ total: 0 }]),
    q<Array<{ total: number }>>(
      `SELECT COUNT(*) AS total FROM dbo.Colaborador WHERE esActivo=1 AND ISNULL(marcajeEstado,'Pendiente')='Pendiente'`,
      [{ total: 0 }],
    ),
    q<Array<{ total: number }>>(`SELECT COUNT(*) AS total FROM dbo.Cuadrilla WHERE Activo=1`, [{ total: 0 }]),
    // UsuarioAuditLog no existe aún en el modelo nuevo -> lista vacía si falla
    q<Array<Record<string, unknown>>>(
      `SELECT TOP 6 ua.Accion, ua.FechaAccion, ua.Entidad, c.calcNombreCompleto AS Actor
       FROM dbo.UsuarioAuditLog ua
       JOIN dbo.Colaborador c ON c.idColaborador = ua.IDColAccion
       ORDER BY ua.FechaAccion DESC`,
      [],
    ),
  ]);

  return {
    colaboradores: col[0] ?? { total: 0, activos: 0 },
    conAcceso: usuarios[0]?.total ?? 0,
    pendientesMarcaje: pendMarcaje[0]?.total ?? 0,
    cuadrillas: cuad[0]?.total ?? 0,
    actividad,
  };
}

const accionLabels: Record<string, { label: string; cls: string }> = {
  CREAR_USUARIO:   { label: 'Nuevo colaborador', cls: 'bg-ds-green-soft text-ds-green-ink' },
  CREAR_ACCESO:    { label: 'Acceso creado',     cls: 'bg-ds-green-soft text-ds-green-ink' },
  EDITAR_ACCESO:   { label: 'Acceso editado',    cls: 'bg-ds-gray-100 text-ds-gray-500' },
  EDITAR_USUARIO:  { label: 'Edición',           cls: 'bg-ds-gray-100 text-ds-gray-500' },
  ASIGNAR_ROL:     { label: 'Rol asignado',      cls: 'bg-ds-gray-100 text-ds-gray-500' },
  REVOCAR_ROL:     { label: 'Rol revocado',      cls: 'bg-ds-red-soft text-ds-red-ink' },
  EDITAR_CUADRILLA:{ label: 'Cuadrilla',         cls: 'bg-ds-gray-100 text-ds-gray-500' },
  MOVER_CUADRILLA: { label: 'Cuadrilla',         cls: 'bg-ds-gray-100 text-ds-gray-500' },
  CAMBIO_ENCARGADO:{ label: 'Cambio de encargado', cls: 'bg-ds-gray-100 text-ds-gray-500' },
  ASIGNAR_ENCARGADO_PARTIDA: { label: 'Encargado asignado', cls: 'bg-ds-green-soft text-ds-green-ink' },
  QUITAR_ENCARGADO_PARTIDA:  { label: 'Encargado quitado',  cls: 'bg-ds-red-soft text-ds-red-ink' },
};

// Cualquier acción no mapeada: convertir SNAKE_CASE en "Snake case" legible.
function accionLegible(code: string): string {
  return code.charAt(0).toUpperCase() + code.slice(1).toLowerCase().replace(/_/g, ' ');
}

export default async function DashboardPage() {
  const session = await getSession();
  const stats = await getStats();

  // Cada card lleva a su destino (o filtro) propio y su ícono lo representa.
  // El texto gris de las 4 es una descripción de la métrica (mismo patrón).
  const cards = [
    {
      label: 'Colaboradores activos',
      value: stats.colaboradores.activos,
      sub: 'personal activo de la empresa',
      icon: 'user',
      href: '/usuarios',
      accent: 'bg-brand',
    },
    {
      label: 'Con acceso a apps',
      value: stats.conAcceso,
      sub: 'usuarios con login',
      icon: 'check',
      href: '/usuarios?soloUsuarios=1',
      accent: 'bg-black',
    },
    {
      label: 'Pendientes de marcaje',
      value: stats.pendientesMarcaje,
      sub: 'sin enrolar en el reloj',
      icon: 'reloj',
      href: '/marcaje',
      accent: stats.pendientesMarcaje > 0 ? 'bg-ds-red' : 'bg-ds-gray-500',
    },
    {
      label: 'Cuadrillas activas',
      value: stats.cuadrillas,
      sub: 'en campo',
      icon: 'cuadrillas',
      href: '/cuadrillas',
      accent: 'bg-ds-gray-500',
    },
  ];

  const quickActions = [
    { href: '/usuarios/nuevo', label: 'Crear colaborador',     icon: 'user',       minLevel: 2 },
    { href: '/roles',          label: 'Gestionar roles',       icon: 'rol',        minLevel: 4 },
    { href: '/cuadrillas',     label: 'Gestionar cuadrillas',  icon: 'cuadrillas', minLevel: 2 },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in">
      {/* Welcome */}
      <div>
        <h1 className="text-3xl sm:text-4xl font-bold text-black tracking-tight">
          Hola, {session?.nombre.split(' ')[0]}
        </h1>
        <p className="text-ds-gray-400 mt-1.5 text-body">Control de personal, accesos y marcaje de Adelante.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(card => (
          <Link key={card.label} href={card.href} className="group block">
            <div className="bg-white rounded-ds-lg border border-ds-gray-200 p-5 shadow-ds-01 hover:shadow-ds-03 transition-all duration-200 hover:-translate-y-0.5">
              <div className="flex items-start justify-between mb-4">
                <div className={`w-10 h-10 rounded-ds ${card.accent} flex items-center justify-center shadow-ds-02`}>
                  <Icon name={card.icon} size="md" color="currentColor" className={card.accent === 'bg-brand' ? 'text-black' : 'text-white'} />
                </div>
                <Icon name="arrow-right" size="sm" color="currentColor" className="text-ds-gray-300 group-hover:text-black transition-colors mt-1" />
              </div>
              <div className="text-3xl sm:text-4xl font-bold text-black mb-1">{card.value}</div>
              <div className="text-sm font-semibold text-black">{card.label}</div>
              <div className="text-xs text-ds-gray-400 mt-0.5">{card.sub}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick actions + Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick actions */}
        <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5">
          <h2 className="font-bold text-black mb-4 text-sub-sm">Acciones rápidas</h2>
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
                    <Icon name={icon} size="sm" color="currentColor" className="text-ds-gray-500 group-hover:text-black" />
                  </div>
                  <span className="text-sm font-semibold text-black">{label}</span>
                  <Icon name="arrow-right" size="sm" color="currentColor" className="text-ds-gray-300 group-hover:text-black ml-auto transition-colors" />
                </Link>
              ))}
          </div>
        </div>

        {/* Recent activity */}
        <div className="lg:col-span-2 bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5">
          <h2 className="font-bold text-black mb-4 text-sub-sm">Actividad reciente</h2>
          {stats.actividad.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-ds-gray-300">
              <Icon name="boleta" size="lg" color="currentColor" className="mb-2" />
              <span className="text-sm">Sin actividad registrada</span>
            </div>
          ) : (
            <div className="space-y-3">
              {stats.actividad.map((a: Record<string, unknown>, i: number) => {
                const cfg = accionLabels[String(a.Accion)] ?? { label: accionLegible(String(a.Accion)), cls: 'bg-ds-gray-100 text-ds-gray-500' };
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-ds text-xs font-semibold shrink-0 ${cfg.cls}`}>
                      {cfg.label}
                    </span>
                    <span className="text-sm font-semibold text-black flex-1 min-w-0 truncate">{String(a.Actor)}</span>
                    <span className="text-xs text-ds-gray-300 shrink-0">
                      {new Date(String(a.FechaAccion)).toLocaleString('es-CR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Costa_Rica' })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
