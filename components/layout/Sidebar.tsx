'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SignOut } from '@phosphor-icons/react';
import { Icon, IconName } from '@/components/ds/Icon/Icon';
import { AdelanteMark } from '@/components/ds/AdelanteMark/AdelanteMark';
import { haptic } from '@/components/ds/haptic';
import { springs } from '@/lib/springs';
import { useConfirm } from '@/components/ui/Confirm';

interface NavItemDef {
  href: string;
  label: string;
  icon: IconName;
  minLevel?: number;
  // Sección con submenú: al estar dentro de `section`, se despliegan `children`.
  section?: string;
  exact?: boolean;
  children?: { href: string; label: string; exact?: boolean }[];
}

const navItems: NavItemDef[] = [
  { href: '/',          label: 'Dashboard',     icon: 'home',      minLevel: 1 },
  // Colaboradores se administran ahora en Recursos Humanos (rh.adelante.cr).
  // En Producción se asignan a la obra desde Cuadrillas.
  { href: '/proyectos', label: 'Proyectos',     icon: 'folder',    minLevel: 2 },
  { href: '/obras',     label: 'Obras',         icon: 'place',     minLevel: 2 },
  { href: '/cuadrillas',label: 'Cuadrillas',    icon: 'cuadrillas',minLevel: 2 },
  { href: '/partidas',  label: 'Partidas',      icon: 'calculator', minLevel: 4 },
  { href: '/presupuesto',label: 'Presupuesto',   icon: 'boleta',    minLevel: 2 },
  {
    href: '/avance', label: 'Avance de obra', icon: 'completado', minLevel: 2,
    section: '/avance',
    children: [
      { href: '/avance', label: 'Obras / Matriz', exact: true },
      { href: '/avance/kanban', label: 'Kanban de avance' },
      { href: '/avance/mano-obra', label: 'Mano de Obra' },
      { href: '/avance/reportes', label: 'Reportes' },
      { href: '/avance/reportes/mano-obra', label: 'Reporte M.O.' },
      { href: '/avance/reportes/pendientes', label: 'Pendientes' },
      { href: '/avance/reportes/historico', label: 'Histórico' },
      { href: '/avance/reportes/m2', label: 'M²' },
      { href: '/avance/sub-partidas', label: 'Sub-partidas' },
      { href: '/avance/tipos-casa', label: 'Tipos de casa' },
      { href: '/avance/sprints', label: 'Sprints y semanas' },
      { href: '/avance/causas', label: 'Causas' },
    ],
  },
  {
    href: '/concreto/dashboard', label: 'Concreto', icon: 'traslado', minLevel: 2,
    section: '/concreto',
    children: [
      { href: '/concreto/dashboard', label: 'Dashboard' },
      { href: '/concreto/coladas', label: 'Coladas' },
      { href: '/concreto/batches', label: 'Batches' },
      { href: '/concreto/laboratorio', label: 'Laboratorio' },
      { href: '/concreto/esclerometro', label: 'Esclerómetro' },
      { href: '/concreto/importaciones', label: 'Importaciones' },
      { href: '/concreto/config', label: 'Configuración' },
    ],
  },
  {
    href: '/compras/ingenieria/dashboard', label: 'Órdenes de Compra', icon: 'entrega', minLevel: 4,
    section: '/compras/ingenieria',
    children: [
      { href: '/compras/ingenieria/dashboard', label: 'Dashboard' },
      { href: '/compras/ingenieria', label: 'Mis solicitudes', exact: true },
      { href: '/compras/ingenieria/devoluciones', label: 'Devoluciones' },
      { href: '/compras/ingenieria/matriz', label: 'Matriz' },
      { href: '/compras/ingenieria/seguimiento', label: 'Seguimiento' },
      { href: '/compras/ingenieria/clasificaciones', label: 'Clasificaciones' },
      { href: '/compras/ingenieria/plantillas', label: 'Plantillas' },
      { href: '/compras/ingenieria/inventarios', label: 'Inventarios' },
    ],
  },
  { href: '/compras/aprobacion', label: 'Aprobación OC', icon: 'rol',    minLevel: 4 },
  {
    href: '/desembolsos/dashboard', label: 'Desembolsos', icon: 'boleta', minLevel: 2,
    section: '/desembolsos',
    children: [
      { href: '/desembolsos/dashboard', label: 'Dashboard' },
      { href: '/desembolsos/matriz', label: 'Matriz' },
      { href: '/desembolsos/movimientos', label: 'Movimientos' },
      { href: '/desembolsos/credito-puente', label: 'Crédito Puente' },
      { href: '/desembolsos/distribucion', label: 'Distribución' },
      { href: '/desembolsos/esquemas', label: 'Esquemas' },
      { href: '/desembolsos/catalogo-hitos', label: 'Catálogo de hitos' },
      { href: '/desembolsos/formalizacion', label: 'Formalización' },
      { href: '/desembolsos/valoracion', label: 'Valoración' },
      { href: '/desembolsos/extras', label: 'Extras' },
      { href: '/desembolsos/reportes', label: 'Reportes' },
    ],
  },
  { href: '/utilidades',label: 'Utilidades',    icon: 'calculator', minLevel: 2 },
  { href: '/reporte-h4',label: 'Reporte H4',    icon: 'reloj',     minLevel: 2 },
  // Roles, Apps y Auditoría se administran ahora en Recursos Humanos (rh.adelante.cr).
];

