import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
  title: 'Foundations / Tipografía',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: 'Escala tipográfica del sistema Losa Flotante. Fuente: **Roboto** 400 / 600 / 700.',
      },
    },
  },
};

export default meta;

const SCALE = [
  { token: 'heading',  size: '32px', lh: '40px', weight: '700', label: 'Heading',  sample: 'Control de Colaboradores' },
  { token: 'sub',      size: '24px', lh: '24px', weight: '600', label: 'Sub',       sample: 'Gestión de proyectos' },
  { token: 'sub-sm',   size: '20px', lh: '24px', weight: '600', label: 'Sub SM',    sample: 'Lista de cuadrillas' },
  { token: 'body',     size: '16px', lh: '24px', weight: '400', label: 'Body',      sample: 'Información del colaborador en el sistema.' },
  { token: 'body-sm',  size: '12px', lh: '16px', weight: '400', label: 'Body SM',   sample: 'Texto de ayuda y etiquetas secundarias.' },
];

export const Escala: StoryObj = {
  name: 'Escala tipográfica',
  render: () => (
    <div className="space-y-8 max-w-2xl">
      {SCALE.map(s => (
        <div key={s.token} className="flex gap-6 items-baseline border-b border-ds-gray-100 pb-6">
          <div className="w-28 shrink-0">
            <code className="text-xs font-mono text-ds-gray-500 bg-ds-gray-100 px-2 py-1 rounded-ds">{s.token}</code>
            <p className="text-xs text-ds-gray-400 mt-1.5">{s.size} / {s.lh}</p>
            <p className="text-xs text-ds-gray-400">w{s.weight}</p>
          </div>
          <p
            className="text-black leading-normal"
            style={{ fontSize: s.size, lineHeight: s.lh, fontWeight: s.weight }}
          >
            {s.sample}
          </p>
        </div>
      ))}
    </div>
  ),
};

export const Pesos: StoryObj = {
  name: 'Pesos de fuente',
  render: () => (
    <div className="space-y-4 max-w-xl">
      {[
        { weight: '400', label: 'Regular — 400', sample: 'Texto de contenido y descripción' },
        { weight: '600', label: 'Semibold — 600', sample: 'Subtítulos y énfasis' },
        { weight: '700', label: 'Bold — 700', sample: 'Títulos principales' },
      ].map(({ weight, label, sample }) => (
        <div key={weight} className="flex gap-4 items-center">
          <span className="w-40 text-xs text-ds-gray-400 shrink-0">{label}</span>
          <span className="text-lg text-black" style={{ fontWeight: weight }}>{sample}</span>
        </div>
      ))}
    </div>
  ),
};
