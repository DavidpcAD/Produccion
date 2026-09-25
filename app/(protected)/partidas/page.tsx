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

// FAMILIAS de la barra de tipos: la gente ve UNA pestaña por cosa del negocio.
// "Obra Vivienda" es una sola —como Infraestructura, Administrativa o Fábrica— y por
// dentro son dos catálogos distintos: la casa (VIVIENDA) y los generales del
// residencial (VIVIENDA_GEN, las obras GEN-*). Por eso la pestaña abre una segunda
// barra con las dos, y recién ahí se elige cuál árbol se mira.
// Se agrupan ACÁ, en la pantalla: en la base siguen siendo dos tipos de obra, que es
// lo que le da a cada uno su propio árbol, su nivel 1 y su "Traer de BC".
const FAMILIAS: { key: string; letra: string; nombre: string; tipos: string[] }[] = [
  { key: 'OBRA_VIVIENDA', letra: 'O', nombre: 'Obra Vivienda', tipos: ['VIVIENDA', 'VIVIENDA_GEN'] },
];

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
  /** true = la subpartida es la misma partida; "Traer de BC" crea la espejo (postventa). */
  subpartidaEspejo?: boolean;
  grupos?: number; partidas?: number; subpartidas?: number; obras?: number;
  obrasBC?: { numeroObra: string; nombre: string }[];
}
/** Lo que deja "Traer de BC", sumando todos los catálogos de la pestaña. */
interface ResumenBC {
  obrasProcesadas: number; gruposCreados: number; partidasCreadas: number;
  subpartidasCreadas: number; gruposActualizados: number; partidasActualizadas: number;
  avisos: string[];
  /** Obras que NO se traen de BC porque su catálogo es de la app (ver motivoSinSyncBC). */
  bloqueadas: { obra: string; motivo: string }[];
  detalle: {
    obra: string; fuente: string; compania?: string | null; version?: string | null;
    gruposCreados: string[]; partidasCreadas: string[]; subpartidasCreadas: string[];
  }[];
}

/** Lo que devuelve /api/partidas para UN tipo de obra. */
interface RespPartidas {
  tipo?: TipoObra; etapas?: Etapa[]; partidas?: Partida[]; subpartidas?: SubPartida[];
}
interface Etapa {
  idEtapa: number; codigo: string; nombre: string;
  bcTaskNo: string | null; bcWorksNo: string | null;
  /** Tipo de obra del que se cargó; lo pone el cliente, no la API. En "Obra
   *  Vivienda" conviven los dos (VIVIENDA y VIVIENDA_GEN) en la misma pantalla. */
  tipo?: string;
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
// Rótulo de nivel: en fábrica el mismo nombre se repite en los tres niveles a
// propósito (la máquina es el proceso, la partida y la subpartida), así que el
// nombre solo no dice en qué nivel estás parado. Cada fila lo dice.
const NIVEL = 'text-[9px] font-semibold uppercase tracking-[0.08em] text-ds-gray-400 shrink-0';

/** Cuántas cosas nuevas traería BC para una obra (los tres niveles juntos). */
function nuevosDeBC(d: { gruposCreados: string[]; partidasCreadas: string[]; subpartidasCreadas?: string[] }) {
  return d.gruposCreados.length + d.partidasCreadas.length + (d.subpartidasCreadas?.length ?? 0);
}

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

  // Estado del árbol: todo arranca CERRADO y se guarda lo que el usuario abre.
  // Con 18 máquinas (o 200 obras) desplegadas de una, la pantalla es un muro y
  // deja de leerse de qué cuelga qué; abrir es el gesto de "ver qué hay adentro".
  const [gruposAbiertos, setGruposAbiertos] = useState<Set<number>>(new Set());
  const [partidasAbiertas, setPartidasAbiertas] = useState<Set<number>>(new Set());
  const [obrasAbiertas, setObrasAbiertas] = useState<Set<string>>(new Set());

  const puede = mounted && isSuperAdmin;
  const termGrupo = tipo?.terminoGrupo ?? 'Etapa';
  const termGrupoLow = termGrupo.toLowerCase();
  const termGrupoPlural = (tipo?.terminoGrupoPlural ?? 'Etapas').toLowerCase();
  // Concordancia del rótulo del nivel 1: "Nueva etapa" / "Nuevo proceso",
  // "esta área" / "este sistema" (dbo.TipoObra.genero).
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
  const [bcPreview, setBcPreview] = useState<ResumenBC | null>(null);

