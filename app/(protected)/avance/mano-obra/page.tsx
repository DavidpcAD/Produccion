'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { SkeletonText, SkeletonRows } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { Table } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { formatCRC } from '@/lib/utilidades/format';
import type { SemanaOperativa, NominaSemanal, HorasObra, Subcontrato } from '@/lib/avance/mano-obra';

// Tipos de subcontrato (lista fija, igual que obrascontrol, para poder tabular en
// reportes). El "Tipo" se elige de este catálogo, no se escribe libre.
const TIPOS_SUBCONTRATO = [
  'Instalación Eléctrica',
  'Plomería / Mecánico',
  'Pintura Interior',
  'Pintura Exterior',
  'Acabados Finos',
  'Cielos',
  'Ventanas y Puertas',
  'Pisos',
  'A/C',
  'Otro',
] as const;

// xlsx bajo demanda (importar horas), igual que en compras.
async function loadXLSX(): Promise<typeof import('xlsx')> {
  const m = await import('xlsx');
  return ((m as unknown as { default?: typeof import('xlsx') }).default ?? m) as typeof import('xlsx');
}

type Tab = 'nomina' | 'horas' | 'subcontratos';
const norm = (v: unknown) => String(v ?? '').trim().toUpperCase();

/**
 * Mano de Obra — captura admin (portado de obrascontrol: NominaSemanalPantalla,
 * HorasObraPantalla, SubcontratosPantalla). Nómina directa por semana, horas por
 * obra (definen el reparto) y subcontratos. El cálculo de costo/m² y eficiencia
 * vive en el reporte (se porta con el reporte de avance).
 */
