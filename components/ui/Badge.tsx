type BadgeVariant = 'green' | 'red' | 'orange' | 'blue' | 'purple' | 'gray' | 'yellow' | 'black';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  dot?: boolean;
  className?: string;
}

const variants: Record<BadgeVariant, string> = {
  green:  'bg-transparent text-ds-green-ink border border-brand',
  red:    'bg-transparent text-ds-red-200 border border-ds-red',
  orange: 'bg-transparent text-ds-gray-500 border border-ds-gray-200',
  blue:   'bg-white text-ds-gray-400 border border-ds-gray-200',
  purple: 'bg-white text-ds-gray-400 border border-ds-gray-200',
  gray:   'bg-white text-ds-gray-400 border border-ds-gray-200',
  yellow: 'bg-transparent text-ds-yellow-ink border border-ds-yellow',
  black:  'bg-black text-white border border-black',
};

const dotColors: Record<BadgeVariant, string> = {
  green:  'bg-brand',
  red:    'bg-ds-red',
  orange: 'bg-ds-gray-400',
  blue:   'bg-ds-gray-300',
  purple: 'bg-ds-gray-300',
  gray:   'bg-ds-gray-400',
  yellow: 'bg-ds-yellow',
  black:  'bg-white',
};

export function Badge({ variant = 'gray', children, dot, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3.5 h-7 text-[13px] font-normal ${variants[variant]} ${className}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColors[variant]}`} />}
      {children}
    </span>
  );
}

export function NivelAdminBadge({ nivel }: { nivel: number }) {
  const map: Record<number, { label: string; variant: BadgeVariant }> = {
    1: { label: 'Solo Lectura', variant: 'blue' },
    2: { label: 'Jefe Área',    variant: 'yellow' },
    3: { label: 'Admin TI',     variant: 'orange' },
    4: { label: 'Super Admin',  variant: 'black' },
  };
  const cfg = map[nivel];
  // Nivel 0 (rol sin nivel de permiso asignado) no muestra badge: evita el
  // ruido de "Sin admin" en roles que todavía no tienen permisos definidos.
  if (!cfg) return null;
  return <Badge variant={cfg.variant} dot>{cfg.label}</Badge>;
}
