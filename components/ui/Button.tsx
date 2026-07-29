'use client';
import { forwardRef, ButtonHTMLAttributes, ReactNode, useRef, useState } from 'react';
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
  'relative inline-flex items-center justify-center gap-2 font-semibold rounded-ds-lg transition-colors duration-100 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:bg-ds-gray-200 disabled:text-ds-gray-300 disabled:shadow-none disabled:border-transparent';

const variants: Record<Variant, string> = {
  primary:   'bg-brand text-black hover:bg-brand-200 focus-visible:ring-brand shadow-ds-03',
  secondary: 'bg-black text-white hover:bg-ds-gray-500 focus-visible:ring-black shadow-ds-03',
  outline:   'border-2 border-black text-black bg-transparent hover:bg-black hover:text-white focus-visible:ring-black',
  danger:    'bg-ds-red text-white hover:bg-ds-red-200 focus-visible:ring-ds-red shadow-ds-03',
  ghost:     'bg-transparent text-black hover:bg-ds-gray-100 focus-visible:ring-black',
};

const sizes: Record<Size, string> = {
  xs: 'px-4 py-2 text-xs rounded-ds',
  sm: 'px-5 py-2.5 text-sm',
  md: 'px-6 py-3 text-sm',
  lg: 'px-7 py-3.5 text-body',
};

// Halo del DS (Figma): color del stroke por variante durante el press.
const haloColor: Record<Variant, string> = {
  primary:   'rgb(136, 160, 36)',
  secondary: 'rgba(0, 0, 0, 0.8)',
  outline:   'rgba(0, 0, 0, 0.8)',
  danger:    'rgb(201, 108, 108)',
  ghost:     'rgb(235, 235, 235)',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, icon, iconRight, className = '', children, disabled, onPointerDown, ...rest }, ref) => {
    const [pressed, setPressed] = useState(false);
    const cancelled = useRef(false);
    const off = disabled || loading;

    return (
      <motion.button
        ref={ref}
        disabled={off}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        whileTap={{ scale: off ? 1 : 0.97 }}
        transition={springs.snappy}
        style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
        onPointerDown={(e) => {
          if (!off) { cancelled.current = false; setPressed(true); haptic.select(); }
          onPointerDown?.(e as React.PointerEvent<HTMLButtonElement>);
        }}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => { if (pressed) { cancelled.current = true; setPressed(false); } }}
        onPointerCancel={() => { cancelled.current = true; setPressed(false); }}
        {...(rest as React.ComponentProps<typeof motion.button>)}
      >
        {loading ? (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : icon ? (
          <span className="shrink-0 flex items-center">{icon}</span>
        ) : null}
        {children}
        {iconRight && !loading && <span className="shrink-0 flex items-center">{iconRight}</span>}

        {!off && (
          <span
            aria-hidden
            style={{
              position: 'absolute', inset: -6, borderRadius: 20,
              border: `6px solid ${haloColor[variant]}`, pointerEvents: 'none',
              opacity: pressed ? 1 : 0,
              transition: pressed ? 'opacity 80ms ease-out' : 'opacity 180ms ease-out 120ms',
            }}
          />
        )}
      </motion.button>
    );
  }
);
Button.displayName = 'Button';
