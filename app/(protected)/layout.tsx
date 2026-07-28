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
  const [navExpanded, setNavExpanded] = useState(false);
  const session = useSession();
  const pathname = usePathname();

  const nivelAdmin = session?.nivelAdmin ?? 0;
  const nombre = session ? `${session.nombre}` : 'Cargando...';
  const iniciales = session ? getInitials(nombre) : '?';
  const nivelLabel =
    nivelAdmin === 4 ? 'Super Admin' :
    nivelAdmin === 3 ? 'Admin TI' :
    nivelAdmin === 2 ? 'Jefe de Área' : 'Usuario';

  return (
    <div className="flex h-full min-h-screen bg-ds-bg">
      {/* Desktop sidebar — riel de íconos que se expande al pasar el mouse.
          El wrapper anima su ancho (76↔264) y EMPUJA el contenido (no lo tapa). */}
      <motion.div
        className="hidden lg:block lg:shrink-0 overflow-hidden"
        onMouseEnter={() => setNavExpanded(true)}
        onMouseLeave={() => setNavExpanded(false)}
        initial={false}
        animate={{ width: navExpanded ? 264 : 76 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        <Sidebar nivelAdmin={nivelAdmin} collapsed={!navExpanded} />
      </motion.div>

      {/* Mobile sidebar */}
      <MobileNav
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        nivelAdmin={nivelAdmin}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar (todas las resoluciones): menú en móvil + usuario a la derecha */}
        <header className="flex items-center gap-3 px-4 lg:px-6 h-14 lg:h-16 bg-white border-b border-ds-gray-200 shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 rounded-full text-ds-gray-400 hover:text-black hover:bg-ds-gray-100 transition-colors"
            aria-label="Abrir menú"
          >
            <Icon name="menu" size="md" color="currentColor" />
          </button>
          <div className="lg:hidden flex items-center gap-2">
            <div className="w-7 h-7 rounded-ds bg-black flex items-center justify-center text-brand">
              <AdelanteMark className="w-4 h-auto" />
            </div>
            <span className="font-bold text-black text-sm">Adelante</span>
          </div>

          {/* Chip de usuario */}
          <div className="ml-auto flex items-center gap-2.5 rounded-full bg-black text-white pl-1.5 pr-4 py-1.5 shadow-ds-01">
            <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-black text-xs font-bold shrink-0">
              {iniciales}
            </div>
            <div className="leading-tight min-w-0">
              <p className="text-sm font-semibold truncate max-w-[180px]">{nombre}</p>
              <p className="text-[11px] text-white/50 truncate">{nivelLabel}</p>
            </div>
          </div>
        </header>

        {/* Page content — transición SOLO de opacidad (sin translate): animar transform
            hace que el navegador rasterice y el texto se vea borroso/"pixeleado" durante
            el cambio de ruta. Un fade corto con tween mantiene el texto nítido. */}
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
