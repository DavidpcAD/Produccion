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

interface NavItemDef {
  href: string;
  label: string;
  icon: IconName;
  minLevel?: number;
}

const navItems: NavItemDef[] = [
  { href: '/',          label: 'Dashboard',     icon: 'home',      minLevel: 1 },
  { href: '/usuarios',  label: 'Colaboradores', icon: 'user',      minLevel: 1 },
  { href: '/proyectos', label: 'Proyectos',     icon: 'folder',    minLevel: 2 },
  { href: '/obras',     label: 'Obras',         icon: 'place',     minLevel: 2 },
  { href: '/cuadrillas',label: 'Cuadrillas',    icon: 'cuadrillas',minLevel: 2 },
  { href: '/partidas',  label: 'Partidas',      icon: 'calculator', minLevel: 4 },
  { href: '/presupuesto',label: 'Presupuesto',   icon: 'boleta',    minLevel: 2 },
  { href: '/avance',    label: 'Avance de obra', icon: 'completado', minLevel: 2 },
  { href: '/concreto',  label: 'Concreto',      icon: 'traslado',  minLevel: 2 },
  { href: '/compras/aprobacion', label: 'Aprobación OC', icon: 'rol',    minLevel: 2 },
  { href: '/utilidades',label: 'Utilidades',    icon: 'calculator', minLevel: 2 },
  { href: '/reporte-h4',label: 'Reporte H4',    icon: 'reloj',     minLevel: 2 },
  { href: '/roles',     label: 'Roles',         icon: 'rol',       minLevel: 4 },
  { href: '/apps',      label: 'Apps',          icon: 'list',      minLevel: 4 },
  { href: '/auditoria', label: 'Auditoría',     icon: 'boleta',    minLevel: 2 },
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
            transition={springs.settling}
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
              transition={springs.settling}
            >
              <p className="text-white font-bold text-sm leading-tight whitespace-nowrap">Adelante</p>
              <p className="text-white/40 text-xs whitespace-nowrap">Desarrollos</p>
            </motion.div>
          )}
        </AnimatePresence>

        {onClose && (
          <button onClick={onClose} className="app-sidebar__toggle lg:hidden shrink-0 ml-auto" aria-label="Cerrar menú">
            <Icon name="close" size="sm" color="currentColor" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className={`app-nav flex-1 px-3 py-2 space-y-1 overflow-y-auto overflow-x-hidden${collapsed ? ' app-nav--collapsed' : ''}`}>
        {navItems
          .filter(item => !item.minLevel || nivelAdmin >= item.minLevel)
          .map(item => (
            <NavItem
              key={item.href}
              item={item}
              active={isActive(item.href)}
              collapsed={collapsed}
              onNavigate={onClose}
            />
          ))}
      </nav>

      {/* Logout */}
      <div className="app-sidebar__footer px-3 py-4 shrink-0 space-y-1">
        <form action="/api/auth/logout" method="POST">
          <motion.button
            type="submit"
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
                  transition={springs.settling}
                >
                  Salir
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </form>
      </div>
    </div>
  );
}
