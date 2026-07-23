import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
  title: 'Foundations / Colores',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: 'Paleta de colores del sistema de diseño Losa Flotante.',
      },
    },
  },
};

export default meta;

const PALETTE = [
  { name: 'brand',       hex: '#ADD010', token: 'bg-brand',        dark: false, desc: 'Verde lima primario' },
  { name: 'brand-200',   hex: '#88A024', token: 'bg-brand-200',    dark: true,  desc: 'Verde lima hover' },
  { name: 'black',       hex: '#000000', token: 'bg-black',        dark: true,  desc: 'Negro puro — sidebar, textos' },
  { name: 'ds-gray-500', hex: '#5D636C', token: 'bg-ds-gray-500',  dark: true,  desc: 'Gris oscuro — texto secundario' },
  { name: 'ds-gray-400', hex: '#747B86', token: 'bg-ds-gray-400',  dark: true,  desc: 'Gris medio — subtextos' },
  { name: 'ds-gray-300', hex: '#AAAFB6', token: 'bg-ds-gray-300',  dark: false, desc: 'Gris claro — placeholders' },
  { name: 'ds-gray-200', hex: '#D9D9D9', token: 'bg-ds-gray-200',  dark: false, desc: 'Borde por defecto' },
  { name: 'ds-gray-100', hex: '#EBEBEB', token: 'bg-ds-gray-100',  dark: false, desc: 'Fondo hover, thead' },
  { name: 'ds-bg',       hex: '#F3F3F3', token: 'bg-ds-bg',        dark: false, desc: 'Fondo de página' },
  { name: 'ds-red',      hex: '#C96C6C', token: 'bg-ds-red',       dark: true,  desc: 'Error / peligro' },
  { name: 'ds-yellow',   hex: '#F0C802', token: 'bg-ds-yellow',    dark: false, desc: 'Advertencia' },
];

function Swatch({ name, hex, token, dark, desc }: typeof PALETTE[0]) {
  return (
    <div className="rounded-ds-lg overflow-hidden border border-ds-gray-200 shadow-ds-01">
      <div
        className="h-20 w-full flex items-end px-3 pb-2"
        style={{ background: hex }}
      >
        <span
          className="font-mono text-xs font-semibold opacity-70"
          style={{ color: dark ? '#fff' : '#000' }}
        >
          {hex}
        </span>
      </div>
      <div className="bg-white px-3 py-2.5">
        <p className="font-semibold text-sm text-black">{name}</p>
        <p className="text-xs text-ds-gray-400 mt-0.5">{desc}</p>
        <code className="text-xs text-ds-gray-500 mt-1 block">{token}</code>
      </div>
    </div>
  );
}

export const Paleta: StoryObj = {
  name: 'Paleta completa',
  render: () => (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {PALETTE.map(c => <Swatch key={c.hex} {...c} />)}
    </div>
  ),
};

export const Primarios: StoryObj = {
  name: 'Colores primarios',
  render: () => (
    <div className="flex flex-wrap gap-4">
      {PALETTE.filter(c => ['brand', 'black', 'ds-red', 'ds-yellow'].includes(c.name))
        .map(c => <Swatch key={c.hex} {...c} />)}
    </div>
  ),
};

export const Grises: StoryObj = {
  name: 'Escala de grises',
  render: () => (
    <div className="flex flex-wrap gap-4">
      {PALETTE.filter(c => c.name.startsWith('ds-gray') || c.name === 'ds-bg' || c.name === 'black')
        .map(c => <Swatch key={c.hex} {...c} />)}
    </div>
  ),
};
