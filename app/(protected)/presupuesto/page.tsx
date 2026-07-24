'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/hooks/useSession';
import { Icon } from '@/components/ds/Icon/Icon';

interface Obra { idObra: number; numeroObra: string; nombreMostrado: string }
interface Linea { taskNo: string; taskType?: string; description: string; lineAmount?: number; unitCost?: number; no?: string }
interface PlantillaParsed { archivo: string; porTipo: Record<string, Linea[]>; totales: Record<string, number>; hojas: string[] }
interface DescParsed { archivo: string; hoja: string | null; lineas: Linea[] }

const crc = new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 });
const TIPO_LABEL: Record<string, string> = { Sales: 'Venta', Cost: 'Costo directo', 'Indirect Cost': 'Indirectos', Production: 'Producción' };
// Solo estos 3 se suben a BC (Producción es base de avance, va aparte — no se muestra).
const TIPO_SUBIBLES = ['Sales', 'Cost', 'Indirect Cost'];

export default function PresupuestoPage() {
  const session = useSession();
  const { toast } = useToast();
  const puede = !!session && session.nivelAdmin >= 2;
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [obras, setObras] = useState<Obra[]>([]);
  const [obraId, setObraId] = useState('');
  const [plantilla, setPlantilla] = useState<PlantillaParsed | null>(null);
  const [descompuesto, setDescompuesto] = useState<DescParsed | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [tipoVista, setTipoVista] = useState('Sales');
  const [plantillas, setPlantillas] = useState<{ idPlantilla: number; nombre: string; tipo: string; archivo: string | null; fechaActualizacion: string }[]>([]);
  const [modalGuardar, setModalGuardar] = useState(false);
  const [nombrePlantilla, setNombrePlantilla] = useState('');
  const [resultado, setResultado] = useState<string | null>(null);
  const plantillaFile = useRef<HTMLInputElement>(null);
  const descFile = useRef<HTMLInputElement>(null);

  const obra = obras.find(o => String(o.idObra) === obraId);

  const load = useCallback(async () => {
    const o = await fetch('/api/obras?porPagina=1000').then(r => (r.ok ? r.json() : null)).catch(() => null);
    if (o) setObras(o.data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function leerArchivos() {
    const fd = new FormData();
    const pf = plantillaFile.current?.files?.[0];
    const df = descFile.current?.files?.[0];
    if (!pf && !df) { toast('Elegí al menos un archivo (Plantilla o Descompuesto)', 'warning'); return; }
    if (pf) fd.append('plantilla', pf);
    if (df) fd.append('descompuesto', df);
    setLeyendo(true); setResultado(null);
    try {
      const res = await fetch('/api/presupuesto/parse', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || 'No se pudo leer el Excel', 'error'); return; }
      setPlantilla(data.plantilla ?? null);
      setDescompuesto(data.descompuesto ?? null);
      toast('Archivos leídos. Revisá el preview antes de subir.', 'success');
    } finally { setLeyendo(false); }
  }

  async function subir() {
    if (!obra) { toast('Elegí la obra', 'warning'); return; }
    if (!plantilla && !descompuesto) { toast('Cargá y leé los archivos primero', 'warning'); return; }
    setSubiendo(true); setResultado(null);
    try {
      const res = await fetch('/api/presupuesto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worksNo: obra.numeroObra, plantilla, descompuesto }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || 'No se pudo subir', 'error'); setResultado(data.error ?? null); return; }
      const partes: string[] = [];
      if (data.version) partes.push(`versión ${data.version} (${data.enviadas ?? 0} líneas enviadas)`);
      if (data.materiales) partes.push(`${data.materiales} materiales`);
      if (data.totales) partes.push(`Venta ${crc.format(data.totales.salesLineAmount ?? 0)} · Costo ${crc.format(data.totales.costLineAmount ?? 0)}`);
      const bcMsg = [data.resultadoBC, data.resultadoDescompuestoBC].filter(Boolean).join(' · ');
      if (bcMsg) partes.push(`BC: ${bcMsg}`);
      toast('Enviado a Business Central', 'success');
      setResultado(`Subido a Business Central — ${partes.join(' · ')}`);
    } finally { setSubiendo(false); }
  }

  // Biblioteca de plantillas guardadas (reutilizables entre obras).
  const cargarPlantillas = useCallback(async () => {
    const d = await fetch('/api/presupuesto/plantillas').then(r => (r.ok ? r.json() : null)).catch(() => null);
    if (d) setPlantillas(d.plantillas ?? []);
  }, []);
  useEffect(() => { cargarPlantillas(); }, [cargarPlantillas]);

  // Guardar lo cargado como plantilla(s) nombradas (general y/o descompuesto).
  async function guardarComoPlantilla() {
    const nombre = nombrePlantilla.trim();
    if (!nombre) { toast('Poné un nombre a la plantilla', 'warning'); return; }
    if (!plantilla && !descompuesto) { toast('Cargá o editá algo primero', 'warning'); return; }
    setGuardando(true);
    try {
      const reqs: Promise<Response>[] = [];
      if (plantilla) reqs.push(fetch('/api/presupuesto/plantillas', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, tipo: 'general', archivo: plantilla.archivo, datos: { porTipo: plantilla.porTipo, totales: plantilla.totales, hojas: plantilla.hojas } }) }));
      if (descompuesto) reqs.push(fetch('/api/presupuesto/plantillas', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, tipo: 'descompuesto', archivo: descompuesto.archivo, datos: { hoja: descompuesto.hoja, lineas: descompuesto.lineas } }) }));
      const res = await Promise.all(reqs);
      if (res.every(r => r.ok)) { toast(`Plantilla "${nombre}" guardada`, 'success'); setModalGuardar(false); setNombrePlantilla(''); cargarPlantillas(); }
      else toast('No se pudo guardar la plantilla', 'error');
    } finally { setGuardando(false); }
  }

  // Cargar una plantilla guardada al preview (editable).
  async function usarPlantilla(id: number) {
    const d = await fetch(`/api/presupuesto/plantillas?id=${id}`).then(r => (r.ok ? r.json() : null)).catch(() => null);
    if (!d) { toast('No se pudo cargar la plantilla', 'error'); return; }
    if (d.tipo === 'general') setPlantilla({ archivo: d.archivo ?? d.nombre, ...d.datos });
    else setDescompuesto({ archivo: d.archivo ?? d.nombre, ...d.datos });
    toast(`Plantilla "${d.nombre}" cargada. Elegí la obra y subí.`, 'success');
  }
  async function borrarPlantilla(id: number) {
    await fetch(`/api/presupuesto/plantillas?id=${id}`, { method: 'DELETE' });
    cargarPlantillas();
  }

  // Editar el monto de una línea de la plantilla (queda en memoria; guardá para persistir).
  function editarMonto(tipo: string, idx: number, valor: string) {
    setPlantilla(p => {
      if (!p) return p;
      const arr = [...(p.porTipo[tipo] ?? [])];
      arr[idx] = { ...arr[idx], lineAmount: Number(valor) || 0 };
      return { ...p, porTipo: { ...p.porTipo, [tipo]: arr } };
    });
  }

  if (mounted && session && !puede) {
    return <div className="p-6 max-w-[1400px] mx-auto"><div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-14 text-center text-ds-gray-400">No tenés acceso a esta sección.</div></div>;
  }

  const tipos = plantilla ? Object.keys(plantilla.porTipo).filter(t => (plantilla.porTipo[t] ?? []).length > 0) : [];
  const hayDatos = tipos.length > 0 || (descompuesto?.lineas.length ?? 0) > 0;

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto animate-fade-in">
      <div>
        <h1 className="text-heading font-bold text-black">Subir presupuesto</h1>
        <p className="text-ds-gray-400 text-body-sm">Cargá los Excel de la obra (Plantilla y Descompuesto) y subílos a Business Central.</p>
      </div>

      {/* 1) Obra + archivos */}
      <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5 space-y-4">
        <div className="sm:max-w-md">
          <Combobox
            label="Obra" required value={obraId} onChange={setObraId} placeholder="Seleccionar obra"
            options={obras.map(o => ({ value: String(o.idObra), label: o.nombreMostrado, parts: [{ text: o.numeroObra, weight: 'bold' as const }, { text: o.nombreMostrado, weight: 'light' as const }], search: `${o.numeroObra} ${o.nombreMostrado}` }))}
          />
          {obra && <p className="text-ds-gray-400 text-xs mt-1">Obra en BC (worksNo): <span className="font-mono font-semibold text-black">{obra.numeroObra}</span></p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-body-sm font-semibold text-black">Plantilla (Venta / Costo / Indirectos)</span>
            <input ref={plantillaFile} type="file" accept=".xlsx,.xls" className="mt-1 block w-full text-sm text-ds-gray-500 file:mr-3 file:rounded-ds file:border-0 file:bg-black file:text-white file:px-4 file:py-2 file:text-sm file:font-semibold file:cursor-pointer" />
          </label>
          <label className="block">
            <span className="text-body-sm font-semibold text-black">Descompuesto (materiales)</span>
            <input ref={descFile} type="file" accept=".xlsx,.xls" className="mt-1 block w-full text-sm text-ds-gray-500 file:mr-3 file:rounded-ds file:border-0 file:bg-black file:text-white file:px-4 file:py-2 file:text-sm file:font-semibold file:cursor-pointer" />
          </label>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="outline" onClick={leerArchivos} loading={leyendo} icon={<Icon name="open" size="sm" color="currentColor" />}>Leer archivos</Button>
          {hayDatos && (
            <Button variant="secondary" onClick={() => setModalGuardar(true)} icon={<Icon name="check" size="sm" color="currentColor" />}>Guardar como plantilla</Button>
          )}
          {hayDatos && (
            <Button onClick={subir} loading={subiendo} disabled={!obraId} icon={<Icon name="arrow-right" size="sm" color="currentColor" />}>Subir a Business Central</Button>
          )}
          {hayDatos && !obraId && (
            <span className="text-ds-red text-body-sm font-medium">↑ Elegí una obra para poder subir</span>
          )}
        </div>
        {resultado && <div className="rounded-ds bg-[#F6FBEA] border border-brand/40 px-4 py-3 text-sm text-black">{resultado}</div>}
      </div>

      {/* Plantillas guardadas (reutilizables) */}
      {plantillas.length > 0 && (
        <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5 space-y-2">
          <h2 className="font-bold text-black">Plantillas guardadas</h2>
          <p className="text-ds-gray-400 text-xs">Cargá una plantilla guardada para editarla o subirla a la obra que elijas.</p>
          <div className="divide-y divide-ds-gray-100">
            {plantillas.map(pl => (
              <div key={pl.idPlantilla} className="py-2.5 flex items-center gap-3">
                <span className={'text-xs px-2 py-0.5 rounded-full shrink-0 ' + (pl.tipo === 'general' ? 'bg-black text-white' : 'bg-ds-gray-100 text-ds-gray-500')}>{pl.tipo === 'general' ? 'General' : 'Descompuesto'}</span>
                <span className="text-sm text-black font-medium truncate flex-1">{pl.nombre}</span>
                <span className="text-ds-gray-400 text-xs shrink-0 hidden sm:block">{pl.archivo}</span>
                <Button size="sm" variant="outline" onClick={() => usarPlantilla(pl.idPlantilla)}>Usar</Button>
                <button onClick={() => borrarPlantilla(pl.idPlantilla)} className="text-ds-gray-300 hover:text-ds-red p-1" title="Borrar plantilla"><Icon name="delete" size="sm" color="currentColor" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2) Preview */}
      {plantilla && (
        <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold text-black">Plantilla</h2>
            <span className="text-ds-gray-400 text-xs font-mono">{plantilla.archivo}</span>
          </div>
          <p className="text-ds-gray-400 text-xs">Solo Venta, Costo e Indirectos se suben a BC. Tocá una tarjeta para ver sus líneas.</p>
          <div className="grid grid-cols-3 gap-3">
            {TIPO_SUBIBLES.filter(t => plantilla.porTipo[t]).map(t => (
              <button key={t} type="button" onClick={() => setTipoVista(t)}
                className={'text-left rounded-ds-lg border p-3 transition ' + (tipoVista === t ? 'border-brand bg-[#F6FBEA]' : 'border-ds-gray-200 hover:bg-ds-gray-100')}>
                <p className="text-ds-gray-400 text-xs">{TIPO_LABEL[t] ?? t}</p>
                <p className="text-black font-bold text-lg">{(plantilla.porTipo[t] ?? []).length}<span className="text-ds-gray-400 text-xs font-normal"> líneas</span></p>
              </button>
            ))}
          </div>
          {/* Vista previa de líneas del tipo seleccionado */}
          {(() => {
            const activa = (TIPO_SUBIBLES.includes(tipoVista) && plantilla.porTipo[tipoVista]) ? tipoVista : TIPO_SUBIBLES.find(t => plantilla.porTipo[t]) ?? '';
            const lineas = plantilla.porTipo[activa] ?? [];
            return (
              <div>
                <p className="text-ds-gray-500 text-body-sm mb-1">Vista previa · <strong className="text-black">{TIPO_LABEL[activa] ?? activa}</strong> ({lineas.length} líneas)</p>
                <div className="overflow-x-auto max-h-[380px] overflow-y-auto no-scrollbar border border-ds-gray-100 rounded-ds">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-ds-gray-100 text-left text-ds-gray-500 text-xs">
                      <tr><th className="py-1.5 px-3">Código</th><th className="py-1.5 px-3">Nivel</th><th className="py-1.5 px-3">Descripción</th><th className="py-1.5 px-3 text-right">Monto</th></tr>
                    </thead>
                    <tbody>
                      {lineas.map((l, i) => (
                        <tr key={i} className="border-b border-ds-gray-100">
                          <td className="py-1.5 px-3 font-mono text-xs text-ds-gray-500">{l.taskNo}</td>
                          <td className="py-1.5 px-3"><span className={'text-xs px-2 py-0.5 rounded-full ' + (l.taskType === 'Total' ? 'bg-black text-white' : 'bg-ds-gray-100 text-ds-gray-500')}>{l.taskType === 'Total' ? 'Capítulo' : 'Partida'}</span></td>
                          <td className="py-1.5 px-3 truncate max-w-[360px]">{l.description}</td>
                          <td className="py-1 px-3 text-right">
                            <input type="number" value={l.lineAmount ?? 0}
                              onChange={e => editarMonto(activa, i, e.target.value)}
                              className="w-32 text-right rounded-ds border border-ds-gray-200 px-2 py-1 text-sm focus:border-black focus:outline-none" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {descompuesto && (
        <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold text-black">Descompuesto (materiales)</h2>
            <span className="text-ds-gray-400 text-xs font-mono">{descompuesto.archivo}</span>
            <span className="ml-auto text-ds-gray-500 text-body-sm"><strong className="text-black">{descompuesto.lineas.length}</strong> materiales</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-ds-gray-400 text-xs border-b border-ds-gray-200"><th className="py-1.5 pr-3">Tarea</th><th className="py-1.5 pr-3">Material</th><th className="py-1.5 pr-3">Descripción</th><th className="py-1.5 text-right">Costo unit.</th></tr></thead>
              <tbody>
                {descompuesto.lineas.slice(0, 12).map((l, i) => (
                  <tr key={i} className="border-b border-ds-gray-100">
                    <td className="py-1.5 pr-3 font-mono text-xs text-ds-gray-500">{l.taskNo}</td>
                    <td className="py-1.5 pr-3 font-mono text-xs">{l.no}</td>
                    <td className="py-1.5 pr-3 truncate max-w-[280px]">{l.description}</td>
                    <td className="py-1.5 text-right">{crc.format(l.unitCost ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {descompuesto.lineas.length > 12 && <p className="text-ds-gray-400 text-xs mt-2">… y {descompuesto.lineas.length - 12} materiales más.</p>}
          </div>
        </div>
      )}

      {/* Modal: guardar como plantilla */}
      <Modal open={modalGuardar} onClose={() => setModalGuardar(false)} title="Guardar como plantilla"
        footer={<><Button variant="outline" onClick={() => setModalGuardar(false)}>Cancelar</Button><Button loading={guardando} disabled={!nombrePlantilla.trim()} onClick={guardarComoPlantilla}>Guardar</Button></>}>
        <div className="space-y-3">
          <p className="text-body-sm text-ds-gray-500">Se guarda lo que tengas cargado (general y/o descompuesto) con este nombre, para reusarlo en cualquier obra.</p>
          <Input label="Nombre de la plantilla" value={nombrePlantilla} onChange={e => setNombrePlantilla(e.target.value)} placeholder="Ej. Casa tipo A — L15" maxLength={150} />
        </div>
      </Modal>
    </div>
  );
}
