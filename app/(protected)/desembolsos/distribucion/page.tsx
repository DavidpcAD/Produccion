'use client';

import { useEffect, useState } from 'react';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import type {
  DistribucionProyectoResumen,
  EntidadDistribucion,
  RespuestaDistribucion,
} from '@/lib/desembolsos/distribucion';

/**
 * Admin · Distribución por proyecto — reparto del precio interno del lote entre
 * entidades del grupo (AD/QFI/GM/...). Portado de `DistribucionPantalla`. Las
 * tarifas se versionan: editar la vigente in-place, o crear una nueva vigencia.
 */
export default function DistribucionPage() {
  const { toast } = useToast();
  const [proyectos, setProyectos] = useState<DistribucionProyectoResumen[]>([]);
  const [entidades, setEntidades] = useState<EntidadDistribucion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sel, setSel] = useState<DistribucionProyectoResumen | null>(null);

  function recargar() {
    setCargando(true);
    Promise.all([
      fetch('/api/desembolsos/distribucion').then((r) => (r.ok ? r.json() : Promise.reject(new Error('No autorizado')))),
      fetch('/api/desembolsos/distribucion/entidades').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([d, ents]: [RespuestaDistribucion, EntidadDistribucion[]]) => {
        setProyectos(d.proyectos ?? []);
        setEntidades(ents ?? []);
      })
      .catch(() => toast('No se pudo cargar la distribución.', 'error'))
      .finally(() => setCargando(false));
  }
  useEffect(recargar, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageShell width="narrow">
      <PageHeader
        title="Distribución por proyecto"
        subtitle="Reparto del precio interno del lote entre entidades. Las tarifas se versionan por fecha de vigencia — cada cambio crea una nueva vigencia o edita la vigente."
      />

      <div className="divide-y divide-ds-gray-100 rounded-ds border border-ds-gray-200 bg-ds-surface">
        {cargando && <p className="px-3 py-6 text-center text-ds-gray-400">Cargando proyectos…</p>}
        {!cargando && proyectos.length === 0 && (
          <p className="px-3 py-6 text-center text-ds-gray-400">Sin proyectos con ventas activas.</p>
        )}
        {!cargando && proyectos.map((p) => {
          const cfg = p.ConfigVigente;
          return (
            <button
              key={p.IDProyecto}
              type="button"
              onClick={() => setSel(p)}
              className="flex w-full items-center gap-4 px-4 py-4 text-left transition hover:bg-ds-gray-100"
            >
              <div className="flex w-32 items-center gap-2">
                {p.ColorHex && <span className="h-8 w-1 rounded-full" style={{ backgroundColor: p.ColorHex }} />}
                <div>
                  <div className="font-semibold">{p.AbreviaturaProyecto}</div>
                  <div className="text-xs text-ds-gray-400">{p.NombreProyecto}</div>
                </div>
              </div>
              <div className="flex-1">
                {cfg ? (
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    {cfg.Entidades.map((e) => (
                      <span key={e.Codigo} className="tabular-nums text-ds-gray-500">
                        <strong className="text-ds-ink">{e.Codigo}</strong> {e.Porcentaje}%
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-sm italic text-ds-gray-400">Sin configuración — click para crear la primera</span>
                )}
              </div>
              <div className="text-right text-sm tabular-nums">
                {cfg ? (
                  <>
                    <div>${cfg.PrecioInternoM2.toFixed(2)} <span className="text-xs text-ds-gray-400">/m²</span></div>
                    <div className="text-[10px] uppercase text-ds-gray-400">Vigente {cfg.VigenteDesde}</div>
                  </>
                ) : '—'}
              </div>
            </button>
          );
        })}
      </div>

      {sel && (
        <PanelDistribucion
          proyecto={sel}
          entidades={entidades}
          onClose={() => setSel(null)}
          onGuardado={() => { setSel(null); recargar(); }}
        />
      )}
    </PageShell>
  );
}

interface FilaEntidad {
  IDEntidad: number;
  Porcentaje: string;
}

function PanelDistribucion({
  proyecto,
  entidades,
  onClose,
  onGuardado,
}: {
  proyecto: DistribucionProyectoResumen;
  entidades: EntidadDistribucion[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  const { toast } = useToast();
  const cfg = proyecto.ConfigVigente;
  const [modo, setModo] = useState<'editar' | 'nueva'>(cfg ? 'editar' : 'nueva');
  const [precio, setPrecio] = useState(cfg ? String(cfg.PrecioInternoM2) : '');
  const [vigenteDesde, setVigenteDesde] = useState('');
  const [notas, setNotas] = useState(cfg?.Notas ?? '');
  const [guardando, setGuardando] = useState(false);

  // Mapear entidades vigentes por código para prellenar IDEntidad.
  const codToId = new Map(entidades.map((e) => [e.Codigo, e.IDEntidad]));
  const [filas, setFilas] = useState<FilaEntidad[]>(
    cfg && cfg.Entidades.length
      ? cfg.Entidades.map((e) => ({ IDEntidad: e.IDEntidad || codToId.get(e.Codigo) || 0, Porcentaje: String(e.Porcentaje) }))
      : [{ IDEntidad: entidades[0]?.IDEntidad ?? 0, Porcentaje: '' }],
  );

  const suma = filas.reduce((a, f) => a + (Number(f.Porcentaje) || 0), 0);
  const sumaOk = Math.abs(suma - 100) < 0.001;

  function setFila(i: number, patch: Partial<FilaEntidad>) {
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function agregar() {
    const usados = new Set(filas.map((f) => f.IDEntidad));
    const libre = entidades.find((e) => !usados.has(e.IDEntidad));
    setFilas((prev) => [...prev, { IDEntidad: libre?.IDEntidad ?? 0, Porcentaje: '' }]);
  }
  function quitar(i: number) {
    setFilas((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function guardar() {
    if (!sumaOk) { toast(`La suma debe ser 100 (va ${suma}).`, 'error'); return; }
    if (!precio || Number(precio) <= 0) { toast('El precio por m² debe ser mayor a 0.', 'error'); return; }
    if (modo === 'nueva' && !/^\d{4}-\d{2}-\d{2}$/.test(vigenteDesde)) {
      toast('Ingresá la fecha de vigencia (YYYY-MM-DD).', 'error'); return;
    }
    const Entidades = filas.map((f) => ({ IDEntidad: f.IDEntidad, Porcentaje: Number(f.Porcentaje) }));
    setGuardando(true);
    try {
      const r = modo === 'nueva'
        ? await fetch('/api/desembolsos/distribucion', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ IDProyecto: proyecto.IDProyecto, PrecioInternoM2: Number(precio), VigenteDesde: vigenteDesde, Notas: notas || null, Entidades }),
          })
        : await fetch(`/api/desembolsos/distribucion/${proyecto.IDProyecto}/vigente`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ PrecioInternoM2: Number(precio), Notas: notas || null, Entidades }),
          });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
      toast(modo === 'nueva' ? 'Nueva vigencia creada.' : 'Distribución vigente actualizada.', 'success');
      onGuardado();
    } catch (e) {
      toast(`No se pudo guardar: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside className="h-full w-full max-w-md overflow-y-auto bg-ds-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-sub font-bold">{proyecto.AbreviaturaProyecto}</h2>
            <p className="text-xs text-ds-gray-400">{proyecto.NombreProyecto}</p>
          </div>
          <button onClick={onClose} className="text-sub leading-none text-ds-gray-400 hover:text-ds-ink">×</button>
        </div>

        {cfg && (
          <div className="mb-4 flex gap-2">
            <Button size="sm" variant={modo === 'editar' ? 'primary' : 'outline'} onClick={() => setModo('editar')}>Editar vigente</Button>
            <Button size="sm" variant={modo === 'nueva' ? 'primary' : 'outline'} onClick={() => setModo('nueva')}>Nueva vigencia</Button>
          </div>
        )}

        <div className="space-y-4">
          <Input label="Precio interno por m² (USD)" type="number" min={0} step="0.01" required
            value={precio} onChange={(e) => setPrecio(e.target.value)} />
          {modo === 'nueva' && (
            <Input label="Vigente desde" type="date" required value={vigenteDesde}
              onChange={(e) => setVigenteDesde(e.target.value)} />
          )}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium">Entidades</span>
              <span className={`text-sm tabular-nums ${sumaOk ? 'text-ds-green-ink' : 'text-ds-red'}`}>Suma {suma}%</span>
            </div>
            <div className="space-y-2">
              {filas.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={f.IDEntidad}
                    onChange={(e) => setFila(i, { IDEntidad: Number(e.target.value) })}
                    className="h-10 flex-1 rounded-ds-xl border-2 border-transparent bg-ds-surface px-3 text-sm shadow-ds-01 focus:border-black focus:outline-none"
                  >
                    {entidades.map((e) => (
                      <option key={e.IDEntidad} value={e.IDEntidad}>{e.Codigo} — {e.Nombre}</option>
                    ))}
                  </select>
                  <input type="number" min={0} max={100} step="0.01" value={f.Porcentaje}
                    onChange={(e) => setFila(i, { Porcentaje: e.target.value })} placeholder="%"
                    className="h-10 w-24 rounded-ds-xl border-2 border-transparent bg-ds-surface px-3 text-right text-sm tabular-nums shadow-ds-01 focus:border-black focus:outline-none" />
                  <button type="button" onClick={() => quitar(i)} className="px-2 text-ds-gray-400 hover:text-ds-red" title="Quitar">×</button>
                </div>
              ))}
            </div>
            <Button size="xs" variant="ghost" className="mt-2" onClick={agregar}>+ Agregar entidad</Button>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Notas (opcional)</span>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} maxLength={500}
              className="w-full rounded-ds-xl border-2 border-transparent bg-ds-surface px-4 py-2 text-sm shadow-ds-01 focus:border-black focus:outline-none" />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={guardar} loading={guardando} disabled={!sumaOk}>
            {modo === 'nueva' ? 'Crear vigencia' : 'Guardar'}
          </Button>
        </div>
      </aside>
    </div>
  );
}
