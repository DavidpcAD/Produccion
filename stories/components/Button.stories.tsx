import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '@/components/ui/Button';
import { Plus, ArrowRight, Trash, Check, ArrowsClockwise } from '@phosphor-icons/react';

const FIGMA_URL = 'https://www.figma.com/design/oRDLRL9OUNcTQ0k6G5MBPS/Losa-Flotante?node-id=2-2';

const meta: Meta<typeof Button> = {
  title: 'Componentes / Button',
  component: Button,
  tags: ['autodocs'],
  parameters: {
    design: {
      type: 'figma',
      url: FIGMA_URL,
    },
    docs: {
      description: {
        component: `
Componente de botón del sistema Losa Flotante.

**Variantes:** \`primary\` (verde lima), \`secondary\` (negro), \`outline\`, \`danger\`, \`ghost\`

**Tamaño mínimo:** 48px de altura — cumple el estándar de accesibilidad táctil.

**Tokens utilizados:** \`bg-brand\`, \`shadow-ds-02\`, \`rounded-ds\`
        `,
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'outline', 'danger', 'ghost'],
      description: 'Variante visual del botón',
      table: {
        defaultValue: { summary: 'primary' },
        type: { summary: 'primary | secondary | outline | danger | ghost' },
      },
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg'],
      description: 'Tamaño del botón',
      table: { defaultValue: { summary: 'md' } },
    },
    loading: {
      control: 'boolean',
      description: 'Muestra spinner de carga y deshabilita el botón',
    },
    disabled: {
      control: 'boolean',
      description: 'Estado deshabilitado',
    },
    children: {
      control: 'text',
      description: 'Texto del botón',
    },
  },
  args: {
    children: 'Button',
    variant: 'primary',
    size: 'md',
    loading: false,
    disabled: false,
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

// ── Primary ────────────────────────────────────────────────────────────────
export const Primary: Story = {
  args: { variant: 'primary', children: 'Guardar cambios' },
};

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Cancelar' },
};

export const Outline: Story = {
  args: { variant: 'outline', children: 'Ver detalles' },
};

export const Danger: Story = {
  args: { variant: 'danger', children: 'Eliminar' },
};

export const Ghost: Story = {
  args: { variant: 'ghost', children: 'Omitir' },
};

// ── Con íconos ────────────────────────────────────────────────────────────
export const ConIconoIzquierdo: Story = {
  name: 'Con ícono izquierdo',
  args: {
    variant: 'primary',
    children: 'Nuevo colaborador',
    icon: <Plus size={16} weight="bold" />,
  },
};

export const ConIconoDerecho: Story = {
  name: 'Con ícono derecho',
  args: {
    variant: 'secondary',
    children: 'Continuar',
    iconRight: <ArrowRight size={16} weight="bold" />,
  },
};

export const Cargando: Story = {
  name: 'Estado: Cargando',
  args: { variant: 'primary', children: 'Guardando...', loading: true },
};

export const Deshabilitado: Story = {
  name: 'Estado: Deshabilitado',
  args: { variant: 'primary', children: 'No disponible', disabled: true },
};

// ── Tamaños ────────────────────────────────────────────────────────────────
export const Tamanios: Story = {
  name: 'Todos los tamaños',
  render: () => (
    <div className="flex items-end gap-3 flex-wrap">
      <Button size="xs">Extra small</Button>
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

// ── Variantes completas ────────────────────────────────────────────────────
export const TodasLasVariantes: Story = {
  name: 'Todas las variantes',
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="danger" icon={<Trash size={16} weight="bold" />}>Danger</Button>
      <Button variant="ghost">Ghost</Button>
    </div>
  ),
};

// ── Full width ────────────────────────────────────────────────────────────
export const AnchoCompleto: Story = {
  name: 'Ancho completo',
  render: () => (
    <div className="w-80 flex flex-col gap-3">
      <Button variant="primary" className="w-full" icon={<Check size={16} weight="bold" />}>
        Confirmar pedido
      </Button>
      <Button variant="outline" className="w-full">
        Cancelar
      </Button>
    </div>
  ),
};
