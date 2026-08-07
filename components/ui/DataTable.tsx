'use client';
import { useMemo, useRef, useState, useEffect } from 'react';
import {
  useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel,
  getPaginationRowModel, getFacetedRowModel, getFacetedUniqueValues, flexRender,
  type ColumnDef, type SortingState, type ColumnFiltersState, type VisibilityState,
  type RowData, type FilterFn, type Column,
} from '@tanstack/react-table';
import { Input } from '@/components/ui/Input';
import { Icon } from '@/components/ds/Icon/Icon';
import { Pagination } from '@/components/ui/Table';

// Metadata opcional por columna: etiqueta legible (para "Columnas" y export) y
// cómo obtener el texto plano al exportar a CSV.
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string;
    exportValue?: (row: TData) => string | number | null | undefined;
    align?: 'left' | 'right' | 'center';
    noFilter?: boolean;
  }
}

interface DataTableProps<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[];
  data: T[];
  loading?: boolean;
  onRowClick?: (row: T) => void;
  searchPlaceholder?: string;
  exportFilename?: string;
  pageSize?: number;
  emptyMessage?: string;
  toolbarExtra?: React.ReactNode;
}

// Filtro multi-selección: la fila pasa si su valor está entre los elegidos.
// Sin selección (undefined / array vacío) no filtra.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const facetedFilter: FilterFn<any> = (row, columnId, filterValue) => {
  if (!Array.isArray(filterValue) || filterValue.length === 0) return true;
  const v = row.getValue(columnId);
  return filterValue.includes(v == null ? '' : String(v));
};

// Normaliza para comparar sin tildes ni mayúsculas.
const normTxt = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Búsqueda global robusta: compara el valor (string O número) de la columna
// contra el término, sin tildes. Reemplaza a 'includesString' de tanstack, cuyo
// "qué columnas son buscables" depende del TIPO de la primera fila (si el primer
// valor es null la columna deja de buscarse — rompía buscar por obra en muestras).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalTextFilter: FilterFn<any> = (row, columnId, filterValue) => {
  const v = row.getValue(columnId);
  if (v == null) return false;
  return normTxt(String(v)).includes(normTxt(String(filterValue)));
};

// Panel de filtro por columna: buscador + "Todos" + lista de valores con checkbox.
function ColumnFilterPanel({ column, label }: { column: Column<unknown, unknown>; label: string }) {
  const [q, setQ] = useState('');
  const selectedArr = (column.getFilterValue() as string[] | undefined) ?? [];
  const selected = new Set(selectedArr);
  const facets = column.getFacetedUniqueValues();
  const options = Array.from(facets.entries())
    .map(([value, count]) => ({ value: value == null ? '' : String(value), count }))
    .filter(o => o.value !== '')
    .sort((a, b) => a.value.localeCompare(b.value, 'es'));
  const ql = q.trim().toLowerCase();
  const filtered = ql ? options.filter(o => o.value.toLowerCase().includes(ql)) : options;

  function toggle(val: string) {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val); else next.add(val);
    column.setFilterValue(next.size ? Array.from(next) : undefined);
  }

  return (
    <div className="absolute left-0 mt-2 w-64 rounded-ds-lg border border-ds-gray-200 bg-ds-surface shadow-ds-03 z-30 p-2 normal-case tracking-normal font-normal">
      <input autoFocus value={q} onChange={e => setQ(e.target.value)}
        placeholder={`Buscar en ${label}…`}
        className="w-full rounded-ds border border-ds-gray-200 px-3 py-2 text-sm text-ds-ink focus:outline-none focus:border-black" />
      <div className="mt-2 max-h-60 overflow-y-auto">
        <label className="flex items-center gap-2 px-2 py-1.5 rounded-ds hover:bg-ds-gray-100 cursor-pointer text-sm">
          <input type="checkbox" checked={selected.size === 0}
            onChange={() => column.setFilterValue(undefined)} className="w-4 h-4 accent-brand" />
          <span className="font-semibold text-ds-ink">Todos</span>
        </label>
        {filtered.map(o => (
          <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 rounded-ds hover:bg-ds-gray-100 cursor-pointer text-sm">
            <input type="checkbox" checked={selected.has(o.value)}
              onChange={() => toggle(o.value)} className="w-4 h-4 accent-brand shrink-0" />
            <span className="text-ds-ink flex-1 min-w-0 break-words">{o.value}</span>
            <span className="text-xs text-ds-gray-300 shrink-0">{o.count}</span>
          </label>
        ))}
        {filtered.length === 0 && <p className="px-2 py-3 text-xs text-ds-gray-400">Sin valores</p>}
      </div>
      {selected.size > 0 && (
        <button onClick={() => column.setFilterValue(undefined)}
          className="mt-1.5 w-full px-2 py-1 text-left text-xs font-semibold text-ds-red hover:underline">
          Limpiar ({selected.size})
        </button>
      )}
    </div>
  );
}

function useClickOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);
  return ref;
}

export function DataTable<T>({
  columns, data, loading, onRowClick,
  searchPlaceholder = 'Buscar…', exportFilename = 'reporte',
  pageSize = 20, emptyMessage = 'Sin resultados', toolbarExtra,
}: DataTableProps<T>) {
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [colsOpen, setColsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState<string | null>(null);

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter, sorting, columnFilters, columnVisibility },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    globalFilterFn: globalTextFilter,
    // Cualquier columna con accessor participa en la búsqueda global (no depende
    // del tipo del primer valor, que antes excluía columnas con primer valor null).
    getColumnCanGlobalFilter: (col) => !!col.accessorFn,
    defaultColumn: { filterFn: facetedFilter },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    initialState: { pagination: { pageSize } },
  });

  const colsRef = useClickOutside(() => setColsOpen(false));
  const exportRef = useClickOutside(() => setExportOpen(false));
  const filterRef = useClickOutside(() => setFilterOpen(null));

  const totalFiltered = table.getFilteredRowModel().rows.length;
  const activeFilters = columnFilters.length + (globalFilter ? 1 : 0);

  function exportCSV() {
    const cols = table.getVisibleLeafColumns().filter(c => c.id !== 'acciones');
    const headers = cols.map(c => (c.columnDef.meta?.label as string) || (typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id));
    const rows = table.getFilteredRowModel().rows.map(r =>
      cols.map(c => {
        const ev = c.columnDef.meta?.exportValue;
        const raw = ev ? ev(r.original) : r.getValue(c.id);
        return raw == null ? '' : String(raw);
      }),
    );
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(v => esc(String(v))).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportFilename}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Reporte PDF: abre una ventana con el reporte formateado y lanza la impresi\u00F3n
  // (el usuario elige "Guardar como PDF"). Sin dependencias externas.
  function exportPDF() {
    const cols = table.getVisibleLeafColumns().filter(c => c.id !== 'acciones');
    const headers = cols.map(c => (c.columnDef.meta?.label as string) || (typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id));
    const rows = table.getFilteredRowModel().rows.map(r =>
      cols.map(c => {
        const ev = c.columnDef.meta?.exportValue;
        const raw = ev ? ev(r.original) : r.getValue(c.id);
        return raw == null ? '' : String(raw);
      }),
    );
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const titulo = exportFilename.charAt(0).toUpperCase() + exportFilename.slice(1);
    const fecha = new Date().toLocaleString('es-CR');
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
      <style>
        *{font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;}
        body{margin:32px;color:#111;}
        h1{font-size:20px;margin:0 0 2px;}
        .meta{color:#666;font-size:12px;margin-bottom:16px;}
        table{width:100%;border-collapse:collapse;font-size:12px;}
        thead th{background:#111;color:#fff;text-align:left;padding:8px 10px;}
        tbody td{padding:7px 10px;border-bottom:1px solid #e5e5e5;}
        tbody tr:nth-child(even){background:#fafafa;}
        @media print{@page{margin:14mm;}}
      </style></head><body>
      <h1>${esc(titulo)}</h1>
      <div class="meta">${rows.length} registro(s) \u00B7 Generado ${esc(fecha)}</div>
      <table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
      <script>window.onload=function(){window.print();}<\/script>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
  }

  const alignCls = (a?: string) => a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <Input value={globalFilter} onChange={e => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            leftIcon={<Icon name="search" size="sm" color="currentColor" className="text-ds-gray-400" />} />
        </div>
        {toolbarExtra}

        {/* Columnas */}
        <div className="relative" ref={colsRef}>
          <button onClick={() => setColsOpen(o => !o)}
            className="inline-flex items-center gap-2 rounded-ds border border-ds-gray-200 bg-ds-surface px-3.5 h-10 text-sm font-semibold text-ds-ink hover:bg-ds-gray-100 transition-colors">
            <Icon name="options" size="sm" color="currentColor" /> Columnas
          </button>
          {colsOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-ds-lg border border-ds-gray-200 bg-ds-surface shadow-ds-03 z-30 p-2 max-h-80 overflow-y-auto">
              {table.getAllLeafColumns().filter(c => c.id !== 'acciones').map(c => (
                <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded-ds hover:bg-ds-gray-100 cursor-pointer text-sm">
                  <input type="checkbox" checked={c.getIsVisible()} onChange={c.getToggleVisibilityHandler()} className="w-4 h-4 accent-brand" />
                  <span className="text-ds-ink">{(c.columnDef.meta?.label as string) || (typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id)}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Exportar */}
        <div className="relative" ref={exportRef}>
          <button onClick={() => setExportOpen(o => !o)}
            className="inline-flex items-center gap-2 rounded-ds border border-ds-gray-200 bg-ds-surface px-3.5 h-10 text-sm font-semibold text-ds-ink hover:bg-ds-gray-100 transition-colors">
            <Icon name="arrow-right" size="sm" color="currentColor" className="rotate-90" /> Exportar
          </button>
          {exportOpen && (
            <div className="absolute right-0 mt-2 w-64 rounded-ds-lg border border-ds-gray-200 bg-ds-surface shadow-ds-03 z-30 p-2">
              <p className="px-2 pt-1 pb-2 text-xs text-ds-gray-400">Descargar {totalFiltered} fila(s) filtradas</p>
              <button onClick={() => { exportCSV(); setExportOpen(false); }}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-ds hover:bg-ds-gray-100 transition-colors text-left">
                <span className="w-10 h-7 shrink-0 rounded-ds bg-black text-white text-[10px] font-bold flex items-center justify-center">CSV</span>
                <span className="text-sm font-semibold text-ds-ink">Excel / CSV</span>
              </button>
              <button onClick={() => { exportPDF(); setExportOpen(false); }}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-ds hover:bg-ds-gray-100 transition-colors text-left">
                <span className="w-10 h-7 shrink-0 rounded-ds bg-black text-white text-[10px] font-bold flex items-center justify-center">PDF</span>
                <span className="text-sm font-semibold text-ds-ink">Reporte PDF</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {activeFilters > 0 && (
        <div className="flex items-center gap-2 text-xs text-ds-gray-400">
          <span>{activeFilters} filtro(s) activo(s)</span>
          <button onClick={() => { setColumnFilters([]); setGlobalFilter(''); }}
            className="font-semibold text-ds-ink hover:underline">Limpiar</button>
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-x-auto rounded-ds-lg border border-ds-gray-200 bg-ds-surface shadow-ds-01">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} className="bg-black">
                {hg.headers.map(h => {
                  const canSort = h.column.getCanSort();
                  const canFilter = h.column.getCanFilter() && !h.column.columnDef.meta?.noFilter && h.column.id !== 'acciones';
                  const sorted = h.column.getIsSorted();
                  const align = h.column.columnDef.meta?.align;
                  return (
                    <th key={h.id} className={`px-4 py-3 font-semibold text-white text-xs uppercase tracking-wide ${alignCls(align)}`}>
                      <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''}`}>
                        <button
                          onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                          className={`inline-flex items-center gap-1 ${canSort ? 'cursor-pointer hover:text-brand' : 'cursor-default'} transition-colors`}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {canSort && (
                            <Icon name={sorted === 'asc' ? 'open' : sorted === 'desc' ? 'close' : 'options'}
                              size="sm" color="currentColor"
                              className={sorted ? 'text-brand' : 'text-ds-gray-400'} />
                          )}
                        </button>
                        {canFilter && (
                          <div className="relative" ref={filterOpen === h.column.id ? filterRef : undefined}>
                            <button onClick={() => setFilterOpen(o => o === h.column.id ? null : h.column.id)}
                              className={`p-0.5 rounded transition-colors ${h.column.getFilterValue() ? 'text-brand' : 'text-ds-gray-400 hover:text-white'}`}
                              title="Filtrar">
                              <Icon name="filter" size="sm" color="currentColor" />
                            </button>
                            {filterOpen === h.column.id && (
                              <ColumnFilterPanel
                                column={h.column as unknown as Column<unknown, unknown>}
                                label={(h.column.columnDef.meta?.label as string) || (typeof h.column.columnDef.header === 'string' ? h.column.columnDef.header : h.column.id)}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-ds-gray-100">
                  {table.getVisibleLeafColumns().map(c => (
                    <td key={c.id} className="px-4 py-3"><div className="h-4 bg-ds-gray-100 rounded-ds animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length} className="px-4 py-14 text-center text-ds-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <Icon name="list" size="lg" color="currentColor" className="text-ds-gray-300" />
                    <span className="text-sm">{emptyMessage}</span>
                  </div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(r => (
                <tr key={r.id}
                  onClick={() => onRowClick?.(r.original)}
                  className={`border-b border-ds-gray-100 last:border-0 transition-colors ${onRowClick ? 'cursor-pointer hover:bg-ds-gray-100' : ''}`}>
                  {r.getVisibleCells().map(cell => (
                    <td key={cell.id} className={`px-4 py-3 text-ds-ink ${alignCls(cell.column.columnDef.meta?.align)}`}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={table.getState().pagination.pageIndex + 1}
        totalPages={table.getPageCount()}
        onPageChange={p => table.setPageIndex(p - 1)}
        totalItems={totalFiltered}
        pageSize={table.getState().pagination.pageSize}
      />
    </div>
  );
}
