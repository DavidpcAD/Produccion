'use client';
import { forwardRef, ButtonHTMLAttributes, ReactNode, useState } from 'react';
import { motion } from 'motion/react';
import { springs } from '@/lib/springs';
import { haptic } from '@/components/ds/haptic';

type Variant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
type Size = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

const base =
  'relative inline-flex items-center justify-center gap-2 font-semibold rounded-ds-lg transition-[box-shadow,background-color,color,border-color] duration-100 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:bg-ds-gray-200 disabled:text-ds-gray-300 disabled:border-transparent';

const variants: Record<Variant, string> = {
  primary:   'bg-brand text-black hover:bg-brand-200 focus-visible:ring-brand shadow-ds-03',
  secondary: 'bg-black text-white hover:bg-ds-gray-500 focus-visible:ring-black shadow-ds-03',
  outline:   'border-2 border-black text-ds-ink bg-transparent hover:bg-black hover:text-white focus-visible:ring-black',
  danger:    'bg-ds-red text-white hover:bg-ds-red-200 focus-visible:ring-ds-red shadow-ds-03',
  ghost:     'bg-transparent text-ds-ink hover:bg-ds-gray-100 focus-visible:ring-black',
};

const sizes: Record<Size, string> = {
  xs: 'px-4 py-2 text-xs rounded-ds',
  sm: 'px-5 py-2.5 text-sm',
  md: 'px-6 py-3 text-sm',
  lg: 'px-7 py-3.5 text-body',
};

// Halo del press, tal cual .ds-btn--pressed del DS: un box-shadow con spread
// (8px, 2px en gris), apilado sobre la sombra base. Sin elementos extra.
const halo: Record<Variant, string> = {
  primary:   '0 0 0 8px var(--ds-color-green-200)',
  secondary: '0 0 0 8px var(--ds-color-black-100)',
  outline:   '0 0 0 8px var(--ds-color-black-100)',
  danger:    '0 0 0 8px var(--ds-color-red-100)',
  ghost:     '0 0 0 2px var(--ds-color-gray-100)',
};

// Variantes con relleno: llevan shadow-ds-03 y el halo se apila encima.
const elevated: Record<Variant, boolean> = {
  primary: true, secondary: true, danger: true, outline: false, ghost: false,
};

// Solo durante el press se pisa el box-shadow de la clase (así el anillo de
// focus-visible, que también es box-shadow, sigue visible en reposo).
function pressedShadow(variant: Variant) {
  return elevated[variant] ? `${halo[variant]}, var(--ds-shadow-03-big)` : halo[variant];
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, icon, iconRight, className = '', children, disabled, onPointerDown, ...rest }, ref) => {
    const [pressed, setPressed] = useState(false);
    const off = disabled || loading;

    return (
      <motion.button
        ref={ref}
        disabled={off}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        whileTap={{ scale: off ? 1 : 0.97 }}
        transition={springs.snappy}
        style={{
          WebkitTapHighlightColor: 'transparent',
          touchAction: 'manipulation',
          boxShadow: pressed && !off ? pressedShadow(variant) : undefined,
        }}
        onPointerDown={(e) => {
          if (!off) { setPressed(true); haptic.select(); }
          onPointerDown?.(e as React.PointerEvent<HTMLButtonElement>);
        }}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        {...(rest as React.ComponentProps<typeof motion.button>)}
      >
        {loading ? (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : icon ? (
          <span className="shrink-0 flex items-center">{icon}</span>
        ) : null}
        {children}
        {iconRight && !loading && <span className="shrink-0 flex items-center">{iconRight}</span>}
      </motion.button>
    );
  }
);
Button.displayName = 'Button';
