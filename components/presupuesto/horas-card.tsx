'use client';
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { useToast } from '@/components/ui/Toast';
import { Icon } from '@/components/ds/Icon/Icon';

// Sección "Presupuesto de Horas y Cantidades": sube la plantilla, muestra la vista
// previa EDITABLE (podés elegir/cambiar la subpartida por fila) y guarda en h4
// (nueva versión vigente por subpartida). BC es espejo (pendiente del campo de horas).

interface SubCat { codigo: string; nombre: string; partida: string }
interface FilaApi {
  fila: number;
  codigoObra: string;
  obraNombre: string | null;
  obraOk: boolean;
  codigoResuelto: string;
  sugerenciaCodigo: string | null;
  nombreOriginal: string | null;
  cantidad: number | null;
  horas: number | null;
}
type Origen = 'excel' | 'sugerido' | 'manual' | 'vacio';
interface Row extends FilaApi { codigo: string; origen: Origen }

const nf = (n: number | null | undefined) => (n ?? 0).toLocaleString('es-CR', { maximumFractionDigits: 2 });

function Chip({ label, value, tone }: { label: string; value: string | number; tone?: 'ok' | 'bad' | 'warn' }) {
  return (
    <div className="rounded-ds border border-ds-gray-100 p-2.5 min-w-[104px]">
      <p className="text-ds-gray-400 text-xs">{label}</p>
      <p className={'font-bold text-sm mt-0.5 ' + (tone === 'ok' ? 'text-ds-green-ink' : tone === 'bad' ? 'text-ds-red' : tone === 'warn' ? 'text-ds-yellow-ink' : 'text-ds-ink')}>{value}</p>
    </div>
  );
}

