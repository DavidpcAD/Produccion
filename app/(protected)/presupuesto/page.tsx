'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { PageShell, PageHeader } from '@/components/layout/Page';
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
interface TotalesBC { salesLineAmount?: number; costLineAmount?: number; indirectCostLineAmount?: number; result?: number }
interface ResultadoBC {
  tipo: 'general' | 'descompuesto';
  worksNo: string;
  version?: string;          // versión creada en esta subida (REESTUDIO+n)
  versionActual?: string | null; // versión vigente en BC (si no se creó una)
  enviadas?: number;         // líneas de versión enviadas
  materiales?: number;       // materiales del descompuesto
  descompuestoChunks?: number;
  totales?: TotalesBC;
  obraCampos?: Record<string, number>; // todos los importes numéricos del registro de BC
  resultadoBC?: string;
  resultadoDescompuestoBC?: string;
}

const crc = new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', maximumFractionDigits: 0 });
const TIPO_LABEL: Record<string, string> = { Sales: 'Venta', Cost: 'Costo directo', 'Indirect Cost': 'Indirectos', Production: 'Producción' };
// Solo estos 3 se suben a BC (Producción es base de avance, va aparte — no se muestra).
const TIPO_SUBIBLES = ['Sales', 'Cost', 'Indirect Cost'];

// Tarjeta de un total de la obra (venta / costo / indirecto / resultado).
function MetricBC({ label, value, accent }: { label: string; value: string; accent?: 'pos' | 'neg' }) {
  return (
    <div className="rounded-ds border border-ds-gray-100 p-2.5">
      <p className="text-ds-gray-400 text-xs">{label}</p>
      <p className={'font-bold text-sm mt-0.5 ' + (accent === 'pos' ? 'text-ds-green-ink' : accent === 'neg' ? 'text-ds-red' : 'text-black')}>{value}</p>
    </div>
  );
}

// Estado "ya subido a BC": reemplaza el botón de subir para no re-subir por error
// (una re-subida del mismo descompuesto genera duplicados en BC). Deja un enlace
// discreto para volver a subir a propósito.
function SubidoChip({ etiqueta, onRedo, redoing }: { etiqueta: string; onRedo: () => void; redoing: boolean }) {
  return (
    <div className="inline-flex items-center gap-2.5 rounded-ds-lg border border-brand/50 bg-brand-soft px-4 py-2.5">
      <Icon name="check" size="sm" color="currentColor" />
      <span className="text-sm font-semibold text-black">{etiqueta} subido a BC</span>
      <button type="button" onClick={onRedo} disabled={redoing}
        className="text-xs font-semibold text-ds-gray-500 underline underline-offset-2 hover:text-black disabled:opacity-50">
        {redoing ? 'Subiendo…' : 'Volver a subir'}
      </button>
    </div>
  );
}

