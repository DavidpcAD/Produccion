import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
  title: 'Adelante / Introducción',
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Sistema de diseño oficial de Adelante Desarrollos, basado en el sistema **Losa Flotante**.',
      },
    },
  },
};

export default meta;

const PALETTE = [
  { name: 'brand',       hex: '#ADD010' },
  { name: 'brand-200',   hex: '#88A024' },
  { name: 'black',       hex: '#000000' },
  { name: 'ds-gray-500', hex: '#5D636C' },
  { name: 'ds-gray-400', hex: '#747B86' },
  { name: 'ds-gray-300', hex: '#AAAFB6' },
  { name: 'ds-gray-200', hex: '#D9D9D9' },
  { name: 'ds-gray-100', hex: '#EBEBEB' },
  { name: 'ds-bg',       hex: '#F3F3F3' },
  { name: 'ds-red',      hex: '#C96C6C' },
  { name: 'ds-yellow',   hex: '#F0C802' },
];

export const Introduccion: StoryObj = {
  name: 'Bienvenida',
  render: () => (
    <div style={{ fontFamily: 'Roboto, sans-serif', maxWidth: 820, margin: '0 auto', padding: '48px 32px', background: '#fff', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40 }}>
        <div style={{ width: 52, height: 52, borderRadius: 12, background: '#ADD010', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 0 rgba(0,0,0,0.16)', flexShrink: 0 }}>
          <svg width="26" height="26" fill="none" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#000', lineHeight: 1.2 }}>Adelante Desarrollos</div>
          <div style={{ fontSize: 14, color: '#747B86' }}>Sistema Losa Flotante · v1.0</div>
        </div>
      </div>

      <p style={{ fontSize: 16, color: '#5D636C', lineHeight: 1.7, marginBottom: 40, maxWidth: 580 }}>
        Sistema de diseño oficial basado en <strong style={{ color: '#000' }}>Losa Flotante</strong>.
        Todos los componentes están construidos sobre tokens del Figma y reflejan el diseño aprobado.
      </p>

      <hr style={{ borderColor: '#EBEBEB', marginBottom: 40 }} />

      {/* Colors */}
      <h2 style={{ fontSize: 20, fontWeight: 600, color: '#000', marginBottom: 20 }}>Paleta de colores</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12, marginBottom: 48 }}>
        {PALETTE.map(c => (
          <div key={c.hex} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #E5E7EB' }}>
            <div style={{ height: 56, background: c.hex }} />
            <div style={{ padding: '8px 10px', background: '#fff' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#111' }}>{c.name}</div>
              <div style={{ fontSize: 11, color: '#747B86', fontFamily: 'monospace' }}>{c.hex}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Typography */}
      <h2 style={{ fontSize: 20, fontWeight: 600, color: '#000', marginBottom: 16 }}>Tipografía</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginBottom: 48 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #EBEBEB', color: '#747B86' }}>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Token</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Size</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Line Height</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Weight</th>
          </tr>
        </thead>
        <tbody>
          {[
            { token: 'body-sm', size: '12px', lh: '16px', w: '400' },
            { token: 'body',    size: '16px', lh: '24px', w: '400' },
            { token: 'sub-sm',  size: '20px', lh: '24px', w: '600' },
            { token: 'sub',     size: '24px', lh: '24px', w: '600' },
            { token: 'heading', size: '32px', lh: '40px', w: '700' },
          ].map(r => (
            <tr key={r.token} style={{ borderBottom: '1px solid #EBEBEB' }}>
              <td style={{ padding: '10px 12px' }}><code style={{ background: '#EBEBEB', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{r.token}</code></td>
              <td style={{ padding: '10px 12px', color: '#5D636C' }}>{r.size}</td>
              <td style={{ padding: '10px 12px', color: '#5D636C' }}>{r.lh}</td>
              <td style={{ padding: '10px 12px', color: '#5D636C' }}>{r.w}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Tokens */}
      <h2 style={{ fontSize: 20, fontWeight: 600, color: '#000', marginBottom: 16 }}>Bordes & Sombras</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginBottom: 48 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #EBEBEB', color: '#747B86' }}>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Token</th>
            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>Valor</th>
          </tr>
        </thead>
        <tbody>
          {[
            { t: 'rounded-ds-sm', v: '4px' },
            { t: 'rounded-ds',    v: '8px' },
            { t: 'rounded-ds-lg', v: '16px' },
            { t: 'rounded-ds-xl', v: '32px' },
            { t: 'shadow-ds-01',  v: '0 4px 8px rgba(170,175,182,0.25)' },
            { t: 'shadow-ds-02',  v: '0 6px 0 rgba(0,0,0,0.16)' },
            { t: 'shadow-ds-03',  v: 'ds-02 + 0 2px 4px rgba(0,0,0,0.16)' },
          ].map(r => (
            <tr key={r.t} style={{ borderBottom: '1px solid #EBEBEB' }}>
              <td style={{ padding: '10px 12px' }}><code style={{ background: '#EBEBEB', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{r.t}</code></td>
              <td style={{ padding: '10px 12px', color: '#5D636C', fontFamily: 'monospace', fontSize: 12 }}>{r.v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Figma link */}
      <hr style={{ borderColor: '#EBEBEB', marginBottom: 24 }} />
      <p style={{ fontSize: 14, color: '#747B86' }}>
        El sistema de diseño completo está disponible en{' '}
        <a href="https://www.figma.com/design/oRDLRL9OUNcTQ0k6G5MBPS/Losa-Flotante" target="_blank" rel="noreferrer" style={{ color: '#ADD010', fontWeight: 600 }}>
          Losa Flotante — Figma
        </a>
      </p>
    </div>
  ),
};
