'use client';
import { CaretLeft, CaretRight, Table as TableIcon } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { springs } from '@/lib/springs';

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField: keyof T;
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}

export function Table<T>({ columns, data, keyField, loading, emptyMessage = 'Sin resultados', onRowClick }: TableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-ds-lg border border-ds-gray-200 bg-white shadow-ds-01">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-ds-gray-100 border-b border-ds-gray-200">
            {columns.map(col => (
              <th
                key={String(col.key)}
                className={`px-4 py-3 text-left font-semibold text-ds-gray-500 text-xs uppercase tracking-wide ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-ds-gray-100">
                {columns.map(col => (
                  <td key={String(col.key)} className="px-4 py-3">
                    <div className="h-4 bg-ds-gray-100 rounded-ds animate-pulse" />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-14 text-center text-ds-gray-400">
                <div className="flex flex-col items-center gap-2">
                  <TableIcon size={32} weight="thin" className="text-ds-gray-300" />
                  <span className="text-sm">{emptyMessage}</span>
                </div>
              </td>
            </tr>
          ) : (
            data.map((row, index) => (
              <motion.tr
                key={String(row[keyField])}
                onClick={() => onRowClick?.(row)}
                className={`border-b border-ds-gray-100 last:border-0 ${onRowClick ? 'cursor-pointer' : ''}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...springs.expanding, delay: Math.min(index * 0.03, 0.3) }}
                whileHover={onRowClick ? { backgroundColor: 'var(--ds-color-gray-100)' } : undefined}
              >
                {columns.map(col => (
                  <td key={String(col.key)} className={`px-4 py-3 text-black ${col.className ?? ''}`}>
                    {col.render ? col.render(row) : String((row as Record<string, unknown>)[String(col.key)] ?? '')}
                  </td>
                ))}
              </motion.tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
}

export function Pagination({ page, totalPages, onPageChange, totalItems, pageSize }: PaginationProps) {
  if (totalPages <= 1) return null;
  const start = pageSize ? (page - 1) * pageSize + 1 : null;
  const end = pageSize && totalItems ? Math.min(page * pageSize, totalItems) : null;

  return (
    <div className="flex items-center justify-between px-1 py-2">
      {totalItems && pageSize ? (
        <p className="text-sm text-ds-gray-400">
          Mostrando {start}–{end} de {totalItems}
        </p>
      ) : <span />}
      <div className="flex gap-1 items-center">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-ds border border-ds-gray-200 disabled:opacity-40 hover:bg-ds-gray-100 transition-colors"
        >
          <CaretLeft size={16} weight="bold" />
        </button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
          return (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`w-8 h-8 text-sm rounded-ds border font-semibold transition-colors ${
                p === page
                  ? 'bg-black text-white border-black'
                  : 'border-ds-gray-200 hover:bg-ds-gray-100 text-black'
              }`}
            >
              {p}
            </button>
          );
        })}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 rounded-ds border border-ds-gray-200 disabled:opacity-40 hover:bg-ds-gray-100 transition-colors"
        >
          <CaretRight size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}
