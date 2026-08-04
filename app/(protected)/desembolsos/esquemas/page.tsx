'use client';

import { useEffect, useState } from 'react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import type {
  CatalogoHito,
  EsquemaBancoResumen,
  RespuestaEsquemas,
} from '@/lib/desembolsos/esquemas';

/**
 * Admin · Esquemas de desembolso por banco — cómo reparte cada banco el
 * desembolso entre los hitos físicos. Portado de `EsquemasPantalla`. Versionado:
 * editar la vigente o crear una nueva vigencia. Los días de solicitud/desembolso
 * y el día fijo del perito alimentan el cálculo de fechas en la matriz.
 */

const DIAS = [
  { value: '', label: 'Perito flexible' },
  { value: 1, label: 'Lunes' }, { value: 2, label: 'Martes' }, { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' }, { value: 5, label: 'Viernes' }, { value: 6, label: 'Sábado' }, { value: 7, label: 'Domingo' },
];

function nombreDia(d: number | null): string {
  if (d == null) return 'flexible';
  return ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][d] ?? '?';
}

export default function EsquemasPage() {
  const { toast } = useToast();
  const [bancos, setBancos] = useState<EsquemaBancoResumen[]>([]);
  const [hitos, setHitos] = useState<CatalogoHito[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sel, setSel] = useState<EsquemaBancoResumen | null>(null);

  function recargar() {
    setCargando(true);
    Promise.all([
      fetch('/api/desembolsos/esquemas').then((r) => (r.ok ? r.json() : Promise.reject(new Error('No autorizado')))),
      fetch('/api/desembolsos/catalogo-hitos').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([d, hs]: [RespuestaEsquemas, CatalogoHito[]]) => {
        setBancos(d.bancos ?? []);
        setHitos(hs ?? []);
      })
      .catch(() => toast('No se pudieron cargar los esquemas.', 'error'))
      .finally(() => setCargando(false));
  }
  useEffect(recargar, []); // eslint-disable-line react-hooks/exhaustive-deps

  const configurados = bancos.filter((b) => b.EsquemaVigente);
  const sinEsquema = bancos.filter((b) => !b.EsquemaVigente);

  return (
    <PageShell width="narrow">
      <PageHeader
        title="Esquemas de desembolso"
        subtitle="Cada banco distribuye el desembolso por hito físico de la obra. Aplican a todos los proyectos. Los días y el día fijo del perito alimentan las fechas proyectadas de la matriz."
      />

      {cargando && <p className="text-ds-gray-400">Cargando bancos…</p>}

      {!cargando && (
        <>
          <SeccionBancos titulo={`Configurados (${configurados.length})`} bancos={configurados} onSel={setSel} />
          {sinEsquema.length > 0 && (
            <SeccionBancos titulo={`Sin esquema (${sinEsquema.length})`} bancos={sinEsquema} onSel={setSel} />
          )}
        </>
      )}

      {sel && (
        <PanelEsquema banco={sel} hitos={hitos} onClose={() => setSel(null)}
          onGuardado={() => { setSel(null); recargar(); }} />
      )}
    </PageShell>
  );
}

function SeccionBancos({
  titulo,
  bancos,
  onSel,
}: {
  titulo: string;
  bancos: EsquemaBancoResumen[];
  onSel: (b: EsquemaBancoResumen) => void;
}) {
  return (
    <section className="mt-4">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-ds-gray-400">{titulo}</div>
      <div className="divide-y divide-ds-gray-100 rounded-ds border border-ds-gray-200 bg-ds-surface">
        {bancos.map((b) => {
          const e = b.EsquemaVigente;
          return (
            <button key={b.IDBan} type="button" onClick={() => onSel(b)}
              className="flex w-full items-center gap-4 px-4 py-4 text-left transition hover:bg-ds-gray-100">
              <div className="flex w-40 items-center gap-2">
                {b.ColorBanco && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.ColorBanco }} />}
                <div>
                  <div className="text-sm font-semibold">{b.AbrevBanco}</div>
                  <div className="text-xs text-ds-gray-400">{b.NombreBanco}</div>
                </div>
              </div>
              <div className="flex-1">
                {e ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
                    {e.Hitos.map((h) => (
                      <span key={h.Codigo} className="text-ds-gray-500">
                        <strong className="text-ds-ink">{h.Codigo}</strong> {h.Porcentaje}%
                        {h.EsMontoFijo ? ' (fijo)' : ''}
                      </span>
                    ))}
                  </div>
                ) : <span className="text-sm italic text-ds-gray-400">Sin esquema — click para crear el primero</span>}
              </div>
              {e && (
                <div className="text-right text-[10px] uppercase text-ds-gray-400">
                  Perito {nombreDia(e.DiaSemanaPeritoFijo)} · {e.Hitos.length} hitos
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

interface FilaHito {
  IDHito: number;
  OrdenEnEsquema: number;
  Porcentaje: string;
  DiasSolicitudVisita: string;
  DiasDesembolsoPostVisita: string;
  EsMontoFijo: boolean;
}

function PanelEsquema({
  banco,
  hitos,
  onClose,
  onGuardado,
}: {
  banco: EsquemaBancoResumen;
  hitos: CatalogoHito[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  const { toast } = useToast();
  const e = banco.EsquemaVigente;
  const [modo, setModo] = useState<'editar' | 'nueva'>(e ? 'editar' : 'nueva');
  const [vigenteDesde, setVigenteDesde] = useState('');
  const [diaPerito, setDiaPerito] = useState<string>(e?.DiaSemanaPeritoFijo != null ? String(e.DiaSemanaPeritoFijo) : '');
  const [notas, setNotas] = useState(e?.Notas ?? '');
  const [guardando, setGuardando] = useState(false);
  const [filas, setFilas] = useState<FilaHito[]>(
    e && e.Hitos.length
      ? e.Hitos.map((h) => ({
          IDHito: h.IDHito, OrdenEnEsquema: h.OrdenEnEsquema, Porcentaje: String(h.Porcentaje),
          DiasSolicitudVisita: String(h.DiasSolicitudVisita), DiasDesembolsoPostVisita: String(h.DiasDesembolsoPostVisita),
          EsMontoFijo: !!h.EsMontoFijo,
        }))
      : [{ IDHito: hitos[0]?.IDHito ?? 0, OrdenEnEsquema: 1, Porcentaje: '', DiasSolicitudVisita: '0', DiasDesembolsoPostVisita: '0', EsMontoFijo: false }],
  );

  // Solo los hitos de monto variable entran en la suma de 100.
  const suma = filas.filter((f) => !f.EsMontoFijo).reduce((a, f) => a + (Number(f.Porcentaje) || 0), 0);
  const sumaOk = Math.abs(suma - 100) < 0.001;

  function setFila(i: number, patch: Partial<FilaHito>) {
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function agregar() {
    setFilas((prev) => [...prev, {
      IDHito: hitos[0]?.IDHito ?? 0, OrdenEnEsquema: prev.length + 1, Porcentaje: '',
      DiasSolicitudVisita: '0', DiasDesembolsoPostVisita: '0', EsMontoFijo: false,
    }]);
  }
  function quitar(i: number) {
    setFilas((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function guardar() {
    if (!sumaOk) { toast(`La suma de % (variables) debe ser 100 (va ${suma}).`, 'error'); return; }
    if (modo === 'nueva' && !/^\d{4}-\d{2}-\d{2}$/.test(vigenteDesde)) {
      toast('Ingresá la fecha de vigencia (YYYY-MM-DD).', 'error'); return;
    }
    const Hitos = filas.map((f, i) => ({
      IDHito: f.IDHito,
      OrdenEnEsquema: f.OrdenEnEsquema || i + 1,
      Porcentaje: Number(f.Porcentaje) || 0,
      DiasSolicitudVisita: Number(f.DiasSolicitudVisita) || 0,
      DiasDesembolsoPostVisita: Number(f.DiasDesembolsoPostVisita) || 0,
    }));
    const DiaSemanaPeritoFijo = diaPerito ? Number(diaPerito) : null;
    setGuardando(true);
    try {
      const r = modo === 'nueva'
        ? await fetch('/api/desembolsos/esquemas', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ IDBan: banco.IDBan, VigenteDesde: vigenteDesde, DiaSemanaPeritoFijo, Notas: notas || null, Hitos }),
          })
        : await fetch(`/api/desembolsos/esquemas/${banco.IDBan}/vigente`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ DiaSemanaPeritoFijo, Notas: notas || null, Hitos }),
          });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
      toast(modo === 'nueva' ? 'Nueva vigencia creada.' : 'Esquema vigente actualizado.', 'success');
      onGuardado();
    } catch (err) {
      toast(`No se pudo guardar: ${err instanceof Error ? err.message : err}`, 'error');
    } finally {
      setGuardando(false);
    }
  }

  const nombreHito = (id: number) => hitos.find((h) => h.IDHito === id)?.Codigo ?? `#${id}`;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside className="h-full w-full max-w-lg overflow-y-auto bg-ds-surface p-6 shadow-xl" onClick={(ev) => ev.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-sub font-bold">{banco.AbrevBanco}</h2>
            <p className="text-xs text-ds-gray-400">{banco.NombreBanco}</p>
          </div>
          <button onClick={onClose} className="text-sub leading-none text-ds-gray-400 hover:text-ds-ink">×</button>
        </div>

        {e && (
          <div className="mb-4 flex gap-2">
            <Button size="sm" variant={modo === 'editar' ? 'primary' : 'outline'} onClick={() => setModo('editar')}>Editar vigente</Button>
            <Button size="sm" variant={modo === 'nueva' ? 'primary' : 'outline'} onClick={() => setModo('nueva')}>Nueva vigencia</Button>
          </div>
        )}

        <div className="space-y-4">
          {modo === 'nueva' && (
            <Input label="Vigente desde" type="date" required value={vigenteDesde}
              onChange={(ev) => setVigenteDesde(ev.target.value)} />
          )}
          <Select label="Día fijo del perito" value={diaPerito}
            onChange={(ev) => setDiaPerito(ev.target.value)} options={DIAS} />

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium">Hitos</span>
              <span className={`text-sm tabular-nums ${sumaOk ? 'text-ds-green-ink' : 'text-ds-red'}`}>Suma variable {suma}%</span>
            </div>
            <div className="space-y-2">
              {filas.map((f, i) => (
                <div key={i} className="rounded-ds border border-ds-gray-200 p-2">
                  <div className="flex items-center gap-2">
                    <select value={f.IDHito} onChange={(ev) => setFila(i, { IDHito: Number(ev.target.value) })}
                      className="h-9 flex-1 rounded-ds border-2 border-transparent bg-ds-surface px-2 text-sm shadow-ds-01 focus:border-black focus:outline-none">
                      {hitos.map((h) => <option key={h.IDHito} value={h.IDHito}>{h.Codigo} — {h.Nombre}</option>)}
                    </select>
                    <input type="number" min={0} max={100} step="0.01" value={f.Porcentaje} placeholder="%"
                      disabled={f.EsMontoFijo}
                      onChange={(ev) => setFila(i, { Porcentaje: ev.target.value })}
                      className="h-9 w-20 rounded-ds border-2 border-transparent bg-ds-surface px-2 text-right text-sm tabular-nums shadow-ds-01 focus:border-black focus:outline-none disabled:bg-ds-gray-100" />
                    <button type="button" onClick={() => quitar(i)} className="px-2 text-ds-gray-400 hover:text-ds-red" title="Quitar">×</button>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-ds-gray-500">
                    <label className="flex items-center gap-1">Solicitud
                      <input type="number" min={0} value={f.DiasSolicitudVisita}
                        onChange={(ev) => setFila(i, { DiasSolicitudVisita: ev.target.value })}
                        className="h-7 w-14 rounded border border-ds-gray-200 px-1 text-right tabular-nums" /> d
                    </label>
                    <label className="flex items-center gap-1">Post-visita
                      <input type="number" min={0} value={f.DiasDesembolsoPostVisita}
                        onChange={(ev) => setFila(i, { DiasDesembolsoPostVisita: ev.target.value })}
                        className="h-7 w-14 rounded border border-ds-gray-200 px-1 text-right tabular-nums" /> d
                    </label>
                    {f.EsMontoFijo && <span className="ml-auto italic">{nombreHito(f.IDHito)}: monto fijo</span>}
                  </div>
                </div>
              ))}
            </div>
            <Button size="xs" variant="ghost" className="mt-2" onClick={agregar}>+ Agregar hito</Button>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Notas (opcional)</span>
            <textarea value={notas} onChange={(ev) => setNotas(ev.target.value)} rows={2} maxLength={500}
              className="w-full rounded-ds-xl border-2 border-transparent bg-ds-surface px-4 py-2 text-sm shadow-ds-01 focus:border-black focus:outline-none" />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={guardar} loading={guardando} disabled={!sumaOk}>
            {modo === 'nueva' ? 'Crear vigencia' : 'Guardar'}
          </Button>
        </div>
      </aside>
    </div>
  );
}
