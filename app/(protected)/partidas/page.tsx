'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { useSession } from '@/hooks/useSession';
import { Icon } from '@/components/ds/Icon/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { CatalogoTabs } from '@/components/layout/CatalogoTabs';
import { coincideBusqueda } from '@/lib/utilidades/buscar';

const TIPOS_CASA = ['1N-Techo', '1N-Azotea', '2N-Techo', '2N-Azotea'] as const;

// El catálogo es un ÁRBOL de tres niveles por tipo de obra:
//   grupo (etapa/sistema/área/proceso/torre) → partida → subpartida
// Los dos primeros niveles existen también en Business Central (capítulo "Total" y
// partida "Posting" de la obra); las subpartidas son solo de esta base.
interface TipoObra {
  codigo: string; letra: string; nombre: string;
  terminoGrupo: string; terminoGrupoPlural: string;
  usaSprints: boolean; usaTiposCasa: boolean; genero: 'F' | 'M';
  /** true = un solo catálogo para todas las obras del tipo (vivienda / infra). */
  catalogoCompartido: boolean;
  grupos?: number; partidas?: number; subpartidas?: number; obras?: number;
  obrasBC?: { numeroObra: string; nombre: string }[];
}
interface Etapa {
  idEtapa: number; codigo: string; nombre: string;
  bcTaskNo: string | null; bcWorksNo: string | null;
}
interface Partida {
  idPartida: number; codigo: string; nombre: string; idEtapa: number | null;
  activo?: boolean; bcTaskNo: string | null;
}
interface SubPartida {
  idSubPartida: number; codigo: string; nombre: string; idPartida: number;
  // Sprint y tipos de casa son del mundo vivienda (es lo que consume Avance); en
  // los demás tipos vienen null/vacío.
  numSprint: number | null; esCritica: boolean; descripcion: string | null;
  activo: boolean; tiposCasa: string[];
}

const EMPTY_SUB = { idEtapa: '', idPartida: '', codigo: '', nombre: '', numSprint: '1', esCritica: false, descripcion: '', activo: true, tiposCasa: [] as string[] };
const EMPTY_PART = { idEtapa: '', codigo: '', nombre: '' };
const EMPTY_ETAPA = { codigo: '', nombre: '', bcWorksNo: '', bcTaskNo: '' };

const SIN_OBRA = '—compartido—';
const porCodigo = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const plural = (n: number, sing: string, plu: string) => `${n} ${n === 1 ? sing : plu}`;

