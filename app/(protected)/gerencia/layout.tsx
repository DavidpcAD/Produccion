import type { ReactNode } from 'react';
import { Barlow, Barlow_Condensed } from 'next/font/google';
// Mini design-system PROPIO del tablero de Gerencia (app "KPI Adelante" de
// Marcos). Igual que Mantenimiento con el DS de Steven: Next lo carga SOLO en
// /gerencia/*, todo scopeado bajo `.kpi-app`, sin tocar el resto de Produccion.
import '@/components/gerencia/kpi.css';

// Tipografía estilo Nike Run Club: Barlow Condensed (negra, itálica) para los
// títulos y números; Barlow para el cuerpo. next/font las auto-hospeda y las
// expone como variables CSS que consume kpi.css.
const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-barlow',
  display: 'swap',
});
const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700', '800', '900'],
  style: ['normal', 'italic'],
  variable: '--font-barlow-cond',
  display: 'swap',
});

export default function GerenciaLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`kpi-app ${barlow.variable} ${barlowCondensed.variable}`}>
      {children}
    </div>
  );
}
