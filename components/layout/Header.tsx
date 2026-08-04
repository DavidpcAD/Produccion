'use client';
import { List } from '@phosphor-icons/react';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onMenuToggle?: () => void;
}

export function Header({ title, subtitle, actions, onMenuToggle }: HeaderProps) {
  return (
    <div className="flex items-center gap-3 px-6 py-4 bg-ds-surface border-b border-ds-gray-200">
      {onMenuToggle && (
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-ds text-ds-gray-400 hover:bg-ds-gray-100 hover:text-ds-ink transition-colors"
        >
          <List size={20} weight="bold" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        {title && <h1 className="text-sub-sm font-bold text-ds-ink truncate">{title}</h1>}
        {subtitle && <p className="text-body-sm text-ds-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
