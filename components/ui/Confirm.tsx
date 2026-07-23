'use client';
import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { ConfirmModal } from './Modal';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}
type ConfirmFn = (opts: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

// Reemplazo del confirm() nativo con el diseño de la app. Uso:
//   const confirm = useConfirm();
//   if (!(await confirm({ message: '¿Eliminar?', danger: true }))) return;
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({ message: '' });
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((optsOrMsg) => {
    setOpts(typeof optsOrMsg === 'string' ? { message: optsOrMsg } : optsOrMsg);
    setOpen(true);
    return new Promise<boolean>(res => { resolver.current = res; });
  }, []);

  const settle = (val: boolean) => {
    setOpen(false);
    resolver.current?.(val);
    resolver.current = null;
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmModal
        open={open}
        onClose={() => settle(false)}
        onConfirm={() => settle(true)}
        title={opts.title ?? 'Confirmar acción'}
        message={opts.message}
        confirmLabel={opts.confirmLabel ?? 'Aceptar'}
        danger={opts.danger}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
