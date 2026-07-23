'use client';
import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, XCircle, Warning, Info } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'motion/react';
import { springs } from '@/lib/springs';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastCtx {
  toast: (msg: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastCtx>({ toast: () => {} });

const configs: Record<ToastType, { bg: string; Icon: React.ElementType }> = {
  success: { bg: 'bg-black text-white',           Icon: CheckCircle },
  error:   { bg: 'bg-ds-red text-white',           Icon: XCircle },
  warning: { bg: 'bg-ds-yellow text-black',        Icon: Warning },
  info:    { bg: 'bg-ds-gray-500 text-white',      Icon: Info },
};

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++counter;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence initial={false}>
          {toasts.map(t => {
            const { bg, Icon } = configs[t.type];
            return (
              <motion.div
                key={t.id}
                className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-ds-lg shadow-ds-03 text-sm font-semibold ${bg}`}
                initial={{ opacity: 0, x: 40, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, scale: 0.95 }}
                transition={springs.completing}
                layout
              >
                <Icon size={18} weight="bold" className="shrink-0" />
                {t.message}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

