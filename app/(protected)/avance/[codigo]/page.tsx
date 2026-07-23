'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ds/Icon/Icon';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Combobox } from '@/components/ui/Combobox';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import type { AvanceSprint, AvanceSubPartida, Causa, EstadoAvance } from '@/lib/avance/types';

const PRESETS = [0, 25, 50, 75, 100] as const;

function estadoDe(sp: AvanceSubPartida): EstadoAvance {
  if (sp.nc_causa) return 'nc';
  if (sp.completada) return 'completada';
  if (sp.pct_completado > 0) return 'en_progreso';
  return 'sin_iniciar';
}

const ESTILO: Record<EstadoAvance, { stripe: string; chip: string; label: string; icon: string }> = {
  sin_iniciar: { stripe: 'bg-ds-gray-300', chip: 'bg-ds-gray-100 text-ds-gray-500', label: 'Sin iniciar', icon: 'square' },
  en_progreso: { stripe: 'bg-ds-gray-400', chip: 'bg-ds-gray-100 text-ds-gray-500', label: 'En progreso', icon: 'incompleto' },
  completada: { stripe: 'bg-brand', chip: 'bg-brand/20 text-[#4a6f00]', label: 'Completada', icon: 'completado' },
  nc: { stripe: 'bg-ds-red', chip: 'bg-ds-red/10 text-ds-red-200', label: 'No cumplió', icon: 'alert' },
};

