'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import type { SemanaOperativaDetalle } from '@/lib/avance/sprints';

/** ISO 8601: nº de semana + año de una fecha (YYYY-MM-DD). */
function isoSemana(fecha: string): { anio: number; numero: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const day = d.getUTCDay() || 7; // lunes=1 … domingo=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // jueves de esa semana
  const anio = d.getUTCFullYear();
  const enero1 = new Date(Date.UTC(anio, 0, 1));
  const numero = Math.ceil(((d.getTime() - enero1.getTime()) / 86400000 + 1) / 7);
  return { anio, numero };
}

/** Suma días a una fecha YYYY-MM-DD (devuelve YYYY-MM-DD). */
function sumarDias(fecha: string, dias: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return fecha;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Próximo jueves (YYYY-MM-DD) desde hoy; si hoy es jueves, hoy. */
function proximoJueves(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const add = (4 - d.getUTCDay() + 7) % 7; // 4 = jueves
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}

/**
 * Valores por defecto de la próxima semana operativa (Jueves → Miércoles). La
 * semana operativa de Adelante corre de jueves a miércoles y se numera de forma
 * secuencial, así que el default se calcula a partir de la ÚLTIMA semana
 * registrada (fin + 1 día = jueves; nº + 1). Si no hay semanas, cae al próximo
 * jueves con nº ISO.
 */
function defaultsSemana(
  semanas: { fecha_fin: string; numero_semana: number; anio: number }[],
): { inicio: string; fin: string; anio: string; numero: string } {
  const ref = semanas[0]; // la API devuelve ORDER BY fecha_inicio DESC → la más reciente
  let inicio: string;
  let numero: number | '';
  let anio: number;
  if (ref && RE_FECHA.test(ref.fecha_fin)) {
    inicio = sumarDias(ref.fecha_fin, 1); // jueves siguiente al miércoles de cierre
    anio = Number(inicio.slice(0, 4));
    numero = anio !== ref.anio ? 1 : ref.numero_semana + 1; // reinicia al cambiar de año
  } else {
    inicio = proximoJueves();
    const iso = isoSemana(inicio);
    anio = iso?.anio ?? Number(inicio.slice(0, 4));
    numero = iso?.numero ?? '';
  }
  return { inicio, fin: sumarDias(inicio, 6), anio: String(anio), numero: String(numero) };
}

/**
 * Gestión de semanas operativas (Programación): abre una nueva semana (auto-fija
 * su línea base), edita los días efectivos de la abierta y permite re-fijar su
 * línea base. Vive en el Kanban de Avance (antes estaba en la config de Sprints).
 */
export function SemanasOperativas() {
  const { toast } = useToast();
  const [semanas, setSemanas] = useState<SemanaOperativaDetalle[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  // Formulario de nueva semana.
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [anio, setAnio] = useState('');
  const [numero, setNumero] = useState('');
  const [dias, setDias] = useState('5');
  const [desc, setDesc] = useState('');

  const recargar = useCallback(() => {
    setCargando(true);
    fetch('/api/avance/semanas')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('No autorizado'))))
      .then((d) => setSemanas((d.semanas as SemanaOperativaDetalle[]) ?? []))
      .catch(() => toast('No se pudieron cargar las semanas.', 'error'))
      .finally(() => setCargando(false));
  }, [toast]);
  useEffect(() => recargar(), [recargar]);

  const abierta = semanas.find((s) => s.estado === 'abierta') ?? null;

  // Prefill de la próxima semana (Jueves → Miércoles + año + nº) una vez cargadas
  // las semanas, si el formulario está vacío. Se recalcula al recargar si el
  // usuario no tocó nada (p. ej. tras abrir/cerrar una semana).
  const prellenado = useRef(false);
  useEffect(() => {
    if (cargando || prellenado.current) return;
    if (!inicio) {
      const d = defaultsSemana(semanas);
      setInicio(d.inicio);
      setFin(d.fin);
      setAnio(d.anio);
      setNumero(d.numero);
    }
    prellenado.current = true;
  }, [cargando, semanas, inicio]);

  // Al cambiar la fecha de inicio, autocompleta fin (+6) y año; conserva el nº
  // secuencial ya prellenado (solo lo deriva por ISO si estuviera vacío).
  function onInicio(v: string) {
    setInicio(v);
    if (RE_FECHA.test(v)) {
      setFin(sumarDias(v, 6));
      setAnio(String(Number(v.slice(0, 4))));
      if (!numero) {
        const iso = isoSemana(v);
        if (iso) setNumero(String(iso.numero));
      }
    }
  }

  async function abrir() {
    if (abierta) {
      return toast('Ya hay una semana abierta. Cerrala antes de abrir otra.', 'error');
    }
    if (!RE_FECHA.test(inicio) || !RE_FECHA.test(fin)) {
      return toast('Indicá fecha de inicio y fin (YYYY-MM-DD).', 'error');
    }
    const nd = Number(dias);
    if (!Number.isInteger(nd) || nd < 1 || nd > 7) {
      return toast('Días efectivos debe ser un entero entre 1 y 7.', 'error');
    }
    setGuardando(true);
    try {
      const r = await fetch('/api/avance/semanas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anio: Number(anio) || 0,
          numero_semana: Number(numero) || 0,
          fecha_inicio: inicio,
          fecha_fin: fin,
          dias_efectivos: Number(dias) || 5,
          descripcion: desc.trim() || null,
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
      toast('Semana abierta y línea base fijada.', 'success');
      setInicio('');
      setFin('');
      setAnio('');
      setNumero('');
      setDias('5');
      setDesc('');
      prellenado.current = false; // que el prefill recalcule la próxima semana
      recargar();
    } catch (e) {
      toast(`No se pudo abrir: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function reFijarBase(id: number) {
    try {
      const r = await fetch(`/api/avance/semanas/${id}/linea-base`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || 'Error');
      toast(`Línea base re-fijada (${d.fijadas}/${d.total_obras} obras).`, 'success');
    } catch (e) {
      toast(`No se pudo re-fijar: ${e instanceof Error ? e.message : e}`, 'error');
    }
  }

  async function guardarDias(id: number, nuevo: number) {
    try {
      const r = await fetch(`/api/avance/semanas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dias_efectivos: nuevo }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
      setSemanas((xs) => xs.map((s) => (s.id === id ? { ...s, dias_efectivos: nuevo } : s)));
      toast('Días efectivos actualizados.', 'success');
    } catch (e) {
      toast(`No se pudo actualizar: ${e instanceof Error ? e.message : e}`, 'error');
    }
  }

  return (
    <section>
      <h2 className="mb-1 text-sub-sm font-bold">Semanas operativas</h2>
      <p className="mb-4 text-sm text-ds-gray-500">
        La semana corre de <strong>jueves a miércoles</strong>. Solo una puede estar{' '}
        <strong>abierta</strong> a la vez: hay que cerrar la anterior antes de abrir otra. Abrir una
        fija la línea base (foto del avance) para medir el logrado desde ahí.
      </p>

      {/* Abrir nueva semana */}
      <div className="mb-6 rounded-ds border border-ds-gray-200 p-4">
        <h3 className="mb-3 text-label font-semibold">Abrir nueva semana</h3>
        {abierta && (
          <p className="mb-3 rounded-ds bg-ds-yellow/10 px-3 py-2 text-xs text-ds-yellow-ink">
            Hay una semana abierta (Semana {abierta.numero_semana}/{abierta.anio}). Debe cerrarse
            antes de abrir otra.
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input
            label="Fecha inicio (jueves)"
            type="date"
            value={inicio}
            onChange={(e) => onInicio(e.target.value)}
          />
          <Input label="Fecha fin" type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
          <Input
            label="Días efectivos"
            type="number"
            min={1}
            max={7}
            value={dias}
            onChange={(e) => setDias(e.target.value)}
          />
          <Input
            label="Año"
            type="number"
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
          />
          <Input
            label="Nº de semana"
            type="number"
            min={1}
            max={53}
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
          />
          <Input
            label="Descripción (opcional)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
        </div>
        <div className="mt-4">
          <Button onClick={abrir} loading={guardando} disabled={!!abierta}>
            Abrir semana
          </Button>
        </div>
      </div>

      {/* Listado */}
      <div className="overflow-x-auto rounded-ds border border-ds-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-ds-gray-100 text-left">
            <tr>
              <th className="px-3 py-2">Semana</th>
              <th className="px-3 py-2">Rango</th>
              <th className="px-3 py-2 text-center">Estado</th>
              <th className="px-3 py-2 text-center">Días efect.</th>
              <th className="px-3 py-2">Descripción</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center">
                  <Skeleton className="h-4 w-48 mx-auto" rounded="rounded-full" />
                </td>
              </tr>
            )}
            {!cargando && semanas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-ds-gray-400">
                  Sin semanas operativas.
                </td>
              </tr>
            )}
            {!cargando &&
              semanas.map((s) => {
                const esAbierta = s.estado === 'abierta';
                return (
                  <tr key={s.id} className="border-t border-ds-gray-100">
                    <td className="px-3 py-2 font-mono text-xs">
                      S{s.numero_semana}/{s.anio}
                    </td>
                    <td className="px-3 py-2 text-ds-gray-500">
                      {s.fecha_inicio} → {s.fecha_fin}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`rounded-ds px-2 py-0.5 text-xs font-semibold ${
                          esAbierta ? 'bg-brand/20 text-brand-dark' : 'bg-ds-gray-100 text-ds-gray-500'
                        }`}
                      >
                        {s.estado}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {esAbierta ? (
                        <Select
                          value={String(s.dias_efectivos)}
                          onChange={(e) => guardarDias(s.id, Number(e.target.value))}
                          options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({
                            value: String(n),
                            label: String(n),
                          }))}
                          className="w-16"
                        />
                      ) : (
                        <span className="tabular-nums">{s.dias_efectivos}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ds-gray-500">{s.descripcion ?? '—'}</td>
                    <td className="px-3 py-2 text-right">
                      {esAbierta ? (
                        <Button size="sm" variant="outline" onClick={() => reFijarBase(s.id)}>
                          Re-fijar línea base
                        </Button>
                      ) : (
                        <span className="text-xs text-ds-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
