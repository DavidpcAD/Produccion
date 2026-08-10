'use client';

import { useEffect, useState } from 'react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import type { HitoConUso } from '@/lib/desembolsos/esquemas';

/**
 * Admin · Catálogo de hitos — puntos del proceso constructivo/financiero contra
 * los que un banco desembolsa. Portado de `CatalogoHitosPantalla`. El catálogo
 * sirve para todos los esquemas de banco.
 */
export default function CatalogoHitosPage() {
  const { toast } = useToast();
  const [hitos, setHitos] = useState<HitoConUso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<HitoConUso | 'nuevo' | null>(null);

  function recargar() {
    setCargando(true);
    fetch('/api/desembolsos/catalogo-hitos?incluirInactivos=true')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('No autorizado'))))
      .then((d: HitoConUso[]) => setHitos(d))
      .catch(() => toast('No se pudieron cargar los hitos.', 'error'))
      .finally(() => setCargando(false));
  }
  useEffect(recargar, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageShell width="narrow">
      <PageHeader
        title="Catálogo de hitos"
        subtitle="Los hitos son los puntos del proceso contra los que un banco desembolsa. Cuando agregás uno acá queda disponible para cualquier esquema de banco."
        actions={<Button onClick={() => setEditando('nuevo')}>+ Nuevo hito</Button>}
      />

      <div className="overflow-x-auto rounded-ds-lg border border-ds-gray-200 bg-ds-surface shadow-ds-01">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-ds-gray-100 border-b border-ds-gray-200">
              <th className="px-4 py-3 text-center font-semibold text-ds-gray-500 text-xs uppercase tracking-wide">Orden</th>
              <th className="px-4 py-3 text-left font-semibold text-ds-gray-500 text-xs uppercase tracking-wide">Código</th>
              <th className="px-4 py-3 text-left font-semibold text-ds-gray-500 text-xs uppercase tracking-wide">Nombre</th>
              <th className="px-4 py-3 text-left font-semibold text-ds-gray-500 text-xs uppercase tracking-wide">Uso</th>
              <th className="px-4 py-3 text-left font-semibold text-ds-gray-500 text-xs uppercase tracking-wide" />
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr><td colSpan={5} className="px-3 py-6 text-center"><Skeleton className="h-4 w-48 mx-auto" rounded="rounded-full" /></td></tr>
            )}
            {!cargando && hitos.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-ds-gray-400">Sin hitos.</td></tr>
            )}
            {!cargando && hitos.map((h) => (
              <tr key={h.IDHito} className="border-t border-ds-gray-100">
                <td className="px-3 py-2 text-center font-mono text-sub-sm tabular-nums">{h.OrdenEstandar}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    {h.ColorHEX && <span className="h-3 w-3 rounded-full" style={{ backgroundColor: h.ColorHEX }} />}
                    <span className="font-mono font-semibold">{h.Codigo}</span>
                    {!h.Activo && (
                      <span className="rounded-full bg-ds-gray-100 px-2 py-0.5 text-[10px] uppercase text-ds-gray-500">Inactivo</span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 text-ds-gray-500">
                  {h.Nombre}
                  {h.Descripcion && <div className="text-xs text-ds-gray-400">{h.Descripcion}</div>}
                </td>
                <td className="px-3 py-2 text-xs text-ds-gray-500">
                  {h.BancosUsando > 0 ? `${h.BancosUsando} banco(s) · ${h.RowsTotales} filas` : 'Sin uso'}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => setEditando(h)}>Editar</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editando && (
        <EditarModal
          hito={editando === 'nuevo' ? null : editando}
          onClose={() => setEditando(null)}
          onGuardado={() => { setEditando(null); recargar(); }}
        />
      )}
    </PageShell>
  );
}

function EditarModal({
  hito,
  onClose,
  onGuardado,
}: {
  hito: HitoConUso | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const { toast } = useToast();
  const esNuevo = hito === null;
  const [codigo, setCodigo] = useState(hito?.Codigo ?? '');
  const [nombre, setNombre] = useState(hito?.Nombre ?? '');
  const [orden, setOrden] = useState(hito ? String(hito.OrdenEstandar) : '');
  const [descripcion, setDescripcion] = useState(hito?.Descripcion ?? '');
  const [color, setColor] = useState(hito?.ColorHEX ?? '#888888');
  const [activo, setActivo] = useState(hito ? hito.Activo : true);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    try {
      const body = {
        Codigo: codigo.trim().toUpperCase(),
        Nombre: nombre.trim(),
        OrdenEstandar: Number(orden),
        Descripcion: descripcion.trim() || null,
        ColorHEX: color || null,
        Activo: activo,
      };
      const r = await fetch(
        esNuevo ? '/api/desembolsos/catalogo-hitos' : `/api/desembolsos/catalogo-hitos/${hito!.IDHito}`,
        {
          method: esNuevo ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
      toast(esNuevo ? 'Hito creado.' : 'Hito actualizado.', 'success');
      onGuardado();
    } catch (e) {
      toast(`No se pudo guardar: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-ds bg-ds-surface p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sub-sm font-bold">{esNuevo ? 'Nuevo hito' : `Editar ${hito!.Codigo}`}</h2>
        {!esNuevo && (
          <p className="mt-1 text-xs text-ds-gray-500">
            {hito!.BancosUsando} banco(s) lo usan · {hito!.RowsTotales} filas históricas
          </p>
        )}

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Input label="Código" required value={codigo} maxLength={20}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="FIRMA, MUROS…" />
            <Input label="Orden" required type="number" min={1} value={orden}
              onChange={(e) => setOrden(e.target.value)} />
          </div>
          <Input label="Nombre completo" required value={nombre} maxLength={100}
            onChange={(e) => setNombre(e.target.value)} placeholder="Firma de casa, Muros colados…" />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ds-ink">Descripción (opcional)</span>
            <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} maxLength={500}
              className="w-full rounded-ds-xl border-2 border-transparent bg-ds-surface px-4 py-2 text-sm shadow-ds-01 focus:border-black focus:outline-none" />
          </label>
          <div className="flex items-end gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ds-ink">Color</span>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                className="h-12 w-20 cursor-pointer rounded-ds border-2 border-ds-gray-200" />
            </label>
            <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="h-4 w-4" />
              <span>Activo (disponible para esquemas nuevos)</span>
            </label>
          </div>
          {!esNuevo && hito!.BancosUsando > 0 && !activo && (
            <p className="rounded-ds border border-ds-yellow bg-ds-yellow/10 px-3 py-2 text-xs text-ds-yellow-ink">
              Atención: {hito!.BancosUsando} banco(s) aún lo usan en su esquema vigente. Desactivarlo
              lo oculta para esquemas nuevos, pero los vigentes lo siguen mostrando.
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={guardar} loading={guardando} disabled={!codigo || !nombre || !orden}>
            {esNuevo ? 'Crear hito' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
