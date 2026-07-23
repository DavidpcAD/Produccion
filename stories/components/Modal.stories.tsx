import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Trash } from '@phosphor-icons/react';

const FIGMA_URL = 'https://www.figma.com/design/oRDLRL9OUNcTQ0k6G5MBPS/Losa-Flotante?node-id=2-2';

const meta: Meta = {
  title: 'Componentes / Modal',
  tags: ['autodocs'],
  parameters: {
    design: { type: 'figma', url: FIGMA_URL },
    layout: 'centered',
    docs: {
      description: {
        component: `
Ventana modal del sistema Losa Flotante.

**Características:** overlay negro, cierre con ESC y clic en overlay, scroll interno, footer de acciones.

**Tokens:** \`rounded-ds-lg\` (16px), \`shadow-ds-01\`, backdrop negro 50%
        `,
      },
    },
  },
};

export default meta;

function ModalDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button onClick={() => setOpen(true)}>Abrir modal</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo colaborador"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => setOpen(false)}>Guardar</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Nombre completo" placeholder="Juan Pérez García" required />
          <Input label="Cédula" placeholder="012345678" required />
          <Select
            label="Departamento"
            placeholder="Seleccionar"
            options={[
              { value: 'campo',    label: 'Campo' },
              { value: 'bodega',   label: 'Bodega' },
              { value: 'admin',    label: 'Administración' },
            ]}
          />
          <Input label="Correo electrónico" type="email" placeholder="juan@adelante.cr" />
        </div>
      </Modal>
    </div>
  );
}

function ConfirmDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button variant="danger" icon={<Trash size={16} weight="bold" />} onClick={() => setOpen(true)}>
        Desactivar usuario
      </Button>
      <ConfirmModal
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
        title="Desactivar colaborador"
        message="¿Confirmas que deseas desactivar a Juan Pérez García? Esta acción quedará registrada en el log de auditoría."
        confirmLabel="Desactivar"
        danger
      />
    </div>
  );
}

export const Default: StoryObj = {
  name: 'Modal de formulario',
  render: () => <ModalDemo />,
};

export const Confirmacion: StoryObj = {
  name: 'Modal de confirmación (peligro)',
  render: () => <ConfirmDemo />,
};

export const TamanioGrande: StoryObj = {
  name: 'Modal tamaño grande',
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <div>
        <Button onClick={() => setOpen(true)}>Modal grande</Button>
        <Modal open={open} onClose={() => setOpen(false)} title="Editar información laboral" size="lg"
          footer={
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => setOpen(false)}>Guardar cambios</Button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <Input label="Puesto" placeholder="Supervisor de campo" />
            <Select label="Departamento" placeholder="Seleccionar" options={[
              { value: 'campo', label: 'Campo' },
              { value: 'bodega', label: 'Bodega' },
            ]} />
            <Input label="Fecha de ingreso" type="date" />
            <Input label="Salario (₡)" type="number" placeholder="500000" />
            <Input label="Correo" type="email" placeholder="juan@adelante.cr" className="col-span-2" />
          </div>
        </Modal>
      </div>
    );
  },
};
