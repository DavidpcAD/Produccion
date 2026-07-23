'use client';
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { Icon } from '@/components/ds/Icon/Icon';
import type { MuestraDetalle } from '@/lib/concreto/tipos';

function fmtDia(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function Dato({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-semibold text-ds-gray-400">{label}</p>
      <p className="text-sm font-semibold text-black">{value}</p>
    </div>
  );
}

export default function MuestraDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<MuestraDetalle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/concreto/lab/muestras/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setData(d))
      .catch(() => toast('No se pudo cargar la muestra', 'error'))
      .finally(() => setLoading(false));
  }, [id, toast]);

  if (loading) {
    return (
      <div className="p-6 max-w-[1200px] mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" rounded="rounded-ds-lg" />
        <Skeleton className="h-64 w-full" rounded="rounded-ds-lg" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 max-w-[1200px] mx-auto">
        <Button variant="outline" onClick={() => router.push('/concreto/laboratorio')} icon={<Icon name="back" size="sm" color="currentColor" />}>
          Volver
        </Button>
        <p className="mt-6 text-ds-gray-400">Muestra no encontrada.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-5 animate-fade-in">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => router.push('/concreto/laboratorio')} icon={<Icon name="back" size="sm" color="currentColor" />}>
          Volver
        </Button>
        <h1 className="text-heading font-bold text-black">Muestra #{data.numero_muestra}</h1>
        <Badge variant="gray">{data.actividad_nombre}</Badge>
      </div>

      {/* Header */}
      <div className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
          <Dato label="Obra" value={data.obra_works_no ? `${data.obra_works_no}${data.obra_display_name ? ` · ${data.obra_display_name}` : ''}` : '—'} />
          <Dato label="Casa" value={data.id_casa || '—'} />
          <Dato label="Actividad" value={data.actividad_nombre} />
          <Dato label="Colado" value={fmtDia(data.fecha_colado)} />
          <Dato label="Proveedor" value={data.proveedor} />
          <Dato label="Tipo de concreto" value={data.tipo_concreto_display} />
          <Dato label="f'c objetivo" value={`${data.fc_objetivo} kg/cm²`} />
          <Dato label="Colada" value={data.codigo_interno_colada ? `#${data.codigo_interno_colada}` : '—'} />
          <Dato label="Planta" value={data.planta_nombre || '—'} />
        </div>
        {data.notas && (
          <div className="mt-4 pt-4 border-t border-ds-gray-100">
            <p className="text-xs font-semibold text-ds-gray-400 mb-1">Notas</p>
            <p className="text-sm text-black whitespace-pre-wrap">{data.notas}</p>
          </div>
        )}
      </div>

      {/* Ensayos + mediciones */}
      <section className="bg-white rounded-ds-lg border border-ds-gray-200 shadow-ds-01 overflow-hidden">
        <div className="px-5 py-3 bg-ds-gray-100 border-b border-ds-gray-200 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-ds bg-black flex items-center justify-center shrink-0">
            <Icon name="boleta" size="sm" color="currentColor" className="text-brand" />
          </div>
          <h2 className="font-bold text-black text-sm">Ensayos ({data.ensayos_detalle.length})</h2>
        </div>
        {data.ensayos_detalle.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ds-gray-400 text-center">Sin ensayos registrados</p>
        ) : (
          <div className="divide-y divide-ds-gray-100">
            {data.ensayos_detalle.map((e) => {
              const cumple =
                e.resistencia_kg_cm2_promedio !== null && e.resistencia_kg_cm2_promedio >= data.fc_objetivo;
              return (
                <div key={e.id} className="px-5 py-3.5">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-bold text-black w-16">{e.edad_dias} días</span>
                    <span className="text-xs text-ds-gray-400">{fmtDia(e.fecha_prueba)}</span>
                    {e.resistencia_kg_cm2_promedio !== null ? (
                      <Badge variant={cumple ? 'green' : 'red'} dot>
                        {e.resistencia_kg_cm2_promedio.toFixed(1)} kg/cm² ({e.resistencia_mpa_promedio?.toFixed(1)} MPa)
                      </Badge>
                    ) : (
                      <Badge variant="gray">Planificado</Badge>
                    )}
                    <span className="text-xs text-ds-gray-400 ml-auto">{e.cantidad_mediciones} probeta(s)</span>
                  </div>
                  {e.mediciones.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 pl-16">
                      {e.mediciones.map((m) => (
                        <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-ds-gray-100 text-ds-gray-500 text-xs font-semibold px-2.5 py-1">
                          Probeta {m.orden}: {(m.resistencia_mpa * 10.197).toFixed(1)} kg/cm²
                        </span>
                      ))}
                    </div>
                  )}
                  {e.notas && <p className="text-xs text-ds-gray-400 mt-1.5 pl-16">{e.notas}</p>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* TODO(concreto): esclerómetro (rebotes) y fotos de la muestra (Azure
          Blob) — diferidos en esta migración. */}
    </div>
  );
}