export function PresupuestoHorasCard() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [subpartidas, setSubpartidas] = useState<SubCat[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [guardado, setGuardado] = useState<{ guardadas: number; obras: number } | null>(null);

  // Opciones del desplegable de subpartida (una sola vez por carga).
  const opciones = useMemo(
    () => subpartidas.map((s) => ({
      value: s.codigo,
      label: `${s.codigo} — ${s.nombre}`,
      parts: [{ text: s.codigo, weight: 'bold' as const }, { text: s.nombre, weight: 'light' as const }],
      search: `${s.codigo} ${s.nombre} ${s.partida}`,
    })),
    [subpartidas],
  );
  const codigosValidos = useMemo(() => new Set(subpartidas.map((s) => s.codigo)), [subpartidas]);

  // Derivar validez + estado por fila y el resumen, en vivo, desde `rows`.
  const derivado = useMemo(() => {
    if (!rows) return null;
    const cuenta = new Map<string, number>();
    for (const r of rows) if (r.codigo) cuenta.set(`${r.codigoObra}:${r.codigo}`, (cuenta.get(`${r.codigoObra}:${r.codigo}`) ?? 0) + 1);
    const vistos = new Set<string>();
    const filas = rows.map((r) => {
      const clave = `${r.codigoObra}:${r.codigo}`;
      let estado: { text: string; tone: 'ok' | 'bad' | 'warn' };
      let valida = false;
      const horasOk = r.horas != null && r.horas > 0;
      const dupPrevio = r.codigo ? vistos.has(clave) : false;
      if (r.codigo) vistos.add(clave);
      if (!r.obraOk) estado = { text: `Obra desconocida (${r.codigoObra || '—'})`, tone: 'bad' };
      else if (!r.codigo) estado = { text: 'Elegí subpartida', tone: 'bad' };
      else if (!codigosValidos.has(r.codigo)) estado = { text: 'Subpartida inválida', tone: 'bad' };
      else if (!horasOk) estado = { text: 'Horas inválidas (> 0)', tone: 'bad' };
      else if (dupPrevio || (cuenta.get(clave) ?? 0) > 1) estado = { text: 'Duplicada (obra + subpartida)', tone: dupPrevio ? 'bad' : 'warn' };
      else if (r.origen === 'sugerido') { estado = { text: 'Sugerido — confirmá', tone: 'warn' }; valida = true; }
      else { estado = { text: 'OK', tone: 'ok' }; valida = true; }
      // Un duplicado (2da+ vez) no es válido para guardar.
      if (dupPrevio) valida = false;
      return { ...r, estado, valida };
    });
    const validas = filas.filter((f) => f.valida);
    return {
      filas,
      resumen: {
        total: filas.length,
        validas: validas.length,
        conError: filas.length - validas.length,
        sugeridas: validas.filter((f) => f.origen === 'sugerido').length,
        sumaHoras: validas.reduce((s, f) => s + (f.horas ?? 0), 0),
        sumaCantidad: validas.reduce((s, f) => s + (f.cantidad ?? 0), 0),
        obras: new Set(validas.map((f) => f.codigoObra)).size,
      },
    };
  }, [rows, codigosValidos]);

  async function leer() {
    const file = fileRef.current?.files?.[0];
    if (!file) { toast('Elegí el Excel de horas primero', 'warning'); return; }
    const fd = new FormData();
    fd.append('archivo', file);
    setLeyendo(true); setRows(null); setGuardado(null);
    try {
      const res = await fetch('/api/presupuesto/horas/parse', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || 'No se pudo leer el Excel', 'error'); return; }
      setSubpartidas(data.subpartidas ?? []);
      const filas: FilaApi[] = data.filas ?? [];
      const nuevas: Row[] = filas.map((f) => {
        const codigo = f.codigoResuelto || f.sugerenciaCodigo || '';
        const origen: Origen = f.codigoResuelto ? 'excel' : f.sugerenciaCodigo ? 'sugerido' : 'vacio';
        return { ...f, codigo, origen };
      });
      setRows(nuevas);
      const nSug = nuevas.filter((r) => r.origen === 'sugerido').length;
      const nVacio = nuevas.filter((r) => r.origen === 'vacio').length;
      toast(`Leído: ${nuevas.length} filas${nSug ? ` · ${nSug} sugeridas` : ''}${nVacio ? ` · ${nVacio} sin subpartida` : ''}`, 'success');
    } finally { setLeyendo(false); }
  }

  function setCodigo(fila: number, codigo: string) {
    setRows((prev) => prev?.map((r) => r.fila === fila ? { ...r, codigo, origen: codigo ? 'manual' : 'vacio' } : r) ?? prev);
  }

  async function guardar() {
    if (!derivado) return;
    const validas = derivado.filas.filter((f) => f.valida)
      .map((f) => ({ codigoObra: f.codigoObra, codigoSubpartida: f.codigo, cantidad: f.cantidad, horas: f.horas }));
    if (validas.length === 0) { toast('No hay filas válidas para guardar', 'warning'); return; }
    setGuardando(true); setGuardado(null);
    try {
      const res = await fetch('/api/presupuesto/horas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filas: validas }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || 'No se pudo guardar', 'error'); return; }
      setGuardado({ guardadas: data.guardadas ?? validas.length, obras: data.obras ?? 0 });
      toast(`Guardado: ${data.guardadas ?? validas.length} subpartidas presupuestadas`, 'success');
    } finally { setGuardando(false); }
  }

  const r = derivado?.resumen;

  return (
    <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="w-7 h-7 rounded-full bg-brand text-black text-sm font-bold flex items-center justify-center shrink-0 mt-0.5">
          <Icon name="reloj" size="sm" color="currentColor" />
        </span>
        <div className="min-w-0">
          <h2 className="text-body font-bold text-ds-ink leading-tight">Presupuesto de Horas y Cantidades</h2>
          <p className="text-ds-gray-400 text-xs mt-0.5">Subí la plantilla y elegí/corregí la subpartida de cada fila. Cada carga crea una nueva versión vigente por subpartida.</p>
        </div>
      </div>

      <div className="rounded-ds-lg border border-ds-gray-100 p-4 space-y-2">
        <input ref={fileRef} type="file" accept=".xlsx,.xls"
          className="block w-full text-sm text-ds-gray-500 file:mr-3 file:rounded-ds file:border-0 file:bg-black file:text-white file:px-4 file:py-2 file:text-sm file:font-semibold file:cursor-pointer" />
        <Button variant="outline" size="sm" onClick={leer} loading={leyendo} disabled={leyendo}
          icon={<Icon name="open" size="sm" color="currentColor" />}>Leer Excel</Button>
      </div>

      {r && (
        <div className="flex flex-wrap gap-2">
          <Chip label="Filas" value={r.total} />
          <Chip label="Válidas" value={r.validas} tone="ok" />
          <Chip label="Con error" value={r.conError} tone={r.conError > 0 ? 'bad' : undefined} />
          <Chip label="Sugeridas" value={r.sugeridas} tone={r.sugeridas > 0 ? 'warn' : undefined} />
          <Chip label="Obras" value={r.obras} />
          <Chip label="Total horas (HH)" value={nf(r.sumaHoras)} />
          <Chip label="Total cantidad" value={nf(r.sumaCantidad)} />
        </div>
      )}

      {derivado && derivado.filas.length > 0 && (
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto border border-ds-gray-200 rounded-ds-lg">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-ds-gray-100 border-b border-ds-gray-200">
                <th className="px-3 py-2.5 text-left font-semibold text-ds-gray-500 text-xs uppercase tracking-wide">Obra</th>
                <th className="px-3 py-2.5 text-left font-semibold text-ds-gray-500 text-xs uppercase tracking-wide min-w-[260px]">Subpartida</th>
                <th className="px-3 py-2.5 text-right font-semibold text-ds-gray-500 text-xs uppercase tracking-wide">Cantidad</th>
                <th className="px-3 py-2.5 text-right font-semibold text-ds-gray-500 text-xs uppercase tracking-wide">Horas</th>
                <th className="px-3 py-2.5 text-left font-semibold text-ds-gray-500 text-xs uppercase tracking-wide">Estado</th>
              </tr>
            </thead>
            <tbody>
              {derivado.filas.map((f) => (
                <tr key={f.fila} className={'border-b border-ds-gray-100 align-top ' + (f.estado.tone === 'bad' ? 'bg-ds-red/5' : '')}>
                  <td className="py-2 px-3">
                    <span className="font-mono text-xs text-ds-ink">{f.codigoObra || '—'}</span>
                    {f.obraNombre && <span className="block text-ds-gray-400 text-xs truncate max-w-[140px]">{f.obraNombre}</span>}
                  </td>
                  <td className="py-2 px-3">
                    <Combobox
                      value={f.codigo}
                      onChange={(v) => setCodigo(f.fila, v)}
                      options={opciones}
                      placeholder="Elegí subpartida…"
                      emptyText="Sin coincidencias"
                    />
                    {f.nombreOriginal && (
                      <span className="block text-ds-gray-400 text-xs mt-1 truncate max-w-[260px]">
                        Excel: <span className="text-ds-gray-500">{f.nombreOriginal}</span>
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">{f.cantidad == null ? '—' : nf(f.cantidad)}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-semibold">{f.horas == null ? '—' : nf(f.horas)}</td>
                  <td className="py-2 px-3">
                    <span className={
                      'text-xs ' + (f.estado.tone === 'ok' ? 'text-ds-green-ink' : f.estado.tone === 'warn' ? 'text-ds-yellow-ink' : 'text-ds-red')
                    }>
                      {f.estado.tone === 'ok' && <Icon name="check" size="sm" color="currentColor" />} {f.estado.text}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {r && (
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={guardar} loading={guardando} disabled={guardando || r.validas === 0}
            icon={<Icon name="arrow-right" size="sm" color="currentColor" />}>
            Guardar {r.validas} en h4
          </Button>
          {r.conError > 0 && <span className="text-ds-red text-xs">{r.conError} fila(s) sin guardar (obra/subpartida/horas). Se guardan solo las válidas.</span>}
          {r.sugeridas > 0 && <span className="text-ds-yellow-ink text-xs">{r.sugeridas} sugerida(s) — revisá que la subpartida sea la correcta.</span>}
          <span className="text-ds-gray-400 text-xs">Business Central: espejo pendiente (campo de horas en BC).</span>
        </div>
      )}

      {guardado && (
        <div className="rounded-ds-lg border border-brand/40 bg-brand-soft px-4 py-3 flex items-center gap-2.5">
          <Icon name="check" size="sm" color="currentColor" />
          <span className="text-sm font-semibold text-ds-ink">Guardado en h4: {guardado.guardadas} subpartidas presupuestadas en {guardado.obras} obra(s).</span>
        </div>
      )}
    </div>
  );
}