export default function PartidasPage() {
  const session = useSession();
  const { toast } = useToast();
  const confirm = useConfirm();
  const isSuperAdmin = !!session && session.nivelAdmin >= 4;
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [tipos, setTipos] = useState<TipoObra[]>([]);
  const [tipoCodigo, setTipoCodigo] = useState('VIVIENDA');
  const [tipo, setTipo] = useState<TipoObra | null>(null);
  const [obraFiltro, setObraFiltro] = useState('');
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [subpartidas, setSubpartidas] = useState<SubPartida[]>([]);
  // Catálogo de sprints (numero_global) para validar el N° de sprint de una
  // subpartida — no debe permitirse un sprint que no existe en el catálogo.
  const [sprintsCat, setSprintsCat] = useState<{ numero_global: number; codigo: string; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');

  // Estado del árbol. Los grupos arrancan ABIERTOS (se guarda lo cerrado) y las
  // partidas CERRADAS (se guarda lo abierto): abrir una partida es justamente el
  // gesto de "ver sus subpartidas".
  const [gruposCerrados, setGruposCerrados] = useState<Set<number>>(new Set());
  const [partidasAbiertas, setPartidasAbiertas] = useState<Set<number>>(new Set());
  const [obrasAbiertas, setObrasAbiertas] = useState<Set<string>>(new Set());

  const puede = mounted && isSuperAdmin;
  const termGrupo = tipo?.terminoGrupo ?? 'Etapa';
  const termGrupoLow = termGrupo.toLowerCase();
  const termGrupoPlural = (tipo?.terminoGrupoPlural ?? 'Etapas').toLowerCase();
  // Concordancia del rótulo del nivel 1: "Nueva etapa" / "Nuevo proceso",
  // "esta área" / "este sistema" (pro_obc.tipos_obra.genero).
  const fem = (tipo?.genero ?? 'F') === 'F';
  const nuevoGrupo = `${fem ? 'Nueva' : 'Nuevo'} ${termGrupoLow}`;
  const elGrupo = `${fem ? 'la' : 'el'} ${termGrupoLow}`;
  const unGrupo = `${fem ? 'una' : 'un'} ${termGrupoLow}`;
  const esteGrupo = `${fem ? 'esta' : 'este'} ${termGrupoLow}`;
  const usaSprints = !!tipo?.usaSprints;
  const usaTiposCasa = !!tipo?.usaTiposCasa;
  const porObra = !!tipo && !tipo.catalogoCompartido;

  // Modal subpartida (crear/editar)
  const [subOpen, setSubOpen] = useState(false);
  const [subEditId, setSubEditId] = useState<number | null>(null);
  const [subForm, setSubForm] = useState({ ...EMPTY_SUB });
  const setSub = (k: keyof typeof subForm, v: string | boolean | string[]) => setSubForm(p => ({ ...p, [k]: v }));
  const toggleTipo = (tc: string) => setSubForm(p => ({ ...p, tiposCasa: p.tiposCasa.includes(tc) ? p.tiposCasa.filter(x => x !== tc) : [...p.tiposCasa, tc] }));

  // Modal partida (crear/editar)
  const [partOpen, setPartOpen] = useState(false);
  const [partEditId, setPartEditId] = useState<number | null>(null);
  const [partForm, setPartForm] = useState({ ...EMPTY_PART });
  const setPart = (k: keyof typeof partForm, v: string) => setPartForm(p => ({ ...p, [k]: v }));

  // Modal grupo (crear) — nivel 1 del árbol
  const [etapaOpen, setEtapaOpen] = useState(false);
  const [etapaForm, setEtapaForm] = useState({ ...EMPTY_ETAPA });
  const setEt = (k: keyof typeof etapaForm, v: string) => setEtapaForm(p => ({ ...p, [k]: v }));

  // Modal "Traer de BC"
  const [bcOpen, setBcOpen] = useState(false);
  const [bcObra, setBcObra] = useState('');
  const [bcSync, setBcSync] = useState<false | 'ver' | 'traer'>(false);
  const [bcPreview, setBcPreview] = useState<null | {
    obrasProcesadas: number; gruposCreados: number; partidasCreadas: number;
    gruposActualizados: number; partidasActualizadas: number;
    detalle: { obra: string; fuente: string; compania?: string | null; version?: string | null; gruposCreados: string[]; partidasCreadas: string[] }[];
  }>(null);

  function cambiarTipo(t: string) {
    if (t === tipoCodigo) return;
    setQ('');
    setObraFiltro('');
    setGruposCerrados(new Set());
    setPartidasAbiertas(new Set());
    setObrasAbiertas(new Set());
    setTipoCodigo(t);
  }

  const cargarTipos = useCallback(async () => {
    const d = await fetch('/api/tipos-obra?conObras=1').then(r => (r.ok ? r.json() : null)).catch(() => null);
    if (d?.tipos) setTipos(d.tipos);
  }, []);
  useEffect(() => { cargarTipos(); }, [cargarTipos]);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ tipo: tipoCodigo });
    if (obraFiltro) qs.set('obra', obraFiltro);
    const d = await fetch(`/api/partidas?${qs}`).then(r => (r.ok ? r.json() : null)).catch(() => null);
    if (d) {
      setTipo(d.tipo ?? null);
      setEtapas(d.etapas ?? []);
      setPartidas(d.partidas ?? []);
      setSubpartidas(d.subpartidas ?? []);
    }
    setLoading(false);
  }, [tipoCodigo, obraFiltro]);
  useEffect(() => { load(); }, [load]);

  // Catálogo de sprints (para validar/elegir el N° de sprint de una subpartida).
  useEffect(() => {
    fetch('/api/avance/sprints')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setSprintsCat(d?.sprints ?? []))
      .catch(() => {});
  }, []);

  const sprintsValidos = useMemo(() => new Set(sprintsCat.map(s => s.numero_global)), [sprintsCat]);
  const tipoActual = useMemo(() => tipos.find(t => t.codigo === tipoCodigo) ?? null, [tipos, tipoCodigo]);
  const obrasDelTipo = useMemo(() => tipoActual?.obrasBC ?? [], [tipoActual]);

  const partidasDeEtapa = useMemo(
    () => (subForm.idEtapa ? partidas.filter(p => String(p.idEtapa) === subForm.idEtapa) : []),
    [partidas, subForm.idEtapa],
  );

  // ---- Árbol ----
  const subsByPartida = useMemo(() => {
    const m = new Map<number, SubPartida[]>();
    for (const s of subpartidas) { if (!m.has(s.idPartida)) m.set(s.idPartida, []); m.get(s.idPartida)!.push(s); }
    for (const arr of m.values()) arr.sort((a, b) => porCodigo(a.codigo, b.codigo));
    return m;
  }, [subpartidas]);

  const term = q.trim();
  const buscando = term.length > 0;

  // Árbol filtrado: obra → grupos → partidas → subpartidas. Si el grupo o la
  // partida coinciden con la búsqueda se muestran completos; si no, solo lo que
  // coincida más abajo (y esas ramas quedan abiertas).
  const arbol = useMemo(() => {
    const match = (...vals: (string | null | undefined)[]) =>
      !buscando || coincideBusqueda(vals.map(v => v ?? '').join(' '), term.toLowerCase());

    const porEtapa = new Map<number, Partida[]>();
    for (const p of partidas) {
      if (p.idEtapa == null) continue;
      if (!porEtapa.has(p.idEtapa)) porEtapa.set(p.idEtapa, []);
      porEtapa.get(p.idEtapa)!.push(p);
    }

    const grupos = etapas.map(e => {
      const grupoMatch = match(e.codigo, e.nombre, e.bcTaskNo, e.bcWorksNo);
      const parts = (porEtapa.get(e.idEtapa) ?? [])
        .sort((a, b) => porCodigo(a.codigo, b.codigo))
        .map(p => {
          const subs = subsByPartida.get(p.idPartida) ?? [];
          const partidaMatch = grupoMatch || match(p.codigo, p.nombre, p.bcTaskNo);
          const subsVisibles = partidaMatch ? subs : subs.filter(s => match(s.codigo, s.nombre));
          return { partida: p, subs, subsVisibles, visible: partidaMatch || subsVisibles.length > 0, forzarAbierta: buscando && !partidaMatch && subsVisibles.length > 0 };
        })
        .filter(p => p.visible);
      const totalSubs = (porEtapa.get(e.idEtapa) ?? []).reduce((n, p) => n + (subsByPartida.get(p.idPartida)?.length ?? 0), 0);
      return {
        etapa: e,
        partidas: parts,
        totalPartidas: (porEtapa.get(e.idEtapa) ?? []).length,
        totalSubs,
        visible: grupoMatch || parts.length > 0,
      };
    }).filter(g => g.visible);

    // Agrupado por obra de BC cuando el catálogo es por obra (admin / fábrica).
    const secciones = new Map<string, typeof grupos>();
    for (const g of grupos) {
      const k = g.etapa.bcWorksNo ?? SIN_OBRA;
      if (!secciones.has(k)) secciones.set(k, []);
      secciones.get(k)!.push(g);
    }
    return [...secciones.entries()]
      .sort((a, b) => (a[0] === SIN_OBRA ? -1 : b[0] === SIN_OBRA ? 1 : porCodigo(a[0], b[0])))
      .map(([obra, grupos]) => ({
        obra: obra === SIN_OBRA ? null : obra,
        grupos,
        totalPartidas: grupos.reduce((n, g) => n + g.totalPartidas, 0),
        totalSubs: grupos.reduce((n, g) => n + g.totalSubs, 0),
      }));
  }, [etapas, partidas, subsByPartida, buscando, term]);

  // Con una sola obra (o buscando) no tiene sentido tenerla cerrada.
  const obraAbierta = (obra: string | null) =>
    obra === null || buscando || arbol.length === 1 || obrasAbiertas.has(obra);
  const grupoAbierto = (id: number) => buscando || !gruposCerrados.has(id);
  const partidaAbierta = (id: number, forzar: boolean) => forzar || partidasAbiertas.has(id);

  const toggleSet = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v); else n.add(v);
    return n;
  };
  function expandirTodo() {
    setGruposCerrados(new Set());
    setPartidasAbiertas(new Set(partidas.map(p => p.idPartida)));
    setObrasAbiertas(new Set(etapas.map(e => e.bcWorksNo).filter((o): o is string => !!o)));
  }
  function colapsarTodo() {
    setGruposCerrados(new Set(etapas.map(e => e.idEtapa)));
    setPartidasAbiertas(new Set());
    setObrasAbiertas(new Set());
  }

  // ---- Subpartida ----
  function abrirNuevaSub(idPartida?: number) {
    const p = idPartida ? partidas.find(x => x.idPartida === idPartida) : undefined;
    // Código sugerido = código de la partida + el siguiente correlativo según la última
    // subpartida existente (ej. 1.1 con hasta 1.1.5 → sugiere 1.1.6). Queda editable.
    let codigo = '';
    if (p) {
      const nums = (subsByPartida.get(p.idPartida) ?? [])
        .map(s => { const m = s.codigo.match(/\.(\d+)\s*$/); return m ? parseInt(m[1], 10) : NaN; })
        .filter(n => !Number.isNaN(n));
      codigo = `${p.codigo}.${(nums.length ? Math.max(...nums) : 0) + 1}`;
    }
    setSubEditId(null);
    setSubForm({ ...EMPTY_SUB, idEtapa: p?.idEtapa != null ? String(p.idEtapa) : '', idPartida: idPartida ? String(idPartida) : '', codigo });
    setSubOpen(true);
  }
  function abrirEditarSub(s: SubPartida) {
    const p = partidas.find(x => x.idPartida === s.idPartida);
    setSubEditId(s.idSubPartida);
    setSubForm({
      idEtapa: p?.idEtapa != null ? String(p.idEtapa) : '', idPartida: String(s.idPartida),
      codigo: s.codigo, nombre: s.nombre, numSprint: s.numSprint != null ? String(s.numSprint) : '',
      esCritica: s.esCritica, descripcion: s.descripcion ?? '',
      activo: s.activo ?? true, tiposCasa: s.tiposCasa ?? [],
    });
    setSubOpen(true);
  }
  async function guardarSub() {
    if (!subForm.idPartida) { toast('Elegí la partida', 'warning'); return; }
    if (!subForm.codigo.trim()) { toast('El código es requerido', 'warning'); return; }
    if (!subForm.nombre.trim()) { toast('El nombre es requerido', 'warning'); return; }
    if (usaTiposCasa && subForm.tiposCasa.length === 0) { toast('Elegí al menos un tipo de casa', 'warning'); return; }
    if (usaSprints) {
      // El sprint debe existir en el catálogo (si el catálogo pudo cargarse).
      const nSprint = Number(subForm.numSprint) || 0;
      if (sprintsValidos.size > 0 && !sprintsValidos.has(nSprint)) {
        toast(`El sprint ${nSprint} no existe en el catálogo. Elegí un sprint válido.`, 'error');
        return;
      }
    }
    setSaving(true);
    try {
      const editing = subEditId != null;
      const res = await fetch(editing ? `/api/subpartidas/${subEditId}` : '/api/subpartidas', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idPartida: Number(subForm.idPartida),
          codigo: subForm.codigo.trim(), nombre: subForm.nombre.trim(),
          numSprint: usaSprints ? Number(subForm.numSprint) || 1 : null,
          esCritica: subForm.esCritica,
          descripcion: subForm.descripcion.trim() || null,
          tiposCasa: usaTiposCasa ? subForm.tiposCasa : [], activo: subForm.activo,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || 'No se pudo guardar la subpartida', 'error'); return; }
      toast(editing ? 'Subpartida actualizada' : 'Subpartida creada', 'success');
      setSubOpen(false);
      setPartidasAbiertas(s => new Set(s).add(Number(subForm.idPartida)));
      await Promise.all([load(), cargarTipos()]);
    } finally { setSaving(false); }
  }
  async function borrarSub(s: SubPartida) {
    const ok = await confirm({ title: 'Eliminar subpartida', message: `¿Eliminar la subpartida "${s.codigo} — ${s.nombre}"?`, confirmLabel: 'Eliminar', danger: true });
    if (!ok) return;
    const res = await fetch(`/api/subpartidas/${s.idSubPartida}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || 'No se pudo eliminar', 'error'); return; }
    toast('Subpartida eliminada', 'success');
    setSubOpen(false);
    await Promise.all([load(), cargarTipos()]);
  }

  // ---- Partida ----
  function abrirNuevaPart(idEtapa?: number) {
    setPartEditId(null);
    setPartForm({ ...EMPTY_PART, idEtapa: idEtapa != null ? String(idEtapa) : '' });
    setPartOpen(true);
  }
  function abrirEditarPart(p: Partida) {
    setPartEditId(p.idPartida);
    setPartForm({ idEtapa: p.idEtapa != null ? String(p.idEtapa) : '', codigo: p.codigo, nombre: p.nombre });
    setPartOpen(true);
  }
  async function guardarPart() {
    if (!partForm.idEtapa) { toast(`Elegí ${elGrupo}`, 'warning'); return; }
    if (!partForm.codigo.trim()) { toast('El código es requerido', 'warning'); return; }
    if (!partForm.nombre.trim()) { toast('El nombre es requerido', 'warning'); return; }
    setSaving(true);
    try {
      const editing = partEditId != null;
      const res = await fetch(editing ? `/api/partidas/${partEditId}` : '/api/partidas', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idEtapa: Number(partForm.idEtapa), codigo: partForm.codigo.trim(), nombre: partForm.nombre.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || 'No se pudo guardar la partida', 'error'); return; }
      toast(editing ? 'Partida actualizada' : 'Partida creada', 'success');
      setPartOpen(false);
      // Al crear, dejar la rama abierta para agregarle subpartidas ahí mismo.
      setGruposCerrados(s => { const n = new Set(s); n.delete(Number(partForm.idEtapa)); return n; });
      if (!editing && data?.idPartida) setPartidasAbiertas(s => new Set(s).add(Number(data.idPartida)));
      await Promise.all([load(), cargarTipos()]);
    } finally { setSaving(false); }
  }
  async function borrarPart(p: Partida) {
    const ok = await confirm({ title: 'Eliminar partida', message: `¿Eliminar la partida "${p.codigo} — ${p.nombre}"? (debe estar sin subpartidas)`, confirmLabel: 'Eliminar', danger: true });
    if (!ok) return;
    const res = await fetch(`/api/partidas/${p.idPartida}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast(data.error || 'No se pudo eliminar', 'error'); return; }
    toast('Partida eliminada', 'success');
    setPartOpen(false);
    await Promise.all([load(), cargarTipos()]);
  }

  // ---- Grupo (etapa / sistema / área / proceso / torre) ----
  function abrirNuevaEtapa() {
    setEtapaForm({ ...EMPTY_ETAPA, bcWorksNo: porObra ? obraFiltro : '' });
    setEtapaOpen(true);
  }
  async function guardarEtapa() {
    if (!etapaForm.codigo.trim()) { toast('El código es requerido', 'warning'); return; }
    if (!etapaForm.nombre.trim()) { toast('El nombre es requerido', 'warning'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/etapas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: etapaForm.codigo.trim(), nombre: etapaForm.nombre.trim(), tipoObra: tipoCodigo,
          bcWorksNo: porObra ? etapaForm.bcWorksNo.trim() : '',
          bcTaskNo: etapaForm.bcTaskNo.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data.error || `No se pudo crear ${elGrupo}`, 'error'); return; }
      toast(`${termGrupo} ${fem ? 'creada' : 'creado'}`, 'success');
      setEtapaOpen(false);
      if (porObra && etapaForm.bcWorksNo.trim()) setObrasAbiertas(s => new Set(s).add(etapaForm.bcWorksNo.trim()));
      await Promise.all([load(), cargarTipos()]);
    } finally { setSaving(false); }
  }

  // ---- Traer de BC ----
  function abrirBC() {
    setBcObra(porObra ? obraFiltro : '');
    setBcPreview(null);
    setBcOpen(true);
  }
  // dryRun: mira BC y dice qué crearía, sin escribir. En vivienda e infra importa
  // de más, porque el catálogo es uno para todas las obras.
  async function verQueTraeriaDeBC() {
    setBcSync('ver');
    try {
      const res = await fetch('/api/partidas/sync-bc', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: tipoCodigo, obra: bcObra || undefined, dryRun: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast(d.error || 'No se pudo leer BC', 'error'); return; }
      setBcPreview(d);
      for (const a of (d.avisos ?? []) as string[]) toast(a, 'warning');
    } finally { setBcSync(false); }
  }
  async function traerDeBC() {
    setBcSync('traer');
    try {
      const res = await fetch('/api/partidas/sync-bc', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: tipoCodigo, obra: bcObra || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast(d.error || 'No se pudo traer de BC', 'error'); return; }
      const nuevo = (d.gruposCreados ?? 0) + (d.partidasCreadas ?? 0);
      toast(
        nuevo === 0
          ? `Sin cambios: BC no tiene nada que no esté ya en el catálogo (${plural(d.obrasProcesadas ?? 0, 'obra revisada', 'obras revisadas')}).`
          : `De BC: ${plural(d.gruposCreados, termGrupoLow, termGrupoPlural)} y ${plural(d.partidasCreadas, 'partida', 'partidas')} nuevas en ${plural(d.obrasProcesadas ?? 0, 'obra', 'obras')}.`,
        nuevo === 0 ? 'info' : 'success',
      );
      for (const a of (d.avisos ?? []) as string[]) toast(a, 'warning');
      setBcOpen(false);
      setBcPreview(null);
      await Promise.all([load(), cargarTipos()]);
    } finally { setBcSync(false); }
  }

  if (mounted && session && !isSuperAdmin) {
    return (
      <PageShell>
        <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-14 text-center text-ds-gray-400">
          No tenés acceso a esta sección.
        </div>
      </PageShell>
    );
  }

  const totalSubs = subpartidas.length;
  const subtitulo = [
    `${plural(partidas.length, 'partida', 'partidas')} en ${plural(etapas.length, termGrupoLow, termGrupoPlural)}`,
    plural(totalSubs, 'subpartida', 'subpartidas'),
    tipo?.nombre.toLowerCase(),
    porObra && obraFiltro ? `obra ${obraFiltro}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <PageShell>
      <PageHeader
        title="Partidas y subpartidas"
        subtitle={subtitulo}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {puede && (
              <Button variant="outline" onClick={abrirBC} icon={<Icon name="traslado" size="sm" color="currentColor" />}>
                Traer de BC
              </Button>
            )}
            {puede && (
              <Button variant="outline" onClick={abrirNuevaEtapa} icon={<Icon name="plus" size="sm" color="currentColor" />}>{nuevoGrupo}</Button>
            )}
            {puede && (
              <Button variant="outline" onClick={() => abrirNuevaPart()} icon={<Icon name="plus" size="sm" color="currentColor" />}>Nueva partida</Button>
            )}
          </div>
        }
      />

      <CatalogoTabs />

      {/* Tipos de obra: O · I · A · F · T (pro_obc.tipos_obra) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap rounded-ds border border-ds-gray-200 p-0.5 bg-ds-surface">
          {(tipos.length > 0 ? tipos : [{ codigo: 'VIVIENDA', letra: 'O', nombre: 'Obra Vivienda' } as TipoObra]).map(t => (
            <button key={t.codigo} onClick={() => cambiarTipo(t.codigo)}
              title={`${t.letra} = ${t.nombre}${t.grupos != null ? ` · ${plural(t.grupos, t.terminoGrupo?.toLowerCase() ?? 'grupo', t.terminoGrupoPlural?.toLowerCase() ?? 'grupos')}, ${plural(t.partidas ?? 0, 'partida', 'partidas')}, ${plural(t.subpartidas ?? 0, 'subpartida', 'subpartidas')}` : ''}`}
              className={'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-ds text-sm font-semibold transition ' + (tipoCodigo === t.codigo ? 'bg-black text-white' : 'text-ds-gray-500 hover:text-ds-ink')}>
              <span className={'inline-flex items-center justify-center h-4 w-4 rounded text-[10px] font-bold font-mono ' + (tipoCodigo === t.codigo ? 'bg-white/20 text-white' : 'bg-ds-gray-100 text-ds-gray-500')}>{t.letra}</span>
              {t.nombre}
              {t.partidas != null && <span className={'text-xs font-normal ' + (tipoCodigo === t.codigo ? 'text-white/70' : 'text-ds-gray-400')}>{t.partidas}</span>}
            </button>
          ))}
        </div>
      </div>

      <p className="text-body-sm text-ds-gray-400">
        {porObra
          ? <>Las <span className="font-semibold text-ds-gray-500">{termGrupoPlural}</span> y <span className="font-semibold text-ds-gray-500">partidas</span> vienen de Business Central y cada obra tiene su propia estructura. Las <span className="font-semibold text-ds-gray-500">subpartidas</span> existen solo acá.</>
          : <>Las <span className="font-semibold text-ds-gray-500">{termGrupoPlural}</span> y <span className="font-semibold text-ds-gray-500">partidas</span> son las de Business Central (capítulo y partida de la obra), compartidas por todas las obras del tipo. Las <span className="font-semibold text-ds-gray-500">subpartidas</span> existen solo acá.</>}
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <Input placeholder="Buscar etapa, partida o subpartida…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        {porObra && (
          <div className="min-w-[240px]">
            <Combobox
              value={obraFiltro}
              onChange={v => { setObraFiltro(v); setObrasAbiertas(new Set()); }}
              placeholder="Todas las obras"
              options={[
                { value: '', label: 'Todas las obras' },
                ...obrasDelTipo.map(o => ({
                  value: o.numeroObra,
                  label: o.nombre ? `${o.numeroObra} — ${o.nombre}` : o.numeroObra,
                  parts: [{ text: o.numeroObra, weight: 'bold' as const }, { text: o.nombre, weight: 'light' as const }],
                  search: `${o.numeroObra} ${o.nombre}`,
                })),
              ]}
            />
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={expandirTodo}>Expandir todo</Button>
          <Button size="sm" variant="ghost" onClick={colapsarTodo}>Colapsar todo</Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : etapas.length === 0 ? (
        <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-10 text-center">
          <p className="text-ds-gray-400">
            El catálogo de <span className="font-semibold text-ds-ink">{tipo?.nombre.toLowerCase() ?? tipoCodigo.toLowerCase()}</span> está vacío.
          </p>
          {puede && (
            <p className="text-body-sm text-ds-gray-400 mt-2">
              Creá {elGrupo} con “{nuevoGrupo}”, o traé la estructura que ya está en Business Central con “Traer de BC”.
            </p>
          )}
        </div>
      ) : arbol.length === 0 ? (
        <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-10 text-center text-ds-gray-400 text-sm">
          Ningún resultado para “{q}”.
        </div>
      ) : (
        // Con catálogo por obra (admin / fábrica) cada obra es su propia tarjeta;
        // con catálogo compartido (vivienda / infra) es una sola.
        <div className={porObra ? 'space-y-3' : ''}>
          {arbol.map(sec => (
            <div key={sec.obra ?? SIN_OBRA} className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 overflow-hidden">
              {/* Nivel 0 (solo admin/fábrica): la obra de BC dueña de la estructura */}
              {sec.obra && (
                <button
                  onClick={() => setObrasAbiertas(s => toggleSet(s, sec.obra!))}
                  title={obraAbierta(sec.obra) ? 'Colapsar la obra' : `Ver la estructura de ${sec.obra}`}
                  className={
                    'w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors ' +
                    // Abierta: sin borde propio — el primer grupo ya trae su border-y.
                    (obraAbierta(sec.obra) ? '' : 'hover:bg-ds-gray-100/70')
                  }
                >
                  <span className={'text-ds-gray-400 transition-transform shrink-0 ' + (obraAbierta(sec.obra) ? 'rotate-90' : '')}>
                    <Icon name="chevron-right" size="sm" color="currentColor" />
                  </span>
                  <span className="font-mono text-xs font-bold text-ds-ink bg-ds-gray-100 border border-ds-gray-200 rounded-ds px-2 py-0.5 shrink-0">
                    {sec.obra}
                  </span>
                  <span className="text-sm font-semibold text-ds-ink truncate flex-1 min-w-0">
                    {obrasDelTipo.find(o => o.numeroObra === sec.obra)?.nombre ?? ''}
                  </span>
                  <span className="text-[11px] text-ds-gray-400 shrink-0 hidden sm:block whitespace-nowrap">
                    {plural(sec.grupos.length, termGrupoLow, termGrupoPlural)} · {plural(sec.totalPartidas, 'partida', 'partidas')}
                    {sec.totalSubs > 0 ? ` · ${plural(sec.totalSubs, 'subpartida', 'subpartidas')}` : ''}
                  </span>
                  <span className="text-[11px] text-ds-gray-400 shrink-0 sm:hidden">{sec.totalPartidas}</span>
                </button>
              )}

              {obraAbierta(sec.obra) && sec.grupos.map(({ etapa, partidas: parts, totalPartidas, totalSubs: subsGrupo }) => {
                const abierto = grupoAbierto(etapa.idEtapa);
                return (
                  <div key={etapa.idEtapa}>
                    {/* Nivel 1 — grupo (etapa / sistema / área / proceso / torre) */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-ds-gray-100 border-y border-ds-gray-200">
                      <button
                        onClick={() => setGruposCerrados(s => toggleSet(s, etapa.idEtapa))}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                        title={abierto ? 'Colapsar' : `Ver las partidas de ${etapa.nombre}`}
                      >
                        <span className={'transition-transform shrink-0 ' + (abierto ? 'rotate-90' : '')}>
                          <Icon name="chevron-right" size="sm" color="currentColor" />
                        </span>
                        <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-ds bg-black text-white text-[11px] font-bold font-mono shrink-0">{etapa.codigo}</span>
                        <span className="font-bold text-ds-ink text-xs uppercase tracking-wide truncate">{etapa.nombre}</span>
                        {etapa.bcTaskNo && (
                          <span className="rounded bg-ds-surface border border-ds-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-ds-gray-400 shrink-0" title={`Capítulo ${etapa.bcTaskNo} de la obra en Business Central`}>
                            BC {etapa.bcTaskNo}
                          </span>
                        )}
                      </button>
                      <span className="text-[11px] text-ds-gray-400 shrink-0 whitespace-nowrap">
                        {plural(totalPartidas, 'partida', 'partidas')}
                        {subsGrupo > 0 ? ` · ${plural(subsGrupo, 'subpartida', 'subpartidas')}` : ''}
                      </span>
                      {puede && (
                        <button onClick={() => abrirNuevaPart(etapa.idEtapa)} className="text-ds-gray-400 hover:text-brand shrink-0" title={`Nueva partida en ${etapa.nombre}`}>
                          <Icon name="plus" size="sm" color="currentColor" />
                        </button>
                      )}
                    </div>

                    {abierto && parts.length === 0 && (
                      <div className="px-10 py-3 text-body-sm text-ds-gray-300">
                        Sin partidas.{puede ? ' Agregá la primera con el “+”.' : ''}
                      </div>
                    )}

                    {abierto && parts.map(({ partida, subs, subsVisibles, forzarAbierta }) => {
                      const subAbierta = partidaAbierta(partida.idPartida, forzarAbierta);
                      return (
                        <div key={partida.idPartida} className="border-b border-ds-gray-100 last:border-b-0">
                          {/* Nivel 2 — partida (existe en BC) */}
                          <div className="flex items-center gap-2 pl-8 pr-3 py-2.5 hover:bg-ds-gray-100/60 transition-colors">
                            <button
                              onClick={() => setPartidasAbiertas(s => toggleSet(s, partida.idPartida))}
                              className="flex items-center gap-2 flex-1 min-w-0 text-left"
                              title={subAbierta ? 'Colapsar subpartidas' : 'Ver subpartidas'}
                            >
                              <span className={'transition-transform shrink-0 ' + (subAbierta ? 'rotate-90' : '') + (subs.length === 0 ? ' opacity-30' : '')}>
                                <Icon name="chevron-right" size="sm" color="currentColor" />
                              </span>
                              <span className="font-mono text-xs font-semibold text-ds-gray-500 shrink-0">{partida.codigo}</span>
                              <span className="text-sm text-ds-ink truncate">{partida.nombre}</span>
                            </button>
                            <span className="text-xs text-ds-gray-400 shrink-0">{subs.length}</span>
                            {puede && (
                              <>
                                <button onClick={() => abrirEditarPart(partida)} className="text-ds-gray-400 hover:text-ds-ink shrink-0" title="Editar partida">
                                  <Icon name="edit" size="sm" color="currentColor" />
                                </button>
                                <button onClick={() => abrirNuevaSub(partida.idPartida)} className="text-ds-gray-400 hover:text-brand shrink-0" title="Agregar subpartida">
                                  <Icon name="plus" size="sm" color="currentColor" />
                                </button>
                              </>
                            )}
                          </div>

                          {/* Nivel 3 — subpartidas (solo en esta base, no en BC) */}
                          {subAbierta && (
                            subsVisibles.length === 0 ? (
                              <div className="pl-16 pr-3 py-2.5 text-body-sm text-ds-gray-300 bg-ds-gray-100/40">
                                Esta partida no tiene subpartidas.{puede ? ' Agregá la primera con el “+”.' : ''}
                              </div>
                            ) : (
                              <ul className="bg-ds-gray-100/40">
                                {subsVisibles.map(s => (
                                  <li
                                    key={s.idSubPartida}
                                    onClick={puede ? () => abrirEditarSub(s) : undefined}
                                    title={puede ? 'Editar subpartida' : undefined}
                                    className={'pl-16 pr-3 py-2.5 flex items-start gap-3 border-t border-ds-gray-100 ' + (puede ? 'cursor-pointer hover:bg-ds-gray-100 transition-colors' : '')}
                                  >
                                    <span className="font-mono text-xs font-semibold text-ds-gray-500 shrink-0 pt-0.5">{s.codigo}</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className={'text-sm truncate ' + (s.activo ? 'text-ds-ink' : 'text-ds-gray-400 line-through')}>{s.nombre}</span>
                                        {s.esCritica && <Badge variant="red">Crítica</Badge>}
                                        {!s.activo && <Badge variant="gray">Inactiva</Badge>}
                                      </div>
                                      {usaTiposCasa && (
                                        <div className="mt-1 flex flex-wrap items-center gap-1">
                                          {s.tiposCasa.length > 0
                                            ? s.tiposCasa.map(tc => (
                                                <span key={tc} className="rounded bg-ds-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-ds-gray-500">{tc}</span>
                                              ))
                                            : <span className="text-[10px] font-semibold text-ds-red">Sin tipos de casa — clic para asignar</span>}
                                        </div>
                                      )}
                                    </div>
                                    {s.numSprint != null && (
                                      <span className="rounded-full bg-ds-gray-100 px-2 py-0.5 text-[11px] font-semibold text-ds-gray-500 shrink-0 whitespace-nowrap" title={`Sprint ${s.numSprint}`}>
                                        Sprint {s.numSprint}
                                      </span>
                                    )}
                                    {puede && (
                                      <span className="text-ds-gray-400 p-1 shrink-0" aria-hidden>
                                        <Icon name="edit" size="sm" color="currentColor" />
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Modal: partida (crear/editar) */}
      <Modal
        open={partOpen}
        onClose={() => setPartOpen(false)}
        title={partEditId != null ? 'Editar partida' : 'Nueva partida'}
        footer={
          <div className="flex items-center gap-2 w-full">
            {partEditId != null && (
              <Button variant="outline" onClick={() => { const p = partidas.find(x => x.idPartida === partEditId); if (p) borrarPart(p); }}>Eliminar</Button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" onClick={() => setPartOpen(false)}>Cancelar</Button>
              <Button loading={saving} disabled={!partForm.idEtapa || !partForm.codigo.trim() || !partForm.nombre.trim()} onClick={guardarPart}>{partEditId != null ? 'Guardar' : 'Crear partida'}</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <Combobox
            label={termGrupo} required
            value={partForm.idEtapa}
            onChange={v => setPart('idEtapa', v)}
            placeholder={`Seleccionar ${termGrupoLow}`}
            options={etapas.map(e => ({
              value: String(e.idEtapa),
              label: e.nombre,
              parts: [
                { text: e.bcWorksNo ? `${e.bcWorksNo} · ${e.codigo}` : e.codigo, weight: 'bold' as const },
                { text: e.nombre, weight: 'light' as const },
              ],
              search: `${e.codigo} ${e.bcWorksNo ?? ''}`,
            }))}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Código" placeholder="Ej. 1.3" value={partForm.codigo} onChange={e => setPart('codigo', e.target.value)} required maxLength={50} hint="Mismo código que la partida en BC" />
            <Input label="Nombre" value={partForm.nombre} onChange={e => setPart('nombre', e.target.value)} required maxLength={150} />
          </div>
        </div>
      </Modal>

      {/* Modal: subpartida (crear/editar) */}
      <Modal
        open={subOpen}
        onClose={() => setSubOpen(false)}
        title={subEditId != null ? 'Editar subpartida' : 'Nueva subpartida'}
        footer={
          <div className="flex items-center gap-2 w-full">
            {subEditId != null && (
              <Button variant="outline" onClick={() => { const s = subpartidas.find(x => x.idSubPartida === subEditId); if (s) borrarSub(s); }}>Eliminar</Button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" onClick={() => setSubOpen(false)}>Cancelar</Button>
              <Button loading={saving} disabled={!subForm.idPartida || !subForm.codigo.trim() || !subForm.nombre.trim()} onClick={guardarSub}>{subEditId != null ? 'Guardar' : 'Crear subpartida'}</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {subForm.idPartida ? (
            // Partida ya definida por contexto (árbol o edición): se muestra fija.
            <div className="rounded-ds bg-ds-gray-100 px-4 py-3 text-sm">
              <span className="text-ds-gray-500">Partida: </span>
              {(() => {
                const p = partidas.find(x => String(x.idPartida) === subForm.idPartida);
                return <span className="font-semibold text-ds-ink">{p ? `${p.codigo} — ${p.nombre}` : subForm.idPartida}</span>;
              })()}
            </div>
          ) : (
            <>
              <p className="text-body-sm text-ds-gray-500">
                La subpartida queda amarrada a una <span className="font-semibold text-ds-ink">partida</span> existente (y a su {termGrupoLow}).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Combobox
                  label={termGrupo} required
                  value={subForm.idEtapa}
                  onChange={v => { setSub('idEtapa', v); setSub('idPartida', ''); }}
                  placeholder={`Seleccionar ${termGrupoLow}`}
                  options={etapas.map(e => ({ value: String(e.idEtapa), label: e.nombre, parts: [{ text: e.bcWorksNo ? `${e.bcWorksNo} · ${e.codigo}` : e.codigo, weight: 'bold' as const }, { text: e.nombre, weight: 'light' as const }], search: `${e.codigo} ${e.bcWorksNo ?? ''}` }))}
                />
                <Combobox
                  label="Partida" required
                  value={subForm.idPartida}
                  onChange={v => setSub('idPartida', v)}
                  placeholder={subForm.idEtapa ? 'Seleccionar partida' : `Elegí ${unGrupo} primero`}
                  emptyText={`${esteGrupo.charAt(0).toUpperCase() + esteGrupo.slice(1)} no tiene partidas`}
                  options={partidasDeEtapa.map(p => ({ value: String(p.idPartida), label: p.nombre, parts: [{ text: p.codigo, weight: 'bold' as const }, { text: p.nombre, weight: 'light' as const }], search: p.codigo }))}
                />
              </div>
            </>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Código" value={subForm.codigo} disabled hint={subEditId != null ? 'Código de la subpartida (no editable)' : 'Automático — siguiente correlativo de la partida'} />
            <Input label="Nombre" value={subForm.nombre} onChange={e => setSub('nombre', e.target.value)} required maxLength={50} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Sprint: solo los tipos que planifican por sprint (hoy, vivienda). */}
            {!usaSprints ? null : sprintsCat.length > 0 ? (
              <Combobox
                label="Sprint"
                value={subForm.numSprint}
                onChange={v => setSub('numSprint', v)}
                placeholder="Seleccionar sprint"
                emptyText="Sin sprints en el catálogo"
                options={(() => {
                  const opts = sprintsCat
                    .slice()
                    .sort((a, b) => a.numero_global - b.numero_global)
                    .map(s => ({ value: String(s.numero_global), label: `Sprint ${s.numero_global} — ${s.nombre}`, parts: [{ text: `Sprint ${s.numero_global}`, weight: 'bold' as const }, { text: s.nombre, weight: 'light' as const }], search: `${s.codigo} ${s.nombre}` }));
                  // Preserva un sprint heredado que ya no esté en el catálogo.
                  if (subForm.numSprint && !sprintsCat.some(s => String(s.numero_global) === subForm.numSprint)) {
                    opts.unshift({ value: subForm.numSprint, label: `Sprint ${subForm.numSprint} (fuera de catálogo)`, parts: [{ text: `Sprint ${subForm.numSprint}`, weight: 'bold' as const }, { text: 'fuera de catálogo', weight: 'light' as const }], search: subForm.numSprint });
                  }
                  return opts;
                })()}
              />
            ) : (
              <Input label="Sprint (N°)" type="number" min={0} value={subForm.numSprint} onChange={e => setSub('numSprint', e.target.value)} hint="Catálogo de sprints no disponible" />
            )}
            <div className="flex items-end gap-4 pb-3">
              <label className="flex items-center gap-2 text-sm text-ds-ink cursor-pointer">
                <input type="checkbox" checked={subForm.esCritica} onChange={e => setSub('esCritica', e.target.checked)} className="w-4 h-4 accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2" />
                Es crítica
              </label>
              <label className="flex items-center gap-2 text-sm text-ds-ink cursor-pointer">
                <input type="checkbox" checked={subForm.activo} onChange={e => setSub('activo', e.target.checked)} className="w-4 h-4 accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2" />
                Activa
              </label>
            </div>
          </div>
          {/* Tipos de casa a los que aplica la subpartida (mismo modelo que Avance). */}
          {usaTiposCasa && (
            <div>
              <label className="block text-body-sm font-medium text-ds-ink mb-1.5">Tipos de casa <span className="text-ds-red">*</span></label>
              <div className="flex flex-wrap gap-2">
                {TIPOS_CASA.map(tc => {
                  const on = subForm.tiposCasa.includes(tc);
                  return (
                    <button key={tc} type="button" onClick={() => toggleTipo(tc)}
                      className={'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ' + (on ? 'border-brand bg-brand/15 text-ds-green-ink' : 'border-ds-gray-200 bg-ds-surface text-ds-gray-400 hover:border-ds-gray-400 hover:text-ds-ink')}>
                      {tc}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {!usaSprints && !usaTiposCasa && (
            <p className="text-body-sm text-ds-gray-400">
              En {tipo?.nombre.toLowerCase() ?? 'este tipo de obra'} la subpartida no lleva sprint ni tipo de casa: aplica a la obra completa.
            </p>
          )}
          <Input label="Descripción (opcional)" value={subForm.descripcion} onChange={e => setSub('descripcion', e.target.value)} maxLength={4000} />
        </div>
      </Modal>

      {/* Modal: grupo (crear) */}
      <Modal
        open={etapaOpen}
        onClose={() => setEtapaOpen(false)}
        title={nuevoGrupo}
        footer={
          <div className="flex items-center gap-2 w-full">
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" onClick={() => setEtapaOpen(false)}>Cancelar</Button>
              <Button loading={saving} disabled={!etapaForm.codigo.trim() || !etapaForm.nombre.trim()} onClick={guardarEtapa}>{`Crear ${termGrupoLow}`}</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-body-sm text-ds-gray-500">
            Se crea en el catálogo de <span className="font-semibold text-ds-ink">{tipo?.nombre.toLowerCase() ?? tipoCodigo.toLowerCase()}</span>.
          </p>
          {porObra && (
            <Combobox
              label="Obra de Business Central"
              value={etapaForm.bcWorksNo}
              onChange={v => setEt('bcWorksNo', v)}
              placeholder="Compartida por todas las obras del tipo"
              options={[
                { value: '', label: 'Compartida por todas las obras del tipo' },
                ...obrasDelTipo.map(o => ({
                  value: o.numeroObra,
                  label: o.nombre ? `${o.numeroObra} — ${o.nombre}` : o.numeroObra,
                  parts: [{ text: o.numeroObra, weight: 'bold' as const }, { text: o.nombre, weight: 'light' as const }],
                  search: `${o.numeroObra} ${o.nombre}`,
                })),
              ]}
            />
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Código" placeholder="Ej. gris, FG, T1" value={etapaForm.codigo} onChange={e => setEt('codigo', e.target.value)} required maxLength={50} />
            <Input label="Nombre" placeholder="Ej. Obra Gris" value={etapaForm.nombre} onChange={e => setEt('nombre', e.target.value)} required maxLength={150} />
          </div>
          <Input
            label="Capítulo en BC (opcional)"
            placeholder="Ej. 1, FG, G1"
            value={etapaForm.bcTaskNo}
            onChange={e => setEt('bcTaskNo', e.target.value)}
            maxLength={50}
            hint="Código del capítulo (“Total”) de la obra en Business Central, si ya existe allá"
          />
        </div>
      </Modal>

      {/* Modal: traer de BC */}
      <Modal
        open={bcOpen}
        onClose={() => setBcOpen(false)}
        title="Traer estructura de Business Central"
        footer={
          <div className="flex items-center gap-2 w-full">
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" onClick={() => setBcOpen(false)}>Cancelar</Button>
              <Button variant="outline" loading={bcSync === 'ver'} onClick={verQueTraeriaDeBC}>Ver qué traería</Button>
              <Button loading={bcSync === 'traer'} onClick={traerDeBC}>Traer</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-body-sm text-ds-gray-500">
            Lee el presupuesto de la obra en BC y agrega al catálogo de{' '}
            <span className="font-semibold text-ds-ink">{tipo?.nombre.toLowerCase() ?? tipoCodigo.toLowerCase()}</span> los
            capítulos que falten como <span className="font-semibold text-ds-ink">{termGrupoPlural}</span> y sus partidas como{' '}
            <span className="font-semibold text-ds-ink">partidas</span>. No borra nada y no toca las subpartidas.
          </p>
          <Combobox
            label="Obra"
            value={bcObra}
            onChange={v => { setBcObra(v); setBcPreview(null); }}
            placeholder={`Todas las obras de ${tipo?.nombre.toLowerCase() ?? 'este tipo'}`}
            options={[
              { value: '', label: `Todas las obras de ${tipo?.nombre.toLowerCase() ?? 'este tipo'}` },
              ...obrasDelTipo.map(o => ({
                value: o.numeroObra,
                label: o.nombre ? `${o.numeroObra} — ${o.nombre}` : o.numeroObra,
                parts: [{ text: o.numeroObra, weight: 'bold' as const }, { text: o.nombre, weight: 'light' as const }],
                search: `${o.numeroObra} ${o.nombre}`,
              })),
            ]}
          />
          {!porObra && (
            <p className="text-body-sm text-ds-gray-400">
              En {tipo?.nombre.toLowerCase()} el catálogo es uno para todas las obras: lo que traiga de esta obra queda
              disponible para todas. Conviene usar “Ver qué traería” antes.
            </p>
          )}
          {bcPreview && (
            <div className="rounded-ds border border-ds-gray-200 bg-ds-gray-100/60 p-3 space-y-2">
              <p className="text-body-sm text-ds-ink">
                {bcPreview.gruposCreados + bcPreview.partidasCreadas === 0
                  ? `Nada nuevo: lo de BC ya está en el catálogo (${plural(bcPreview.obrasProcesadas, 'obra revisada', 'obras revisadas')}).`
                  : <>Traería <span className="font-semibold">{plural(bcPreview.gruposCreados, termGrupoLow, termGrupoPlural)}</span> y <span className="font-semibold">{plural(bcPreview.partidasCreadas, 'partida', 'partidas')}</span> nuevas de {plural(bcPreview.obrasProcesadas, 'obra', 'obras')}.</>}
              </p>
              {bcPreview.detalle.some(d => d.gruposCreados.length + d.partidasCreadas.length > 0) && (
                <ul className="max-h-48 overflow-y-auto space-y-1.5 text-body-sm">
                  {bcPreview.detalle.filter(d => d.gruposCreados.length + d.partidasCreadas.length > 0).map(d => (
                    <li key={d.obra}>
                      <span className="font-mono text-xs font-semibold text-ds-gray-500">{d.obra}</span>
                      <span className="text-ds-gray-400">
                        {' · '}
                        {d.fuente === 'bc' ? 'BC en vivo'
                          : d.fuente === 'bc-otra' ? `BC · compañía ${d.compania ?? 'anterior'}`
                          : 'snapshot del ETL'}
                        {d.version ? ` · versión ${d.version}` : ''}
                      </span>
                      <div className="pl-3 text-ds-gray-500">
                        {[...d.gruposCreados.map(g => `${termGrupo}: ${g}`), ...d.partidasCreadas.map(p => `Partida: ${p}`)]
                          .slice(0, 12).map(t => <div key={t} className="truncate">{t}</div>)}
                        {d.gruposCreados.length + d.partidasCreadas.length > 12 && (
                          <div className="text-ds-gray-400">…y {d.gruposCreados.length + d.partidasCreadas.length - 12} más</div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-body-sm text-ds-gray-400">
                También refrescaría el nombre de {plural(bcPreview.gruposActualizados, `${termGrupoLow} que ya está`, `${termGrupoPlural} que ya están`)} y {plural(bcPreview.partidasActualizadas, 'partida que ya está', 'partidas que ya están')}.
              </p>
            </div>
          )}
        </div>
      </Modal>
    </PageShell>
  );
}
