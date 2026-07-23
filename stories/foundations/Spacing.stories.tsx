import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
  title: 'Foundations / Bordes y Sombras',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: 'Tokens de borde (border-radius) y sombras (box-shadow) del sistema Losa Flotante.',
      },
    },
  },
};

export default meta;

export const Radios: StoryObj = {
  name: 'Border radius',
  render: () => (
    <div className="flex flex-wrap gap-6 items-end">
      {[
        { token: 'rounded-ds-sm', px: '4px',  label: 'DS SM' },
        { token: 'rounded-ds',    px: '8px',  label: 'DS' },
        { token: 'rounded-ds-lg', px: '16px', label: 'DS LG' },
        { token: 'rounded-ds-xl', px: '32px', label: 'DS XL' },
      ].map(({ token, px, label }) => (
        <div key={token} className="flex flex-col items-center gap-2">
          <div
            className={`w-20 h-20 bg-brand border-2 border-black/10 ${token}`}
          />
          <div className="text-center">
            <p className="text-xs font-semibold text-black">{label}</p>
            <code className="text-xs text-ds-gray-400">{px}</code>
          </div>
        </div>
      ))}
    </div>
  ),
};

export const Sombras: StoryObj = {
  name: 'Sombras',
  render: () => (
    <div className="flex flex-wrap gap-8 items-end">
      {[
        { token: 'shadow-ds-01', label: 'DS-01', desc: 'Tarjetas, tablas',     className: 'shadow-ds-01' },
        { token: 'shadow-ds-02', label: 'DS-02', desc: 'Botones, avatares',    className: 'shadow-ds-02' },
        { token: 'shadow-ds-03', label: 'DS-03', desc: 'Elevación alta',       className: 'shadow-ds-03' },
      ].map(({ token, label, desc, className }) => (
        <div key={token} className="flex flex-col items-center gap-3">
          <div className={`w-28 h-28 bg-white rounded-ds-lg ${className}`} />
          <div className="text-center">
            <p className="text-xs font-semibold text-black">{label}</p>
            <code className="text-xs text-ds-gray-400">{token}</code>
            <p className="text-xs text-ds-gray-400 mt-0.5">{desc}</p>
          </div>
        </div>
      ))}
    </div>
  ),
};
