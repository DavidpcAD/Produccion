'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { useSession } from '@/hooks/useSession';
import { Icon } from '@/components/ds/Icon/Icon';
import { formatCRC } from '@/lib/utilidades/format';

interface Partida {
  partida: string;
  nombre: string;
  oc_pct: number | null;
  bc_pct: number;
  delta: number | null;
  monto_a_registrar: number;
  se_reportaria: boolean;
}
interface Preview {
  obra: string;
  registrar_disponible: boolean;
  partidas: Partida[];
  total_a_registrar: number;
  monto_registrado: number;
  n_cambios: number;
  ya_registrado: boolean;
  produccion_inicializada: boolean;
}

export default function DetalleBcPage() {
  const params = useParams<{ obra: string }>();
  const obra = decodeURIComponent(params.obra ?? '');
  const search = useSearchParams();
  const fecha = search.get('fecha') ?? '';
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const session = useSession();
  const puedeEscribir = (session?.nivelAdmin ?? 0) >= 4;

  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'reportar' | 'registrar' | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bc/preview?obra=${encodeURIComponent(obra)}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar');
      setPreview(data);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al cargar', 'error');
    } finally {
      setLoading(false);
    }
  }, [obra, toast]);

  useEffect(() => {
    if (obra) cargar();
  }, [obra, cargar]);

  async function reportar() {
    if (!preview) return;
    const ok = await confirm({
      title: 'Reportar avance a BC',
      message: `Se escribirá el % de avance de ${preview.n_cambios} partida(s) de ${obra} en Business Central. Esta acción solo sube (BC no baja).`,
      confirmLabel: 'Reportar',
    });
    if (!ok) return;
    setBusy('reportar');
    try {
      const res = await fetch('/api/bc/reportar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ obra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo reportar');
      const r: { ok: boolean }[] = data.resultados ?? [];
      const okN = r.filter((x) => x.ok).length;
      const fail = r.length - okN;
      toast(`Reportadas ${okN} partida(s) en BC${fail ? `, ${fail} con error` : ''}`, fail ? 'warning' : 'success');
      await cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al reportar', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function registrar() {
    if (!preview) return;
    const ok = await confirm({
      title: 'Registrar (postear) en BC',
      message: `Se registrará la producción pendiente de ${obra} en BC con fecha ${fecha || 'hoy'}.`,
      confirmLabel: 'Registrar',
    });
    if (!ok) return;
    setBusy('registrar');
    try {
      const res = await fetch('/api/bc/registrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ obra, fecha: fecha || new Date().toISOString().slice(0, 10) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo registrar');
      toast(`Obra ${obra} registrada en BC`, 'success');
      await cargar();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al registrar', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageShell>
      <PageHeader
        back={
          <Button variant="ghost" size="sm" onClick={() => router.push('/bc/integracion')} icon={<Icon name="back" size="sm" color="currentColor" />}>
            Obras
          </Button>
        }
        title={`Detalle BC · ${obra}`}
        subtitle="Avance de ObrasControl vs Business Central por partida."
      />

      {loading && <p className="text-body-sm text-ds-gray-400">Cargando…</p>}

      {!loading && preview && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-4 shadow-ds-01">
            <div className="text-body-sm">
              {!preview.produccion_inicializada ? (
                <span className="font-medium text-ds-red">
                  Producción no inicializada en BC — primero “Importar avance de Excel”
                </span>
              ) : preview.ya_registrado ? (
                <span className="font-medium text-ds-green-ink">Al día — nada nuevo que reportar</span>
              ) : (
                <span className="text-ds-ink">
                  <span className="font-semibold">{preview.n_cambios}</span> partida(s) a reportar · monto a registrar:{' '}
                  <span className="font-semibold">{formatCRC(preview.total_a_registrar)}</span>
                </span>
              )}
            </div>
            {puedeEscribir && (
              <div className="flex gap-2">
                <Button
                  onClick={reportar}
                  loading={busy === 'reportar'}
                  disabled={busy !== null || preview.ya_registrado || !preview.produccion_inicializada}
                >
                  {`Reportar (${preview.n_cambios})`}
                </Button>
                <Button
                  variant="secondary"
                  onClick={registrar}
                  loading={busy === 'registrar'}
                  disabled={busy !== null || !preview.registrar_disponible}
                  title={preview.registrar_disponible ? 'Postea la producción en BC' : 'Pendiente: el partner de BC debe publicar el web service de Registrar'}
                >
                  Registrar
                </Button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-ds-lg border border-ds-gray-200 bg-ds-surface shadow-ds-01">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="border-b border-ds-gray-200 bg-ds-gray-100 text-label uppercase tracking-wide text-ds-gray-500">
                  <th className="px-4 py-3 text-left">Partida</th>
                  <th className="px-4 py-3 text-left">Descripción</th>
                  <th className="px-4 py-3 text-right">OC %</th>
                  <th className="px-4 py-3 text-right">BC %</th>
                  <th className="px-4 py-3 text-right">Δ</th>
                  <th className="px-4 py-3 text-right">Monto a registrar</th>
                </tr>
              </thead>
              <tbody>
                {preview.partidas.map((p) => (
                  <tr key={p.partida} className={`border-b border-ds-gray-100 last:border-0 ${p.se_reportaria ? 'bg-ds-yellow/10' : ''}`}>
                    <td className="px-4 py-3 font-mono text-ds-ink">{p.partida}</td>
                    <td className="px-4 py-3 text-ds-ink">{p.nombre}</td>
                    <td className="px-4 py-3 text-right text-ds-ink">{p.oc_pct == null ? '—' : p.oc_pct.toFixed(1)}</td>
                    <td className="px-4 py-3 text-right text-ds-ink">{p.bc_pct.toFixed(1)}</td>
                    <td className={`px-4 py-3 text-right ${p.se_reportaria ? 'font-semibold text-ds-yellow-ink' : 'text-ds-gray-400'}`}>
                      {p.delta == null ? '—' : `${p.delta >= 0 ? '+' : ''}${p.delta.toFixed(1)}`}
                    </td>
                    <td className="px-4 py-3 text-right text-ds-ink">
                      {p.monto_a_registrar > 0 ? formatCRC(p.monto_a_registrar) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!preview.registrar_disponible && (
            <p className="text-body-sm text-ds-gray-400">
              “Registrar” se habilita cuando el partner de BC publique el web service (ver{' '}
              <code className="rounded bg-ds-gray-100 px-1">docs/integracion-bc-registrar.md</code>). Por ahora podés Reportar y registrar a mano en BC.
            </p>
          )}
        </>
      )}
    </PageShell>
  );
}