export default function AvanceCapturaPage() {
  const router = useRouter();
  const params = useParams<{ codigo: string }>();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const codigo = decodeURIComponent(params.codigo);
  const partidaFoco = searchParams.get('partida');

  const [avance, setAvance] = useState<AvanceSprint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [causas, setCausas] = useState<Causa[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [colapsadasManual, setColapsadasManual] = useState<Set<string> | null>(null);
  const [ncDe, setNcDe] = useState<AvanceSubPartida | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/avance/obras/${encodeURIComponent(codigo)}/avance`);
      const d = await r.json();
      if (!r.ok) {
        setError(d.error ?? 'No se pudo cargar el avance');
        setAvance(null);
      } else {
        setAvance(d.data);
      }
    } catch {
      setError('No se pudo cargar el avance');
    } finally {
      setLoading(false);
    }
  }, [codigo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    fetch('/api/avance/causas?activo=true')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((d) => setCausas(d.data ?? []))
      .catch(() => {});
  }, []);

  const porPartida = useMemo(() => {
    const map = new Map<string, { nombre: string; subs: AvanceSubPartida[] }>();
    for (const sp of avance?.sub_partidas ?? []) {
      const g = map.get(sp.partida_codigo) ?? { nombre: sp.partida_nombre, subs: [] };
      g.subs.push(sp);
      map.set(sp.partida_codigo, g);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [avance]);

  const sprintActual = avance?.sprint ?? 0;
  const defaultColapsadas = useMemo(() => {
    const s = new Set<string>();
    for (const [cod, g] of porPartida) {
      if (!g.subs.some((sp) => sp.sprint_numero === sprintActual)) s.add(cod);
    }
    return s;
  }, [porPartida, sprintActual]);
  const colapsadas = colapsadasManual ?? defaultColapsadas;
  const forzarAbierto = busqueda.trim() !== '' || partidaFoco !== null;

  const porPartidaVista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return porPartida
      .filter(([cod]) => !partidaFoco || cod === partidaFoco)
      .map(([cod, g]) => {
        const subs = q ? g.subs.filter((s) => `${s.codigo} ${s.nombre}`.toLowerCase().includes(q)) : g.subs;
        return [cod, { ...g, subs }] as const;
      })
      .filter(([, g]) => g.subs.length > 0);
  }, [porPartida, partidaFoco, busqueda]);

  function togglePartida(cod: string) {
    setColapsadasManual(() => {
      const next = new Set(colapsadas);
      if (next.has(cod)) next.delete(cod);
      else next.add(cod);
      return next;
    });
  }

  async function registrar(body: Record<string, unknown>, etiqueta: string, silencioso = false) {
    try {
      const r = await fetch(`/api/avance/obras/${encodeURIComponent(codigo)}/avance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) {
        toast(d.error ?? 'No se pudo registrar', 'error');
        return;
      }
      if (!silencioso) toast(`Avance registrado: ${etiqueta}`, 'success');
      await cargar();
    } catch {
      toast('No se pudo registrar', 'error');
    }
  }

  function fijarPct(sp: AvanceSubPartida, pct: number) {
    if (pct < sp.piso_pct) {
      toast(`El último cierre dejó esta sub-partida en ${sp.piso_pct}%. No se puede bajar.`, 'warning');
      return;
    }
    registrar(
      { sub_partida_id: sp.sub_partida_id, pct_completado: pct, completada: pct >= 100, nc_causa: null, nc_nota: null },
      `${sp.codigo} · ${pct}%`,
      true,
    );
  }

  async function completarArrastradas() {
    try {
      const r = await fetch(`/api/avance/obras/${encodeURIComponent(codigo)}/completar-arrastradas`, {
        method: 'POST',
      });
      const d = await r.json();
      if (!r.ok) {
        toast(d.error ?? 'No se pudo completar', 'error');
        return;
      }
      toast(`${d.data?.completadas ?? 0} arrastradas completadas`, 'success');
      await cargar();
    } catch {
      toast('No se pudo completar', 'error');
    }
  }

  const causaLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of causas) m.set(c.codigo, c.descripcion);
    return m;
  }, [causas]);

  const arrastradasPendientes = (avance?.sub_partidas ?? []).filter((sp) => sp.arrastrada && !sp.completada).length;

  return (
    <div className="p-6 space-y-5 max-w-[1100px] mx-auto animate-fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button
            type="button"
            onClick={() => router.push('/avance')}
            className="mb-1 flex items-center gap-1 text-body-sm text-ds-gray-400 hover:text-black"
          >
            <Icon name="back" size="sm" color="currentColor" /> Volver a obras
          </button>
          <h1 className="text-heading font-bold text-black font-mono">{codigo}</h1>
          {avance && (
            <p className="text-ds-gray-400 text-body-sm">
              {avance.tipo_casa} · sprint {avance.sprint} · avance del sprint {avance.avance_sprint}%
            </p>
          )}
        </div>
        {arrastradasPendientes > 0 && (
          <Button variant="outline" onClick={completarArrastradas} icon={<Icon name="check" size="sm" color="currentColor" />}>
            Completar {arrastradasPendientes} arrastrada{arrastradasPendientes === 1 ? '' : 's'}
          </Button>
        )}
      </div>

      {partidaFoco && (
        <div className="flex items-center gap-2 rounded-ds border border-ds-gray-200 bg-ds-gray-100 px-3 py-2 text-body-sm">
          <span className="text-ds-gray-500">Mostrando solo la partida {partidaFoco}.</span>
          <button type="button" onClick={() => router.push(`/avance/${encodeURIComponent(codigo)}`)} className="font-semibold text-black hover:underline">
            Ver todas
          </button>
        </div>
      )}

      <div className="relative max-w-md">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ds-gray-400">
          <Icon name="search" size="sm" color="currentColor" />
        </span>
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar sub-partida…"
          className="h-10 w-full rounded-ds border border-ds-gray-200 pl-9 pr-3 text-sm text-black focus:border-black focus:outline-none"
        />
      </div>

      {loading && <Skeleton className="h-64 w-full" />}

      {error && !loading && (
        <p className="rounded-ds border border-dashed border-ds-gray-200 p-6 text-center text-body-sm text-ds-gray-400">{error}</p>
      )}

      {!loading && !error && avance && (
        <div className="space-y-3">
          {porPartidaVista.map(([cod, g]) => {
            const abierta = forzarAbierto || !colapsadas.has(cod);
            const total = g.subs.length;
            const completas = g.subs.filter((s) => s.completada).length;
            return (
              <section key={cod} className="rounded-ds border border-ds-gray-200 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => !forzarAbierto && togglePartida(cod)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-ds-gray-100/50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-ds-gray-400">
                      <Icon name={abierta ? 'open' : 'arrow-right'} size="sm" color="currentColor" />
                    </span>
                    <span className="font-semibold text-black">{cod}</span>
                    <span className="text-body-sm text-ds-gray-400">{g.nombre}</span>
                  </div>
                  <Badge variant={completas === total ? 'green' : 'gray'}>
                    {completas}/{total}
                  </Badge>
                </button>

                {abierta && (
                  <div className="divide-y divide-ds-gray-100 border-t border-ds-gray-100">
                    {g.subs.map((sp) => {
                      const est = estadoDe(sp);
                      const s = ESTILO[est];
                      return (
                        <div key={sp.sub_partida_id} className="flex items-stretch gap-3">
                          <div className={`w-1 shrink-0 ${s.stripe}`} />
                          <div className="flex-1 py-3 pr-4 space-y-2">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div>
                                <p className="flex items-center gap-2 text-sm font-medium text-black">
                                  {sp.codigo} · {sp.nombre}
                                  {sp.es_critica && <Badge variant="yellow">crítica</Badge>}
                                  {sp.arrastrada && <Badge variant="red">arrastrada</Badge>}
                                </p>
                                <p className="text-body-sm text-ds-gray-400 flex items-center gap-2">
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.chip}`}>
                                    <Icon name={s.icon} size="sm" color="currentColor" /> {s.label}
                                  </span>
                                  <span className="tabular-nums">{sp.pct_completado}%</span>
                                  {sp.peso > 0 && <span>peso {sp.peso}</span>}
                                  {sp.piso_pct > 0 && <span>mín {sp.piso_pct}%</span>}
                                </p>
                                {sp.nc_causa && (
                                  <p className="text-body-sm text-ds-red-200">
                                    NC: {causaLabel.get(sp.nc_causa) ?? sp.nc_causa}
                                    {sp.nc_nota ? ` — ${sp.nc_nota}` : ''}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {PRESETS.map((p) => {
                                const activo = sp.pct_completado === p;
                                const bloqueado = p < sp.piso_pct;
                                return (
                                  <button
                                    key={p}
                                    type="button"
                                    disabled={bloqueado}
                                    onClick={() => fijarPct(sp, p)}
                                    className={`h-8 min-w-[44px] rounded-ds border px-2 text-xs font-semibold tabular-nums transition-colors ${
                                      activo
                                        ? 'border-black bg-black text-white'
                                        : bloqueado
                                          ? 'border-ds-gray-100 bg-ds-gray-100 text-ds-gray-300 cursor-not-allowed'
                                          : 'border-ds-gray-200 bg-white text-ds-gray-500 hover:border-black'
                                    }`}
                                  >
                                    {p}%
                                  </button>
                                );
                              })}
                              <button
                                type="button"
                                onClick={() => setNcDe(sp)}
                                className="h-8 rounded-ds border border-ds-red/40 bg-white px-2.5 text-xs font-semibold text-ds-red-200 hover:bg-ds-red/10"
                              >
                                No cumplió
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
          {porPartidaVista.length === 0 && (
            <p className="rounded-ds border border-dashed border-ds-gray-200 p-6 text-center text-body-sm text-ds-gray-400">
              No hay sub-partidas para mostrar.
            </p>
          )}
        </div>
      )}

      <NCDialog
        sub={ncDe}
        causas={causas}
        onClose={() => setNcDe(null)}
        onConfirm={(causa, nota) => {
          if (!ncDe) return;
          registrar(
            { sub_partida_id: ncDe.sub_partida_id, nc_causa: causa, nc_nota: nota },
            `${ncDe.codigo} · NC`,
          );
          setNcDe(null);
        }}
      />
    </div>
  );
}

function NCDialog({
  sub,
  causas,
  onClose,
  onConfirm,
}: {
  sub: AvanceSubPartida | null;
  causas: Causa[];
  onClose: () => void;
  onConfirm: (causa: string, nota: string | null) => void;
}) {
  const [causa, setCausa] = useState('');
  const [nota, setNota] = useState('');

  useEffect(() => {
    setCausa(sub?.nc_causa ?? '');
    setNota(sub?.nc_nota ?? '');
  }, [sub]);

  const opciones = causas
    .filter((c) => c.aplica_nc)
    .map((c) => ({ value: c.codigo, label: `${c.codigo} — ${c.descripcion}`, search: c.descripcion }));

  return (
    <Modal
      open={!!sub}
      onClose={onClose}
      title={sub ? `No cumplió — ${sub.codigo}` : 'No cumplió'}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!causa} onClick={() => onConfirm(causa, nota.trim() || null)}>Registrar NC</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-body-sm text-ds-gray-400">
          Registrá por qué no se cumplió el objetivo de esta sub-partida. El % de avance no cambia.
        </p>
        <Combobox label="Causa" value={causa} onChange={setCausa} options={opciones} placeholder="Seleccionar causa…" emptyText="Sin causas" />
        <div>
          <label className="mb-1 block text-sm font-medium text-black">Nota (opcional)</label>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            className="w-full rounded-ds border border-ds-gray-200 px-3 py-2 text-sm text-black focus:border-black focus:outline-none"
            placeholder="Detalle de lo ocurrido…"
          />
        </div>
      </div>
    </Modal>
  );
}
