import type { Meta, StoryObj } from '@storybook/react';
import { Input, Select } from '@/components/ui/Input';
import { MagnifyingGlass, Lock, User, EnvelopeSimple, Phone, Warning } from '@phosphor-icons/react';

const FIGMA_URL = 'https://www.figma.com/design/oRDLRL9OUNcTQ0k6G5MBPS/Losa-Flotante?node-id=2-2';

const meta: Meta<typeof Input> = {
  title: 'Componentes / Input',
  component: Input,
  tags: ['autodocs'],
  parameters: {
    design: { type: 'figma', url: FIGMA_URL },
    docs: {
      description: {
        component: `
Campo de texto del sistema Losa Flotante.

**Estados:** default, focus (borde negro), error (borde rojo), disabled

**Altura mínima:** 56px — cumple estándar táctil.

**Tokens:** \`border-ds-gray-200\` → \`border-2 border-black\` (focus) → \`border-ds-red\` (error)
        `,
      },
    },
  },
  argTypes: {
    label: { control: 'text' },
    placeholder: { control: 'text' },
    error: { control: 'text', description: 'Mensaje de error (activa estado rojo)' },
    hint: { control: 'text', description: 'Texto de ayuda' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
  },
  args: {
    label: 'Campo',
    placeholder: 'Escribe aquí...',
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: { label: 'Nombre', placeholder: 'Juan Pérez' },
};

export const ConIcono: Story = {
  name: 'Con ícono izquierdo',
  args: {
    label: 'Buscar',
    placeholder: 'Buscar colaborador...',
    leftIcon: <MagnifyingGlass size={16} weight="bold" />,
  },
};

export const Contrasena: Story = {
  name: 'Contraseña',
  args: {
    label: 'Contraseña',
    type: 'password',
    placeholder: '••••••••',
    leftIcon: <Lock size={16} weight="bold" />,
  },
};

export const ConError: Story = {
  name: 'Estado: Error',
  args: {
    label: 'Cédula',
    placeholder: '012345678',
    error: 'La cédula ingresada no es válida',
    leftIcon: <User size={16} weight="bold" />,
  },
};

export const ConAyuda: Story = {
  name: 'Con texto de ayuda',
  args: {
    label: 'Correo electrónico',
    type: 'email',
    placeholder: 'usuario@adelante.cr',
    hint: 'Recibirás notificaciones en este correo',
    leftIcon: <EnvelopeSimple size={16} weight="bold" />,
  },
};

export const Deshabilitado: Story = {
  name: 'Estado: Deshabilitado',
  args: {
    label: 'Teléfono',
    placeholder: '8888-8888',
    disabled: true,
    leftIcon: <Phone size={16} weight="bold" />,
  },
};

export const Requerido: Story = {
  args: {
    label: 'Nombre completo',
    placeholder: 'Juan Pérez García',
    required: true,
  },
};

export const TodosLosEstados: Story = {
  name: 'Todos los estados',
  render: () => (
    <div className="flex flex-col gap-4 w-80">
      <Input label="Default" placeholder="Estado normal" />
      <Input label="Con error" placeholder="Campo inválido" error="Este campo es requerido" />
      <Input label="Con ayuda" placeholder="..." hint="Texto de ayuda descriptivo" />
      <Input label="Deshabilitado" placeholder="No editable" disabled />
      <Input label="Requerido" placeholder="Campo obligatorio" required />
    </div>
  ),
};

// ── Select ─────────────────────────────────────────────────────────────────
export const SelectComponent: Story = {
  name: 'Select / Dropdown',
  render: () => (
    <div className="w-80">
      <Select
        label="Departamento"
        placeholder="Seleccionar departamento"
        options={[
          { value: 'campo',    label: 'Campo' },
          { value: 'bodega',   label: 'Bodega' },
          { value: 'logistica',label: 'Logística' },
          { value: 'admin',    label: 'Administración' },
          { value: 'ti',       label: 'TI' },
        ]}
      />
    </div>
  ),
};

export const SelectConError: Story = {
  name: 'Select con error',
  render: () => (
    <div className="w-80">
      <Select
        label="Categoría"
        placeholder="Seleccionar"
        error="Debes seleccionar una categoría"
        options={[
          { value: '1', label: 'Opción 1' },
          { value: '2', label: 'Opción 2' },
        ]}
      />
    </div>
  ),
};
