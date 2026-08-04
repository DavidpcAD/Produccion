'use client';
import { InputHTMLAttributes, forwardRef, SelectHTMLAttributes, useState } from 'react';
import { Eye, EyeSlash } from '@phosphor-icons/react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftIcon, rightElement, className = '', id, type, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    // Para campos de contraseña se agrega automáticamente un botón "ver/ocultar"
    // (a menos que ya se pase un rightElement propio).
    const [reveal, setReveal] = useState(false);
    const isPassword = type === 'password';
    const effectiveType = isPassword && reveal ? 'text' : type;
    const right = rightElement ?? (isPassword ? (
      <button type="button" tabIndex={-1} onClick={() => setReveal(r => !r)}
        aria-label={reveal ? 'Ocultar contraseña' : 'Ver contraseña'}
        className="text-ds-gray-400 hover:text-ds-ink transition-colors">
        {reveal ? <EyeSlash size={18} weight="bold" /> : <Eye size={18} weight="bold" />}
      </button>
    ) : null);
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-ds-ink">
            {label}
            {props.required && <span className="text-ds-red ml-0.5">*</span>}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 flex items-center pl-5 pointer-events-none text-ds-gray-400">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            type={effectiveType}
            className={`
              w-full h-12 rounded-ds-xl bg-ds-surface text-ds-ink placeholder-ds-gray-300
              text-body-sm transition-all duration-150 font-normal
              border-2 shadow-ds-01
              focus:outline-none focus:border-black focus:shadow-none
              disabled:bg-ds-gray-100 disabled:text-ds-gray-400 disabled:cursor-not-allowed disabled:border-transparent disabled:shadow-none
              ${error
                ? 'border-ds-red focus:border-ds-red'
                : 'border-transparent'
              }
              ${leftIcon ? 'pl-12' : 'pl-5'}
              ${right ? 'pr-12' : 'pr-5'}
              ${className}
            `}
            {...props}
          />
          {right && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-4">
              {right}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-ds-red font-medium pl-1">{error}</p>}
        {hint && !error && <p className="text-xs text-ds-gray-400 pl-1">{hint}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: { value: string | number; label: string }[];
  placeholder?: string;
}

export function Select({ label, error, hint, options, placeholder, className = '', id, ...props }: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-ds-ink">
          {label}
          {props.required && <span className="text-ds-red ml-0.5">*</span>}
        </label>
      )}
      <select
        id={selectId}
        className={`
          w-full h-12 rounded-ds-xl bg-ds-surface text-ds-ink text-body-sm px-5 transition-all duration-150 font-normal
          border-2 shadow-ds-01
          focus:outline-none focus:border-black focus:shadow-none
          disabled:bg-ds-gray-100 disabled:cursor-not-allowed disabled:border-transparent disabled:shadow-none
          ${error ? 'border-ds-red' : 'border-transparent'}
          ${className}
        `}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {error && <p className="text-xs text-ds-red font-medium pl-1">{error}</p>}
      {hint && !error && <p className="text-xs text-ds-gray-400 pl-1">{hint}</p>}
    </div>
  );
}