export default function ManoObraPage() {
  const { toast } = useToast();
  const [semanas, setSemanas] = useState<SemanaOperativa[]>([]);
  const [semanaId, setSemanaId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('nomina');

  useEffect(() => {
    fetch('/api/avance/semanas')
      .then((r) => (r.ok ? r.json() : { semanas: [] }))
      .then((d) => {
        const s: SemanaOperativa[] = d.semanas ?? [];
        setSemanas(s);
        setSemanaId((prev) => prev ?? s[0]?.id ?? null);
      })
      .catch(() => toast('No se pudieron cargar las semanas.', 'error'));
  }, [toast]);

  const semanaSel = semanas.find((s) => s.id === semanaId) ?? null;
  const semanaLabel = (s: SemanaOperativa) =>
    `Semana ${s.numero_semana}/${s.anio} · ${s.fecha_inicio} → ${s.fecha_fin}`;

  return (
    <PageShell>
      <PageHeader
        title="Mano de Obra"
        subtitle="Acá se captura, por semana, la mano de obra: el monto de nómina directa, las horas trabajadas en cada obra y los subcontratos. Con eso el sistema reparte el costo de M.O. entre las obras y calcula el costo por m² (Reporte M.O.)."
      />

      {/* Selector de semana (compartido por los tres tabs) */}
      <div className="my-4 max-w-md">
        <Combobox
          label="Semana operativa"
          value={String(semanaId ?? '')}
          onChange={(v) => setSemanaId(Number(v) || null)}
          options={semanas.map((s) => ({ value: String(s.id), label: semanaLabel(s) }))}
          placeholder={semanas.length ? 'Elegí una semana…' : 'Cargando…'}
        />
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Secciones de mano de obra" className="mb-5 flex gap-2 border-b border-ds-gray-200">
        {(['nomina', 'horas', 'subcontratos'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            title={t === 'nomina' ? 'Monto total de nómina directa de la semana y costo teórico por m²' : t === 'horas' ? 'Cuántas horas trabajó el personal en cada obra (para repartir la nómina)' : 'Montos de subcontratos por obra de la semana'}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition rounded-t focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black ${
              tab === t ? 'border-black text-ds-ink' : 'border-transparent text-ds-gray-400 hover:text-ds-ink'
            }`}
          >
            {t === 'nomina' ? 'Nómina' : t === 'horas' ? 'Horas por obra' : 'Subcontratos'}
          </button>
        ))}
      </div>

      {!semanaSel ? (
        <p className="text-ds-gray-400">Elegí una semana para empezar.</p>
      ) : tab === 'nomina' ? (
        <TabNomina semanaId={semanaSel.id} />
      ) : tab === 'horas' ? (
        <TabHoras semanaId={semanaSel.id} />
      ) : (
        <TabSubcontratos semanaId={semanaSel.id} />
      )}
    </PageShell>
  );
}

// ---------------------------------------------------------------- Nómina
function TabNomina({ semanaId }: { semanaId: number }) {
  const { toast } = useToast();
  const [monto, setMonto] = useState('');
  const [teorico, setTeorico] = useState('');
  const [notas, setNotas] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setCargando(true);
    fetch('/api/avance/mano-obra/nomina')
      .then((r) => (r.ok ? r.json() : { nomina: [] }))
      .then((d) => {
        const row = (d.nomina as NominaSemanal[]).find((n) => Number(n.semana_operativa_id) === semanaId);
        setMonto(row ? String(row.monto_nomina_directa) : '');
        setTeorico(row ? String(row.costo_teorico_m2) : '122000');
        setNotas(row?.notas ?? '');
      })
      .catch(() => toast('No se pudo cargar la nómina.', 'error'))
      .finally(() => setCargando(false));
  }, [semanaId, toast]);

  async function guardar() {
    setGuardando(true);
    try {
      const r = await fetch('/api/avance/mano-obra/nomina', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          semana_operativa_id: semanaId,
          monto_nomina_directa: Number(monto) || 0,
          costo_teorico_m2: Number(teorico) || 0,
          notas: notas.trim() || null,
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
      toast('Nómina guardada.', 'success');
    } catch (e) {
      toast(`No se pudo guardar: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <div className="max-w-md"><SkeletonText lines={4} /></div>;

  return (
    <div className="max-w-md space-y-4">
      <p className="rounded-ds border border-ds-gray-100 bg-ds-gray-50 px-3 py-2 text-sm text-ds-gray-500">
        Ingresá el <strong className="text-ds-ink">total</strong> de la planilla directa de la semana (sin subcontratos) y el <strong className="text-ds-ink">costo teórico por m²</strong> presupuestado. Con esto el sistema calcula el costo de M.O. por m² y el sobrecosto.
      </p>
      <Input
        label="Monto nómina directa (₡)"
        type="number"
        min={0}
        value={monto}
        onChange={(e) => setMonto(e.target.value)}
        hint={monto ? formatCRC(Number(monto)) : 'Total pagado en planilla directa esta semana'}
      />
      <Input
        label="Costo teórico por m² (₡)"
        type="number"
        min={0}
        value={teorico}
        onChange={(e) => setTeorico(e.target.value)}
        hint={teorico ? formatCRC(Number(teorico)) : 'Costo de M.O. por m² presupuestado (la meta)'}
      />
      <Input label="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />
      <Button onClick={guardar} loading={guardando}>
        Guardar nómina
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- Horas
interface FilaHoras {
  obra_codigo: string;
  horas: string;
}

function TabHoras({ semanaId }: { semanaId: number }) {
  const { toast } = useToast();
  const [filas, setFilas] = useState<FilaHoras[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCargando(true);
    fetch('/api/avance/mano-obra/horas')
      .then((r) => (r.ok ? r.json() : { horas: [] }))
      .then((d) => {
        const rows = (d.horas as HorasObra[])
          .filter((h) => Number(h.semana_operativa_id) === semanaId)
          .map((h) => ({ obra_codigo: h.obra_codigo, horas: String(h.horas) }));
        setFilas(rows);
      })
      .catch(() => toast('No se pudieron cargar las horas.', 'error'))
      .finally(() => setCargando(false));
  }, [semanaId, toast]);

  const totalHoras = useMemo(
    () => filas.reduce((a, f) => a + (Number(f.horas) || 0), 0),
    [filas],
  );

  function setFila(i: number, patch: Partial<FilaHoras>) {
    setFilas((fs) => fs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function agregarFila() {
    setFilas((fs) => [...fs, { obra_codigo: '', horas: '' }]);
  }
  function quitarFila(i: number) {
    setFilas((fs) => fs.filter((_, idx) => idx !== i));
  }

  async function importarExcel(file: File) {
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (!aoa.length) return toast('El Excel está vacío.', 'error');
      // Detecta columnas: obra = la que parezca código (texto con "-"); horas = la más numérica.
      const nCols = Math.max(...aoa.map((r) => r.length));
      const parece = (v: unknown) => /^[A-Za-z]{1,4}-/.test(String(v ?? '').trim());
      const numerico = (v: unknown) => v !== '' && !Number.isNaN(Number(v)) && Number(v) > 0;
      const hits = (pred: (v: unknown) => boolean) =>
        Array.from({ length: nCols }, (_, c) => aoa.reduce((n, r) => n + (pred(r[c]) ? 1 : 0), 0));
      const obraHits = hits(parece);
      const obraCol = obraHits.indexOf(Math.max(...obraHits));
      const numHits = hits(numerico).map((n, c) => (c === obraCol ? -1 : n));
      const horasCol = Math.max(...numHits) > 0 ? numHits.indexOf(Math.max(...numHits)) : -1;
      if (obraHits[obraCol] === 0 || horasCol < 0) {
        return toast('No encontré columnas de obra y horas en el Excel.', 'error');
      }
      const nuevas = aoa
        .filter((r) => parece(r[obraCol]))
        .map((r) => ({ obra_codigo: norm(r[obraCol]), horas: String(Number(r[horasCol]) || 0) }))
        .filter((r) => Number(r.horas) > 0);
      if (!nuevas.length) return toast('Ninguna fila válida en el Excel.', 'error');
      setFilas(nuevas);
      toast(`Se cargaron ${nuevas.length} obra(s) del Excel. Revisá y guardá.`, 'success');
    } catch (e) {
      toast(`No pude leer el Excel: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function guardar() {
    const limpias = filas
      .map((f) => ({ obra_codigo: f.obra_codigo.trim(), horas: Number(f.horas) || 0 }))
      .filter((f) => f.obra_codigo.length >= 3 && f.horas > 0);
    setGuardando(true);
    try {
      const r = await fetch('/api/avance/mano-obra/horas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ semana_operativa_id: semanaId, filas: limpias }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
      toast(`Horas guardadas (${limpias.length} obra/s).`, 'success');
    } catch (e) {
      toast(`No se pudo guardar: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <SkeletonRows rows={5} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={agregarFila}>
          + Agregar obra
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importarExcel(f);
          }}
        />
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          ⬆ Importar Excel
        </Button>
        <span className="ml-auto text-sm text-ds-gray-500">
          {filas.length} obra(s) · <strong>{totalHoras.toLocaleString('es-CR')} h</strong> total
        </span>
      </div>

      <div className="overflow-x-auto rounded-ds border border-ds-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-ds-gray-100 text-left">
            <tr>
              <th className="px-3 py-2">Obra (código)</th>
              <th className="px-3 py-2 text-right">Horas</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-ds-gray-400">
                  Sin horas para esta semana. Agregá obras o importá un Excel.
                </td>
              </tr>
            )}
            {filas.map((f, i) => (
              <tr key={i} className="border-t border-ds-gray-100">
                <td className="px-3 py-1.5">
                  <input
                    className="w-40 rounded-ds border border-ds-gray-200 px-2 py-1"
                    value={f.obra_codigo}
                    placeholder="VN-C.08"
                    onChange={(e) => setFila(i, { obra_codigo: e.target.value })}
                  />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <input
                    type="number"
                    min={0}
                    className="w-24 rounded-ds border border-ds-gray-200 px-2 py-1 text-right"
                    value={f.horas}
                    onChange={(e) => setFila(i, { horas: e.target.value })}
                  />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <button
                    type="button"
                    className="text-ds-red hover:underline"
                    onClick={() => quitarFila(i)}
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-ds-gray-400">
        Guardar <strong>reemplaza</strong> todas las horas de esta semana.
      </p>
      <Button onClick={guardar} loading={guardando}>
        Guardar horas de la semana
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- Subcontratos
function TabSubcontratos({ semanaId }: { semanaId: number }) {
  const { toast } = useToast();
  const [items, setItems] = useState<Subcontrato[]>([]);
  const [cargando, setCargando] = useState(true);
  const [obra, setObra] = useState('');
  const [tipo, setTipo] = useState('');
  const [monto, setMonto] = useState('');
  const [desc, setDesc] = useState('');
  const [guardando, setGuardando] = useState(false);

  // La obra debe elegirse de la lista de obras activas (habilitadas en avance),
  // no escribirse a mano (evita códigos inválidos en el reparto de M.O.).
  const [obrasOpts, setObrasOpts] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    fetch('/api/avance/obras')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setObrasOpts(
        (d.data ?? []).map((o: { codigo: string; tipo_casa?: string | null }) => ({
          value: o.codigo,
          label: o.tipo_casa ? `${o.codigo} · ${o.tipo_casa}` : o.codigo,
        })),
      ))
      .catch(() => {});
  }, []);

  function recargar() {
    setCargando(true);
    fetch('/api/avance/mano-obra/subcontratos')
      .then((r) => (r.ok ? r.json() : { subcontratos: [] }))
      .then((d) =>
        setItems((d.subcontratos as Subcontrato[]).filter((s) => Number(s.semana_operativa_id) === semanaId)),
      )
      .catch(() => toast('No se pudieron cargar los subcontratos.', 'error'))
      .finally(() => setCargando(false));
  }
  useEffect(recargar, [semanaId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function agregar() {
    if (!obra.trim()) return toast('Seleccioná la obra de la lista.', 'error');
    if (!(Number(monto) >= 0) || !monto) return toast('Indicá el monto.', 'error');
    setGuardando(true);
    try {
      const r = await fetch('/api/avance/mano-obra/subcontratos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          semana_operativa_id: semanaId,
          obra_codigo: obra.trim(),
          tipo: tipo.trim() || null,
          monto: Number(monto) || 0,
          descripcion: desc.trim() || null,
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
      toast('Subcontrato agregado.', 'success');
      setObra('');
      setTipo('');
      setMonto('');
      setDesc('');
      recargar();
    } catch (e) {
      toast(`No se pudo agregar: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(id: number) {
    try {
      const r = await fetch(`/api/avance/mano-obra/subcontratos/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Error');
      setItems((xs) => xs.filter((x) => x.id !== id));
      toast('Subcontrato eliminado.', 'success');
    } catch {
      toast('No se pudo eliminar.', 'error');
    }
  }

  const total = items.reduce((a, s) => a + Number(s.monto), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 rounded-ds border border-ds-gray-200 p-4 sm:grid-cols-5">
        <Combobox
          label="Obra"
          value={obra}
          onChange={setObra}
          placeholder="Seleccionar obra…"
          emptyText="Sin obras activas"
          options={obrasOpts}
        />
        <Select
          label="Tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          placeholder="Seleccionar tipo…"
          options={TIPOS_SUBCONTRATO.map((t) => ({ value: t, label: t }))}
        />
        <Input label="Monto (₡)" type="number" min={0} value={monto} onChange={(e) => setMonto(e.target.value)} />
        <Input label="Descripción" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <div className="flex items-end">
          <Button onClick={agregar} loading={guardando} className="w-full">
            Agregar
          </Button>
        </div>
      </div>

      <Table<Subcontrato>
        columns={[
          { key: 'obra_codigo', header: 'Obra' },
          { key: 'tipo', header: 'Tipo', render: (s) => s.tipo ?? '—' },
          { key: 'monto', header: 'Monto', render: (s) => formatCRC(Number(s.monto)) },
          { key: 'descripcion', header: 'Descripción', render: (s) => s.descripcion ?? '—' },
          {
            key: 'id',
            header: '',
            render: (s) => (
              <button type="button" className="text-ds-red hover:underline" onClick={() => eliminar(s.id)}>
                Eliminar
              </button>
            ),
          },
        ]}
        data={items}
        keyField="id"
        loading={cargando}
        emptyMessage="Sin subcontratos para esta semana."
      />
      <p className="text-right text-sm text-ds-gray-500">
        Total subcontratos semana: <strong>{formatCRC(total)}</strong>
      </p>
    </div>
  );
}
