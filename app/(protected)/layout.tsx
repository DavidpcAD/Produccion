'use client';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Sidebar } from '@/components/layout/Sidebar';
import { useSession } from '@/hooks/useSession';
import { getInitials, getRouteModule } from '@/lib/permissions';

const NAVPIN_KEY = 'adelante_oc_navpin';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  // Binario, solo por botón: abierto (pinned, 264px) o cerrado (riel 72px). Persistido.
  const [pinned, setPinned] = useState(false);
  const [navOpen, setNavOpen] = useState(false); // drawer (móvil)
  const [ready, setReady] = useState(false);     // evita animar al cargar
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();

  // Módulos que habilita el rol de Producción del usuario (calculados en el
  // servidor con rol+tipo). null = sin rol de Producción → se usa el filtro por
  // nivel de siempre, no deja a nadie afuera.
  const allowedModules = useMemo(
    () => (session?.modules && session.modules.length ? session.modules : null),
    [session],
  );

  // Guard de página: si el rol no habilita el módulo de la ruta actual, al Dashboard.
  useEffect(() => {
    if (!session || !allowedModules) return;
    if (!allowedModules.includes(getRouteModule(pathname))) router.replace('/');
  }, [session, allowedModules, pathname, router]);

  const nivelAdmin = session?.nivelAdmin ?? 0;
  const nombre = session ? `${session.nombre}` : 'Cargando…';
  const iniciales = session ? getInitials(nombre) : '?';
  // Rótulo real del rol de Producción (nombre · tipo, ej. "Ingenieria · Electrico",
  // "Presupuestista · General"). Solo si el usuario no tiene rol de Producción se
  // cae a la etiqueta por nivel de siempre (así nadie queda sin rótulo).
  const rolPorNivel =
    nivelAdmin === 4 ? 'Super Admin' :
    nivelAdmin === 3 ? 'Admin TI' :
    nivelAdmin === 2 ? 'Jefe de Área' : 'Usuario';
  const rol = session?.rolLabel || rolPorNivel;

  const isMobile = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches;
  // Tablet (≤1024px): el menú abierto FLOTA sobre el contenido (ver globals.css),
  // así que al navegar o tocar afuera se encoge, como el drawer del móvil.
  const isTablet = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1024px)').matches;
  const cerrarAlNavegar = () => {
    if (isMobile()) setNavOpen(false);
    else if (isTablet()) setPinned(false);
  };
  const cerrarMenu = () => { setNavOpen(false); if (isTablet()) setPinned(false); };

  // Hidratar el pin (el tema ya lo fijó el script no-flash del layout raíz).
  useEffect(() => {
    try { setPinned(localStorage.getItem(NAVPIN_KEY) === '1'); } catch { /* ignore */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) try { localStorage.setItem(NAVPIN_KEY, pinned ? '1' : '0'); } catch { /* ignore */ }
  }, [pinned, ready]);
  // Cerrar el drawer al navegar (móvil).
  useEffect(() => { if (isMobile()) setNavOpen(false); }, [pathname]);
  // Escape cierra el drawer.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setNavOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  return (
    <div className={`app-shell${pinned ? ' pinned' : ''}${navOpen ? ' nav-open' : ''}${ready ? ' is-ready' : ''} bg-ds-bg`}>
      {/* Overlay: drawer en móvil, y menú flotante en tablet (en escritorio el CSS lo oculta) */}
      {(navOpen || pinned) && <div className="app-nav-overlay" onClick={cerrarMenu} aria-hidden />}

      <Sidebar
        nivelAdmin={nivelAdmin}
        nombre={nombre}
        iniciales={iniciales}
        rol={rol}
        pinned={pinned}
        navOpen={navOpen}
        onTogglePinned={() => setPinned((p) => !p)}
        onCloseDrawer={() => setNavOpen(false)}
        onNavigate={cerrarAlNavegar}
        allowedModules={allowedModules}
      />

      {/* FAB hamburguesa (solo móvil, con el drawer cerrado) */}
      {!navOpen && (
        <button
          type="button"
          className="fab fab--menu"
          onClick={() => setNavOpen(true)}
          aria-label="Abrir menú"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
      )}

      {/* Contenido */}
      <div className="app-content min-w-0" id="contenido-principal">
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={pathname}
            className="h-full overflow-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  );
}
