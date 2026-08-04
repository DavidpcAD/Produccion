'use client';
import { useState, useEffect, useMemo } from 'react';
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

interface ObraLite { idObra: number; numeroObra: string; nombreMostrado: string | null; idProyecto: number | null; }
interface SubLite { idSubPartida: number; codigo: string; nombre: string; idPartida: number; partidaCodigo: string | null; partidaNombre: string | null; idProyecto?: number | null; }
interface PartidaLite { idPartida: number; codigo: string; nombre: string; }
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

// ─── Selector de OBRAS: buscador + lista con checkboxes (multi) ───────────────
function ObrasPicker({ obras, selected, onChange }: {
  obras: ObraLite[]; selected: number[]; onChange: (ids: number[]) => void;
}) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const filtered = term
    ? obras.filter(o => o.numeroObra.toLowerCase().includes(term) || (o.nombreMostrado ?? '').toLowerCase().includes(term))
    : obras;
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
          <label className="text-sm font-bold text-ds-ink">Obras <span className="text-ds-red">*</span></label>
          <p className="text-xs text-ds-gray-400">Marcá en qué obras trabaja esta cuadrilla.</p>
        </div>
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
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar obra por número o nombre…"
        leftIcon={<Icon name="search" size="sm" color="currentColor" className="text-ds-gray-400" />} />
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
              <span className="text-xs text-ds-gray-400 truncate">{o.nombreMostrado ?? ''}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Selector de SUBPARTIDAS: filtro por partida + buscador + checkboxes ──────
