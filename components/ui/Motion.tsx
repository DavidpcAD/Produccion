'use client';
import { motion } from 'motion/react';
import { springs } from '@/lib/springs';
import type { ReactNode } from 'react';

// Variantes reutilizables para aplicar stagger a GRILLAS sin envolver en divs
// extra: el contenedor usa `listStagger` y cada item `listItem` sobre el mismo
// elemento que ya existe (motion.div con las mismas clases → no cambia layout
// ni rompe la altura pareja de la grilla).
export const listStagger = { hidden: {}, show: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } } } as const;
export const listItem = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: springs.expanding } } as const;

// Entrada escalonada para listas. `Stagger` es el contenedor; cada hijo va en
// `StaggerItem`. Pensado para listas verticales (space-y) para no romper la
// altura de grillas. Usa el vocabulario de springs del design system.
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: springs.expanding } }}
    >
      {children}
    </motion.div>
  );
}
