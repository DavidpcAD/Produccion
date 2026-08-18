'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { SignOut } from '@phosphor-icons/react';
import { Icon, IconName } from '@/components/ds/Icon/Icon';
import { AdelanteMark } from '@/components/ds/AdelanteMark/AdelanteMark';
import { haptic } from '@/components/ds/haptic';
import { springs } from '@/lib/springs';
import { useConfirm } from '@/components/ui/Confirm';
import { getRouteModule } from '@/lib/permissions';

const THEME_KEY = 'adelante_oc_theme';

const IconMoon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);
const IconSun = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

interface NavItemDef {
  href: string;
  label: string;
  icon: IconName;
  minLevel?: number;
  section?: string;
  exact?: boolean;
  children?: { href: string; label: string; exact?: boolean }[];
}

const navItems: NavItemDef[] = [
  { href: '/',          label: 'Dashboard',     icon: 'home',      minLevel: 1 },
  { href: '/proyectos', label: 'Proyectos',     icon: 'folder',    minLevel: 2 },
  { href: '/obras',     label: 'Obras',         icon: 'place',     minLevel: 2 },
  { href: '/cuadrillas',label: 'Cuadrillas',    icon: 'cuadrillas',minLevel: 2 },
  { href: '/partidas',  label: 'Partidas',      icon: 'calculator', minLevel: 4 },
  { href: '/presupuesto',label: 'Presupuesto',   icon: 'boleta',    minLevel: 2 },
  {
    href: '/bc/integracion', label: 'Business Central', icon: 'traslado', minLevel: 2,
    section: '/bc',
    children: [
      { href: '/bc/integracion', label: 'Integración BC' },
      { href: '/bc/presupuestos', label: 'Presupuestos por obra' },
    ],
  },
  {
    href: '/avance', label: 'Avance de obra', icon: 'completado', minLevel: 2,
    section: '/avance',
    children: [
      // Una sola entrada: la página /avance ya trae el toggle Lista/Matriz/Kanban.
      { href: '/avance', label: 'Obras', exact: true },
      { href: '/avance/mano-obra', label: 'Mano de Obra' },
      // `exact` para que estar en un sub-reporte (/avance/reportes/m2, …) NO marque
      // también "Reportes" (antes se resaltaban los dos).
      { href: '/avance/reportes', label: 'Reportes', exact: true },
      { href: '/avance/reportes/mano-obra', label: 'Reporte M.O.' },
      { href: '/avance/reportes/pendientes', label: 'Pendientes' },
      { href: '/avance/reportes/historico', label: 'Histórico' },
      { href: '/avance/reportes/m2', label: 'M²' },
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
    href: '/compras/ingenieria', label: 'Órdenes de Compra', icon: 'entrega', minLevel: 4,
    section: '/compras/ingenieria',
    children: [
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
];

interface SidebarProps {
  nivelAdmin: number;
  nombre: string;
  iniciales: string;
  rol: string;
  /** Abierto (pinned, desktop) — controla submenús. Los labels los muestra el CSS. */
  pinned: boolean;
  /** Drawer abierto (móvil). */
  navOpen: boolean;
  onTogglePinned: () => void;
  onCloseDrawer: () => void;
  /** Al navegar (cierra el drawer en móvil). */
  onNavigate: () => void;
  /** Módulos que el rol de Producción habilita. null = sin rol de Producción
   *  (se cae al filtro por nivel de siempre, no deja a nadie sin menú). */
  allowedModules?: string[] | null;
}

export function Sidebar({ nivelAdmin, nombre, iniciales, rol, pinned, navOpen, onTogglePinned, onCloseDrawer, onNavigate, allowedModules }: SidebarProps) {
  const pathname = usePathname();
  const confirm = useConfirm();
  const logoutRef = useRef<HTMLFormElement>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [devol, setDevol] = useState<{ pedidosDevueltos: number; ordenesRechazadas: number } | null>(null);

  useEffect(() => {
    setTheme((document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light');
  }, []);

  // Conteo de devoluciones para el badge de la nav (la Sidebar está fuera del store de
  // Compras, así que lo pide por API). Solo si el usuario tiene acceso a Compras.
  useEffect(() => {
    const canCompras = !allowedModules || allowedModules.includes(getRouteModule('/compras/ingenieria/devoluciones'));
    if (!canCompras) return;
    let cancel = false;
    fetch('/api/compras/devoluciones-count')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancel && d && typeof d.pedidosDevueltos === 'number') setDevol(d); })
      .catch(() => {});
    return () => { cancel = true; };
  }, [allowedModules]);
  function toggleTheme() {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
      return next;
    });
  }

  const pedirSalir = async () => {
    const ok = await confirm({
      title: 'Cerrar sesión',
      message: '¿Seguro que querés cerrar la sesión?',
      confirmLabel: 'Cerrar sesión',
      danger: true,
    });
    if (ok) logoutRef.current?.requestSubmit();
  };

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  // Los submenús (y labels) están "expandidos" con pin (desktop) o con el drawer (móvil).
  const expanded = pinned || navOpen;

  // Secciones con submenú desplegadas. Cada encabezado funciona como acordeón
  // INDEPENDIENTE: tocar Concreto abre su submenú y tocarlo de nuevo lo cierra,
  // sin afectar a los demás — se pueden tener varios abiertos a la vez. Arranca
  // con la sección activa abierta (el submenú de donde estás). Nada de esto
  // aplica al riel colapsado (solo iconos).
  const activeSection = navItems.find((it) => it.section && pathname.startsWith(it.section))?.section ?? null;
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(activeSection ? [activeSection] : []),
  );
  const lastSection = useRef<string | null>(activeSection);
  // Al navegar a otra sección, abrí su submenú SIN cerrar los que el usuario
  // dejó abiertos.
  useEffect(() => {
    if (activeSection !== lastSection.current) {
      lastSection.current = activeSection;
      if (activeSection) setOpenSections((prev) => new Set(prev).add(activeSection));
    }
  }, [activeSection]);
  const toggleSection = (section: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });

  return (
    <nav
      className={`app-nav no-scrollbar${navOpen ? ' is-open' : ''}`}
      aria-label="Secciones"
      role={navOpen ? 'dialog' : undefined}
      aria-modal={navOpen ? true : undefined}
    >
      {/* Cabecera: hamburguesa (siempre) + marca (al abrir) + X (móvil) */}
      <div className="app-nav__head">
        <button
          type="button"
          className="app-nav__burger"
          onClick={() => { onTogglePinned(); haptic.select(); }}
          aria-label={pinned ? 'Encoger menú' : 'Expandir menú'}
          title={pinned ? 'Encoger menú' : 'Expandir menú'}
          aria-pressed={pinned}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
        <Link href="/" className="app-nav__brand" title="Adelante Desarrollos" onClick={onNavigate}>
          <span className="topbar__logo"><AdelanteMark className="w-4 h-auto" /></span>
          <span className="app-nav__brand-name">Adelante</span>
        </Link>
        <button type="button" className="app-nav__close" onClick={onCloseDrawer} aria-label="Cerrar menú">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      {/* Rótulo de sección */}
      <span className="app-nav__section app-nav__label">Menú</span>

      {/* Ítems */}
      {navItems
        .filter((item) => {
          // Con rol de Producción: filtrar por módulo. Sin él (null): por nivel.
          if (allowedModules) return allowedModules.includes(getRouteModule(item.section ?? item.href));
          return !item.minLevel || nivelAdmin >= item.minLevel;
        })
        .map((item) => {
          const sectionActive = item.section ? pathname.startsWith(item.section) : isActive(item.href);
          return (
            <div key={item.href}>
              <Link
                href={item.href}
                onClick={(e) => {
                  // Encabezado con submenú = acordeón independiente. Abierto →
                  // tocarlo lo cierra (sin navegar), sin tocar los demás. Cerrado →
                  // lo abre (deja los demás abiertos) y solo navega si es OTRA
                  // sección (si ya estás en esta, solo abre el submenú, no re-navega).
                  if (item.children && expanded && item.section) {
                    if (openSections.has(item.section)) {
                      e.preventDefault();
                      toggleSection(item.section);
                      return;
                    }
                    toggleSection(item.section);
                    if (activeSection === item.section) {
                      e.preventDefault();
                      return;
                    }
                  }
                  onNavigate();
                }}
                title={item.label}
                aria-current={sectionActive ? 'page' : undefined}
                className={`app-nav__item${sectionActive ? ' is-active' : ''}`}
              >
                <span className="app-nav__ic"><Icon name={item.icon} size="md" color="currentColor" /></span>
                <span className="app-nav__label">{item.label}</span>
              </Link>
              {item.children && item.section && openSections.has(item.section) && expanded && (
                <div className="app-nav__sub">
                  {item.children.map((child) => {
                    const childActive = child.exact
                      ? pathname === child.href
                      : (pathname === child.href || pathname.startsWith(child.href + '/'));
                    const devolN = devol && child.href.includes('/devoluciones')
                      ? (child.href.includes('/proveeduria') ? devol.pedidosDevueltos + devol.ordenesRechazadas : devol.pedidosDevueltos)
                      : 0;
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={onNavigate}
                        aria-current={childActive ? 'page' : undefined}
                        className={`app-nav__subitem${childActive ? ' is-active' : ''}`}
                      >
                        {child.label}
                        {devolN > 0 && (
                          <span aria-label={`${devolN} devoluciones`} style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: 'var(--ds-color-red-200)', color: '#fff', fontSize: 11, fontWeight: 700 }}>{devolN}</span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

      {/* Pie: tema + usuario + salir */}
      <div className="app-nav__foot">
        <form ref={logoutRef} action="/api/auth/logout" method="POST" className="hidden" />
        <button
          type="button"
          className="app-nav__item app-nav__theme"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          aria-pressed={theme === 'dark'}
        >
          <span className="app-nav__ic">{theme === 'dark' ? <IconSun /> : <IconMoon />}</span>
          <span className="app-nav__label">{theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>
          <span className={`app-nav__switch${theme === 'dark' ? ' is-on' : ''} app-nav__label`} aria-hidden><i /></span>
        </button>

        <div className="app-nav__user">
          <span className="app-nav__avatar">{iniciales}</span>
          <span className="app-nav__user-meta app-nav__label">
            <span className="app-nav__user-name">{nombre}</span>
            <span className="app-nav__user-role">{rol}</span>
          </span>
          <motion.button
            type="button"
            className="app-nav__logout app-nav__label"
            title="Salir"
            onClick={pedirSalir}
            aria-label="Cerrar sesión"
            whileTap={{ scale: 0.92 }}
            transition={springs.snappy}
          >
            <SignOut size={18} weight="bold" />
          </motion.button>
        </div>
      </div>
    </nav>
  );
}
