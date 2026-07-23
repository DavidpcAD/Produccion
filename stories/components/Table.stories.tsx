import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Table, Pagination } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';

const FIGMA_URL = 'https://www.figma.com/design/oRDLRL9OUNcTQ0k6G5MBPS/Losa-Flotante?node-id=2-2';

const meta: Meta = {
  title: 'Componentes / Table',
  tags: ['autodocs'],
  parameters: {
    design: { type: 'figma', url: FIGMA_URL },
    layout: 'padded',
    docs: {
      description: {
        component: `
Tabla de datos del sistema Losa Flotante.

**Características:** columnas configurables, render personalizado, estado vacío, skeleton loader, paginación.

**Tokens:** \`rounded-ds-lg\`, \`shadow-ds-01\`, \`border-ds-gray-200\`, hover suave.
        `,
      },
    },
  },
};

export default meta;

interface Colaborador {
  id: number;
  nombre: string;
  cedula: string;
  departamento: string;
  estado: 'activo' | 'inactivo' | 'suspendido';
  cargo: string;
}

const DATA: Colaborador[] = [
  { id: 1, nombre: 'Juan Pérez García',    cedula: '012345678', departamento: 'Campo',          estado: 'activo',     cargo: 'Supervisor de Campo' },
  { id: 2, nombre: 'María López Vargas',   cedula: '987654321', departamento: 'Bodega',         estado: 'activo',     cargo: 'Jefa de Bodega' },
  { id: 3, nombre: 'Carlos Mora Rojas',    cedula: '111222333', departamento: 'Administración', estado: 'inactivo',   cargo: 'Analista' },
  { id: 4, nombre: 'Ana Jiménez Cruz',     cedula: '444555666', departamento: 'Logística',      estado: 'activo',     cargo: 'Coordinadora' },
  { id: 5, nombre: 'Pedro Salas Ulate',    cedula: '777888999', departamento: 'Campo',          estado: 'suspendido', cargo: 'Operario' },
];

const ESTADO_VARIANT: Record<string, 'green' | 'red' | 'yellow'> = {
  activo:     'green',
  inactivo:   'red',
  suspendido: 'yellow',
};

const COLUMNS = [
  { key: 'nombre',       header: 'Colaborador',   render: (r: Colaborador) => (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-ds-lg bg-brand flex items-center justify-center text-black font-bold text-xs shadow-ds-02">
        {r.nombre.split(' ').map(n => n[0]).slice(0,2).join('')}
      </div>
      <div>
        <div className="font-semibold text-sm">{r.nombre}</div>
        <div className="text-xs text-ds-gray-400">{r.cedula}</div>
      </div>
    </div>
  )},
  { key: 'cargo',        header: 'Cargo' },
  { key: 'departamento', header: 'Departamento' },
  { key: 'estado',       header: 'Estado', render: (r: Colaborador) => (
    <Badge variant={ESTADO_VARIANT[r.estado]} dot>
      {r.estado.charAt(0).toUpperCase() + r.estado.slice(1)}
    </Badge>
  )},
];

export const Default: StoryObj = {
  name: 'Tabla de colaboradores',
  render: () => (
    <Table columns={COLUMNS} data={DATA} keyField="id" />
  ),
};

export const Cargando: StoryObj = {
  name: 'Estado: Cargando',
  render: () => (
    <Table columns={COLUMNS} data={[]} keyField="id" loading />
  ),
};

export const SinResultados: StoryObj = {
  name: 'Estado: Sin resultados',
  render: () => (
    <Table columns={COLUMNS} data={[]} keyField="id" emptyMessage="No se encontraron colaboradores" />
  ),
};

export const Clickeable: StoryObj = {
  name: 'Filas clickeables',
  render: () => (
    <Table
      columns={COLUMNS}
      data={DATA}
      keyField="id"
      onRowClick={(row) => alert(`Seleccionado: ${row.nombre}`)}
    />
  ),
};

export const ConPaginacion: StoryObj = {
  name: 'Con paginación',
  render: () => {
    const PAGE_SIZE = 3;
    const [page, setPage] = useState(1);
    const totalPages = Math.ceil(DATA.length / PAGE_SIZE);
    const paged = DATA.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return (
      <div className="flex flex-col gap-3">
        <Table columns={COLUMNS} data={paged} keyField="id" />
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={DATA.length}
          pageSize={PAGE_SIZE}
        />
      </div>
    );
  },
};