function SubpartidasPicker({ partidas, subpartidas, selected, onChange, ocupadas }: {
  partidas: PartidaLite[]; subpartidas: SubLite[]; selected: number[]; onChange: (ids: number[]) => void;
  ocupadas?: Map<number, string>;   // idSubPartida -> nombre de la cuadrilla que ya la tiene (en este proyecto)
}) {
  const [q, setQ] = useState('');
  const [filtroPartida, setFiltroPartida] = useState('');
  const term = q.trim().toLowerCase();
  const filtered = subpartidas.filter(s => {
    if (filtroPartida && String(s.idPartida) !== filtroPartida) return false;
    if (term && !`${s.codigo} ${s.nombre}`.toLowerCase().includes(term)) return false;
    return true;
  });
  const sel = new Set(selected);
  const toggle = (id: number) => onChange(sel.has(id) ? selected.filter(x => x !== id) : [...selected, id]);
  const selSubs = subpartidas.filter(s => sel.has(s.idSubPartida));

  return (
    <div className="rounded-ds-lg border border-ds-gray-200 p-3.5 space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-ds bg-black flex items-center justify-center shrink-0">
          <Icon name="list" size="sm" color="currentColor" className="text-brand" />
        </div>
        <div className="flex-1 min-w-0">
          <label className="text-sm font-bold text-ds-ink">Subpartidas <span className="text-ds-red">*</span></label>
          <p className="text-xs text-ds-gray-400">Marcá las que ejecuta. Podés filtrar por partida.</p>
        </div>
        {selected.length > 0 && (
          <span className="text-[11px] font-bold rounded-full px-2 py-0.5 shrink-0 bg-brand text-black">
            {selected.length} sel.
          </span>
        )}
      </div>
      {selSubs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selSubs.map(s => (
            <span key={s.idSubPartida} className="inline-flex items-center gap-1 rounded-full bg-black text-white text-xs font-semibold pl-2.5 pr-1.5 py-1">
              {s.codigo}
              <button type="button" onClick={() => toggle(s.idSubPartida)} aria-label="Quitar" title="Quitar"
                className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-ds-surface/20 leading-none">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Combobox value={filtroPartida} onChange={setFiltroPartida} placeholder="Filtrar por partida"
          options={[{ value: '', label: 'Todas las partidas' }, ...partidas.map(p => ({
            value: String(p.idPartida), label: `${p.codigo} · ${p.nombre}`,
            parts: [{ text: p.codigo, weight: 'bold' as const }, { text: p.nombre, weight: 'light' as const }],
          }))]} />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar subpartida…"
          leftIcon={<Icon name="search" size="sm" color="currentColor" className="text-ds-gray-400" />} />
      </div>
      <div className="max-h-52 overflow-y-auto rounded-ds border border-ds-gray-200 divide-y divide-ds-gray-100 bg-ds-surface">
        {filtered.length === 0 ? (
          <p className="px-3 py-5 text-sm text-ds-gray-400 text-center">Sin subpartidas</p>
        ) : filtered.slice(0, 400).map(s => {
          const on = sel.has(s.idSubPartida);
          const ocupadaPor = !on ? ocupadas?.get(s.idSubPartida) : undefined;
          if (ocupadaPor) {
            return (
              <div key={s.idSubPartida} title={`Ya tomada por ${ocupadaPor} en este proyecto`}
                className="w-full flex items-center gap-3 px-3 py-2 bg-ds-gray-100/60 cursor-not-allowed">
                <span className="w-4 h-4 rounded border-2 border-ds-gray-200 bg-ds-gray-100 flex items-center justify-center shrink-0 text-ds-gray-300 text-[11px] leading-none">×</span>
                <span className="text-sm text-ds-gray-400 font-semibold shrink-0 w-16">{s.codigo}</span>
                <span className="text-xs text-ds-gray-400 truncate flex-1">{s.nombre}</span>
                <span className="text-[10px] font-semibold text-ds-gray-400 shrink-0 truncate max-w-[9rem] bg-ds-gray-200/60 rounded-full px-2 py-0.5">{ocupadaPor}</span>
              </div>
            );
          }
          return (
            <button key={s.idSubPartida} type="button" onClick={() => toggle(s.idSubPartida)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${on ? 'bg-brand/10' : 'hover:bg-ds-gray-100'}`}>
              <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${on ? 'bg-brand border-brand' : 'border-ds-gray-300 bg-ds-surface'}`}>
                {on && <Icon name="check" size="sm" color="currentColor" className="text-ds-ink" />}
              </span>
              <span className="text-sm text-ds-ink font-semibold shrink-0 w-16">{s.codigo}</span>
              <span className="text-xs text-ds-gray-400 truncate flex-1">{s.nombre}</span>
              {s.partidaCodigo && <span className="text-[10px] text-ds-gray-300 shrink-0">{s.partidaCodigo}</span>}
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
  const [proyectos, setProyectos] = useState<ProyectoLite[]>([]);
  // Subpartidas ya tomadas, POR proyecto (para bloquearlas en el form).
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

  // Crear / editar cuadrilla
  const [modalOpen, setModalOpen] = useState(false);
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
    ]).then(([c, o, u, pt, en, usu, pr]) => {
      setProyectos(((pr.data ?? []) as { IDProyecto: number; Nombre: string }[]).map(x => ({ idProyecto: x.IDProyecto, nombre: x.Nombre })));
      setCuadrillas(c.data ?? []);
      setObras((o.data ?? []).map((x: { idObra: number; numeroObra: string; nombreMostrado: string | null; idProyecto: number | null }) => ({ idObra: x.idObra, numeroObra: x.numeroObra, nombreMostrado: x.nombreMostrado, idProyecto: x.idProyecto ?? null })));
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
    setModalOpen(true);
  }
  function openEdit(c: CuadrillaDetalle) {
    setEditId(c.IDCuadrilla);
    // Reconstruir bloques por proyecto desde obras (obra.idProyecto) y subpartidas (cs.idProyecto).
    const obrasByProy: Record<number, number[]> = {};
    const subsByProy: Record<number, number[]> = {};
    for (const o of (c.obras ?? [])) if (o.idProyecto != null) (obrasByProy[o.idProyecto] ??= []).push(o.idObra);
    for (const s of (c.subpartidas ?? [])) if (s.idProyecto != null) (subsByProy[s.idProyecto] ??= []).push(s.idSubPartida);
    const proyectos = [...new Set([
      ...(c.proyectos ?? []).map(p => p.idProyecto),
      ...Object.keys(obrasByProy).map(Number),
      ...Object.keys(subsByProy).map(Number),
    ])].filter(Boolean);
    setForm({
      nombre: c.Nombre,
      idEncargado: String(c.IDEncargado),
      capacidad: String(c.Capacidad),
      proyectos,
      obrasByProy,
      subsByProy,
    });
    setVerCuad(null);
    setModalOpen(true);
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
      setModalOpen(false);
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

  async function openVerMiembros(c: Cuadrilla) {
    setSelectedCol('');
    setLoadingMiembros(true);
    setVerCuad({ ...c, IDEncargado: 0, obras: [], subpartidas: [], miembros: [], otrasMembresias: [] });
    try {
      await loadDetalle(c.IDCuadrilla);
    } catch { toast('No se pudieron cargar los miembros', 'error'); } finally {
      setLoadingMiembros(false);
    }
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
      c.Nombre.toLowerCase().includes(term) ||
      (c.Encargado ?? '').toLowerCase().includes(term) ||
      (c.Proyecto ?? '').toLowerCase().includes(term) ||
      (c.Obras ?? '').toLowerCase().includes(term) ||
      (c.Subpartidas ?? '').toLowerCase().includes(term),
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
      ].join(' ').toLowerCase();
      return hay.includes(term);
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
        subtitle={vista === 'cuadrillas' ? `${cuadrillas.length} cuadrillas activas` : `${partidasConEnc} de ${partidas.length} partida(s) con encargados`}
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
                      <h2 className="font-bold text-ds-ink text-sm flex-1 min-w-0 truncate">{row.p.codigo} · {row.p.nombre}</h2>
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
                            <span className="text-xs text-ds-gray-400 truncate flex-1">{x.sub.nombre}</span>
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
                onClick={() => openVerMiembros(c)}
                onKeyDown={e => { if (e.key === 'Enter') openVerMiembros(c); }}
                className="group bg-ds-surface rounded-ds border border-ds-gray-200 shadow-ds-01 p-4 flex flex-col cursor-pointer hover:border-black hover:shadow-ds-02 transition-all">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-ds bg-black flex items-center justify-center shrink-0">
                      <Icon name="cuadrillas" size="sm" color="currentColor" className="text-brand" />
                    </div>
                    <p className="font-bold text-ds-ink text-sm truncate">{c.Nombre}</p>
                  </div>
                  <Badge variant="green" dot>Activa</Badge>
                </div>
                <p className="text-xs font-semibold text-ds-ink mb-1 truncate" title={c.Proyecto || 'Sin proyecto'}>
                  <Icon name="folder" size="sm" color="currentColor" className="inline mr-1 text-ds-gray-300" />
                  {c.Proyecto || 'Sin proyecto'}
                </p>
                <p className="text-xs text-ds-gray-300 mb-1 truncate" title={c.Encargado || undefined}>Enc: {c.Encargado || '—'}</p>
                <p className="text-xs text-ds-gray-400 mb-3 truncate" title={c.Obras || 'Sin obras'}>
                  <Icon name="place" size="sm" color="currentColor" className="inline mr-1 text-ds-gray-300" />
                  {c.Obras || 'Sin obras'}
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
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="2xl" title={editId ? 'Editar cuadrilla' : 'Nueva cuadrilla'}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button loading={saving} onClick={handleSave}>{editId ? 'Guardar cambios' : 'Crear cuadrilla'}</Button>
          </>
        }
      >
        <div className="space-y-5">
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

          {form.proyectos.length === 0 ? (
            <div className="rounded-ds-lg border border-dashed border-ds-gray-200 p-8 text-center">
              <p className="text-sm text-ds-gray-400">Elegí uno o más <span className="font-semibold text-ds-ink">proyectos</span> para ver sus obras y subpartidas.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Pestañas: se trabaja UN proyecto a la vez (obras + subpartidas de ese proyecto). */}
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
                      </button>
                    );
                  })}
                </div>
              )}

              {activeProy != null && (() => {
                const pid = activeProy;
                const nom = proyectos.find(x => x.idProyecto === pid)?.nombre ?? 'Proyecto';
                return (
                  <div key={pid} className="rounded-ds-lg border border-ds-gray-200 p-4 space-y-3 bg-ds-gray-100/30">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-ds bg-black flex items-center justify-center shrink-0">
                        <Icon name="folder" size="sm" color="currentColor" className="text-brand" />
                      </div>
                      <h3 className="font-bold text-ds-ink text-sm">{nom}</h3>
                      <span className="text-xs text-ds-gray-400">· obras y subpartidas de este proyecto</span>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                      <ObrasPicker
                        obras={obras.filter(o => o.idProyecto === pid)}
                        selected={form.obrasByProy[pid] ?? []}
                        onChange={ids => setForm(p => ({ ...p, obrasByProy: { ...p.obrasByProy, [pid]: ids } }))} />
                      <SubpartidasPicker partidas={partidas} subpartidas={subpartidas}
                        selected={form.subsByProy[pid] ?? []}
                        ocupadas={ocupadasByProy[pid]}
                        onChange={ids => setForm(p => ({ ...p, subsByProy: { ...p.subsByProy, [pid]: ids } }))} />
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </Modal>

      {/* Ver miembros de la cuadrilla */}
      <Modal
        open={!!verCuad}
        onClose={() => setVerCuad(null)}
        size="xl"
        title={verCuad ? `Cuadrilla: ${verCuad.Nombre}` : ''}
        footer={<Button variant="outline" onClick={() => setVerCuad(null)}>Cerrar</Button>}
      >
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-2">
              {verCuad?.Proyecto && (
                <div>
                  <p className="text-xs font-semibold text-ds-gray-400 mb-1">Proyecto</p>
                  <Badge variant="green">{verCuad.Proyecto}</Badge>
                </div>
              )}
              {(verCuad?.obras?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-semibold text-ds-gray-400 mb-1">Obras</p>
                  <div className="flex flex-wrap gap-1.5">
                    {verCuad!.obras.map(o => <Badge key={o.idObra} variant="green">{o.numeroObra}</Badge>)}
                  </div>
                </div>
              )}
              {(verCuad?.subpartidas?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-semibold text-ds-gray-400 mb-1">Subpartidas</p>
                  <div className="flex flex-wrap gap-1.5">
                    {verCuad!.subpartidas.map(s => (
                      <Badge key={s.idSubPartida} variant="black">{s.codigo} · {s.nombre}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {isAdmin && verCuad && verCuad.IDEncargado > 0 && (
              <Button variant="outline" size="sm" onClick={() => openEdit(verCuad)}
                icon={<Icon name="edit" size="sm" color="currentColor" />} className="shrink-0">
                Editar cuadrilla
              </Button>
            )}
          </div>

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
                      <p className="text-sm font-semibold truncate">{encNombre}</p>
                      <p className="text-xs text-ds-gray-300 truncate">
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
                            <p className="text-sm font-semibold text-ds-ink truncate">{m.NombreCompleto}</p>
                            <p className="text-xs text-ds-gray-400 truncate">{m.Cedula} · {m.Puesto || 'Sin puesto'}</p>
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
                  <label className="text-sm font-bold text-ds-ink">Subpartidas <span className="font-normal text-ds-gray-400">· marcá las que toma</span></label>
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
                          <span className="text-xs text-ds-gray-400 truncate flex-1">{s.nombre}</span>
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
                        <span className="text-xs text-ds-gray-400 truncate flex-1">{s.nombre}</span>
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
