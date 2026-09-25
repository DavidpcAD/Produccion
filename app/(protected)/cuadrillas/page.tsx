'use client';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { useSession } from '@/hooks/useSession';
import { Icon } from '@/components/ds/Icon/Icon';
import { Skeleton, SkeletonCards } from '@/components/ui/Skeleton';
import { Stagger, StaggerItem, listStagger, listItem } from '@/components/ui/Motion';
import { motion } from 'motion/react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { coincideBusqueda } from '@/lib/utilidades/buscar';

interface ObraLite { idObra: number; numeroObra: string; nombreMostrado: string | null; idProyecto: number | null; tipoObra: string; }
interface SubLite { idSubPartida: number; codigo: string; nombre: string; idPartida: number; partidaCodigo: string | null; partidaNombre: string | null; idProyecto?: number | null; }
interface PartidaLite { idPartida: number; codigo: string; nombre: string; idEtapa?: number | null; }
interface EtapaLite { idEtapa: number; codigo: string; nombre: string; tipoObra: string; bcWorksNo: string | null; }
interface TipoLite { codigo: string; letra: string; nombre: string; terminoGrupo: string; }
interface CatalogoTipo { etapas: EtapaLite[]; partidas: PartidaLite[]; subpartidas: SubLite[]; }
interface ProyectoLite { idProyecto: number; nombre: string; }
// Asignación de encargado a una subpartida (tabla dbo.EncargadoPartida).
// Cada subpartida tiene UN solo encargado; un encargado puede tomar varias.
interface EncargadoDirecto {
  idEncargadoPartida: number; idColaborador: number; encargado: string;
  idSubPartida: number;
  subPartidaCodigo: string | null; subPartida: string | null;
  partidaId: number | null; partidaCodigo: string | null; partida: string | null;
}

const iniciales = (s: string) => (s || '?').split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('');

// Chip de encargado asignado directamente (con botón de quitar opcional).
function ChipEncargado({ nombre, onRemove, loading }: { nombre: string; onRemove?: () => void; loading?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black text-white text-xs font-semibold pl-1 pr-2 py-0.5">
      <span className="w-5 h-5 rounded-full bg-brand text-black text-[10px] font-bold flex items-center justify-center shrink-0">{iniciales(nombre)}</span>
      <span>{nombre}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} disabled={loading} aria-label="Quitar encargado" title="Quitar"
          className="-mr-0.5 ml-0.5 w-5 h-5 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-ds-surface/20 disabled:opacity-50 leading-none text-sm">
          ×
        </button>
      )}
    </span>
  );
}

interface Cuadrilla {
  IDCuadrilla: number;
  Nombre: string;
  Encargado: string | null;
  idProyecto: number | null;
  Proyecto: string | null;
  TotalMiembros: number;
  Capacidad: number;
  TotalObras: number;
  Obras: string | null;
  Subpartidas: string | null;
}
interface Colaborador { IDCol: number; NombreCompleto: string; Cedula?: string; }
interface Miembro {
  IDCuadMiembro: number; IDCol: number; NombreCompleto: string; Cedula: string;
  Puesto: string; Activo: boolean; FechaIngreso: string;
}
interface OtraMembresia { IDCol: number; IDCuadrilla: number; Cuadrilla: string; }
interface CuadrillaDetalle extends Cuadrilla {
  IDEncargado: number;
  Activo?: boolean;
  proyectos?: { idProyecto: number; nombre: string }[];
  obras: ObraLite[];
  subpartidas: SubLite[];
  miembros: Miembro[];
  otrasMembresias: OtraMembresia[];
}

// Modelo multi-proyecto: la cuadrilla trabaja en varios proyectos; por cada uno
// tiene sus obras y sus subpartidas.
const EMPTY = {
  nombre: '', idEncargado: '', capacidad: '25',
  proyectos: [] as number[],
  obrasByProy: {} as Record<number, number[]>,
  subsByProy: {} as Record<number, number[]>,
};

