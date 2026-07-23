import type { Meta, StoryObj } from '@storybook/react';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { CheckCircle, XCircle, Warning, Info } from '@phosphor-icons/react';

const FIGMA_URL = 'https://www.figma.com/design/oRDLRL9OUNcTQ0k6G5MBPS/Losa-Flotante?node-id=2-2';

const meta: Meta = {
  title: 'Componentes / Toast',
  tags: ['autodocs'],
  parameters: {
    design: { type: 'figma', url: FIGMA_URL },
    layout: 'centered',
    docs: {
      description: {
        component: `
Notificaciones temporales del sistema Losa Flotante.

**Tipos:** success (negro), error (rojo), warning (amarillo), info (gris)

**Comportamiento:** aparece en la esquina superior derecha, desaparece a los 4 segundos.

**Tokens:** \`rounded-ds\`, \`shadow-ds-01\`, Phosphor Bold icons
        `,
      },
    },
  },
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
};

export default meta;

function ToastButtons() {
  const { toast } = useToast();
  return (
    <div className="flex flex-col gap-3 w-72">
      <Button
        variant="secondary"
        icon={<CheckCircle size={16} weight="bold" />}
        onClick={() => toast('Colaborador guardado exitosamente', 'success')}
        className="w-full"
      >
        Toast: Éxito
      </Button>
      <Button
        variant="danger"
        icon={<XCircle size={16} weight="bold" />}
        onClick={() => toast('Error al guardar los cambios. Intente de nuevo.', 'error')}
        className="w-full"
      >
        Toast: Error
      </Button>
      <Button
        variant="outline"
        icon={<Warning size={16} weight="bold" />}
        onClick={() => toast('El colaborador tiene documentos pendientes', 'warning')}
        className="w-full"
      >
        Toast: Advertencia
      </Button>
      <Button
        variant="ghost"
        icon={<Info size={16} weight="bold" />}
        onClick={() => toast('Los cambios se sincronizarán en unos momentos', 'info')}
        className="w-full"
      >
        Toast: Información
      </Button>
    </div>
  );
}

export const Default: StoryObj = {
  name: 'Todos los tipos',
  render: () => <ToastButtons />,
};

export const Exito: StoryObj = {
  name: 'Toast: Éxito',
  render: () => {
    function Demo() {
      const { toast } = useToast();
      return (
        <Button
          variant="secondary"
          icon={<CheckCircle size={16} weight="bold" />}
          onClick={() => toast('Cambios guardados correctamente', 'success')}
        >
          Mostrar toast
        </Button>
      );
    }
    return <Demo />;
  },
};

export const ErrorToast: StoryObj = {
  name: 'Toast: Error',
  render: () => {
    function Demo() {
      const { toast } = useToast();
      return (
        <Button
          variant="danger"
          icon={<XCircle size={16} weight="bold" />}
          onClick={() => toast('No se pudo completar la operación', 'error')}
        >
          Mostrar error
        </Button>
      );
    }
    return <Demo />;
  },
};
