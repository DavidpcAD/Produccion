import type { Meta, StoryObj } from '@storybook/react';
import { Sidebar } from '@/components/layout/Sidebar';

const FIGMA_URL = 'https://www.figma.com/design/oRDLRL9OUNcTQ0k6G5MBPS/Losa-Flotante?node-id=2-2';

const meta: Meta<typeof Sidebar> = {
  title: 'Layout / Sidebar',
  component: Sidebar,
  tags: ['autodocs'],
  parameters: {
    design: { type: 'figma', url: FIGMA_URL },
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
Barra lateral de navegación del sistema Losa Flotante.

**Fondo:** negro \`#000000\`

**Nav activo:** fondo verde lima \`bg-brand\`, texto negro

**Íconos:** Phosphor Bold 18px

**Niveles de acceso:** las rutas se filtran según \`nivelAdmin\` (1–4).
        `,
      },
    },
  },
  argTypes: {
    nivelAdmin: {
      control: 'select',
      options: [1, 2, 3, 4],
      description: 'Nivel de administración del usuario (controla qué rutas son visibles)',
    },
  },
  args: {
    nivelAdmin: 2,
  },
  decorators: [
    (Story) => (
      <div className="h-screen w-64">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Sidebar>;

export const Default: Story = {
  name: 'Sidebar — Jefe de Área (nivel 2)',
  args: { nivelAdmin: 2 },
};

export const SuperAdmin: Story = {
  name: 'Super Admin (nivel 4)',
  args: { nivelAdmin: 4 },
};

export const UsuarioBasico: Story = {
  name: 'Usuario básico (nivel 1)',
  args: { nivelAdmin: 1 },
};

export const AdminTI: Story = {
  name: 'Admin TI (nivel 3)',
  args: { nivelAdmin: 3 },
};