// ─── Selector de OBRAS: tipo de obra → buscador + lista con checkboxes ────────
// Las obras van AMARRADAS al tipo: vivienda construcción muestra las de
// PRO VIVIENDA menos las GEN-*, vivienda general solo las GEN-*, infra las
// INF-*, y así (es el tipoObraEfectivo que ya calcula /api/obras).
function ObrasPicker({ obras, tipos, selected, onChange }: {
  obras: ObraLite[]; tipos: TipoLite[]; selected: number[]; onChange: (ids: number[]) => void;
}) {
  const [q, setQ] = useState('');
  // Arranca en el tipo de las obras que la cuadrilla ya tiene en este proyecto.
  const [tipoSel, setTipoSel] = useState(() => obras.find(o => selected.includes(o.idObra))?.tipoObra || 'VIVIENDA');
  const term = q.trim().toLowerCase();
  const delTipo = obras.filter(o => o.tipoObra === tipoSel);
  const filtered = term
    ? delTipo.filter(o => coincideBusqueda([o.numeroObra, o.nombreMostrado ?? ''].join(' '), term))
    : delTipo;
  const sel = new Set(selected);
  const toggle = (id: number) => onChange(sel.has(id) ? selected.filter(x => x !== id) : [...selected, id]);
  const selObras = obras.filter(o => sel.has(o.idObra));

  return (
    <div className="rounded-ds-lg border border-ds-gray-200 p-3.5 space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-ds bg-black flex items-center justify-center shrink-0">
          <Icon name="place" size="sm" color="currentColor" className="text-brand" />
        </div>
        <div className="flex-1 min-w-0">
          <label className="text-sm font-semibold text-ds-ink">Obras <span className="text-ds-red">*</span></label>
          <p className="text-xs text-ds-gray-400">Elegí el tipo de obra y marcá en cuáles trabaja esta cuadrilla.</p>
        </div>
        {filtered.length > 0 && (
          <button type="button"
            onClick={() => {
              const allOn = filtered.every(o => sel.has(o.idObra));
              if (allOn) onChange(selected.filter(id => !filtered.some(o => o.idObra === id)));
              else onChange([...new Set([...selected, ...filtered.map(o => o.idObra)])]);
            }}
            className="text-[11px] font-semibold text-ds-gray-500 hover:text-ds-ink underline underline-offset-2 shrink-0">
            {filtered.every(o => sel.has(o.idObra)) ? 'Quitar todas' : (term ? 'Seleccionar filtradas' : 'Seleccionar todas')}
          </button>
        )}
        {selected.length > 0 && (
          <span className="text-[11px] font-bold rounded-full px-2 py-0.5 shrink-0 bg-brand text-black">
            {selected.length} sel.
          </span>
        )}
      </div>
      {selObras.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selObras.map(o => (
            <span key={o.idObra} className="inline-flex items-center gap-1 rounded-full bg-brand text-black text-xs font-semibold pl-2.5 pr-1.5 py-1">
              {o.numeroObra}
              <button type="button" onClick={() => toggle(o.idObra)} aria-label="Quitar" title="Quitar"
                className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-black/15 leading-none">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Combobox value={tipoSel} onChange={setTipoSel} placeholder="Tipo de obra"
          options={tipos.map(t => ({
            value: t.codigo, label: `${t.letra} · ${t.nombre}`,
            parts: [{ text: t.letra, weight: 'bold' as const }, { text: t.nombre, weight: 'light' as const }],
          }))} />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar obra por número o nombre…"
          leftIcon={<Icon name="search" size="sm" color="currentColor" className="text-ds-gray-400" />} />
      </div>
      <div className="max-h-52 overflow-y-auto rounded-ds border border-ds-gray-200 divide-y divide-ds-gray-100 bg-ds-surface">
        {filtered.length === 0 ? (
          <p className="px-3 py-5 text-sm text-ds-gray-400 text-center">Sin obras</p>
        ) : filtered.slice(0, 300).map(o => {
          const on = sel.has(o.idObra);
          return (
            <button key={o.idObra} type="button" onClick={() => toggle(o.idObra)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${on ? 'bg-brand/10' : 'hover:bg-ds-gray-100'}`}>
              <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border-2 transition-colors ${on ? 'bg-brand border-brand' : 'border-ds-gray-300 bg-ds-surface'}`}>
                {on && <Icon name="check" size="sm" color="currentColor" className="text-ds-ink" />}
              </span>
              <span className="text-sm text-ds-ink font-semibold shrink-0 w-20">{o.numeroObra}</span>
              <span className="text-xs text-ds-gray-400 flex-1 min-w-0 break-words">{o.nombreMostrado ?? ''}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Selector de SUBPARTIDAS en cascada: tipo de obra → etapa/área → partida ──
// Así se le indica a la cuadrilla QUÉ puede trabajar recorriendo el catálogo como
// está organizado: primero el tipo (vivienda, infra, fábrica…), después la etapa
// (o área/sistema/proceso, según el tipo), después la partida y ahí sus subpartidas.
function SubpartidasPicker({ tipos, catalogos, cargandoTipos, onCargarTipo, subsIndex, selected, onChange, ocupadas }: {
  tipos: TipoLite[];
  catalogos: Record<string, CatalogoTipo>;
  cargandoTipos: Set<string>;
  onCargarTipo: (codigo: string) => void;
  subsIndex: Map<number, { codigo: string; nombre: string }>;
  selected: number[]; onChange: (ids: number[]) => void;
  ocupadas?: Map<number, string>;   // idSubPartida -> cuadrilla que ya la tiene (en este proyecto)
}) {
  const [q, setQ] = useState('');
  const [tipoSel, setTipoSel] = useState('VIVIENDA');
  const [etapaSel, setEtapaSel] = useState('');
  const [partidaSel, setPartidaSel] = useState('');
  const term = q.trim().toLowerCase();

  const cat = catalogos[tipoSel];
  const cargando = cargandoTipos.has(tipoSel);
  const tipoActual = tipos.find(t => t.codigo === tipoSel);
  const termGrupo = tipoActual?.terminoGrupo ?? 'Etapa';

  const cambiarTipo = (t: string) => { setTipoSel(t); setEtapaSel(''); setPartidaSel(''); if (t) onCargarTipo(t); };
  const cambiarEtapa = (e: string) => { setEtapaSel(e); setPartidaSel(''); };

  const partidasDeEtapa = (cat?.partidas ?? []).filter(pa => !etapaSel || String(pa.idEtapa ?? '') === etapaSel);
  const idsPartidasVisibles = new Set(partidasDeEtapa.map(pa => pa.idPartida));

  // La lista pide al menos la etapa (o una búsqueda): fábrica trae 5.800 subpartidas
  // y volcarlas de una no ayuda a nadie.
  const listaActiva = !!(etapaSel || partidaSel || term);
  const filtered = !cat || !listaActiva ? [] : cat.subpartidas.filter(sp => {
    if (partidaSel && String(sp.idPartida) !== partidaSel) return false;
    if (!partidaSel && etapaSel && !idsPartidasVisibles.has(sp.idPartida)) return false;
    if (term && !coincideBusqueda(`${sp.codigo} ${sp.nombre}`, term)) return false;
    return true;
  });

  const sel = new Set(selected);
  const toggle = (id: number) => onChange(sel.has(id) ? selected.filter(x => x !== id) : [...selected, id]);

  return (
    <div className="rounded-ds-lg border border-ds-gray-200 p-3.5 space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-ds bg-black flex items-center justify-center shrink-0">
          <Icon name="list" size="sm" color="currentColor" className="text-brand" />
        </div>
        <div className="flex-1 min-w-0">
          <label className="text-sm font-semibold text-ds-ink">Subpartidas <span className="text-ds-red">*</span></label>
          <p className="text-xs text-ds-gray-400">Elegí tipo de obra → {termGrupo.toLowerCase()} → partida, y marcá las que ejecuta.</p>
        </div>
        {selected.length > 0 && (
          <span className="text-[11px] font-bold rounded-full px-2 py-0.5 shrink-0 bg-brand text-black">
            {selected.length} sel.
          </span>
        )}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(id => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-black text-white text-xs font-semibold pl-2.5 pr-1.5 py-1"
              title={subsIndex.get(id)?.nombre ?? ''}>
              {subsIndex.get(id)?.codigo ?? `#${id}`}
              <button type="button" onClick={() => toggle(id)} aria-label="Quitar" title="Quitar"
                className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-ds-surface/20 leading-none">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {/* La cascada: tipo → etapa/área/sistema/proceso → partida */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Combobox value={tipoSel} onChange={cambiarTipo} placeholder="Tipo de obra"
          options={tipos.map(t => ({
            value: t.codigo, label: `${t.letra} · ${t.nombre}`,
            parts: [{ text: t.letra, weight: 'bold' as const }, { text: t.nombre, weight: 'light' as const }],
          }))} />
        <Combobox value={etapaSel} onChange={cambiarEtapa} placeholder={cargando ? 'Cargando…' : termGrupo}
          options={[{ value: '', label: `Todas (${termGrupo.toLowerCase()})` }, ...(cat?.etapas ?? []).map(e => ({
            value: String(e.idEtapa),
            label: `${e.bcWorksNo ? `${e.bcWorksNo} — ` : ''}${e.nombre}`,
            parts: [{ text: e.bcWorksNo ?? e.codigo, weight: 'bold' as const }, { text: e.nombre, weight: 'light' as const }],
            search: `${e.bcWorksNo ?? ''} ${e.codigo} ${e.nombre}`,
          }))]} />
        <Combobox value={partidaSel} onChange={setPartidaSel} placeholder="Partida"
          options={[{ value: '', label: 'Todas las partidas' }, ...partidasDeEtapa.map(pa => ({
            value: String(pa.idPartida), label: `${pa.codigo} · ${pa.nombre}`,
            parts: [{ text: pa.codigo, weight: 'bold' as const }, { text: pa.nombre, weight: 'light' as const }],
          }))]} />
      </div>
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar subpartida…"
        leftIcon={<Icon name="search" size="sm" color="currentColor" className="text-ds-gray-400" />} />
      <div className="max-h-52 overflow-y-auto rounded-ds border border-ds-gray-200 divide-y divide-ds-gray-100 bg-ds-surface">
        {cargando ? (
          <p className="px-3 py-5 text-sm text-ds-gray-400 text-center">Cargando el catálogo…</p>
        ) : !listaActiva ? (
          <p className="px-3 py-5 text-sm text-ds-gray-400 text-center">
            Elegí {termGrupo.toLowerCase()} y partida (o buscá) para ver las subpartidas.
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-5 text-sm text-ds-gray-400 text-center">Sin subpartidas</p>
        ) : filtered.slice(0, 400).map(sp => {
          const on = sel.has(sp.idSubPartida);
          // Varias cuadrillas SÍ pueden compartir subpartida en un proyecto (así trabajan:
          // Apoyo entra a lo de Pintura, etc.) — solo se AVISA quién más la tiene.
          const tambienEn = ocupadas?.get(sp.idSubPartida);
          return (
            <button key={sp.idSubPartida} type="button" onClick={() => toggle(sp.idSubPartida)}
              title={tambienEn ? `También la trabaja ${tambienEn} en este proyecto` : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${on ? 'bg-brand/10' : 'hover:bg-ds-gray-100'}`}>
              <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${on ? 'bg-brand border-brand' : 'border-ds-gray-300 bg-ds-surface'}`}>
                {on && <Icon name="check" size="sm" color="currentColor" className="text-ds-ink" />}
              </span>
              <span className="text-sm text-ds-ink font-semibold shrink-0 w-16">{sp.codigo}</span>
              <span className="text-xs text-ds-gray-400 flex-1 min-w-0 break-words">{sp.nombre}</span>
              {tambienEn ? (
                <span className="text-[10px] font-semibold text-ds-gray-400 shrink-0 max-w-[12rem] break-words bg-ds-gray-200/60 rounded-full px-2 py-0.5">{tambienEn}</span>
              ) : sp.partidaCodigo ? (
                <span className="text-[10px] text-ds-gray-300 shrink-0">{sp.partidaCodigo}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function CuadrillasPage() {
  const session = useSession();
  const { toast } = useToast();
  const confirm = useConfirm();
  const isAdmin = !!session && session.nivelAdmin >= 2;

  const [cuadrillas, setCuadrillas] = useState<Cuadrilla[]>([]);
  const [loading, setLoading] = useState(true);
  const [obras, setObras] = useState<ObraLite[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  // Solo colaboradores CON cuenta de login: para ser encargado de una partida
  // (o subpartida) la persona tiene que ser usuario.
  const [usuariosLogin, setUsuariosLogin] = useState<Colaborador[]>([]);
  const [partidas, setPartidas] = useState<PartidaLite[]>([]);
  const [subpartidas, setSubpartidas] = useState<SubLite[]>([]);
  // Catálogo por tipo de obra para el selector en cascada (se carga al elegir el tipo).
  const [tipos, setTipos] = useState<TipoLite[]>([]);
  const [catalogos, setCatalogos] = useState<Record<string, CatalogoTipo>>({});
  const [cargandoTipos, setCargandoTipos] = useState<Set<string>>(new Set());
  // Subpartidas de la cuadrilla que se está editando (por si son de un tipo aún no cargado).
  const [subsExtra, setSubsExtra] = useState<SubLite[]>([]);
  const [proyectos, setProyectos] = useState<ProyectoLite[]>([]);
  // Subpartidas que otras cuadrillas ya trabajan, POR proyecto (solo para AVISAR en el form).
  const [ocupadasByProy, setOcupadasByProy] = useState<Record<number, Map<number, string>>>({});
  const [q, setQ] = useState('');
  // Dos vistas: la grilla de cuadrillas y los encargados por subpartida.
  const [vista, setVista] = useState<'cuadrillas' | 'encargados'>('cuadrillas');
  const [directos, setDirectos] = useState<EncargadoDirecto[]>([]);        // encargado por subpartida
  const [tablaFaltante, setTablaFaltante] = useState(false);
  const [expandedPart, setExpandedPart] = useState<Set<number>>(new Set());

  // Asignar encargado: se elige UN encargado y las subpartidas (varias) que toma.
  const [asignarPartida, setAsignarPartida] = useState<{ idPartida: number; label: string } | null>(null);
  const [asignarEnc, setAsignarEnc] = useState('');            // idColaborador (uno)
  const [asignarSubs, setAsignarSubs] = useState<number[]>([]); // idSubPartida (varias)
  const [asignando, setAsignando] = useState(false);
  const [quitandoId, setQuitandoId] = useState<number | null>(null);

  // Crear / editar cuadrilla — UN modal con pestañas (como el editor de RH):
  // Datos → Casas → Subpartidas → Miembros.
  const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab] = useState<'datos' | 'casas' | 'subpartidas' | 'miembros'>('datos');
  // Como el editor de RH: se abre en LECTURA y "Editar" habilita los campos.
  const [modoEdicion, setModoEdicion] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY);
  // Proyecto activo (pestaña) dentro del form multi-proyecto.
  const [activeProy, setActiveProy] = useState<number | null>(null);

  // Ver miembros de una cuadrilla
  const [verCuad, setVerCuad] = useState<CuadrillaDetalle | null>(null);
  const [loadingMiembros, setLoadingMiembros] = useState(false);
  const [selectedCol, setSelectedCol] = useState('');
  const [addingMiembro, setAddingMiembro] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  // Catálogo de un tipo de obra, una sola vez (fábrica pesa ~1 MB: solo si se pide).
  const catalogosEnVuelo = useRef(new Set<string>());
  const cargarCatalogo = useCallback(async (codigo: string) => {
    if (!codigo || catalogos[codigo] || catalogosEnVuelo.current.has(codigo)) return;
    catalogosEnVuelo.current.add(codigo);
    setCargandoTipos(prev => new Set(prev).add(codigo));
    try {
      const d = await fetch(`/api/partidas?tipo=${encodeURIComponent(codigo)}`).then(r => (r.ok ? r.json() : null));
      if (d) setCatalogos(prev => ({ ...prev, [codigo]: { etapas: d.etapas ?? [], partidas: d.partidas ?? [], subpartidas: d.subpartidas ?? [] } }));
    } finally {
      catalogosEnVuelo.current.delete(codigo);
      setCargandoTipos(prev => { const n = new Set(prev); n.delete(codigo); return n; });
    }
  }, [catalogos]);

  // Código y nombre de CUALQUIER subpartida conocida (catálogos cargados + las de la
  // cuadrilla en edición): es lo que usan las chips de seleccionadas.
  const subsIndex = useMemo(() => {
    const m = new Map<number, { codigo: string; nombre: string }>();
    for (const c of Object.values(catalogos)) for (const sp of c.subpartidas) m.set(sp.idSubPartida, { codigo: sp.codigo, nombre: sp.nombre });
    for (const sp of subsExtra) if (!m.has(sp.idSubPartida)) m.set(sp.idSubPartida, { codigo: sp.codigo, nombre: sp.nombre });
    return m;
  }, [catalogos, subsExtra]);

  async function loadCuadrillas() {
    const data = await fetch('/api/cuadrillas').then(r => r.json());
    setCuadrillas(data.data ?? []);
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/cuadrillas').then(r => r.json()),
      fetch('/api/obras?porPagina=1000').then(r => r.json()),
      // Todos los colaboradores activos (no solo 200): si se corta la lista, los
      // que quedan fuera del corte alfabético no aparecen en el buscador de miembros.
      fetch('/api/usuarios?activo=1&porPagina=5000').then(r => r.json()),
      fetch('/api/partidas').then(r => r.json()),
      fetch('/api/encargados-partida').then(r => r.json()).catch(() => ({})),
      fetch('/api/usuarios?activo=1&soloUsuarios=1&porPagina=500').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/proyectos').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/tipos-obra').then(r => r.json()).catch(() => ({ tipos: [] })),
    ]).then(([c, o, u, pt, en, usu, pr, ti]) => {
      setTipos(((ti.tipos ?? []) as TipoLite[]).map(t => ({ codigo: t.codigo, letra: t.letra, nombre: t.nombre, terminoGrupo: t.terminoGrupo })));
      setCatalogos({ VIVIENDA: { etapas: pt.etapas ?? [], partidas: pt.partidas ?? [], subpartidas: pt.subpartidas ?? [] } });
      setProyectos(((pr.data ?? []) as { IDProyecto: number; Nombre: string }[]).map(x => ({ idProyecto: x.IDProyecto, nombre: x.Nombre })));
      setCuadrillas(c.data ?? []);
      setObras((o.data ?? []).map((x: { idObra: number; numeroObra: string; nombreMostrado: string | null; idProyecto: number | null; tipoObraEfectivo?: string | null }) => ({ idObra: x.idObra, numeroObra: x.numeroObra, nombreMostrado: x.nombreMostrado, idProyecto: x.idProyecto ?? null, tipoObra: (x.tipoObraEfectivo ?? 'VIVIENDA').toUpperCase() })));
      setColaboradores(u.data ?? []);
      setUsuariosLogin(usu.data ?? []);
      setPartidas(pt.partidas ?? []);
      setSubpartidas(pt.subpartidas ?? []);

      setDirectos(en.directos ?? []);
      setTablaFaltante(!!en.tablaFaltante);
    }).catch(() => toast('Error cargando datos', 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  async function loadEncargados() {
    const d = await fetch('/api/encargados-partida').then(r => r.json()).catch(() => ({}));
    setDirectos(d.directos ?? []);
    setTablaFaltante(!!d.tablaFaltante);
  }

  // La pestaña activa siempre debe ser uno de los proyectos elegidos.
  useEffect(() => {
    if (form.proyectos.length === 0) { if (activeProy !== null) setActiveProy(null); return; }
    if (activeProy === null || !form.proyectos.includes(activeProy)) setActiveProy(form.proyectos[0]);
  }, [form.proyectos, activeProy]);

  // Al abrir el form, traer las subpartidas ya tomadas en CADA proyecto elegido.
  const proyKey = form.proyectos.join(',');
  useEffect(() => {
    if (!modalOpen || form.proyectos.length === 0) { setOcupadasByProy({}); return; }
    let cancelado = false;
    Promise.all(form.proyectos.map(p =>
      fetch(`/api/cuadrillas/subpartidas-ocupadas?idProyecto=${p}${editId ? `&excluir=${editId}` : ''}`)
        .then(r => r.json())
        .then((d: { data?: { idSubPartida: number; cuadrilla: string }[] }) => {
          const m = new Map<number, string>();
          for (const row of (d.data ?? [])) m.set(row.idSubPartida, row.cuadrilla);
          return [p, m] as const;
        })
        .catch(() => [p, new Map<number, string>()] as const),
    )).then(pairs => { if (!cancelado) setOcupadasByProy(Object.fromEntries(pairs)); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, proyKey, editId]);

  function openCreate() {
    setEditId(null);
    setForm(EMPTY);
    setVerCuad(null);
    setSubsExtra([]);
    setSelectedCol('');
    setTab('datos');
    setModoEdicion(true);
    setModalOpen(true);
  }
  // Vuelca el detalle de la cuadrilla en el formulario (bloques por proyecto,
  // reconstruidos desde obras (obra.idProyecto) y subpartidas (cs.idProyecto)).
  function poblarForm(c: CuadrillaDetalle) {
    setSubsExtra(c.subpartidas ?? []);
    const obrasByProy: Record<number, number[]> = {};
    const subsByProy: Record<number, number[]> = {};
    for (const o of (c.obras ?? [])) if (o.idProyecto != null) (obrasByProy[o.idProyecto] ??= []).push(o.idObra);
    for (const s of (c.subpartidas ?? [])) if (s.idProyecto != null) (subsByProy[s.idProyecto] ??= []).push(s.idSubPartida);
    const proys = [...new Set([
      ...(c.proyectos ?? []).map(p => p.idProyecto),
      ...Object.keys(obrasByProy).map(Number),
      ...Object.keys(subsByProy).map(Number),
    ])].filter(Boolean);
    setForm({
      nombre: c.Nombre,
      idEncargado: String(c.IDEncargado),
      capacidad: String(c.Capacidad),
      proyectos: proys,
      obrasByProy,
      subsByProy,
    });
  }
  // Abrir una cuadrilla = el modal de pestañas, cargando su detalle.
  async function abrirCuadrilla(c: Cuadrilla) {
    setEditId(c.IDCuadrilla);
    setForm({ ...EMPTY, nombre: c.Nombre });
    setVerCuad(null);
    setSubsExtra([]);
    setSelectedCol('');
    setTab('datos');
    setModoEdicion(false);
    setLoadingMiembros(true);
    setModalOpen(true);
    try {
      const d: CuadrillaDetalle = await fetch(`/api/cuadrillas/${c.IDCuadrilla}`).then(r => r.json());
      setVerCuad(d);
      poblarForm(d);
    } catch { toast('No se pudo cargar la cuadrilla', 'error'); } finally {
      setLoadingMiembros(false);
    }
  }

  async function handleSave() {
    if (!form.nombre.trim() || !form.idEncargado) { toast('Nombre y encargado son requeridos', 'warning'); return; }
    if (form.proyectos.length === 0) { toast('Seleccioná al menos un proyecto', 'warning'); return; }
    const bloques = form.proyectos.map(p => ({
      idProyecto: p,
      idObras: form.obrasByProy[p] ?? [],
      idSubPartidas: form.subsByProy[p] ?? [],
    }));
    for (const b of bloques) {
      const nom = proyectos.find(x => x.idProyecto === b.idProyecto)?.nombre ?? 'un proyecto';
      if (b.idObras.length === 0) { toast(`Elegí al menos una obra en ${nom}`, 'warning'); return; }
      if (b.idSubPartidas.length === 0) { toast(`Elegí al menos una subpartida en ${nom}`, 'warning'); return; }
    }
    setSaving(true);
    try {
      const res = await fetch(editId ? `/api/cuadrillas/${editId}` : '/api/cuadrillas', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre,
          idEncargado: parseInt(form.idEncargado),
          capacidad: Math.max(1, parseInt(form.capacidad) || 25),
          bloques,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); toast(e.error || 'Error guardando cuadrilla', 'error'); return; }
      toast(editId ? 'Cuadrilla actualizada' : 'Cuadrilla creada', 'success');
      if (editId) {
        // Igual que RH: se guarda y el panel vuelve a lectura, ya refrescado.
        setModoEdicion(false);
        try {
          const d: CuadrillaDetalle = await fetch(`/api/cuadrillas/${editId}`).then(r => r.json());
          setVerCuad(d);
          poblarForm(d);
        } catch { /* la lista de abajo igual se refresca */ }
      } else {
        setModalOpen(false);
      }
      await loadCuadrillas();
      await loadEncargados();
    } finally {
      setSaving(false);
    }
  }

  async function loadDetalle(idCuadrilla: number) {
    const d: CuadrillaDetalle = await fetch(`/api/cuadrillas/${idCuadrilla}`).then(r => r.json());
    setVerCuad(d);
  }

  const otraCuadrillaPorCol = useMemo(() => {
    const m = new Map<number, string>();
    (verCuad?.otrasMembresias ?? []).forEach(o => m.set(o.IDCol, o.Cuadrilla));
    return m;
  }, [verCuad]);

  const yaEnEsta = useMemo(
    () => new Set((verCuad?.miembros ?? []).filter(m => m.Activo).map(m => m.IDCol)),
    [verCuad],
  );

  async function handleAgregarMiembro() {
    if (!verCuad || !selectedCol) { toast('Selecciona un colaborador', 'warning'); return; }
    const otra = otraCuadrillaPorCol.get(parseInt(selectedCol));
    if (otra) { toast(`Ese colaborador pertenece a la cuadrilla "${otra}". Quítalo de ahí primero.`, 'warning'); return; }
    setAddingMiembro(true);
    try {
      const res = await fetch(`/api/cuadrillas/${verCuad.IDCuadrilla}/miembros`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idCol: parseInt(selectedCol) }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); toast(e.error || 'Error agregando miembro', 'error'); return; }
      toast('Miembro agregado', 'success');
      setSelectedCol('');
      await loadDetalle(verCuad.IDCuadrilla);
      await loadCuadrillas();
    } finally {
      setAddingMiembro(false);
    }
  }

  async function handleQuitarMiembro(idCuadMiembro: number) {
    if (!verCuad) return;
    if (!(await confirm({ message: '¿Quitar este miembro de la cuadrilla?', confirmLabel: 'Quitar', danger: true }))) return;
    setRemovingId(idCuadMiembro);
    try {
      await fetch(`/api/cuadrillas/${verCuad.IDCuadrilla}/miembros`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idCuadMiembro }),
      });
      toast('Miembro removido', 'warning');
      await loadDetalle(verCuad.IDCuadrilla);
      await loadCuadrillas();
    } finally {
      setRemovingId(null);
    }
  }

  // Filtro de búsqueda (nombre, encargado, obras o subpartidas).
  const cuadrillasFiltradas = useMemo(() => {
    const term = q.trim().toLowerCase();
    const orden = [...cuadrillas].sort((a, b) => a.Nombre.localeCompare(b.Nombre));
    if (!term) return orden;
    return orden.filter(c =>
      coincideBusqueda([c.Nombre, c.Encargado ?? '', c.Proyecto ?? '', c.Obras ?? '', c.Subpartidas ?? ''].join(' '), term),
    );
  }, [cuadrillas, q]);

  // Vista "Encargados por partida": recorre TODAS las partidas y por cada una
  // lista sus subpartidas con su encargado (0 o 1 por subpartida). Se filtra por
  // el buscador (partida, subpartida o encargado).
  const partidasView = useMemo(() => {
    // idSubPartida -> su encargado asignado (uno solo).
    const encPorSub = new Map<number, EncargadoDirecto>();
    for (const d of directos) encPorSub.set(d.idSubPartida, d);

    // Subpartidas por partida.
    const subsPorPartida = new Map<number, SubLite[]>();
    for (const s of subpartidas) {
      if (!subsPorPartida.has(s.idPartida)) subsPorPartida.set(s.idPartida, []);
      subsPorPartida.get(s.idPartida)!.push(s);
    }

    const rows = [...partidas]
      .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }))
      .map(p => {
        const subs = (subsPorPartida.get(p.idPartida) ?? [])
          .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }))
          .map(s => ({ sub: s, encargado: encPorSub.get(s.idSubPartida) ?? null }));
        const conEnc = subs.filter(x => x.encargado).length;
        return { p, subs, conEnc, total: subs.length };
      });

    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(row => {
      const hay = [
        row.p.codigo, row.p.nombre,
        ...row.subs.flatMap(x => [x.sub.codigo, x.sub.nombre, x.encargado?.encargado ?? '']),
      ].join(' ');
      return coincideBusqueda(hay, term);
    });
  }, [partidas, subpartidas, directos, q]);

  const partidasConEnc = useMemo(() => partidasView.filter(r => r.conEnc > 0).length, [partidasView]);

  function toggleExpand(idPartida: number) {
    setExpandedPart(prev => {
      const next = new Set(prev);
      if (next.has(idPartida)) next.delete(idPartida); else next.add(idPartida);
      return next;
    });
  }

  function openAsignar(idPartida: number, label: string) {
    setAsignarPartida({ idPartida, label });
    setAsignarEnc('');
    setAsignarSubs([]);
  }

  // Asigna UN encargado a las subpartidas seleccionadas (varias) de la partida.
  async function handleAsignar() {
    if (!asignarPartida) return;
    if (!asignarEnc) { toast('Seleccioná el encargado', 'warning'); return; }
    if (asignarSubs.length === 0) { toast('Marcá al menos una subpartida', 'warning'); return; }
    setAsignando(true);
    try {
      let ok = 0, fail = 0, lastErr = '';
      for (const idSub of asignarSubs) {
        const res = await fetch('/api/encargados-partida', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idColaborador: Number(asignarEnc), idSubPartida: idSub }),
        });
        if (res.ok) { ok++; } else { fail++; const e = await res.json().catch(() => ({})); lastErr = e.error || ''; }
      }
      if (ok) toast(`${ok} subpartida${ok === 1 ? '' : 's'} asignada${ok === 1 ? '' : 's'}`, 'success');
      if (fail) toast(`${fail} no se pudo asignar${lastErr ? `: ${lastErr}` : ''}`, 'error');
      setAsignarSubs([]);
      await loadEncargados();
    } finally {
      setAsignando(false);
    }
  }

  async function handleQuitarEncargado(idEncargadoPartida: number) {
    if (!(await confirm({ message: '¿Quitar el encargado de esta subpartida?', confirmLabel: 'Quitar', danger: true }))) return;
    setQuitandoId(idEncargadoPartida);
    try {
      const res = await fetch('/api/encargados-partida', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idEncargadoPartida }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); toast(e.error || 'Error quitando encargado', 'error'); return; }
      toast('Encargado quitado', 'warning');
      await loadEncargados();
    } finally {
      setQuitandoId(null);
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Cuadrillas"
        subtitle={loading ? 'Cargando…' : vista === 'cuadrillas' ? `${cuadrillas.length} cuadrillas activas` : `${partidasConEnc} de ${partidas.length} partida(s) con encargados`}
        actions={isAdmin && vista === 'cuadrillas' && (
          <Button onClick={openCreate} icon={<Icon name="plus" size="sm" color="currentColor" />}>
            Nueva cuadrilla
          </Button>
        )}
      />

      {/* Toggle: Cuadrillas | Encargados por partida */}
      <div className="inline-flex gap-1 p-1 bg-ds-gray-100 rounded-full">
        {([
          { val: 'cuadrillas', label: 'Cuadrillas', icon: 'cuadrillas' },
          { val: 'encargados', label: 'Encargados por partida', icon: 'user' },
        ] as const).map(opt => (
          <button key={opt.val} onClick={() => setVista(opt.val)}
            className={`inline-flex items-center gap-2 px-5 h-11 rounded-full text-sm font-semibold transition-all ${vista === opt.val ? 'bg-black text-white shadow-ds-02' : 'text-ds-gray-400 hover:text-ds-ink'}`}>
            <Icon name={opt.icon} size="sm" color="currentColor" />
            {opt.label}
          </button>
        ))}
      </div>

      <Input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={vista === 'cuadrillas' ? 'Buscar por nombre, encargado, obra o subpartida…' : 'Buscar por partida, subpartida o encargado…'}
        leftIcon={<Icon name="search" size="sm" color="currentColor" className="text-ds-gray-400" />}
      />

      {/* ── Vista: Encargados por partida ── */}
      {vista === 'encargados' && (
        loading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full" rounded="rounded-ds-lg" />)}</div>
        ) : (
          <Stagger className="space-y-3">
            {tablaFaltante && (
              <div className="rounded-ds-lg border border-ds-yellow/50 bg-ds-yellow/10 px-4 py-3 text-sm text-black flex items-start gap-2.5">
                <Icon name="alert" size="sm" color="currentColor" className="text-ds-yellow mt-0.5 shrink-0" />
                <span>Falta correr la migración <code className="font-mono text-xs bg-black/5 px-1 py-0.5 rounded">dbo.EncargadoPartida</code> en AdelanteSBX. Hasta entonces no se pueden asignar encargados.</span>
              </div>
            )}

            {partidasView.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-ds-gray-300">
                <Icon name="user" size="lg" color="currentColor" className="mb-4" />
                <p className="text-body font-semibold text-ds-ink">{q ? 'Sin resultados' : 'Sin partidas'}</p>
                <p className="text-sm mt-1 text-ds-gray-400">{q ? 'Probá con otro término de búsqueda.' : 'No hay partidas activas en el catálogo.'}</p>
              </div>
            ) : partidasView.map(row => {
              const expanded = expandedPart.has(row.p.idPartida);
              const completa = row.total > 0 && row.conEnc === row.total;
              return (
                <StaggerItem key={row.p.idPartida}>
                <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 overflow-hidden">
                  {/* Encabezado de la partida */}
                  <div className="px-5 py-3 bg-ds-gray-100 border-b border-ds-gray-200 flex items-center gap-2.5">
                    <button onClick={() => toggleExpand(row.p.idPartida)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                      <div className="w-7 h-7 rounded-ds bg-black flex items-center justify-center shrink-0">
                        <Icon name="list" size="sm" color="currentColor" className="text-brand" />
                      </div>
                      <h2 className="font-bold text-ds-ink text-label flex-1 min-w-0 break-words">{row.p.codigo} · {row.p.nombre}</h2>
                      <Icon name="open" size="sm" color="currentColor" className={`text-ds-gray-400 shrink-0 transition-transform ${expanded ? '' : 'rotate-180'}`} />
                    </button>
                    <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 shrink-0 ${row.conEnc === 0 ? 'text-ds-gray-400 bg-ds-gray-200' : completa ? 'text-black bg-brand' : 'text-black bg-brand/40'}`}>
                      {row.conEnc}/{row.total}
                    </span>
                    {isAdmin && !tablaFaltante && (
                      <Button size="sm" variant="outline" onClick={() => openAsignar(row.p.idPartida, `${row.p.codigo} · ${row.p.nombre}`)}
                        icon={<Icon name="plus" size="sm" color="currentColor" />} className="shrink-0">
                        Asignar
                      </Button>
                    )}
                  </div>

                  {/* Subpartidas de la partida */}
                  {expanded && (
                    row.subs.length === 0 ? (
                      <p className="px-5 py-4 text-sm text-ds-gray-400">Esta partida no tiene subpartidas.</p>
                    ) : (
                      <div className="divide-y divide-ds-gray-100">
                        {row.subs.map(x => (
                          <div key={x.sub.idSubPartida} className="px-5 py-2.5 flex items-center gap-3">
                            <span className="text-sm font-semibold text-ds-ink shrink-0 w-16">{x.sub.codigo}</span>
                            <span className="text-xs text-ds-gray-400 flex-1 min-w-0 break-words">{x.sub.nombre}</span>
                            {x.encargado ? (
                              <ChipEncargado nombre={x.encargado.encargado}
                                onRemove={isAdmin ? () => handleQuitarEncargado(x.encargado!.idEncargadoPartida) : undefined}
                                loading={quitandoId === x.encargado.idEncargadoPartida} />
                            ) : (
                              <span className="text-xs text-ds-gray-300 shrink-0">Sin encargado</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
                </StaggerItem>
              );
            })}
          </Stagger>
        )
      )}

      {/* ── Vista: Cuadrillas ── */}
      {vista === 'cuadrillas' && (loading ? (
        <SkeletonCards count={6} />
      ) : cuadrillasFiltradas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-ds-gray-300">
          <Icon name="cuadrillas" size="lg" color="currentColor" className="mb-4" />
          <p className="text-body font-semibold text-ds-ink">{q ? 'Sin resultados' : 'Sin cuadrillas'}</p>
          {isAdmin && !q && (
            <Button className="mt-4" onClick={openCreate} icon={<Icon name="plus" size="sm" color="currentColor" />}>
              Crear primera cuadrilla
            </Button>
          )}
        </div>
      ) : (
        <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
          initial="hidden" animate="show" variants={listStagger}>
          {cuadrillasFiltradas.map(c => {
            const pct = Math.round((c.TotalMiembros / c.Capacidad) * 100);
            const barColor = pct > 80 ? 'bg-ds-red' : pct > 60 ? 'bg-ds-yellow' : 'bg-brand';
            return (
              <motion.div key={c.IDCuadrilla}
                variants={listItem}
                role="button"
                tabIndex={0}
                onClick={() => abrirCuadrilla(c)}
                onKeyDown={e => { if (e.key === 'Enter') abrirCuadrilla(c); }}
                className="group bg-ds-surface rounded-ds border border-ds-gray-200 shadow-ds-01 p-4 flex flex-col cursor-pointer hover:border-black hover:shadow-ds-02 transition-all">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-ds bg-black flex items-center justify-center shrink-0">
                      <Icon name="cuadrillas" size="sm" color="currentColor" className="text-brand" />
                    </div>
                    <p className="font-bold text-ds-ink text-sm break-words">{c.Nombre}</p>
                  </div>
                  <Badge variant="green" dot>Activa</Badge>
                </div>
                <p className="text-xs font-semibold text-ds-ink mb-1 break-words">
                  <Icon name="folder" size="sm" color="currentColor" className="inline mr-1 text-ds-gray-300" />
                  {c.Proyecto || 'Sin proyecto'}
                </p>
                <p className="text-xs text-ds-gray-300 mb-1 break-words">Enc: {c.Encargado || '—'}</p>
                {/* Cuántas obras, no cuáles. La lista entera —Eléctricos llega a 40
                    códigos— estiraba la tarjeta cinco veces más que sus vecinas y
                    reventaba la fila del grid; y cortarla con «…» no sirve, porque los
                    códigos comparten prefijo (VN-B.22, VN-B.24…) y el pedazo visible no
                    distingue una obra de otra. El detalle completo está a un clic, en la
                    pestaña "Casas" del panel, que es donde se trabaja con él. La búsqueda
                    sigue mirando los códigos (ver coincideBusqueda). */}
                <p className="text-xs text-ds-gray-400 mb-3 break-words">
                  <Icon name="place" size="sm" color="currentColor" className="inline mr-1 text-ds-gray-300" />
                  {c.TotalObras > 0 ? `${c.TotalObras} ${c.TotalObras === 1 ? 'obra' : 'obras'}` : 'Sin obras'}
                </p>
                <div className="space-y-1.5 mt-auto">
                  <div className="flex justify-between text-xs">
                    <span className="text-ds-gray-400 font-medium">{c.TotalMiembros} / {c.Capacidad} miembros</span>
                    <span className={`font-semibold ${pct > 80 ? 'text-ds-red' : pct > 60 ? 'text-ds-yellow' : 'text-ds-ink'}`}>{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-ds-gray-100 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
                <div className="flex items-center mt-3 pt-2">
                  <span className="ml-auto text-xs font-semibold text-ds-gray-300 group-hover:text-ds-ink transition-colors">Ver →</span>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      ))}

      {/* Crear / editar cuadrilla */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="xl" variant="drawer"
        title={editId ? `Cuadrilla: ${form.nombre || '…'}` : 'Nueva cuadrilla'}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cerrar</Button>
            {isAdmin && editId && !modoEdicion && (
              <Button onClick={() => setModoEdicion(true)} icon={<Icon name="edit" size="sm" color="currentColor" />}>Editar</Button>
            )}
            {isAdmin && modoEdicion && editId && (
              <Button variant="outline" onClick={() => { if (verCuad) poblarForm(verCuad); setModoEdicion(false); }}>Descartar</Button>
            )}
            {isAdmin && modoEdicion && (
              <Button loading={saving} onClick={handleSave}>{editId ? 'Guardar cambios' : 'Crear cuadrilla'}</Button>
            )}
          </>
        }
      >
        <div className="space-y-5">
          {/* Pestañas al estilo del editor de colaboradores de RH: primero los datos,
              después qué casas toma, después qué subpartidas, y por último la gente. */}
          <div className="inline-flex gap-1 p-1 bg-ds-gray-100 rounded-full flex-wrap">
            {([
              { val: 'datos' as const, label: 'Datos', icon: 'edit', badge: null },
              { val: 'casas' as const, label: 'Casas', icon: 'folder', badge: Object.values(form.obrasByProy).reduce((n, a) => n + a.length, 0) || null },
              { val: 'subpartidas' as const, label: 'Subpartidas', icon: 'list', badge: Object.values(form.subsByProy).reduce((n, a) => n + a.length, 0) || null },
              { val: 'miembros' as const, label: 'Miembros', icon: 'user', badge: (verCuad?.miembros ?? []).filter(m => m.Activo).length || null },
            ]).map(t => (
              <button key={t.val} type="button" onClick={() => setTab(t.val)} aria-current={tab === t.val}
                className={`inline-flex items-center gap-2 px-4 h-10 rounded-full text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${tab === t.val ? 'bg-black text-white shadow-ds-02' : 'text-ds-gray-400 hover:text-ds-ink'}`}>
                <Icon name={t.icon} size="sm" color="currentColor" />
                {t.label}
                {t.badge != null && (
                  <span className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold ${tab === t.val ? 'bg-brand text-black' : 'bg-ds-gray-200 text-ds-gray-500'}`}>
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {tab === 'datos' && (
          <div className="space-y-5">
          <div className="flex items-center justify-between gap-3 border-b border-ds-gray-100 pb-2">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <h3 className="font-bold text-ds-ink text-sm shrink-0">Datos de la cuadrilla</h3>
              {editId && <span className="font-mono text-[11px] font-semibold rounded-ds border border-ds-gray-200 bg-ds-gray-100 px-1.5 py-0.5 text-ds-gray-500">Cuadrilla #{editId}</span>}
            </div>
            {editId && verCuad && (
              <Badge variant={verCuad.Activo === false ? 'gray' : 'green'}>{verCuad.Activo === false ? 'Inactiva' : 'Activa'}</Badge>
            )}
          </div>
          <fieldset disabled={!modoEdicion || !isAdmin} className="contents">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Nombre de la cuadrilla" placeholder="Cuadrilla A — Cimentación" value={form.nombre}
              onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} required />
            <Combobox label="Encargado" value={String(form.idEncargado)}
              onChange={v => setForm(p => ({ ...p, idEncargado: v }))}
              placeholder="Seleccionar encargado" required
              options={colaboradores.map(c => ({ value: String(c.IDCol), label: c.NombreCompleto }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Combobox multiple label="Proyectos" values={form.proyectos.map(String)}
              onValuesChange={vals => setForm(p => {
                const nuevos = vals.map(Number);
                const obrasByProy: Record<number, number[]> = {};
                const subsByProy: Record<number, number[]> = {};
                for (const id of nuevos) { obrasByProy[id] = p.obrasByProy[id] ?? []; subsByProy[id] = p.subsByProy[id] ?? []; }
                return { ...p, proyectos: nuevos, obrasByProy, subsByProy };
              })}
              options={proyectos.map(pr => ({ value: String(pr.idProyecto), label: pr.nombre }))}
              placeholder="Elegí uno o más proyectos" emptyText="Sin proyectos" />
            <Input label="Capacidad máxima" type="number" min={1} value={form.capacidad}
              onChange={e => setForm(p => ({ ...p, capacidad: e.target.value }))} />
          </div>
          </fieldset>
          <p className="text-xs text-ds-gray-400">
            {modoEdicion
              ? <>Con los proyectos elegidos, pasá a <span className="font-semibold text-ds-ink">Casas</span> para marcar en qué obras trabaja y a <span className="font-semibold text-ds-ink">Subpartidas</span> para indicarle qué puede ejecutar.</>
              : <>Estás viendo la cuadrilla. Tocá <span className="font-semibold text-ds-ink">Editar</span> (abajo) para cambiar datos, casas o subpartidas.</>}
          </p>
          </div>
          )}

          {/* Un proyecto a la vez: la misma fila de pestañas de proyecto sirve para
              Casas y para Subpartidas. */}
          {(tab === 'casas' || tab === 'subpartidas') && (
          <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 border-b border-ds-gray-100 pb-2">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <h3 className="font-bold text-ds-ink text-sm shrink-0">{tab === 'casas' ? 'Casas por proyecto' : 'Subpartidas que puede trabajar'}</h3>
              {editId && <span className="font-mono text-[11px] font-semibold rounded-ds border border-ds-gray-200 bg-ds-gray-100 px-1.5 py-0.5 text-ds-gray-500">Cuadrilla #{editId}</span>}
            </div>
            {!modoEdicion && editId && isAdmin && (
              <button type="button" onClick={() => setModoEdicion(true)} className="text-xs font-semibold text-ds-ink hover:text-ds-gray-400 shrink-0">Editar</button>
            )}
          </div>
          {form.proyectos.length === 0 ? (
            <div className="rounded-ds-lg border border-dashed border-ds-gray-200 p-8 text-center">
              <p className="text-sm text-ds-gray-400">Primero elegí los <span className="font-semibold text-ds-ink">proyectos</span> en la pestaña Datos.</p>
            </div>
          ) : (
            <>
              {/* Cambiar de proyecto es NAVEGAR, no editar: queda fuera del fieldset
                  para que también funcione viendo la cuadrilla en modo lectura. */}
              {form.proyectos.length > 1 && (
                <div className="flex flex-wrap gap-1.5 border-b border-ds-gray-200 pb-1">
                  {form.proyectos.map(pid => {
                    const nom = proyectos.find(x => x.idProyecto === pid)?.nombre ?? 'Proyecto';
                    const nObras = (form.obrasByProy[pid] ?? []).length;
                    const nSubs = (form.subsByProy[pid] ?? []).length;
                    const activa = activeProy === pid;
                    const completo = nObras > 0 && nSubs > 0;
                    return (
                      <button key={pid} type="button" onClick={() => setActiveProy(pid)}
                        className={`inline-flex items-center gap-2 px-4 h-9 rounded-full text-sm font-semibold transition-colors ${activa ? 'bg-black text-white' : 'bg-ds-gray-100 text-ds-gray-500 hover:text-ds-ink'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${completo ? 'bg-brand' : 'bg-ds-red'}`} />
                        {nom}
                        <span className="text-[11px] font-bold opacity-70">{tab === 'casas' ? nObras : nSubs}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <fieldset disabled={!modoEdicion || !isAdmin} className="contents">
                {activeProy != null && (tab === 'casas' ? (
                  <ObrasPicker key={`o-${activeProy}`} tipos={tipos}
                    obras={obras.filter(o => o.idProyecto === activeProy)}
                    selected={form.obrasByProy[activeProy] ?? []}
                    onChange={ids => setForm(p => ({ ...p, obrasByProy: { ...p.obrasByProy, [activeProy]: ids } }))} />
                ) : (
                  <SubpartidasPicker key={`s-${activeProy}`} tipos={tipos} catalogos={catalogos}
                    cargandoTipos={cargandoTipos} onCargarTipo={cargarCatalogo}
                    subsIndex={subsIndex}
                    selected={form.subsByProy[activeProy] ?? []}
                    ocupadas={ocupadasByProy[activeProy]}
                    onChange={ids => setForm(p => ({ ...p, subsByProy: { ...p.subsByProy, [activeProy]: ids } }))} />
                ))}
              </fieldset>
            </>
          )}
          </div>
          )}

          {tab === 'miembros' && (
          <div className="space-y-3">
            {!editId ? (
              <div className="rounded-ds-lg border border-dashed border-ds-gray-200 p-8 text-center">
                <p className="text-sm text-ds-gray-400">Creá la cuadrilla primero; después podés agregarle miembros acá.</p>
              </div>
            ) : (
              <>
              {isAdmin && (
                <div className="flex items-end gap-2">
                  <div className="flex-1 min-w-0">
                    <Combobox label="Agregar usuario" value={selectedCol} onChange={setSelectedCol}
                      placeholder="Buscar colaborador…"
                      options={colaboradores
                        .filter(c => !yaEnEsta.has(c.IDCol))
                        .map(c => {
                          const otra = otraCuadrillaPorCol.get(c.IDCol);
                          return {
                            value: String(c.IDCol),
                            label: `${c.NombreCompleto}${otra ? ` (en ${otra})` : ''}`,
                            parts: otra
                              ? [{ text: c.NombreCompleto, weight: 'light' as const }, { text: `en ${otra}`, weight: 'light' as const }]
                              : [{ text: c.NombreCompleto, weight: 'bold' as const }, ...(c.Cedula ? [{ text: c.Cedula, weight: 'light' as const }] : [])],
                            search: c.Cedula,
                          };
                        })}
                    />
                  </div>
                  <Button onClick={handleAgregarMiembro} loading={addingMiembro} disabled={!selectedCol}
                    icon={<Icon name="plus" size="sm" color="currentColor" />}>
                    Agregar
                  </Button>
                </div>
              )}
              {selectedCol && otraCuadrillaPorCol.get(parseInt(selectedCol)) && (
                <p className="text-xs text-ds-red">
                  Este colaborador ya pertenece a la cuadrilla “{otraCuadrillaPorCol.get(parseInt(selectedCol))}”. Quítalo de ahí antes de agregarlo aquí.
                </p>
              )}
              {loadingMiembros ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (() => {
                const activos = verCuad?.miembros.filter(m => m.Activo) ?? [];
                const encId = verCuad?.IDEncargado ?? 0;
                const encMiembro = activos.find(m => m.IDCol === encId);
                const resto = activos.filter(m => m.IDCol !== encId);
                const encNombre = encMiembro?.NombreCompleto ?? verCuad?.Encargado ?? null;
                const encIni = (encNombre || '?').split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('');

                if (activos.length === 0 && !encNombre) {
                  return (
                    <div className="flex flex-col items-center justify-center py-10 text-ds-gray-300">
                      <Icon name="user" size="lg" color="currentColor" className="mb-2" />
                      <p className="text-sm font-semibold text-ds-ink">Sin miembros en esta cuadrilla</p>
                      <p className="text-xs text-ds-gray-400 mt-1">Agregá el primero con “Agregar”.</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-2">
                    {encNombre && (
                      <div className="flex items-center gap-3 px-4 py-2.5 rounded-ds bg-black text-white">
                        <div className="w-9 h-9 rounded-ds bg-brand flex items-center justify-center text-black text-xs font-bold shrink-0 shadow-ds-02">{encIni}</div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold break-words">{encNombre}</p>
                          <p className="text-xs text-ds-gray-300 break-words">
                            {encMiembro ? `${encMiembro.Cedula} · ${encMiembro.Puesto || 'Sin puesto'}` : 'Encargado (no cuenta como miembro)'}
                          </p>
                        </div>
                        <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-black bg-brand rounded-full px-2 py-0.5">
                          <Icon name="rol" size="sm" color="currentColor" /> Encargado
                        </span>
                      </div>
                    )}

                    {resto.length > 0 && (
                      <div className="rounded-ds border border-ds-gray-200 divide-y divide-ds-gray-100 max-h-[45vh] overflow-y-auto">
                        {resto.map(m => {
                          const ini = (m.NombreCompleto || '?').split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('');
                          return (
                            <div key={m.IDCuadMiembro} className="flex items-center gap-3 px-4 py-2.5">
                              <div className="w-9 h-9 rounded-ds bg-ds-gray-100 flex items-center justify-center text-ds-ink text-xs font-bold shrink-0">{ini}</div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-ds-ink break-words">{m.NombreCompleto}</p>
                                <p className="text-xs text-ds-gray-400 break-words">{m.Cedula} · {m.Puesto || 'Sin puesto'}</p>
                              </div>
                              {isAdmin && (
                                <button
                                  onClick={() => handleQuitarMiembro(m.IDCuadMiembro)}
                                  disabled={removingId === m.IDCuadMiembro}
                                  title="Quitar de la cuadrilla"
                                  aria-label="Quitar de la cuadrilla"
                                  className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-ds text-ds-gray-400 hover:text-ds-red hover:bg-ds-gray-100 transition-colors disabled:opacity-50"
                                >
                                  <Icon name="remove" size="sm" color="currentColor" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
              </>
            )}
          </div>
          )}
        </div>
      </Modal>


      {/* Asignar UN encargado a varias subpartidas (libres) de la partida */}
      <Modal
        open={!!asignarPartida}
        onClose={() => setAsignarPartida(null)}
        title="Asignar encargado"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setAsignarPartida(null)}>Cerrar</Button>
            <Button onClick={handleAsignar} loading={asignando} disabled={!asignarEnc || asignarSubs.length === 0}
              icon={<Icon name="plus" size="sm" color="currentColor" />}>
              Asignar{asignarSubs.length ? ` (${asignarSubs.length})` : ''}
            </Button>
          </>
        }
      >
        {asignarPartida && (() => {
          const subs = subpartidas
            .filter(s => s.idPartida === asignarPartida.idPartida)
            .sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
          const encPorSub = new Map(directos.map(d => [d.idSubPartida, d]));
          const sel = new Set(asignarSubs);
          const toggle = (id: number) => setAsignarSubs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
          const libres = subs.filter(s => !encPorSub.has(s.idSubPartida));
          const allLibres = libres.length > 0 && libres.every(s => sel.has(s.idSubPartida));
          return (
            <div className="space-y-4">
              <div className="rounded-ds bg-ds-gray-100 px-3 py-2 text-sm">
                <span className="text-ds-gray-400">Partida: </span>
                <span className="font-semibold text-ds-ink">{asignarPartida.label}</span>
              </div>
              <div>
                <Combobox label="Encargado (usuario)" value={asignarEnc} onChange={setAsignarEnc}
                  placeholder="Buscar usuario…"
                  options={usuariosLogin.map(c => ({
                    value: String(c.IDCol), label: c.NombreCompleto,
                    parts: [{ text: c.NombreCompleto, weight: 'bold' as const }, ...(c.Cedula ? [{ text: c.Cedula, weight: 'light' as const }] : [])],
                    search: c.Cedula,
                  }))} />
                <p className="text-xs text-ds-gray-400 mt-1">Solo usuarios con login. Tomará las subpartidas que marques abajo.</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-semibold text-ds-ink">Subpartidas <span className="font-normal text-ds-gray-400">· marcá las que toma</span></label>
                  {libres.length > 0 && (
                    <button type="button" onClick={() => setAsignarSubs(allLibres ? [] : libres.map(s => s.idSubPartida))}
                      className="text-xs font-semibold text-ds-ink hover:text-ds-gray-400">
                      {allLibres ? 'Quitar todas' : 'Marcar libres'}
                    </button>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto rounded-ds-lg border border-ds-gray-200 divide-y divide-ds-gray-100 bg-ds-surface">
                  {subs.length === 0 ? (
                    <p className="px-3 py-5 text-sm text-ds-gray-400 text-center">Sin subpartidas</p>
                  ) : subs.map(s => {
                    const taken = encPorSub.get(s.idSubPartida);
                    if (taken) {
                      return (
                        <div key={s.idSubPartida} className="flex items-center gap-3 px-3 py-2.5 bg-ds-gray-100/60">
                          <span className="w-5 h-5 rounded-ds border-2 border-ds-gray-200 bg-ds-gray-100 shrink-0 flex items-center justify-center">
                            <Icon name="check" size="sm" color="currentColor" className="text-ds-gray-300" />
                          </span>
                          <span className="text-sm font-semibold text-ds-gray-400 shrink-0 w-14">{s.codigo}</span>
                          <span className="text-xs text-ds-gray-400 flex-1 min-w-0 break-words">{s.nombre}</span>
                          <ChipEncargado nombre={taken.encargado}
                            onRemove={isAdmin ? () => handleQuitarEncargado(taken.idEncargadoPartida) : undefined}
                            loading={quitandoId === taken.idEncargadoPartida} />
                        </div>
                      );
                    }
                    const on = sel.has(s.idSubPartida);
                    return (
                      <button key={s.idSubPartida} type="button" onClick={() => toggle(s.idSubPartida)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${on ? 'bg-brand/10' : 'hover:bg-ds-gray-100'}`}>
                        <span className={`w-5 h-5 rounded-ds border-2 flex items-center justify-center shrink-0 transition-colors ${on ? 'bg-brand border-brand' : 'border-ds-gray-300 bg-ds-surface'}`}>
                          {on && <Icon name="check" size="sm" color="currentColor" className="text-ds-ink" />}
                        </span>
                        <span className="text-sm font-semibold text-ds-ink shrink-0 w-14">{s.codigo}</span>
                        <span className="text-xs text-ds-gray-400 flex-1 min-w-0 break-words">{s.nombre}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-ds-gray-400 mt-1.5">Las subpartidas grises ya tienen encargado (bloqueadas). Quitá el actual para reasignar.</p>
              </div>
            </div>
          );
        })()}
      </Modal>
    </PageShell>
  );
}
