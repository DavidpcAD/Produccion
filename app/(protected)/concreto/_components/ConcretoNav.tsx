'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/ds/Icon/Icon';

// Sub-navegación del módulo Concreto: Coladas | Laboratorio.
// Mismo patrón visual que el toggle de la página de Cuadrillas de la base.
const TABS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  {
    href: '/concreto',
    label: 'Coladas',
    icon: 'list',
    match: (p) => p === '/concreto' || p.startsWith('/concreto/coladas'),
  },
  {
    href: '/concreto/laboratorio',
    label: 'Laboratorio',
    icon: 'boleta',
    match: (p) => p.startsWith('/concreto/laboratorio'),
  },
];

export function ConcretoNav() {
  const pathname = usePathname();
  return (
    <div className="inline-flex gap-1 p-1 bg-ds-gray-100 rounded-full">
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`inline-flex items-center gap-2 px-5 h-11 rounded-full text-sm font-semibold transition-all ${
              active ? 'bg-black text-white shadow-ds-02' : 'text-ds-gray-400 hover:text-ds-ink'
            }`}
          >
            <Icon name={t.icon} size="sm" color="currentColor" />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
