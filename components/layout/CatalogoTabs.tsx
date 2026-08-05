'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Pestañas del "catálogo de obra": Partidas/subpartidas, Tipos de casa y Sprints
// comparten el mismo catálogo (pro_obc), así que se navegan como una sola sección.
// Se muestra arriba de /partidas, /avance/tipos-casa y /avance/sprints.
const TABS = [
  { href: '/partidas', label: 'Partidas y subpartidas' },
  { href: '/avance/tipos-casa', label: 'Tipos de casa' },
  { href: '/avance/sprints', label: 'Sprints y semanas' },
];

export function CatalogoTabs() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-1 w-fit">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + '/');
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={
              'rounded-ds px-3.5 py-1.5 text-sm font-semibold transition-colors ' +
              (active
                ? 'bg-black text-white'
                : 'text-ds-gray-500 hover:bg-ds-gray-100 hover:text-ds-ink')
            }
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
