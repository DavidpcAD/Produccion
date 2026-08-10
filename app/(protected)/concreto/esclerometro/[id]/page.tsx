'use client';
import { useState, useEffect, use, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { DatePicker } from '@/components/ui/DatePicker';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { Icon } from '@/components/ds/Icon/Icon';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { ANGULOS_IMPACTO, calcularReboteUtilPromedio } from '@/lib/concreto/tipos-esclerometro';
import type { EnsayoEsclerometroDetalle, Rebote } from '@/lib/concreto/tipos-esclerometro';

// `/concreto/esclerometro/[id]` — detalle de un ensayo de esclerómetro.
//  - Header con datos del ensayo + edición inline (modo edición).
//  - Tabla de rebotes editable (agregar/editar/borrar cada golpe).
//  - Promedio útil (descarta max/min con ≥3 golpes) y promedio bruto.
//  - Botón eliminar el ensayo completo (solo admin).

const ETIQUETAS_ANGULO: Record<number, string> = {
  [-90]: '↓ Hacia abajo (-90°)',
  [-45]: '↘ Diagonal abajo (-45°)',
  [0]: '→ Horizontal (0°)',
  [45]: '↗ Diagonal arriba (45°)',
  [90]: '↑ Hacia arriba (90°)',
};

function fmtFechaLarga(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function fmtDia(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function Dato({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-semibold text-ds-gray-400">{label}</p>
      <p className="text-sm font-semibold text-ds-ink">{value}</p>
    </div>
  );
}

export default function EsclerometroDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [ensayo, setEnsayo] = useState<EnsayoEsclerometroDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/concreto/lab/esclerometro/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se encontró el ensayo');
      setEnsayo(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando ensayo');
      setEnsayo(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // --- Edición del header --------------------------------------------------
  const [modoEdicion, setModoEdicion] = useState(false);
  const [editFecha, setEditFecha] = useState('');
  const [editElemento, setEditElemento] = useState('');
  const [editEdad, setEditEdad] = useState('');
  const [editAngulo, setEditAngulo] = useState(0);
  const [editEquipo, setEditEquipo] = useState('');
  const [editIdCasa, setEditIdCasa] = useState('');
  const [editObra, setEditObra] = useState('');
  const [editNotas, setEditNotas] = useState('');
  const [guardandoHeader, setGuardandoHeader] = useState(false);

  const abrirEdicion = () => {
    if (!ensayo) return;
    setEditFecha(ensayo.fecha.slice(0, 10));
    setEditElemento(ensayo.elemento_estructural);
    setEditEdad(ensayo.edad_dias === null ? '' : String(ensayo.edad_dias));
    setEditAngulo(ensayo.angulo_impacto);
    setEditEquipo(ensayo.equipo_serial ?? '');
    setEditIdCasa(ensayo.id_casa ?? '');
    setEditObra(ensayo.obra_works_no ?? '');
    setEditNotas(ensayo.notas ?? '');
    setModoEdicion(true);
  };

  const guardarEdicion = async () => {
    if (!ensayo) return;
    const edadNum = editEdad.trim() === '' ? null : Number(editEdad);
    if (edadNum !== null && (!Number.isInteger(edadNum) || edadNum <= 0 || edadNum > 3650)) {
      toast('Edad inválida (1-3650)', 'warning');
      return;
    }
    if (editElemento.trim().length === 0) {
      toast('El elemento estructural es requerido', 'warning');
      return;
    }
    setGuardandoHeader(true);
    try {
      const res = await fetch(`/api/concreto/lab/esclerometro/${ensayo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha: editFecha,
          elemento_estructural: editElemento.trim(),
          edad_dias: edadNum,
          angulo_impacto: editAngulo,
          equipo_serial: editEquipo.trim() || null,
          id_casa: editIdCasa.trim() || null,
          obra_works_no: editObra.trim() || null,
          notas: editNotas.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error guardando');
      setEnsayo(data);
      setModoEdicion(false);
      toast('Ensayo actualizado', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error guardando', 'error');
    } finally {
      setGuardandoHeader(false);
    }
  };

  const onEliminarEnsayo = async () => {
    if (!ensayo) return;
    const ok = await confirm({
      title: 'Eliminar ensayo',
      message: `¿Eliminar el ensayo #${ensayo.numero}? Se borran también sus rebotes.`,
      danger: true,
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/concreto/lab/esclerometro/${ensayo.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error eliminando');
      toast('Ensayo eliminado', 'success');
      router.push('/concreto/esclerometro');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error eliminando', 'error');
    }
  };

  // --- Rebotes -------------------------------------------------------------
  const proximoNumeroGolpe = useMemo(() => {
    if (!ensayo || ensayo.rebotes.length === 0) return 1;
    return Math.max(...ensayo.rebotes.map((r) => r.numero_golpe)) + 1;
  }, [ensayo]);

  const promedio = useMemo(() => {
    if (!ensayo) return null;
    return calcularReboteUtilPromedio(ensayo.rebotes.map((r) => r.valor_rebote));
  }, [ensayo]);

  const promedioBruto = useMemo(() => {
    if (!ensayo || ensayo.rebotes.length === 0) return null;
    return ensayo.rebotes.reduce((s, r) => s + r.valor_rebote, 0) / ensayo.rebotes.length;
  }, [ensayo]);

  const [nuevoValor, setNuevoValor] = useState('');
  const [nuevoNotas, setNuevoNotas] = useState('');
  const [agregando, setAgregando] = useState(false);

  const agregarRebote = async () => {
    if (!ensayo) return;
    const v = Number(nuevoValor);
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      toast('Valor de rebote inválido (0-100)', 'warning');
      return;
    }
    setAgregando(true);
    try {
      const res = await fetch(`/api/concreto/lab/esclerometro/${ensayo.id}/rebotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numero_golpe: proximoNumeroGolpe,
          valor_rebote: v,
          notas: nuevoNotas.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error agregando golpe');
      setNuevoValor('');
      setNuevoNotas('');
      await cargar();
      queueMicrotask(() => {
        const el = document.getElementById('nuevo-valor') as HTMLInputElement | null;
        el?.focus();
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error agregando golpe', 'error');
    } finally {
      setAgregando(false);
    }
  };

  const actualizarRebote = async (
    reboteId: number,
    cambios: { valor_rebote?: number; notas?: string | null },
  ) => {
    try {
      const res = await fetch(`/api/concreto/lab/esclerometro/rebotes/${reboteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cambios),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error guardando golpe');
      await cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error guardando golpe', 'error');
      await cargar();
    }
  };

  const eliminarRebote = async (rebote: Rebote) => {
    const ok = await confirm({
      message: `¿Eliminar golpe #${rebote.numero_golpe}?`,
      danger: true,
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/concreto/lab/esclerometro/rebotes/${rebote.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error eliminando golpe');
      await cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error eliminando golpe', 'error');
    }
  };

  // --- Render --------------------------------------------------------------
  if (loading) {
    return (
      <PageShell width="narrow" className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" rounded="rounded-ds-lg" />
        <Skeleton className="h-64 w-full" rounded="rounded-ds-lg" />
      </PageShell>
    );
  }

  if (error || !ensayo) {
    return (
      <PageShell width="narrow" className="space-y-4">
        <Button variant="ghost" size="sm" icon={<Icon name="back" />} onClick={() => router.push('/concreto/esclerometro')}>
          Volver
        </Button>
        <p className="text-sm text-ds-red">{error ?? 'No se encontró el ensayo.'}</p>
      </PageShell>
    );
  }

  const rebotesOrdenados = ensayo.rebotes
    .slice()
    .sort((a, b) => a.numero_golpe - b.numero_golpe);

  return (
    <PageShell width="narrow" className="space-y-4">
      <PageHeader
        back={
          <Button
            variant="ghost"
            size="sm"
            icon={<Icon name="back" />}
            onClick={() => router.push('/concreto/esclerometro')}
          >
            Volver al listado
          </Button>
        }
        title={null}
        actions={
          <>
            {!modoEdicion && (
              <Button variant="outline" size="sm" icon={<Icon name="edit" />} onClick={abrirEdicion}>
                Editar
              </Button>
            )}
            <Button
              variant="danger"
              size="sm"
              icon={<Icon name="delete" />}
              onClick={onEliminarEnsayo}
            >
              Eliminar
            </Button>
          </>
        }
      />

      {/* Header del ensayo */}
      <div className="rounded-ds-lg border border-ds-gray-100 bg-ds-surface p-6 shadow-ds-01">
        <div className="mb-4 flex items-center gap-3">
          <h1 className="text-heading font-bold text-ds-ink">Ensayo #{ensayo.numero}</h1>
          <span className="text-sm text-ds-gray-400">{fmtDia(ensayo.fecha)}</span>
        </div>

        {!modoEdicion ? (
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Dato
              label="Obra"
              value={
                ensayo.obra_works_no ? (
                  <span>
                    {ensayo.obra_works_no}
                    {ensayo.obra_display_name && (
                      <span className="text-ds-gray-400"> — {ensayo.obra_display_name}</span>
                    )}
                  </span>
                ) : (
                  <span className="text-ds-gray-300">—</span>
                )
              }
            />
            <Dato label="Casa / ubicación" value={ensayo.id_casa || <span className="text-ds-gray-300">—</span>} />
            <Dato label="Elemento estructural" value={ensayo.elemento_estructural} />
            <Dato
              label="Edad (días)"
              value={ensayo.edad_dias ?? <span className="text-ds-gray-300">—</span>}
            />
            <Dato
              label="Ángulo de impacto"
              value={ETIQUETAS_ANGULO[ensayo.angulo_impacto] ?? `${ensayo.angulo_impacto}°`}
            />
            <Dato
              label="Equipo"
              value={ensayo.equipo_serial || <span className="text-ds-gray-300">—</span>}
            />
            {ensayo.notas && (
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs font-semibold text-ds-gray-400">Notas</p>
                <p className="whitespace-pre-wrap text-sm text-ds-ink">{ensayo.notas}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <DatePicker label="Fecha" value={editFecha} onChange={setEditFecha} required />
              <Input
                label="Elemento estructural"
                value={editElemento}
                onChange={(e) => setEditElemento(e.target.value)}
                required
              />
              <Input
                label="Edad (días)"
                type="number"
                value={editEdad}
                onChange={(e) => setEditEdad(e.target.value)}
                min={1}
                max={3650}
              />
              <Select
                label="Ángulo"
                value={String(editAngulo)}
                onChange={(e) => setEditAngulo(Number(e.target.value))}
                options={ANGULOS_IMPACTO.map((a) => ({
                  value: String(a),
                  label: ETIQUETAS_ANGULO[a] ?? `${a}°`,
                }))}
              />
              <Input
                label="Equipo (serial)"
                value={editEquipo}
                onChange={(e) => setEditEquipo(e.target.value)}
              />
              <Input
                label="Casa / ubicación"
                value={editIdCasa}
                onChange={(e) => setEditIdCasa(e.target.value)}
              />
              <Input
                label="Obra (works_no)"
                value={editObra}
                onChange={(e) => setEditObra(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="e-notas" className="text-sm font-medium text-ds-ink">
                Notas
              </label>
              <textarea
                id="e-notas"
                value={editNotas}
                onChange={(e) => setEditNotas(e.target.value)}
                className="min-h-[64px] w-full rounded-ds-xl border-2 border-transparent bg-ds-surface px-5 py-3 text-body-sm text-ds-ink shadow-ds-01 focus:border-black focus:shadow-none focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                icon={<Icon name="check" />}
                onClick={guardarEdicion}
                loading={guardandoHeader}
                disabled={guardandoHeader}
              >
                Guardar cambios
              </Button>
              <Button variant="ghost" onClick={() => setModoEdicion(false)} disabled={guardandoHeader}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Rebotes */}
      <div className="rounded-ds-lg border border-ds-gray-100 bg-ds-surface shadow-ds-01">
        <div className="flex flex-col gap-1 border-b border-ds-gray-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-body font-bold text-ds-ink">Rebotes ({ensayo.rebotes.length})</h2>
          <div className="flex flex-col text-xs sm:items-end">
            {promedio !== null && (
              <span className="text-sm font-semibold text-ds-ink tabular-nums">
                R̄ útil: {promedio.toFixed(2)}
              </span>
            )}
            {promedioBruto !== null && ensayo.rebotes.length >= 3 && (
              <span className="text-ds-gray-400">
                (bruto {promedioBruto.toFixed(2)} con todos los golpes)
              </span>
            )}
            {ensayo.rebotes.length > 0 && ensayo.rebotes.length < 3 && (
              <span className="text-ds-yellow-ink">
                Se recomiendan ≥ 3 golpes para descartar outliers.
              </span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ds-gray-100 text-left text-xs font-semibold text-ds-gray-400">
                <th className="w-[80px] px-6 py-2">Golpe</th>
                <th className="w-[160px] px-4 py-2">Valor R</th>
                <th className="px-4 py-2">Notas</th>
                <th className="w-[60px] px-6 py-2" />
              </tr>
            </thead>
            <tbody>
              {ensayo.rebotes.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-sm text-ds-gray-400">
                    Sin rebotes registrados. Agregá el primer golpe abajo.
                  </td>
                </tr>
              )}
              {rebotesOrdenados.map((r) => (
                <FilaRebote
                  key={r.id}
                  rebote={r}
                  onActualizar={actualizarRebote}
                  onEliminar={() => eliminarRebote(r)}
                />
              ))}
              {/* Fila para agregar */}
              <tr className="bg-ds-gray-100/40">
                <td className="px-6 py-2 font-semibold tabular-nums">{proximoNumeroGolpe}</td>
                <td className="px-4 py-2">
                  <input
                    id="nuevo-valor"
                    type="number"
                    step="0.1"
                    min={0}
                    max={100}
                    value={nuevoValor}
                    onChange={(e) => setNuevoValor(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        agregarRebote();
                      }
                    }}
                    placeholder="0.0 - 100.0"
                    className="h-9 w-28 rounded-ds border-2 border-transparent bg-ds-surface px-3 text-sm text-ds-ink shadow-ds-01 focus:border-black focus:shadow-none focus:outline-none"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    value={nuevoNotas}
                    onChange={(e) => setNuevoNotas(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        agregarRebote();
                      }
                    }}
                    placeholder="(opcional)"
                    className="h-9 w-full rounded-ds border-2 border-transparent bg-ds-surface px-3 text-sm text-ds-ink shadow-ds-01 focus:border-black focus:shadow-none focus:outline-none"
                  />
                </td>
                <td className="px-6 py-2 text-right">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={agregarRebote}
                    disabled={agregando || nuevoValor.trim() === ''}
                    title="Agregar golpe (Enter)"
                  >
                    <Icon name="plus" />
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-ds-gray-400">
        Creado por {ensayo.creado_por_email ?? 'sistema'} el {fmtFechaLarga(ensayo.creado_en)}
        {ensayo.actualizado_en !== ensayo.creado_en && (
          <> · Actualizado {fmtFechaLarga(ensayo.actualizado_en)}</>
        )}
      </div>
    </PageShell>
  );
}

// =============================================================================
// FilaRebote: edición inline con commit onBlur (sin botón "guardar"). El valor
// se guarda al perder foco si cambió; las notas igual.
// =============================================================================

function FilaRebote({
  rebote,
  onActualizar,
  onEliminar,
}: {
  rebote: Rebote;
  onActualizar: (id: number, cambios: { valor_rebote?: number; notas?: string | null }) => void;
  onEliminar: () => void;
}) {
  const { toast } = useToast();
  const [valor, setValor] = useState(String(rebote.valor_rebote));
  const [notas, setNotas] = useState(rebote.notas ?? '');

  const commitValor = () => {
    const v = Number(valor);
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      toast('Valor inválido (0-100)', 'warning');
      setValor(String(rebote.valor_rebote));
      return;
    }
    if (v !== rebote.valor_rebote) onActualizar(rebote.id, { valor_rebote: v });
  };

  const commitNotas = () => {
    const limpio = notas.trim();
    const actual = rebote.notas ?? '';
    if (limpio !== actual) onActualizar(rebote.id, { notas: limpio || null });
  };

  return (
    <tr className="border-b border-ds-gray-100 last:border-0">
      <td className="px-6 py-2 font-semibold tabular-nums">{rebote.numero_golpe}</td>
      <td className="px-4 py-2">
        <input
          type="number"
          step="0.1"
          min={0}
          max={100}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onBlur={commitValor}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="h-9 w-28 rounded-ds border-2 border-transparent bg-ds-surface px-3 text-sm text-ds-ink shadow-ds-01 focus:border-black focus:shadow-none focus:outline-none"
        />
      </td>
      <td className="px-4 py-2">
        <input
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          onBlur={commitNotas}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          placeholder="(opcional)"
          className="h-9 w-full rounded-ds border-2 border-transparent bg-ds-surface px-3 text-sm text-ds-ink shadow-ds-01 focus:border-black focus:shadow-none focus:outline-none"
        />
      </td>
      <td className="px-6 py-2 text-right">
        <Button
          size="xs"
          variant="ghost"
          onClick={onEliminar}
          title="Eliminar golpe"
        >
          <Icon name="delete" />
        </Button>
      </td>
    </tr>
  );
}
