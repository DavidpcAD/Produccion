'use client';
import { Sidebar } from './Sidebar';

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
  nivelAdmin: number;
}

export function MobileNav({ open, onClose, nivelAdmin }: MobileNavProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative h-full w-64">
        <Sidebar nivelAdmin={nivelAdmin} onClose={onClose} />
      </div>
    </div>
  );
}
