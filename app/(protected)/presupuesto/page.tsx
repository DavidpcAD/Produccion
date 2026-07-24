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

// Encabezado de paso: badge numerado + título, para guiar el flujo (1 → 2 → 3).
function StepHeader({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-7 h-7 rounded-full bg-black text-white text-sm font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</span>
      <div className="min-w-0">
        <h2 className="font-bold text-black leading-tight">{title}</h2>
        {hint && <p className="text-ds-gray-400 text-xs mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

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
  const [subiendoQue, setSubiendoQue] = useState<'general' | 'descompuesto' | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [tipoVista, setTipoVista] = useState('Sales');
  const [vistaPreview, setVistaPreview] = useState<'general' | 'descompuesto'>('general');
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

  // General (plantilla → versión) y Descompuesto (materiales) se suben a BC por separado.
  async function subir(que: 'general' | 'descompuesto') {
    if (!obra) { toast('Elegí la obra', 'warning'); return; }
    if (que === 'general' && !plantilla) { toast('No hay plantilla (General) cargada', 'warning'); return; }
    if (que === 'descompuesto' && !descompuesto) { toast('No hay Descompuesto cargado', 'warning'); return; }
    setSubiendoQue(que); setResultado(null);
    try {
      const payload = que === 'general' ? { plantilla } : { descompuesto };
      const res = await fetch('/api/presupuesto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worksNo: obra.numeroObra, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || 'No se pudo subir', 'error'); setResultado(data.error ?? null); return; }
      const partes: string[] = [];
      if (data.version) partes.push(`versión ${data.version} (${data.enviadas ?? 0} líneas enviadas)`);
      if (data.materiales) partes.push(`${data.materiales} materiales`);
      if (data.totales) partes.push(`Venta ${crc.format(data.totales.salesLineAmount ?? 0)} · Costo ${crc.format(data.totales.costLineAmount ?? 0)}`);
      const bcMsg = [data.resultadoBC, data.resultadoDescompuestoBC].filter(Boolean).join(' · ');
      if (bcMsg) partes.push(`BC: ${bcMsg}`);
      const etiqueta = que === 'general' ? 'General' : 'Descompuesto';
      toast(`${etiqueta} enviado a Business Central`, 'success');
      setResultado(`${etiqueta} subido a Business Central — ${partes.join(' · ')}`);
    } finally { setSubiendoQue(null); }
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

      {/* Paso 1 — Obra + archivos */}
      <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5 space-y-4">
        <StepHeader n={1} title="Elegí la obra y cargá los Excel" hint="Podés cargar solo General, solo Descompuesto, o los dos." />
        <div className="sm:max-w-md">
          <Combobox
            label="Obra" required value={obraId} onChange={setObraId} placeholder="Seleccionar obra"
            options={obras.map(o => ({ value: String(o.idObra), label: o.nombreMostrado, parts: [{ text: o.numeroObra, weight: 'bold' as const }, { text: o.nombreMostrado, weight: 'light' as const }], search: `${o.numeroObra} ${o.nombreMostrado}` }))}
          />
          {obra && <p className="text-ds-gray-400 text-xs mt-1">Obra en BC (worksNo): <span className="font-mono font-semibold text-black">{obra.numeroObra}</span></p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-body-sm font-semibold text-black">Plantilla general</span>
            <span className="block text-ds-gray-400 text-xs mb-1">Venta, Costo e Indirectos — esto arma la versión en BC.</span>
            <input ref={plantillaFile} type="file" accept=".xlsx,.xls" className="block w-full text-sm text-ds-gray-500 file:mr-3 file:rounded-ds file:border-0 file:bg-black file:text-white file:px-4 file:py-2 file:text-sm file:font-semibold file:cursor-pointer" />
          </label>
          <label className="block">
            <span className="text-body-sm font-semibold text-black">Descompuesto</span>
            <span className="block text-ds-gray-400 text-xs mb-1">Materiales por tarea — se suben aparte a BC.</span>
            <input ref={descFile} type="file" accept=".xlsx,.xls" className="block w-full text-sm text-ds-gray-500 file:mr-3 file:rounded-ds file:border-0 file:bg-black file:text-white file:px-4 file:py-2 file:text-sm file:font-semibold file:cursor-pointer" />
          </label>
        </div>
        <Button variant="outline" onClick={leerArchivos} loading={leyendo} icon={<Icon name="open" size="sm" color="currentColor" />}>Leer archivos</Button>
      </div>

      {/* Plantillas guardadas (reutilizables) */}
      {plantillas.length > 0 && (
        <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5 space-y-2">
          <h2 className="font-bold text-black">O empezá desde una plantilla guardada</h2>
          <p className="text-ds-gray-400 text-xs">En vez de cargar Excel, reutilizá una plantilla: se abre en la vista previa para editarla y subirla a la obra que elijas.</p>
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

      {/* 2) Preview — tabs para alternar entre General (plantilla) y Descompuesto sin scrollear */}
      {(plantilla || descompuesto) && (() => {
        const vistaActiva: 'general' | 'descompuesto' =
          vistaPreview === 'descompuesto' && descompuesto ? 'descompuesto'
          : vistaPreview === 'general' && plantilla ? 'general'
          : plantilla ? 'general' : 'descompuesto';
        return (
        <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5 space-y-3">
          <StepHeader n={2} title="Revisá el presupuesto" hint="Alterná entre General y Descompuesto. Podés editar los montos antes de subir." />
          {/* Selector de vista */}
          <div className="flex items-center gap-2 flex-wrap">
            {plantilla && (
              <button type="button" onClick={() => setVistaPreview('general')}
                className={'text-sm font-semibold px-4 py-2 rounded-ds-lg transition ' + (vistaActiva === 'general' ? 'bg-black text-white' : 'bg-ds-gray-100 text-ds-gray-500 hover:bg-ds-gray-200')}>
                General
              </button>
            )}
            {descompuesto && (
              <button type="button" onClick={() => setVistaPreview('descompuesto')}
                className={'text-sm font-semibold px-4 py-2 rounded-ds-lg transition ' + (vistaActiva === 'descompuesto' ? 'bg-black text-white' : 'bg-ds-gray-100 text-ds-gray-500 hover:bg-ds-gray-200')}>
                Descompuesto <span className="opacity-70 font-normal">({descompuesto.lineas.length})</span>
              </button>
            )}
            <span className="ml-auto text-ds-gray-400 text-xs font-mono truncate max-w-[240px]">{vistaActiva === 'general' ? plantilla?.archivo : descompuesto?.archivo}</span>
          </div>

          {/* Vista General (plantilla: Venta / Costo / Indirectos) */}
          {vistaActiva === 'general' && plantilla && (
            <>
              <p className="text-ds-gray-400 text-xs">Solo Venta, Costo e Indirectos se suben a BC. Tocá una tarjeta para ver sus líneas.</p>
              <div className="grid grid-cols-3 gap-3">
                {TIPO_SUBIBLES.filter(t => plantilla.porTipo[t]).map(t => (
                  <button key={t} type="button" onClick={() => setTipoVista(t)}
                    className={'text-left rounded-ds-lg border p-3 transition ' + (tipoVista === t ? 'border-brand bg-brand-soft' : 'border-ds-gray-200 hover:bg-ds-gray-100')}>
                    <p className="text-ds-gray-400 text-xs">{TIPO_LABEL[t] ?? t}</p>
                    <p className="text-black font-bold text-lg">{(plantilla.porTipo[t] ?? []).length}<span className="text-ds-gray-400 text-xs font-normal"> líneas</span></p>
                  </button>
                ))}
              </div>
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
                              <td className="py-1 px-3">
                                <div className="flex justify-end">
                                  <div className="inline-flex items-center gap-1 rounded-ds border border-ds-gray-200 pl-2 w-40 focus-within:border-black">
                                    <span className="text-ds-gray-400 text-xs shrink-0">₡</span>
                                    <input type="number" step="0.01" value={Math.round((l.lineAmount ?? 0) * 100) / 100}
                                      onChange={e => editarMonto(activa, i, e.target.value)}
                                      className="w-full text-right px-1 py-1 text-sm bg-transparent focus:outline-none" />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {/* Vista Descompuesto (materiales) */}
          {vistaActiva === 'descompuesto' && descompuesto && (
            <div>
              <p className="text-ds-gray-500 text-body-sm mb-1">Vista previa · <strong className="text-black">Descompuesto</strong> ({descompuesto.lineas.length} materiales)</p>
              <div className="overflow-x-auto max-h-[380px] overflow-y-auto no-scrollbar border border-ds-gray-100 rounded-ds">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-ds-gray-100 text-left text-ds-gray-500 text-xs">
                    <tr><th className="py-1.5 px-3">Tarea</th><th className="py-1.5 px-3">Material</th><th className="py-1.5 px-3">Descripción</th><th className="py-1.5 px-3 text-right">Costo unit.</th></tr>
                  </thead>
                  <tbody>
                    {descompuesto.lineas.map((l, i) => (
                      <tr key={i} className="border-b border-ds-gray-100">
                        <td className="py-1.5 px-3 font-mono text-xs text-ds-gray-500">{l.taskNo}</td>
                        <td className="py-1.5 px-3 font-mono text-xs">{l.no}</td>
                        <td className="py-1.5 px-3 truncate max-w-[280px]">{l.description}</td>
                        <td className="py-1.5 px-3 text-right">{crc.format(l.unitCost ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        );
      })()}

      {/* Paso 3 — Guardar / Subir a Business Central */}
      {hayDatos && (
        <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5 space-y-4">
          <StepHeader n={3} title="Guardá o subí a Business Central" hint="General (versión) y Descompuesto (materiales) se suben por separado — cada botón manda solo lo suyo." />
          {!obraId && (
            <div className="rounded-ds bg-brand-soft border border-brand/40 px-4 py-2.5 text-sm text-black">
              Elegí una obra en el paso 1 para poder subir a BC.
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="secondary" onClick={() => setModalGuardar(true)} icon={<Icon name="check" size="sm" color="currentColor" />}>Guardar como plantilla</Button>
            {plantilla && (
              <Button onClick={() => subir('general')} loading={subiendoQue === 'general'} disabled={!obraId || subiendoQue !== null} icon={<Icon name="arrow-right" size="sm" color="currentColor" />}>Subir General a BC</Button>
            )}
            {descompuesto && (
              <Button onClick={() => subir('descompuesto')} loading={subiendoQue === 'descompuesto'} disabled={!obraId || subiendoQue !== null} icon={<Icon name="arrow-right" size="sm" color="currentColor" />}>Subir Descompuesto a BC</Button>
            )}
          </div>
          {resultado && <div className="rounded-ds bg-brand-soft border border-brand/40 px-4 py-3 text-sm text-black">{resultado}</div>}
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