// Panel de detalle de la respuesta de Business Central tras subir — replica el
// "Información obra / Resumen" de BC: código de versión, importes y resultado.
function DetalleBC({ r }: { r: ResultadoBC }) {
  const t = r.totales;
  const version = r.version ?? r.versionActual ?? null;
  const mensajeBC = [r.resultadoBC, r.resultadoDescompuestoBC].filter(Boolean).join(' · ');
  const resultadoVal = t?.result ?? 0;
  return (
    <div className="rounded-ds-lg border border-brand/40 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-brand-soft border-b border-brand/30">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="check" size="sm" color="currentColor" />
          <span className="font-bold text-black text-sm truncate">{r.tipo === 'general' ? 'General' : 'Descompuesto'} subido a Business Central</span>
        </div>
        <span className="text-xs text-ds-gray-500 shrink-0">Obra <span className="font-mono font-semibold text-black">{r.worksNo}</span></span>
      </div>
      <div className="p-4 space-y-3.5">
        {version && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-ds-gray-400 text-xs">Cód. versión</span>
            <span className="text-sm font-bold text-black bg-ds-gray-100 rounded-full px-3 py-0.5">{version}</span>
            {r.version && <span className="text-ds-green-ink text-xs">· versión creada en esta subida</span>}
          </div>
        )}
        {t && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricBC label="Importe venta" value={crc.format(t.salesLineAmount ?? 0)} />
            <MetricBC label="Importe coste" value={crc.format(t.costLineAmount ?? 0)} />
            <MetricBC label="Coste indirecto" value={crc.format(t.indirectCostLineAmount ?? 0)} />
            <MetricBC label="Resultado" value={crc.format(resultadoVal)} accent={resultadoVal >= 0 ? 'pos' : 'neg'} />
          </div>
        )}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ds-gray-500">
          {r.enviadas != null && <span>Líneas de versión enviadas: <strong className="text-black">{r.enviadas}</strong></span>}
          {r.materiales != null && <span>Materiales del descompuesto: <strong className="text-black">{r.materiales}</strong></span>}
          {r.descompuestoChunks != null && <span>Chunks: <strong className="text-black">{r.descompuestoChunks}</strong></span>}
        </div>
        {mensajeBC && (
          <div className="rounded-ds bg-ds-gray-100 px-3 py-2 text-xs font-mono text-ds-gray-600 break-words">
            Respuesta BC: {mensajeBC}
          </div>
        )}
        {r.obraCampos && Object.keys(r.obraCampos).length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer select-none text-ds-gray-500 hover:text-black">Ver todos los importes de la obra en BC</summary>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5">
              {Object.entries(r.obraCampos).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-ds-gray-100 py-0.5">
                  <span className="text-ds-gray-400 truncate">{k}</span>
                  <span className="font-mono text-ds-gray-600 shrink-0">{v.toLocaleString('es-CR', { maximumFractionDigits: 2 })}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

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
  const [leyendoQue, setLeyendoQue] = useState<'plantilla' | 'descompuesto' | null>(null);
  const [subiendoQue, setSubiendoQue] = useState<'general' | 'descompuesto' | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [tipoVista, setTipoVista] = useState('Sales');
  const [vistaPreview, setVistaPreview] = useState<'general' | 'descompuesto'>('general');
  const [plantillas, setPlantillas] = useState<{ idPlantilla: number; nombre: string; tipo: string; archivo: string | null; fechaActualizacion: string }[]>([]);
  const [modalGuardar, setModalGuardar] = useState(false);
  const [nombrePlantilla, setNombrePlantilla] = useState('');
  const [resultado, setResultado] = useState<ResultadoBC | null>(null);
  // Qué ya se subió a BC en esta obra, para reemplazar el botón por un estado
  // "hecho" y evitar re-subidas accidentales (una re-subida del mismo descompuesto
  // genera duplicados y BC responde "0 insertados, N errores").
  const [subido, setSubido] = useState<{ general?: boolean; descompuesto?: boolean }>({});
  const plantillaFile = useRef<HTMLInputElement>(null);
  const descFile = useRef<HTMLInputElement>(null);

  const obra = obras.find(o => String(o.idObra) === obraId);

  // Al cambiar de obra, lo subido/mostrado ya no aplica.
  useEffect(() => { setSubido({}); setResultado(null); }, [obraId]);

  const load = useCallback(async () => {
    const o = await fetch('/api/obras?porPagina=1000').then(r => (r.ok ? r.json() : null)).catch(() => null);
    if (o) setObras(o.data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Lee UN archivo a la vez (General o Descompuesto) sin borrar lo otro que ya esté
  // cargado. El endpoint /parse auto-detecta el tipo por contenido, así que aplicamos
  // lo que devuelva sin importar en qué campo se subió.
  async function leerUno(cual: 'plantilla' | 'descompuesto') {
    const input = cual === 'plantilla' ? plantillaFile.current : descFile.current;
    const file = input?.files?.[0];
    const nombre = cual === 'plantilla' ? 'Plantilla general' : 'Descompuesto';
    if (!file) { toast(`Elegí el archivo de ${nombre} primero`, 'warning'); return; }
    const fd = new FormData();
    fd.append(cual, file);
    setLeyendoQue(cual); setResultado(null); setSubido({});
    try {
      const res = await fetch('/api/presupuesto/parse', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || 'No se pudo leer el Excel', 'error'); return; }
      if (data.plantilla) setPlantilla(data.plantilla);
      if (data.descompuesto) setDescompuesto(data.descompuesto);
      const leido = data.plantilla ? 'Plantilla general' : data.descompuesto ? 'Descompuesto' : null;
      toast(leido ? `${leido} leído. Revisalo en el paso 2.` : 'No se reconoció el archivo como Plantilla ni Descompuesto.', leido ? 'success' : 'warning');
    } finally { setLeyendoQue(null); }
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
      if (!res.ok) { toast(data.error || 'No se pudo subir', 'error'); setResultado(null); return; }
      const etiqueta = que === 'general' ? 'General' : 'Descompuesto';
      toast(`${etiqueta} enviado a Business Central`, 'success');
      setResultado({ tipo: que, worksNo: obra.numeroObra, ...data });
      setSubido(s => ({ ...s, [que]: true }));
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
    return <div className="p-6 max-w-[1200px] mx-auto"><div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-14 text-center text-ds-gray-400">No tenés acceso a esta sección.</div></div>;
  }

  const tipos = plantilla ? Object.keys(plantilla.porTipo).filter(t => (plantilla.porTipo[t] ?? []).length > 0) : [];
  const hayDatos = tipos.length > 0 || (descompuesto?.lineas.length ?? 0) > 0;

  return (
    <PageShell width="narrow">
      <PageHeader
        title="Subir presupuesto"
        subtitle="Cargá los Excel de la obra (Plantilla y Descompuesto) y subílos a Business Central."
      />

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
          <div className="rounded-ds-lg border border-ds-gray-100 p-4 space-y-2">
            <div>
              <span className="text-body-sm font-semibold text-black">Plantilla general</span>
              <span className="block text-ds-gray-400 text-xs">Venta, Costo e Indirectos — esto arma la versión en BC.</span>
            </div>
            <input ref={plantillaFile} type="file" accept=".xlsx,.xls" className="block w-full text-sm text-ds-gray-500 file:mr-3 file:rounded-ds file:border-0 file:bg-black file:text-white file:px-4 file:py-2 file:text-sm file:font-semibold file:cursor-pointer" />
            <Button variant="outline" size="sm" onClick={() => leerUno('plantilla')} loading={leyendoQue === 'plantilla'} disabled={leyendoQue === 'plantilla'} icon={<Icon name="open" size="sm" color="currentColor" />}>Leer plantilla</Button>
          </div>
          <div className="rounded-ds-lg border border-ds-gray-100 p-4 space-y-2">
            <div>
              <span className="text-body-sm font-semibold text-black">Descompuesto</span>
              <span className="block text-ds-gray-400 text-xs">Materiales por tarea — se suben aparte a BC.</span>
            </div>
            <input ref={descFile} type="file" accept=".xlsx,.xls" className="block w-full text-sm text-ds-gray-500 file:mr-3 file:rounded-ds file:border-0 file:bg-black file:text-white file:px-4 file:py-2 file:text-sm file:font-semibold file:cursor-pointer" />
            <Button variant="outline" size="sm" onClick={() => leerUno('descompuesto')} loading={leyendoQue === 'descompuesto'} disabled={leyendoQue === 'descompuesto'} icon={<Icon name="open" size="sm" color="currentColor" />}>Leer descompuesto</Button>
          </div>
        </div>
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
                    <p className="text-black font-bold text-sub-sm">{(plantilla.porTipo[t] ?? []).length}<span className="text-ds-gray-400 text-xs font-normal"> líneas</span></p>
                  </button>
                ))}
              </div>
              {(() => {
                const activa = (TIPO_SUBIBLES.includes(tipoVista) && plantilla.porTipo[tipoVista]) ? tipoVista : TIPO_SUBIBLES.find(t => plantilla.porTipo[t]) ?? '';
                const lineas = plantilla.porTipo[activa] ?? [];
                return (
                  <div>
                    <p className="text-ds-gray-500 text-body-sm mb-1">Vista previa · <strong className="text-black">{TIPO_LABEL[activa] ?? activa}</strong> ({lineas.length} líneas)</p>
                    <div className="overflow-x-auto max-h-[380px] overflow-y-auto no-scrollbar border border-ds-gray-200 rounded-ds-lg">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-ds-gray-100 border-b border-ds-gray-200">
                            <th className="px-4 py-3 text-left font-semibold text-ds-gray-500 text-xs uppercase tracking-wide">Código</th>
                            <th className="px-4 py-3 text-left font-semibold text-ds-gray-500 text-xs uppercase tracking-wide">Nivel</th>
                            <th className="px-4 py-3 text-left font-semibold text-ds-gray-500 text-xs uppercase tracking-wide">Descripción</th>
                            <th className="px-4 py-3 text-right font-semibold text-ds-gray-500 text-xs uppercase tracking-wide">Monto</th>
                          </tr>
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
              <div className="overflow-x-auto max-h-[380px] overflow-y-auto no-scrollbar border border-ds-gray-200 rounded-ds-lg">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-ds-gray-100 border-b border-ds-gray-200">
                      <th className="px-4 py-3 text-left font-semibold text-ds-gray-500 text-xs uppercase tracking-wide">Tarea</th>
                      <th className="px-4 py-3 text-left font-semibold text-ds-gray-500 text-xs uppercase tracking-wide">Material</th>
                      <th className="px-4 py-3 text-left font-semibold text-ds-gray-500 text-xs uppercase tracking-wide">Descripción</th>
                      <th className="px-4 py-3 text-right font-semibold text-ds-gray-500 text-xs uppercase tracking-wide">Costo unit.</th>
                    </tr>
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
            {plantilla && (subido.general
              ? <SubidoChip etiqueta="General" onRedo={() => subir('general')} redoing={subiendoQue === 'general'} />
              : <Button onClick={() => subir('general')} loading={subiendoQue === 'general'} disabled={!obraId || subiendoQue === 'general'} icon={<Icon name="arrow-right" size="sm" color="currentColor" />}>Subir General a BC</Button>
            )}
            {descompuesto && (subido.descompuesto
              ? <SubidoChip etiqueta="Descompuesto" onRedo={() => subir('descompuesto')} redoing={subiendoQue === 'descompuesto'} />
              : <Button onClick={() => subir('descompuesto')} loading={subiendoQue === 'descompuesto'} disabled={!obraId || subiendoQue === 'descompuesto'} icon={<Icon name="arrow-right" size="sm" color="currentColor" />}>Subir Descompuesto a BC</Button>
            )}
          </div>
          {resultado && <DetalleBC r={resultado} />}
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
    </PageShell>
  );
}
