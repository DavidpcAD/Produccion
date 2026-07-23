'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Table';
import { useSession } from '@/hooks/useSession';
import { useToast } from '@/components/ui/Toast';
import { Icon } from '@/components/ds/Icon/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { ColaboradorEditModal } from '@/components/usuarios/ColaboradorEditModal';

interface AppRoles {
  idApp: number | null;
  app: string;
  appCodigo: string | null;
  roles: string;
}
interface Colaborador {
  IDCol: number; Cedula: string; NombreCompleto: string; Correo: string;
  Telefono: string; Departamento: string; Puesto: string; Activo: boolean; Roles: string;
  Username?: string | null; EsUsuario: boolean; apps: AppRoles[];
}

const initials = (s: string) => (s || '?').split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('');
const columnHelper = createColumnHelper<Colaborador>();

export default function UsuariosPage() {
  const session = useSession();
  const { toast } = useToast();
  const isAdmin = !!session && session.nivelAdmin >= 2;

  const [data, setData] = useState<Colaborador[]>([]);
  const [total, setTotal] = useState(0);
  const [paginas, setPaginas] = useState(1);
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [activo, setActivo] = useState('1');
  // Vista: todos los colaboradores, o solo los que son usuarios (con acceso a apps).
  const [vista, setVista] = useState<'colaboradores' | 'usuarios'>('colaboradores');
  // Modal de edición (componente único, compartido con el detalle).
  const [editId, setEditId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: busqueda, pagina: String(pagina), activo });
      if (vista === 'usuarios') params.set('soloUsuarios', '1');
      const res = await fetch(`/api/usuarios?${params}`);
      if (!res.ok) { toast('Error cargando colaboradores', 'error'); return; }
      const json = await res.json();
      setData(json.data ?? []);
      setTotal(json.total ?? 0);
      setPaginas(json.paginas ?? 1);
    } finally {
      setLoading(false);
    }
  }, [busqueda, pagina, activo, vista, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPagina(1); }, [busqueda, activo, vista]);
  // Permite entrar directo a la vista "Usuarios" desde el dashboard (?soloUsuarios=1).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('soloUsuarios') === '1') setVista('usuarios');
  }, []);

  // ─── TanStack columns (según la vista activa) ──────────────────────
  const columns = useMemo(() => {
    const nombreCol = columnHelper.accessor('NombreCompleto', {
      header: 'Colaborador',
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-ds bg-brand flex items-center justify-center text-black text-xs font-bold shrink-0 shadow-ds-02">
            {initials(row.original.NombreCompleto)}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-black text-sm truncate flex items-center gap-1.5">
              {row.original.NombreCompleto}
              {row.original.EsUsuario && (
                <span title="Tiene acceso al sistema (usuario)" className="inline-flex items-center">
                  <Icon name="rol" size="sm" color="var(--ds-color-gray-400)" />
                </span>
              )}
            </div>
            <div className="text-xs text-ds-gray-400 font-mono">
              {row.original.EsUsuario && row.original.Username
                ? <span className="text-black">@{row.original.Username}</span>
                : row.original.Cedula}
            </div>
          </div>
        </div>
      ),
    });

    const idCol = columnHelper.accessor('IDCol', {
      id: 'idCol',
      header: 'ID',
      cell: ({ getValue }) => <span className="font-mono text-xs font-semibold text-ds-gray-500">#{getValue() as number}</span>,
    });

    const deptoCol = columnHelper.accessor('Departamento', {
      header: 'Departamento / Puesto',
      cell: ({ row }) => (
        <div>
          <div className="text-sm font-medium text-black">{row.original.Departamento || '—'}</div>
          <div className="text-xs text-ds-gray-400">{row.original.Puesto || '—'}</div>
        </div>
      ),
    });

    const estadoCol = columnHelper.accessor('Activo', {
      header: 'Estado',
      cell: ({ getValue }) => <Badge variant={getValue() ? 'green' : 'red'} dot>{getValue() ? 'Activo' : 'Inactivo'}</Badge>,
    });

    if (vista === 'usuarios') {
      // Vista Usuarios: apps y roles agrupados (como la pantalla de Usuarios).
      const appsCol = columnHelper.accessor('apps', {
        header: 'Apps y roles',
        cell: ({ row }) => {
          const apps = row.original.apps;
          if (!apps || apps.length === 0) return <span className="text-ds-gray-300 text-xs">sin acceso a apps</span>;
          return (
            <div className="flex flex-col gap-1.5">
              {apps.map(a => (
                <div key={`${row.original.IDCol}-${a.idApp ?? a.app}`} className="flex items-start gap-2">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-ds-gray-500 whitespace-nowrap pt-1">
                    <Icon name="folder" size="sm" color="var(--ds-color-gray-400)" />
                    {a.app}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {a.roles.split(', ').map((r, i) => <span key={`${r}-${i}`} className="ds-rol-pill">{r}</span>)}
                  </div>
                </div>
              ))}
            </div>
          );
        },
      });
      return [nombreCol, idCol, deptoCol, appsCol, estadoCol];
    }

    // Vista Colaboradores: roles resumidos + contacto.
    const rolesCol = columnHelper.accessor('Roles', {
      header: 'Roles',
      cell: ({ getValue }) => {
        const roles = getValue();
        if (!roles) return <span className="text-ds-gray-300 text-xs">Sin acceso</span>;
        const arr = roles.split(', ');
        return (
          <div className="flex flex-wrap gap-1">
            {arr.slice(0, 2).map((r, i) => <Badge key={`${r}-${i}`} variant="blue">{r}</Badge>)}
            {arr.length > 2 && <Badge variant="gray">+{arr.length - 2}</Badge>}
          </div>
        );
      },
    });
    const contactoCol = columnHelper.accessor('Correo', {
      header: 'Contacto',
      cell: ({ row }) => (
        <div>
          <div className="text-sm text-black truncate max-w-[200px]">{row.original.Correo || '—'}</div>
          <div className="text-xs text-ds-gray-400">{row.original.Telefono || '—'}</div>
        </div>
      ),
    });
    return [nombreCol, idCol, deptoCol, rolesCol, contactoCol, estadoCol];
  }, [vista]);

  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="p-6 space-y-5 max-w-[1600px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div>
          <h1 className="text-heading font-bold text-black">
            {vista === 'usuarios' ? 'Usuarios' : 'Colaboradores'}
          </h1>
          <p className="text-ds-gray-400 text-body-sm">
            {vista === 'usuarios' ? `${total} con acceso al sistema` : `${total} personas en el sistema`}
          </p>
        </div>
        {isAdmin && vista === 'colaboradores' && (
          <Link href="/usuarios/nuevo" className="sm:ml-auto">
            <Button icon={<Icon name="plus" size="sm" />}>Nuevo colaborador</Button>
          </Link>
        )}
      </div>

      {/* Toggle de vista: Colaboradores (todos) vs Usuarios (con acceso a apps) */}
      <div className="inline-flex gap-1 p-1 bg-ds-gray-100 rounded-full">
        {([
          { val: 'colaboradores', label: 'Colaboradores', icon: 'user' },
          { val: 'usuarios', label: 'Usuarios', icon: 'check' },
        ] as const).map(opt => (
          <button key={opt.val} onClick={() => setVista(opt.val)}
            className={`inline-flex items-center gap-2 px-5 h-11 rounded-full text-sm font-semibold transition-all ${vista === opt.val ? 'bg-black text-white shadow-ds-02' : 'text-ds-gray-400 hover:text-black'}`}>
            <Icon name={opt.icon} size="sm" color="currentColor" />
            {opt.label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Input placeholder="Buscar por nombre, cédula o correo…" value={busqueda}
            onChange={e => setBusqueda(e.target.value)} leftIcon={<Icon name="search" size="sm" />} />
        </div>
        <div className="flex gap-1 p-1 bg-ds-gray-100 rounded-ds">
          {[{ val: '', label: 'Todos' }, { val: '1', label: 'Activos' }, { val: '0', label: 'Inactivos' }].map(opt => (
            <button key={opt.val} onClick={() => setActivo(opt.val)}
              className={`px-4 py-1.5 rounded-ds-sm text-sm font-semibold transition-all ${activo === opt.val ? 'bg-black text-white shadow-ds-02' : 'text-ds-gray-400 hover:text-black'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla (TanStack) */}
      <div className="overflow-x-auto rounded-ds-lg border border-ds-gray-200 bg-white shadow-ds-01">
        <table className="w-full text-sm table-fixed min-w-[820px]">
          {/* Anchos fijos para que Todos/Activos/Inactivos queden alineados igual
              (con layout automático los anchos variaban según el contenido). */}
          <colgroup>
            {columns.map((c, i) => {
              const isId = (c as { id?: string }).id === 'idCol';
              // ID = columna angosta fija; nombre 24%, estado (última) 12%, el resto se
              // reparte el espacio restante en partes iguales.
              const width = isId ? '7%'
                : i === 0 ? '24%'
                : i === columns.length - 1 ? '12%'
                : `${(100 - 24 - 7 - 12) / (columns.length - 3)}%`;
              return <col key={i} style={{ width }} />;
            })}
          </colgroup>
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} className="bg-ds-gray-100 border-b border-ds-gray-200">
                {hg.headers.map(h => (
                  <th key={h.id} className="px-4 py-3 text-left font-semibold text-ds-gray-500 text-xs uppercase tracking-wide">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-ds-gray-100">
                  {columns.map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-5 w-full" rounded="rounded-full" /></td>)}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-14 text-center text-ds-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <Icon name="list" size="lg" className="text-ds-gray-300" />
                    <span className="text-sm">No hay colaboradores que coincidan</span>
                  </div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(row => (
                <tr key={row.id} onClick={() => setEditId(row.original.IDCol)}
                    className="border-b border-ds-gray-100 last:border-0 cursor-pointer hover:bg-ds-gray-100 transition-colors">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-4 py-3 text-black align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={pagina} totalPages={paginas} onPageChange={setPagina} totalItems={total} pageSize={20} />

      {/* Modal de edición — mismo componente que usa el detalle */}
      <ColaboradorEditModal idColaborador={editId} onClose={() => setEditId(null)} onSaved={fetchData} />
    </div>
  );
}
