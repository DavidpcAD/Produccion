'use client';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { useSession } from '@/hooks/useSession';
import { getInitials } from '@/lib/permissions';
import { Icon } from '@/components/ds/Icon/Icon';
import { AdelanteMark } from '@/components/ds/AdelanteMark/AdelanteMark';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Sidebar por hamburger: fija/expande (empuja el contenido) o se oculta y el
  // contenido usa todo el ancho. El botón flotante (FAB) lo vuelve a abrir.
  const [navOpen, setNavOpen] = useState(true);
  const session = useSession();
  const pathname = usePathname();

  const nivelAdmin = session?.nivelAdmin ?? 0;
  const nombre = session ? `${session.nombre}` : 'Cargando...';
  const iniciales = session ? getInitials(nombre) : '?';
  const nivelLabel =
    nivelAdmin === 4 ? 'Super Admin' :
    nivelAdmin === 3 ? 'Admin TI' :
    nivelAdmin === 2 ? 'Jefe de Área' : 'Usuario';

  const abrirMenu = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
      setNavOpen(true);
    } else {
      setMobileOpen(true);
    }
  };

  return (
    <div className="flex h-full min-h-screen bg-ds-bg">
      {/* Sidebar desktop — el hamburger la fija/expande (260px) empujando el
          contenido, o la colapsa a 0 (oculta) para dar todo el ancho. */}
      <motion.div
        className="hidden lg:block lg:shrink-0 overflow-hidden"
        initial={false}
        animate={{ width: navOpen ? 260 : 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
      >
        <div className="h-full w-[260px]">
          <Sidebar nivelAdmin={nivelAdmin} onClose={() => setNavOpen(false)} />
        </div>
      </motion.div>

      {/* Sidebar móvil (drawer superpuesto) */}
      <MobileNav
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        nivelAdmin={nivelAdmin}
      />

      {/* FAB de menú — abre el sidebar (desktop cuando está cerrado; móvil siempre).
          Se oculta en desktop cuando el sidebar ya está abierto. */}
      <button
        onClick={abrirMenu}
        aria-label="Abrir menú"
        className={`fixed top-3 left-3 z-40 w-12 h-12 rounded-ds-lg bg-black text-brand shadow-ds-03 flex items-center justify-center active:scale-95 transition-transform ${navOpen ? 'lg:hidden' : ''}`}
      >
        <Icon name="menu" size="md" color="currentColor" />
      </button>

      {/* Contenido */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-3 px-4 lg:px-6 h-14 lg:h-16 bg-white border-b border-ds-gray-200 shrink-0">
          {/* Reserva el espacio del FAB a la izquierda cuando está visible. */}
          <div className={`w-14 shrink-0 transition-all duration-200 ${navOpen ? 'lg:w-0' : 'lg:w-14'}`} />
          <div className="lg:hidden flex items-center gap-2">
            <div className="w-7 h-7 rounded-ds bg-black flex items-center justify-center text-brand">
              <AdelanteMark className="w-4 h-auto" />
            </div>
            <span className="font-bold text-black text-sm">Adelante</span>
          </div>

          {/* Chip de usuario */}
          <div className="ml-auto flex items-center gap-2.5 rounded-full bg-black text-white pl-1.5 pr-1.5 py-1.5 sm:pr-4 shadow-ds-01">
            <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-black text-body-sm font-bold shrink-0">
              {iniciales}
            </div>
            <div className="leading-tight min-w-0 hidden sm:block">
              <p className="text-body-sm font-semibold truncate max-w-[180px]">{nombre}</p>
              <p className="text-[11px] text-white/50 truncate">{nivelLabel}</p>
            </div>
          </div>
        </header>

        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={pathname}
            className="flex-1 overflow-auto"
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