/** Item de navegación con la interacción del DS (halo + haptic + press). */
function NavItem({
  item, active, collapsed, onNavigate,
}: { item: NavItemDef; active: boolean; collapsed: boolean; onNavigate?: () => void }) {
  const [pressed, setPressed] = useState(false);
  const cancelled = useRef(false);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={`app-nav__item${active ? ' app-nav__item--active' : ''}${collapsed ? ' app-nav__item--collapsed' : ''}`}
      style={{ position: 'relative', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        cancelled.current = false;
        setPressed(true);
        haptic.select();
      }}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => { if (pressed) { cancelled.current = true; setPressed(false); } }}
      onPointerCancel={() => { cancelled.current = true; setPressed(false); }}
    >
      <span className="app-nav__icon">
        <Icon name={item.icon} size="md" color="currentColor" />
      </span>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.span
            className="app-nav__label"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
      <span
        aria-hidden
        style={{
          position: 'absolute', inset: -6, borderRadius: 999,
          border: '6px solid rgba(255,255,255,0.16)', pointerEvents: 'none',
          opacity: pressed ? 1 : 0,
          transition: pressed ? 'opacity 80ms ease-out' : 'opacity 180ms ease-out 120ms',
        }}
      />
    </Link>
  );
}

interface SidebarProps {
  nivelAdmin: number;
  onClose?: () => void;
  /** Controlado desde el layout: riel (true) o expandido (false). El hover y la
   *  animación de ancho los maneja el wrapper del layout, que EMPUJA el
   *  contenido (no lo tapa). */
  collapsed?: boolean;
}

export function Sidebar({ nivelAdmin, onClose, collapsed = false }: SidebarProps) {
  const pathname = usePathname();
  const confirm = useConfirm();
  const logoutRef = useRef<HTMLFormElement>(null);

  // Salir con confirmación (diálogo del DS) antes del POST de logout.
  const pedirSalir = async () => {
    const ok = await confirm({
      title: 'Cerrar sesión',
      message: '¿Seguro que querés cerrar la sesión?',
      confirmLabel: 'Cerrar sesión',
      danger: true,
    });
    if (ok) logoutRef.current?.requestSubmit();
  };

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <div
      className="app-sidebar flex flex-col h-full w-full select-none overflow-hidden"
    >
      {/* Logo + toggle (arriba). Se mantiene SIEMPRE en fila (solo se centra el logo
          al colapsar): si se cambiara a flex-col, el texto que aún se está
          desmontando se apila bajo el logo, agranda el alto del header y empuja los
          íconos del nav hacia abajo hasta que termina la salida (el "salto" feo). */}
      <div className={`shrink-0 px-4 py-5 flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-9 h-9 rounded-ds-lg bg-brand flex items-center justify-center shrink-0 shadow-ds-02 text-black">
          <AdelanteMark className="w-5 h-auto" />
        </div>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              className="flex-1 min-w-0"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <p className="text-white font-bold text-sm leading-tight whitespace-nowrap">Adelante</p>
              <p className="text-white/40 text-xs whitespace-nowrap">Desarrollos</p>
            </motion.div>
          )}
        </AnimatePresence>

        {onClose && (
          <button onClick={onClose} className="app-sidebar__toggle shrink-0 ml-auto" aria-label="Cerrar menú">
            <Icon name="close" size="sm" color="currentColor" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className={`app-nav no-scrollbar flex-1 px-3 py-2 space-y-1 overflow-y-auto overflow-x-hidden${collapsed ? ' app-nav--collapsed' : ''}`}>
        {navItems
          .filter(item => !item.minLevel || nivelAdmin >= item.minLevel)
          .map(item => {
            const sectionActive = item.section ? pathname.startsWith(item.section) : isActive(item.href);
            return (
              <div key={item.href}>
                <NavItem
                  item={item}
                  active={sectionActive}
                  collapsed={collapsed}
                  onNavigate={onClose}
                />
                {/* Submenú: al estar dentro de la sección (y con el sidebar expandido)
                    se muestran los subitems, como una subcolumna. */}
                {item.children && sectionActive && !collapsed && (
                  <div className="mt-0.5 mb-1 ml-5 pl-3 border-l border-white/10 space-y-0.5">
                    {item.children.map(child => {
                      const childActive = child.exact
                        ? pathname === child.href
                        : (pathname === child.href || pathname.startsWith(child.href + '/'));
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={onClose}
                          aria-current={childActive ? 'page' : undefined}
                          className={`block px-3 py-1.5 rounded-ds text-sm transition-colors ${
                            childActive ? 'text-brand font-semibold bg-brand/10' : 'text-white/55 hover:text-white hover:bg-white/[0.06]'
                          }`}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
      </nav>

      {/* Logout */}
      <div className="app-sidebar__footer px-3 py-4 shrink-0 space-y-1">
        <form ref={logoutRef} action="/api/auth/logout" method="POST" className="hidden" />
        <motion.button
          type="button"
          onClick={pedirSalir}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          className={`app-nav__item app-nav__item--logout w-full${collapsed ? ' app-nav__item--collapsed' : ''}`}
          whileTap={{ scale: 0.97 }}
          transition={springs.snappy}
        >
          <span className="app-nav__icon">
            <SignOut size={20} weight="bold" />
          </span>
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                className="app-nav__label"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                Salir
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  );
}
