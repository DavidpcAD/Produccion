'use client';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { Icon } from '@/components/ds/Icon/Icon';
import { ESTADO_COLADA } from '@/lib/concreto/estados';
import type { ColadaDetalle } from '@/lib/concreto/tipos';

function fmtFecha(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function fmtDia(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function num(n: number | null, dec = 2): string {
  return n === null ? '—' : Number(n).toFixed(dec);
}

function Dato({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-semibold text-ds-gray-400">{label}</p>
      <p className="text-sm font-semibold text-black">{value}</p>
    </div>
  );
}

export default function ColadaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<ColadaDetalle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/concreto/coladas/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setData(d))
      .catch(() => toast('No se pudo cargar la colada', 'error'))
      .finally(() => setLoading(false));
  }, [id, toast]);

  if (loading) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" rounded="rounded-ds-lg" />
        <Skeleton className="h-64 w-full" rounded="rounded-ds-lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <Button variant="outline" onClick={() => router.push('/concreto')} icon={<Icon name="back" size="sm" color="currentColor" />}>
          Volver
        </Button>
        <p className="mt-6 text-ds-gray-400">Colada no encontrada.</p>
      </div>
    );
  }

  const c = data.colada;
  const estadoCfg = ESTADO_COLADA[c.estado];

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5 animate-fade-in">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => router.push('/concreto')} icon={<Icon name="back" size="sm" color="currentColor" />}>
          Volver
        </Button>
        <h1 className="text-heading font-bold text-black">Colada #{c.codigo_interno}</h1>
        <Badge variant={estadoCfg.variant} dot>{estadoCfg.label}</Badge>
        {c.tuvo_alarma && <Badge variant="red" dot>{c.cantidad_alarmas_total} alarma(s)</Badge>}
      </div>

      {c.estado === 'anulada' && c.motivo_anulacion && (
        <div className="rounded-ds-lg border border-ds-red/50 bg-ds-red/10 px-4 py-3 text-sm text-black flex items-start gap-2.5">
          <Icon name="alert" size="sm" color="currentColor" className="text-ds-red mt-0.5 shrink-0" />
          <span><span className="font-semibold">Colada anulada:</span> {c.motivo_anulacion}</span>
        </div>
      )}

      {/* Header de la colada */}
      <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
          <Dato label="Planta" value={`${c.planta_nombre} · ${c.planta_serial}`} />
          <Dato label="Receta Blend" value={c.receta_blend_nombre} />
          <Dato label="Receta BC" value={c.codigo_receta_bc ? `${c.codigo_receta_bc}${c.descripcion_receta_bc ? ` · ${c.descripcion_receta_bc}` : ''}` : 'Sin mapear'} />
          <Dato label="Destino" value={c.destino_display || '—'} />
          <Dato label="Obra" value={c.obra_works_no ? `${c.obra_works_no}${c.obra_display_name ? ` · ${c.obra_display_name}` : ''}` : '—'} />
          <Dato label="Inicio" value={fmtFecha(c.fecha_inicio)} />
          <Dato label="Fin" value={fmtFecha(c.fecha_fin)} />
          <Dato label="m³ producidos" value={num(c.m3_producidos)} />
          <Dato label="Batches" value={c.cantidad_batches} />
          <Dato label="Relación A/C prom." value={num(c.relacion_agua_cemento_promedio, 3)} />
          <Dato label="f'c teórica" value={c.fc_teorica_kg_cm2 !== null ? `${num(c.fc_teorica_kg_cm2)} kg/cm²` : '—'} />
          <Dato label="Pedido BC" value={c.numero_pedido_ensamblado_bc || '—'} />
        </div>
      </div>

      {/* TODO(concreto): líneas del Pedido de Ensamblado BC (mapeo de materiales
          + conversión de unidades) y acciones de workflow (confirmar/digitar/
          cerrar/anular) — dependen del cliente BC (diferido). */}

      {/* Batches */}
      <section className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 overflow-hidden">
        <div className="px-5 py-3 bg-ds-gray-100 border-b border-ds-gray-200 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-ds bg-black flex items-center justify-center shrink-0">
            <Icon name="list" size="sm" color="currentColor" className="text-brand" />
          </div>
          <h2 className="font-bold text-black text-sm">Batches ({data.batches.length})</h2>
        </div>
        {data.batches.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ds-gray-400 text-center">Sin batches asociados</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-ds-gray-400 border-b border-ds-gray-100">
                  <th className="px-4 py-2.5">Record</th>
                  <th className="px-4 py-2.5">Fecha</th>
                  <th className="px-4 py-2.5 text-right">m³</th>
                  <th className="px-4 py-2.5 text-right">A/C</th>
                  <th className="px-4 py-2.5">Alarmas</th>
                  <th className="px-4 py-2.5">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ds-gray-100">
                {data.batches.map((b) => (
                  <tr key={b.id_batch} className={b.excluido ? 'opacity-50' : ''}>
                    <td className="px-4 py-2.5 font-semibold text-black">{b.record_no}</td>
                    <td className="px-4 py-2.5 text-ds-gray-500">{fmtFecha(b.fecha_inicio)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{num(b.m3_producidos, 3)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{num(b.ac_real, 3)}</td>
                    <td className="px-4 py-2.5">
                      {b.tuvo_alarma ? <Badge variant="red" dot>{b.cantidad_alarmas}</Badge> : <span className="text-ds-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {b.excluido ? (
                        <Badge variant="gray" dot>Excluido{b.excluido_motivo ? ` · ${b.excluido_motivo}` : ''}</Badge>
                      ) : (
                        <Badge variant="green" dot>Incluido</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Cilindros (laboratorio de campo de la colada) */}
      <section className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 overflow-hidden">
        <div className="px-5 py-3 bg-ds-gray-100 border-b border-ds-gray-200 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-ds bg-black flex items-center justify-center shrink-0">
            <Icon name="boleta" size="sm" color="currentColor" className="text-brand" />
          </div>
          <h2 className="font-bold text-black text-sm">Cilindros ({data.cilindros.length})</h2>
        </div>
        {data.cilindros.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ds-gray-400 text-center">Sin cilindros registrados</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-ds-gray-400 border-b border-ds-gray-100">
                  <th className="px-4 py-2.5">Serie</th>
                  <th className="px-4 py-2.5">Toma</th>
                  <th className="px-4 py-2.5 text-right">Slump (cm)</th>
                  <th className="px-4 py-2.5">Ensayo 7d</th>
                  <th className="px-4 py-2.5 text-right">7d (kg/cm²)</th>
                  <th className="px-4 py-2.5">Ensayo 28d</th>
                  <th className="px-4 py-2.5 text-right">28d (kg/cm²)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ds-gray-100">
                {data.cilindros.map((cil) => (
                  <tr key={cil.id_cilindro}>
                    <td className="px-4 py-2.5 font-semibold text-black">{cil.numero_serie}</td>
                    <td className="px-4 py-2.5 text-ds-gray-500">{fmtDia(cil.fecha_toma)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{num(cil.slump_cm)}</td>
                    <td className="px-4 py-2.5 text-ds-gray-500">{fmtDia(cil.fecha_ensayo_7d)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{num(cil.resistencia_7d_kg_cm2)}</td>
                    <td className="px-4 py-2.5 text-ds-gray-500">{fmtDia(cil.fecha_ensayo_28d)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{num(cil.resistencia_28d_kg_cm2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