  function cambiarTipo(t: string) {
    if (t === tipoCodigo) return;
    setQ('');
    setObraFiltro('');
    setGruposAbiertos(new Set());
    setPartidasAbiertas(new Set());
    setObrasAbiertas(new Set());
    setTipoCodigo(t);
  }

  const cargarTipos = useCallback(async () => {
    const d = await fetch('/api/tipos-obra?conObras=1').then(r => (r.ok ? r.json() : null)).catch(() => null);
    if (d?.tipos) setTipos(d.tipos);
  }, []);
  useEffect(() => { cargarTipos(); }, [cargarTipos]);

  // Una pestaña puede traer VARIOS catálogos: "Obra Vivienda" muestra a la vez el
  // de construcción y el de generales, uno debajo del otro, como las obras de
  // administrativas. Cada etapa se queda marcada con el tipo del que vino.
  const load = useCallback(async () => {
    setLoading(true);
    const fam = FAMILIAS.find(f => f.tipos.includes(tipoCodigo));
    const codigos = fam ? fam.tipos : [tipoCodigo];
    const respuestas = await Promise.all(codigos.map(async (cod) => {
      const qs = new URLSearchParams({ tipo: cod });
      if (obraFiltro && !fam) qs.set('obra', obraFiltro);
      const d: RespPartidas | null = await fetch(`/api/partidas?${qs}`)
        .then(r => (r.ok ? r.json() : null)).catch(() => null);
      return d ? { cod, d } : null;
    }));
    const vivos = respuestas.filter((r): r is { cod: string; d: RespPartidas } => !!r);
    if (vivos.length > 0) {
      setTipo(vivos[0].d.tipo ?? null);
      setEtapas(vivos.flatMap(b => (b.d.etapas ?? []).map(e => ({ ...e, tipo: b.cod }))));
      setPartidas(vivos.flatMap(b => b.d.partidas ?? []));
      setSubpartidas(vivos.flatMap(b => b.d.subpartidas ?? []));
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

  // Las pestañas de arriba: una por familia (Obra Vivienda) y una por cada tipo que
  // no está en ninguna. El orden es el de dbo.TipoObra.
  const pestanas = useMemo(() => {
    const out: { key: string; letra: string; nombre: string; miembros: TipoObra[] }[] = [];
    const puestas = new Set<string>();
    for (const t of tipos) {
      const fam = FAMILIAS.find(f => f.tipos.includes(t.codigo));
      if (!fam) { out.push({ key: t.codigo, letra: t.letra, nombre: t.nombre, miembros: [t] }); continue; }
      if (puestas.has(fam.key)) continue;
      puestas.add(fam.key);
      const miembros = fam.tipos.map(c => tipos.find(x => x.codigo === c)).filter((x): x is TipoObra => !!x);
      out.push({ key: fam.key, letra: fam.letra, nombre: fam.nombre, miembros });
    }
    return out;
  }, [tipos]);
  const pestanaActual = useMemo(
    () => pestanas.find(p => p.miembros.some(m => m.codigo === tipoCodigo)) ?? null,
    [pestanas, tipoCodigo],
  );
  /** Los catálogos que se ven a la vez en la pestaña (vivienda son dos). */
  const miembrosActivos = useMemo(() => pestanaActual?.miembros ?? [], [pestanaActual]);

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

    // De qué cuelga cada rama de arriba:
    //   · Familia (Obra Vivienda) → del CATÁLOGO: una fila por tipo, "Vivienda
    //     Construcción" y "Vivienda General", como ALM-SSO y COM-FORM en
    //     administrativas. Dentro van sus etapas/áreas derecho, sin repetir la obra
    //     (en generales el área YA es la obra: GEN-BAR).
    //   · Resto → de la OBRA de BC, como siempre (admin / fábrica / postventa).
    const porCatalogo = (miembrosActivos?.length ?? 0) > 1;
    const secciones = new Map<string, typeof grupos>();
    for (const g of grupos) {
      const k = porCatalogo ? (g.etapa.tipo ?? tipoCodigo) : (g.etapa.bcWorksNo ?? SIN_OBRA);
      if (!secciones.has(k)) secciones.set(k, []);
      secciones.get(k)!.push(g);
    }
    const orden = (k: string) => (porCatalogo ? (miembrosActivos ?? []).findIndex(m => m.codigo === k) : 0);
    return [...secciones.entries()]
      .sort((a, b) => porCatalogo
        ? orden(a[0]) - orden(b[0])
        : (a[0] === SIN_OBRA ? -1 : b[0] === SIN_OBRA ? 1 : porCodigo(a[0], b[0])))
      .map(([clave, grupos]) => {
        const tipoSec = porCatalogo ? (miembrosActivos ?? []).find(m => m.codigo === clave) ?? null : null;
        return {
          clave,
          // Con qué se rotula la fila de arriba: el catálogo (C · Vivienda
          // Construcción) o la obra de BC (ALM-SSO · Seguridad ocupacional).
          codigo: tipoSec ? tipoSec.letra : (clave === SIN_OBRA ? null : clave),
          nombre: tipoSec ? tipoSec.nombre : (obrasDelTipo.find(o => o.numeroObra === clave)?.nombre ?? ''),
          conFila: tipoSec ? true : clave !== SIN_OBRA,
          tipoSec,
          grupos,
          totalPartidas: grupos.reduce((n, g) => n + g.totalPartidas, 0),
          totalSubs: grupos.reduce((n, g) => n + g.totalSubs, 0),
        };
      });
  }, [etapas, partidas, subsByPartida, buscando, term, miembrosActivos, tipoCodigo, obrasDelTipo]);

  // Con una sola rama (o buscando) no tiene sentido tenerla cerrada.
  const seccionAbierta = (clave: string, conFila: boolean) =>
    !conFila || buscando || arbol.length === 1 || obrasAbiertas.has(clave);
  const grupoAbierto = (id: number) => buscando || gruposAbiertos.has(id);
  const partidaAbierta = (id: number, forzar: boolean) => forzar || partidasAbiertas.has(id);

  const toggleSet = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v); else n.add(v);
    return n;
  };
  function expandirTodo() {
    setGruposAbiertos(new Set(etapas.map(e => e.idEtapa)));
    setPartidasAbiertas(new Set(partidas.map(p => p.idPartida)));
    setObrasAbiertas(new Set(arbol.map(s => s.clave)));
  }
  function colapsarTodo() {
    setGruposAbiertos(new Set());
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
      setGruposAbiertos(s => new Set(s).add(Number(partForm.idEtapa)));
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
  // Una pestaña puede tener más de un catálogo (Obra Vivienda: construcción y
  // generales): se le pide a BC por cada uno y se suma, porque para la gente el
  // botón es uno solo.
  async function sincronizarConBC(dryRun: boolean): Promise<ResumenBC | { error: string }> {
    const codigos = miembrosActivos.length > 0 ? miembrosActivos.map(m => m.codigo) : [tipoCodigo];
    const partes = await Promise.all(codigos.map(async (t) => {
      const res = await fetch('/api/partidas/sync-bc', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: t, obra: bcObra || undefined, dryRun }),
      });
      const d = await res.json().catch(() => ({}));
      return { ok: res.ok, d };
    }));
    const error = partes.find(p => !p.ok);
    if (error) return { error: (error.d?.error as string) || 'No se pudo leer BC' };
    const suma = (k: string) => partes.reduce((n, p) => n + (Number(p.d?.[k]) || 0), 0);
    return {
      obrasProcesadas: suma('obrasProcesadas'),
      gruposCreados: suma('gruposCreados'),
      partidasCreadas: suma('partidasCreadas'),
      subpartidasCreadas: suma('subpartidasCreadas'),
      gruposActualizados: suma('gruposActualizados'),
      partidasActualizadas: suma('partidasActualizadas'),
      avisos: partes.flatMap(p => (p.d?.avisos ?? []) as string[]),
      bloqueadas: partes.flatMap(p => (p.d?.bloqueadas ?? []) as ResumenBC['bloqueadas']),
      detalle: partes.flatMap(p => (p.d?.detalle ?? []) as ResumenBC['detalle']),
    };
  }

  // dryRun: mira BC y dice qué crearía, sin escribir. En vivienda e infra importa
  // de más, porque el catálogo es uno para todas las obras.
  async function verQueTraeriaDeBC() {
    setBcSync('ver');
    try {
      const d = await sincronizarConBC(true);
      if ('error' in d) { toast(d.error, 'error'); return; }
      setBcPreview(d);
      for (const a of d.avisos) toast(a, 'warning');
    } finally { setBcSync(false); }
  }
  async function traerDeBC() {
    setBcSync('traer');
    try {
      const d = await sincronizarConBC(false);
      if ('error' in d) { toast(d.error, 'error'); return; }
      const nuevo = (d.gruposCreados ?? 0) + (d.partidasCreadas ?? 0) + (d.subpartidasCreadas ?? 0);
      toast(
        nuevo === 0
          ? `Sin cambios: BC no tiene nada que no esté ya en el catálogo (${plural(d.obrasProcesadas ?? 0, 'obra revisada', 'obras revisadas')}).`
          : `De BC: ${plural(d.gruposCreados, termGrupoLow, termGrupoPlural)} y ${plural(d.partidasCreadas, 'partida', 'partidas')} nuevas en ${plural(d.obrasProcesadas ?? 0, 'obra', 'obras')}`
            + (d.subpartidasCreadas ? `, con ${plural(d.subpartidasCreadas, 'subpartida', 'subpartidas')} igual que su partida.` : '.'),
        nuevo === 0 ? 'info' : 'success',
      );
      for (const a of d.avisos) toast(a, 'warning');
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
  // El tipo de obra ya se lee en el chip activo, así que no se repite acá.
  const subtitulo = [
    plural(partidas.length, 'partida', 'partidas'),
    plural(etapas.length, termGrupoLow, termGrupoPlural),
    totalSubs > 0 ? plural(totalSubs, 'subpartida', 'subpartidas') : 'sin subpartidas',
    porObra && obraFiltro ? `obra ${obraFiltro}` : null,
  ].filter(Boolean).join(' · ');
  // Un solo botón que alterna, en vez de "Expandir todo" + "Colapsar todo" siempre.
  const todoColapsado = etapas.length > 0 && obrasAbiertas.size === 0
    && partidasAbiertas.size === 0 && gruposAbiertos.size === 0;

  return (
    <PageShell>
      <PageHeader
        title="Partidas y subpartidas"
        subtitle={subtitulo}
        actions={
          puede ? (
            <div className="flex items-center gap-2 flex-wrap">
              {/* Jerarquía: una sola acción principal; las otras dos, secundarias. */}
              <Button variant="ghost" size="sm" onClick={abrirBC} icon={<Icon name="traslado" size="sm" color="currentColor" />}>
                Traer de BC
              </Button>
              <Button variant="ghost" size="sm" onClick={abrirNuevaEtapa} icon={<Icon name="plus" size="sm" color="currentColor" />}>
                {nuevoGrupo}
              </Button>
              <Button onClick={() => abrirNuevaPart()} icon={<Icon name="plus" size="sm" color="currentColor" />}>
                Nueva partida
              </Button>
            </div>
          ) : undefined
        }
      />

      <CatalogoTabs />

      {/* UN SOLO panel: el tipo de obra, los filtros y el catálogo viven juntos, en
          vez de cuatro bloques sueltos y una tarjeta por obra. */}
      <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 overflow-hidden">
        <div className="px-4 pt-3 pb-3 border-b border-ds-gray-200 space-y-3">
          {/* Tipos de obra (dbo.TipoObra), agrupados por familia: O · I · A · F · T · P.
              Filtro, no una segunda barra de pestañas: sin caja y sin número en los
              inactivos. Vivienda abre su propia barra debajo. */}
          <div className="flex flex-wrap items-center gap-1">
            {(pestanas.length > 0
              ? pestanas
              : [{ key: 'VIVIENDA', letra: 'O', nombre: 'Obra Vivienda', miembros: [] as TipoObra[] }]
            ).map(p => {
              const activo = pestanaActual?.key === p.key;
              const partidas = p.miembros.reduce((n, m) => n + (m.partidas ?? 0), 0);
              const detalle = p.miembros.length > 1
                ? p.miembros.map(m => m.nombre).join(' · ')
                : p.miembros[0]
                  ? `${plural(p.miembros[0].grupos ?? 0, p.miembros[0].terminoGrupo.toLowerCase(), p.miembros[0].terminoGrupoPlural.toLowerCase())}, ${plural(p.miembros[0].partidas ?? 0, 'partida', 'partidas')}, ${plural(p.miembros[0].subpartidas ?? 0, 'subpartida', 'subpartidas')}`
                  : '';
              return (
                <button key={p.key} onClick={() => { if (!activo && p.miembros[0]) cambiarTipo(p.miembros[0].codigo); }}
                  aria-current={activo ? 'true' : undefined}
                  title={`${p.letra} = ${p.nombre}${detalle ? ` · ${detalle}` : ''}`}
                  className={'inline-flex items-center gap-1.5 rounded-ds px-3 py-1.5 text-label font-semibold transition-colors ' + (activo ? 'bg-black text-white' : 'text-ds-gray-500 hover:bg-ds-gray-100 hover:text-ds-ink')}>
                  <span className={'font-mono text-body-sm font-bold ' + (activo ? 'text-white/60' : 'text-ds-gray-300')}>{p.letra}</span>
                  {p.nombre}
                  {activo && partidas > 0 && <span className="text-body-sm font-normal text-white/70">{partidas}</span>}
                </button>
              );
            })}
          </div>


          {/* Buscar · obra · expandir, todo en una línea */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[220px] flex-1">
              <Input placeholder="Buscar etapa, partida o subpartida…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            {porObra && (
              <div className="w-full sm:w-[230px]">
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
            <Button size="sm" variant="ghost" onClick={todoColapsado ? expandirTodo : colapsarTodo}
              icon={<Icon name="chevrons-up-down" size="sm" color="currentColor" />}>
              {todoColapsado ? 'Expandir' : 'Colapsar'}
            </Button>
          </div>

          {/* Cómo se lee el árbol. Cada nivel tiene su forma de código y acá está
              la equivalencia, que era justo lo que no se entendía de un vistazo. */}
          <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-ds-gray-400">
            <span className="inline-flex items-center justify-center h-4 px-1 rounded-ds bg-black text-white text-[9px] font-bold font-mono">AB</span>
            <span>{termGrupo}</span>
            <Icon name="chevron-right" size="sm" color="currentColor" />
            <span className="font-mono rounded border border-ds-gray-200 bg-ds-surface px-1 text-[10px] font-semibold text-ds-gray-500">AB-01</span>
            <span>partida</span>
            <Icon name="chevron-right" size="sm" color="currentColor" />
            <span className="font-mono text-[10px] text-ds-gray-400">AB-01.1</span>
            <span>subpartida</span>
          </div>
        </div>

        {loading ? (
          <div className="p-4 space-y-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : etapas.length === 0 ? (
          <div className="p-10 text-center">
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
          <div className="p-10 text-center text-ds-gray-400 text-label">
            Ningún resultado para “{q}”.
          </div>
        ) : (
        // Todas las obras en el MISMO panel, separadas por una línea: antes cada una
        // era su propia tarjeta y seis tarjetas huecas llenaban la pantalla.
        <div>
          {arbol.map((sec, iSec) => (
            <div key={sec.clave} className={iSec > 0 ? 'border-t border-ds-gray-200' : ''}>
              {/* Nivel 0: la obra de BC dueña de la estructura (admin / fábrica /
                  postventa) o, en Obra Vivienda, cada uno de sus dos catálogos. */}
              {sec.conFila && (
                <button
                  onClick={() => setObrasAbiertas(st => toggleSet(st, sec.clave))}
                  title={seccionAbierta(sec.clave, sec.conFila)
                    ? 'Colapsar'
                    : `Ver la estructura de ${sec.nombre || sec.codigo || sec.clave}`}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-ds-gray-200 bg-ds-gray-100/60 hover:bg-ds-gray-100 transition-colors" 
                >
                  <span className={'text-ds-gray-300 transition-transform shrink-0 ' + (seccionAbierta(sec.clave, sec.conFila) ? 'rotate-90' : '')}>
                    <Icon name="chevron-right" size="sm" color="currentColor" />
                  </span>
                  <span className="font-mono text-body-sm font-semibold text-ds-gray-500 shrink-0 min-w-[84px] whitespace-nowrap">
                    {sec.codigo}
                  </span>
                  <span className="text-label font-semibold text-ds-ink break-words flex-1 min-w-0">
                    {sec.nombre}
                  </span>
                  <span className="text-body-sm text-ds-gray-400 shrink-0 hidden sm:block whitespace-nowrap">
                    {plural(sec.grupos.length,
                      (sec.tipoSec?.terminoGrupo ?? termGrupo).toLowerCase(),
                      (sec.tipoSec?.terminoGrupoPlural ?? termGrupoPlural).toLowerCase())} · {plural(sec.totalPartidas, 'partida', 'partidas')}
                    {sec.totalSubs > 0 ? ` · ${plural(sec.totalSubs, 'subpartida', 'subpartidas')}` : ''}
                  </span>
                  <span className="text-body-sm text-ds-gray-400 shrink-0 sm:hidden">{sec.totalPartidas}</span>
                </button>
              )}

              {/* Cuando hay obra (admin / fábrica) todo lo suyo entra un escalón: si los
                  procesos arrancan pegados al borde no se lee que cuelgan de la obra. */}
              {seccionAbierta(sec.clave, sec.conFila) && (
              <div className={sec.conFila ? 'pl-8' : ''}>
              {sec.grupos.map(({ etapa, partidas: parts, totalPartidas, totalSubs: subsGrupo }, iGrupo) => {
                const abierto = grupoAbierto(etapa.idEtapa);
                const ultimoGrupo = iGrupo === sec.grupos.length - 1;
                return (
                  <div key={etapa.idEtapa} className="relative">
                    {/* Riel de la rama de arriba hacia sus grupos. */}
                    {sec.conFila && (
                      <span aria-hidden className={'pointer-events-none absolute left-[-9px] top-0 w-px bg-ds-gray-200 ' + (ultimoGrupo ? 'h-[18px]' : 'bottom-0')} />
                    )}
                    {/* Nivel 1 — grupo (etapa / sistema / área / proceso / torre) */}
                    <div className={
                      'group/proc relative flex items-center gap-2 px-3 py-2 border-b border-ds-gray-100 transition-colors '
                      + (abierto ? 'bg-ds-gray-100/60' : 'hover:bg-ds-gray-100/40')
                    }>
                      {sec.conFila && <span aria-hidden className="pointer-events-none absolute left-[-9px] top-[18px] h-px w-[9px] bg-ds-gray-200" />}
                      <button
                        onClick={() => setGruposAbiertos(s => toggleSet(s, etapa.idEtapa))}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                        title={abierto ? 'Colapsar' : `Ver las partidas de ${etapa.nombre}`}
                      >
                        <span className={'text-ds-gray-300 transition-transform shrink-0 ' + (abierto ? 'rotate-90' : '')}>
                          <Icon name="chevron-right" size="sm" color="currentColor" />
                        </span>
                        <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1.5 rounded-ds bg-ds-ink text-ds-surface text-[10px] font-bold font-mono shrink-0">{etapa.codigo}</span>
                        <span className="text-sm font-semibold text-ds-ink break-words">{etapa.nombre}</span>
                        {etapa.bcTaskNo && (
                          <span className="rounded border border-ds-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-ds-gray-300 shrink-0 hidden sm:inline" title={`Capítulo ${etapa.bcTaskNo} de la obra en Business Central`}>
                            BC {etapa.bcTaskNo}
                          </span>
                        )}
                      </button>
                      <span className={NIVEL}>{sec.tipoSec?.terminoGrupo ?? termGrupo}</span>
                      <span className="text-[11px] text-ds-gray-300 shrink-0 whitespace-nowrap hidden sm:inline">
                        {plural(totalPartidas, 'partida', 'partidas')}
                        {subsGrupo > 0 ? ` · ${plural(subsGrupo, 'subpartida', 'subpartidas')}` : ''}
                      </span>
                      {puede && (
                        <button onClick={() => abrirNuevaPart(etapa.idEtapa)} className="text-ds-gray-300 hover:text-brand shrink-0 transition-opacity sm:opacity-0 sm:group-hover/proc:opacity-100 sm:focus-visible:opacity-100" title={`Nueva partida en ${etapa.nombre}`}>
                          <Icon name="plus" size="sm" color="currentColor" />
                        </button>
                      )}
                    </div>

                    {abierto && parts.length === 0 && (
                      <div className="px-10 py-3 text-body-sm text-ds-gray-300">
                        Sin partidas.{puede ? ' Agregá la primera con el “+”.' : ''}
                      </div>
                    )}

                    {abierto && parts.map(({ partida, subs, subsVisibles, forzarAbierta }, iPart) => {
                      const subAbierta = partidaAbierta(partida.idPartida, forzarAbierta);
                      const ultimaPart = iPart === parts.length - 1;
                      return (
                        <div key={partida.idPartida} className="relative border-b border-ds-gray-100 last:border-b-0">
                          {/* Riel del nivel 2: la línea que baja desde el proceso y
                              entra a cada partida. Va por bloque de partida, así que
                              los tramos se pegan y se leen como una sola guía; en la
                              última se corta en el codo, como cualquier árbol. */}
                          <span aria-hidden className={'pointer-events-none absolute left-[21px] top-0 w-px bg-ds-gray-200 ' + (ultimaPart ? 'h-[22px]' : 'bottom-0')} />
                          {/* Nivel 2 — partida (existe en BC) */}
                          <div className="group/part relative flex items-center gap-2 pl-8 pr-3 py-2 hover:bg-ds-gray-100/40 transition-colors">
                            <span aria-hidden className="pointer-events-none absolute left-[21px] top-1/2 h-px w-2.5 bg-ds-gray-200" />
                            <button
                              onClick={() => setPartidasAbiertas(s => toggleSet(s, partida.idPartida))}
                              className="flex items-center gap-2 flex-1 min-w-0 text-left"
                              title={subAbierta ? 'Colapsar subpartidas' : 'Ver subpartidas'}
                            >
                              <span className={'text-ds-gray-300 transition-transform shrink-0 ' + (subAbierta ? 'rotate-90' : '') + (subs.length === 0 ? ' opacity-30' : '')}>
                                <Icon name="chevron-right" size="sm" color="currentColor" />
                              </span>
                              <span className="font-mono text-[10px] font-semibold text-ds-gray-400 shrink-0 rounded border border-ds-gray-200 px-1.5 py-0.5">{partida.codigo}</span>
                              <span className="text-sm text-ds-ink break-words">{partida.nombre}</span>
                            </button>
                            <span className={NIVEL}>Partida</span>
                            {subs.length > 0 && (
                              <span className="text-[11px] text-ds-gray-300 shrink-0 whitespace-nowrap hidden sm:inline">
                                {plural(subs.length, 'subpartida', 'subpartidas')}
                              </span>
                            )}
                            {puede && (
                              <>
                                <button onClick={() => abrirEditarPart(partida)} className="text-ds-gray-300 hover:text-ds-ink shrink-0 transition-opacity sm:opacity-0 sm:group-hover/part:opacity-100 sm:focus-visible:opacity-100" title="Editar partida">
                                  <Icon name="edit" size="sm" color="currentColor" />
                                </button>
                                <button onClick={() => abrirNuevaSub(partida.idPartida)} className="text-ds-gray-300 hover:text-brand shrink-0 transition-opacity sm:opacity-0 sm:group-hover/part:opacity-100 sm:focus-visible:opacity-100" title="Agregar subpartida">
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
                                {subsVisibles.map((s, iSub) => (
                                  <li
                                    key={s.idSubPartida}
                                    onClick={puede ? () => abrirEditarSub(s) : undefined}
                                    title={puede ? 'Editar subpartida' : undefined}
                                    className={'group/sub relative pl-16 pr-3 py-2 flex items-start gap-3 border-t border-ds-gray-100 ' + (puede ? 'cursor-pointer hover:bg-ds-gray-100/70 transition-colors' : '')}
                                  >
                                    {/* Riel del nivel 3, un escalón más adentro que el de partidas. */}
                                    <span aria-hidden className={'pointer-events-none absolute left-[45px] top-0 w-px bg-ds-gray-200 ' + (iSub === subsVisibles.length - 1 ? 'h-[22px]' : 'bottom-0')} />
                                    <span aria-hidden className="pointer-events-none absolute left-[45px] top-[22px] h-px w-3 bg-ds-gray-200" />
                                    <span className="font-mono text-[10px] text-ds-gray-300 shrink-0 pt-1">{s.codigo}</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className={'text-[13px] break-words ' + (s.activo ? 'text-ds-ink' : 'text-ds-gray-400 line-through')}>{s.nombre}</span>
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
                                    <span className={NIVEL + ' pt-1'}>Subpartida</span>
                                    {s.numSprint != null && (
                                      <span className="rounded-full bg-ds-gray-100 px-2 py-0.5 text-[11px] font-semibold text-ds-gray-500 shrink-0 whitespace-nowrap" title={`Sprint ${s.numSprint}`}>
                                        Sprint {s.numSprint}
                                      </span>
                                    )}
                                    {puede && (
                                      <span className="text-ds-gray-300 p-1 shrink-0 transition-opacity sm:opacity-0 sm:group-hover/sub:opacity-100" aria-hidden>
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
              )}
            </div>
          ))}
        </div>
        )}
      </div>

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
              <label className="block text-body-sm font-semibold text-ds-ink mb-1.5">Tipos de casa <span className="text-ds-red">*</span></label>
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
            <span className="font-semibold text-ds-ink">partidas</span>. No borra nada
            {tipo?.subpartidaEspejo
              ? <> y a cada partida nueva le crea su subpartida, igual que la partida.</>
              : <> y no toca las subpartidas.</>}
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
              {/* Obras cuyo catálogo es de la app: no se traen de BC. Va acá y no solo
                  en un toast, que se va solo antes de que lo lean. */}
              {bcPreview.bloqueadas.map(b => (
                <p key={b.obra} className="text-body-sm text-ds-ink">
                  <span className="font-mono text-xs font-semibold">{b.obra}</span> no se trae de BC.{' '}
                  <span className="text-ds-gray-500">{b.motivo}</span>
                </p>
              ))}
              {bcPreview.obrasProcesadas > 0 && (
              <p className="text-body-sm text-ds-ink">
                {bcPreview.gruposCreados + bcPreview.partidasCreadas + (bcPreview.subpartidasCreadas ?? 0) === 0
                  ? `Nada nuevo: lo de BC ya está en el catálogo (${plural(bcPreview.obrasProcesadas, 'obra revisada', 'obras revisadas')}).`
                  : <>Traería <span className="font-semibold">{plural(bcPreview.gruposCreados, termGrupoLow, termGrupoPlural)}</span> y <span className="font-semibold">{plural(bcPreview.partidasCreadas, 'partida', 'partidas')}</span> nuevas de {plural(bcPreview.obrasProcesadas, 'obra', 'obras')}
                    {bcPreview.subpartidasCreadas ? <>, más <span className="font-semibold">{plural(bcPreview.subpartidasCreadas, 'subpartida', 'subpartidas')}</span> igual que su partida</> : null}.</>}
              </p>
              )}
              {bcPreview.detalle.some(d => nuevosDeBC(d) > 0) && (
                <ul className="max-h-48 overflow-y-auto space-y-1.5 text-body-sm">
                  {bcPreview.detalle.filter(d => nuevosDeBC(d) > 0).map(d => (
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
                        {[...d.gruposCreados.map(g => `${termGrupo}: ${g}`), ...d.partidasCreadas.map(p => `Partida: ${p}`),
                          ...(d.subpartidasCreadas ?? []).map(sp => `Subpartida: ${sp}`)]
                          .slice(0, 12).map(t => <div key={t} className="break-words">{t}</div>)}
                        {nuevosDeBC(d) > 12 && (
                          <div className="text-ds-gray-400">…y {nuevosDeBC(d) - 12} más</div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {bcPreview.obrasProcesadas > 0 && (
                <p className="text-body-sm text-ds-gray-400">
                  También refrescaría el nombre de {plural(bcPreview.gruposActualizados, `${termGrupoLow} que ya está`, `${termGrupoPlural} que ya están`)} y {plural(bcPreview.partidasActualizadas, 'partida que ya está', 'partidas que ya están')}.
                </p>
              )}
            </div>
          )}
        </div>
      </Modal>
    </PageShell>
  );
}
