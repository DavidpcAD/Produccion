import type { Meta, StoryObj } from '@storybook/react';
import { Badge, NivelAdminBadge } from '@/components/ui/Badge';

const FIGMA_URL = 'https://www.figma.com/design/oRDLRL9OUNcTQ0k6G5MBPS/Losa-Flotante?node-id=2-2';

const meta: Meta<typeof Badge> = {
  title: 'Componentes / Badge',
  component: Badge,
  tags: ['autodocs'],
  parameters: {
    design: { type: 'figma', url: FIGMA_URL },
    docs: {
      description: {
        component: `
Chip / etiqueta de estado del sistema Losa Flotante.

**Variantes de color:** green, red, orange, blue, purple, gray, yellow, black

**Uso:** estados, roles, categorías, indicadores.

**Tokens:** \`rounded-ds-xl\` (32px), font-semibold 12px
        `,
      },
    },
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['green', 'red', 'orange', 'blue', 'purple', 'gray', 'yellow', 'black'],
    },
    dot: {
      control: 'boolean',
      description: 'Muestra indicador de punto de estado',
    },
    children: { control: 'text' },
  },
  args: { children: 'Badge', variant: 'green', dot: false },
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  args: { variant: 'green', children: 'Activo' },
};

export const ConPunto: Story = {
  name: 'Con indicador de estado',
  args: { variant: 'green', children: 'Activo', dot: true },
};

export const TodasLasVariantes: Story = {
  name: 'Todas las variantes',
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="green" dot>Activo</Badge>
      <Badge variant="red" dot>Inactivo</Badge>
      <Badge variant="orange">Pendiente</Badge>
      <Badge variant="blue">En revisión</Badge>
      <Badge variant="purple">Admin</Badge>
      <Badge variant="gray">Sin estado</Badge>
      <Badge variant="yellow">Advertencia</Badge>
      <Badge variant="black">Super Admin</Badge>
    </div>
  ),
};

export const EstadosDeColaborador: Story = {
  name: 'Estados de colaborador',
  render: () => (
    <div className="flex gap-2">
      <Badge variant="green" dot>Activo</Badge>
      <Badge variant="red" dot>Inactivo</Badge>
      <Badge variant="yellow" dot>Suspendido</Badge>
    </div>
  ),
};

export const NivelesAdmin: Story = {
  name: 'Niveles de administración',
  render: () => (
    <div className="flex flex-wrap gap-2">
      <NivelAdminBadge nivel={0} />
      <NivelAdminBadge nivel={1} />
      <NivelAdminBadge nivel={2} />
      <NivelAdminBadge nivel={3} />
      <NivelAdminBadge nivel={4} />
    </div>
  ),
};

export const EnContexto: Story = {
  name: 'En contexto (tarjeta)',
  render: () => (
    <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-4 flex items-center gap-4 w-80">
      <div className="w-10 h-10 rounded-ds-lg bg-brand flex items-center justify-center text-black font-bold text-sm shadow-ds-02">
        JP
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-black">Juan Pérez</div>
        <div className="text-xs text-ds-gray-400">Supervisor de Campo</div>
      </div>
      <div className="flex flex-col gap-1 items-end">
        <Badge variant="green" dot>Activo</Badge>
        <NivelAdminBadge nivel={2} />
      </div>
    </div>
  ),
};
