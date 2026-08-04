'use client';
import { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Combobox, type ComboOption } from '@/components/ui/Combobox';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { useSession } from '@/hooks/useSession';
import { Icon } from '@/components/ds/Icon/Icon';
import { ESTADO_COLADA } from '@/lib/concreto/estados';
import type { ColadaDetalle } from '@/lib/concreto/tipos';
import type { Obra } from '@/lib/concreto/tipos-workflow';

// Línea del Pedido de Ensamblado BC (preview). El endpoint pedido-bc lo
// implementa otro agente; definimos el tipo local para no acoplarnos.
interface LineaPedidoBc {
  descripcion: string;
  cantidad: number;
  unidad: string;
  codigo_recurso_bc?: string;
}

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
      <p className="text-sm font-semibold text-ds-ink">{value}</p>
    </div>
  );
}

export default function ColadaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const session = useSession();
  const esAdmin = (session?.nivelAdmin ?? 0) >= 4;

  const [data, setData] = useState<ColadaDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  // Acción en curso (url del fetch) para deshabilitar botones.
  const [busy, setBusy] = useState<string | null>(null);

  // Modales.
  const [modalDigitar, setModalDigitar] = useState(false);
  const [numPedido, setNumPedido] = useState('');
  const [modalAnular, setModalAnular] = useState(false);
  const [motivoAnular, setMotivoAnular] = useState('');
  const [modalExcluir, setModalExcluir] = useState<number | null>(null); // idBatch
  const [motivoExcluir, setMotivoExcluir] = useState('');
  const [modalObra, setModalObra] = useState(false);
  const [obras, setObras] = useState<Obra[]>([]);
  const [obrasCargando, setObrasCargando] = useState(false);
  const [obraSel, setObraSel] = useState('');
  const [modalPedidoBc, setModalPedidoBc] = useState(false);
  const [pedidoLineas, setPedidoLineas] = useState<LineaPedidoBc[] | null>(null);
  const [pedidoCargando, setPedidoCargando] = useState(false);

  const cargar = useCallback(() => {
    setLoading(true);
    return fetch(`/api/concreto/coladas/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setData(d))
      .catch(() => toast('No se pudo cargar la colada', 'error'))
      .finally(() => setLoading(false));
  }, [id, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  // Ejecuta una acción POST. Todos los endpoints devuelven el detalle
  // actualizado → lo seteamos directo (sin recargar).
  async function runAction(url: string, okMsg: string, body?: unknown): Promise<boolean> {
    setBusy(url);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(d?.error || 'No se pudo completar la acción', 'error');
        return false;
      }
      setData(d);
      toast(okMsg, 'success');
      return true;
    } catch {
      toast('Error de red', 'error');
      return false;
    } finally {
      setBusy(null);
    }
  }

  // ─── Handlers de workflow ─────────────────────────────────────────────
  const base = `/api/concreto/coladas/${id}`;

  async function onConfirmar() { await runAction(`${base}/confirmar`, 'Colada confirmada'); }
  async function onDesconfirmar() { await runAction(`${base}/desconfirmar`, 'Colada devuelta a sugerida'); }
  async function onDesmarcarDigitada() { await runAction(`${base}/desmarcar-digitada`, 'Digitación revertida'); }
  async function onDesanular() { await runAction(`${base}/desanular`, 'Colada desanulada'); }

  async function onCerrar() {
    if (!(await confirm({ title: 'Cerrar colada', message: '¿Cerrar la colada? Es un estado final.', confirmLabel: 'Cerrar' }))) return;
    await runAction(`${base}/cerrar`, 'Colada cerrada');
  }

  async function onMarcarDigitada() {
    const n = numPedido.trim();
    if (!n) { toast('Ingresá el N° de Pedido BC', 'error'); return; }
    const ok = await runAction(`${base}/marcar-digitada`, 'Colada marcada como digitada', { numero_pedido_ensamblado_bc: n });
    if (ok) { setModalDigitar(false); setNumPedido(''); }
  }

  async function onAnular() {
    const m = motivoAnular.trim();
    if (!m) { toast('Ingresá el motivo de anulación', 'error'); return; }
    const ok = await runAction(`${base}/anular`, 'Colada anulada', { motivo_anulacion: m });
    if (ok) { setModalAnular(false); setMotivoAnular(''); }
  }

  async function onExcluirBatch() {
    if (modalExcluir === null) return;
    const m = motivoExcluir.trim();
    if (!m) { toast('Ingresá el motivo de exclusión', 'error'); return; }
    const ok = await runAction(`${base}/excluir-batch/${modalExcluir}`, 'Batch excluido', { motivo: m });
    if (ok) { setModalExcluir(null); setMotivoExcluir(''); }
  }

  async function onRestaurarBatch(idBatch: number) {
    await runAction(`${base}/restaurar-batch/${idBatch}`, 'Batch restaurado');
  }

  // ─── Asignar obra ─────────────────────────────────────────────────────
  function abrirModalObra() {
    setObraSel(data?.colada.obra_works_no ?? '');
    setModalObra(true);
    setObrasCargando(true);
    fetch('/api/concreto/obras')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setObras(d.obras ?? []))
      .catch(() => toast('No se pudieron cargar las obras', 'error'))
      .finally(() => setObrasCargando(false));
  }
  async function onAsignarObra(worksNo: string | null) {
    const ok = await runAction(`${base}/asignar-obra`, worksNo ? 'Obra asignada' : 'Obra quitada', { obra_works_no: worksNo });
    if (ok) setModalObra(false);
  }

  // ─── Crear Pedido BC ──────────────────────────────────────────────────
  function abrirModalPedidoBc() {
    setModalPedidoBc(true);
    setPedidoLineas(null);
    setPedidoCargando(true);
    fetch(`${base}/pedido-bc`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error || 'No se pudo generar la vista previa');
        return d;
      })
      .then((d) => setPedidoLineas(Array.isArray(d?.lineas) ? d.lineas : []))
      .catch((e) => { toast(e instanceof Error ? e.message : 'Error', 'error'); setModalPedidoBc(false); })
      .finally(() => setPedidoCargando(false));
  }
  async function onConfirmarPedidoBc() {
    setBusy(`${base}/pedido-bc`);
    try {
      const res = await fetch(`${base}/pedido-bc`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(d?.error || 'No se pudo crear el pedido BC', 'error');
        return;
      }
      toast(`Pedido BC creado: ${d?.numero_pedido ?? ''}`, 'success');
      setModalPedidoBc(false);
      await cargar();
    } catch {
      toast('Error de red', 'error');
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) {
    return (
      <PageShell width="full" className="max-w-[1400px]">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" rounded="rounded-ds-lg" />
        <Skeleton className="h-64 w-full" rounded="rounded-ds-lg" />
      </PageShell>
    );
  }

  if (!data) {
    return (
      <PageShell width="full" className="max-w-[1400px]">
        <Button variant="outline" onClick={() => router.push('/concreto')} icon={<Icon name="back" size="sm" color="currentColor" />}>
          Volver
        </Button>
        <p className="mt-6 text-ds-gray-400">Colada no encontrada.</p>
      </PageShell>
    );
  }

  const c = data.colada;
  const estadoCfg = ESTADO_COLADA[c.estado];
  const anyBusy = busy !== null;
  // Batches se pueden editar (excluir/restaurar) solo en sugerida/confirmada.
  const batchesEditables = c.estado === 'sugerida' || c.estado === 'confirmada';

  return (
    <PageShell width="full" className="max-w-[1400px]">
      <PageHeader
        back={
          <Button variant="outline" size="sm" onClick={() => router.push('/concreto')} icon={<Icon name="back" size="sm" color="currentColor" />}>
            Volver
          </Button>
        }
        title={
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-heading font-bold text-ds-ink">Colada #{c.codigo_interno}</h1>
            <Badge variant={estadoCfg.variant} dot>{estadoCfg.label}</Badge>
            {c.tuvo_alarma && <Badge variant="red" dot>{c.cantidad_alarmas_total} alarma(s)</Badge>}
          </div>
        }
      />

      {c.estado === 'anulada' && c.motivo_anulacion && (
        <div className="rounded-ds-lg border border-ds-red/50 bg-ds-red/10 px-4 py-3 text-sm text-ds-ink flex items-start gap-2.5">
          <Icon name="alert" size="sm" color="currentColor" className="text-ds-red mt-0.5 shrink-0" />
          <span><span className="font-semibold">Colada anulada:</span> {c.motivo_anulacion}</span>
        </div>
      )}

      {/* Barra de acciones de workflow según el estado actual */}
      <div className="flex items-center gap-2.5 flex-wrap">
        {c.estado === 'sugerida' && (
          <Button size="sm" onClick={onConfirmar} disabled={anyBusy}>Confirmar</Button>
        )}
        {c.estado === 'confirmada' && (
          <>
            <Button size="sm" variant="outline" onClick={onDesconfirmar} disabled={anyBusy}>Desconfirmar</Button>
            <Button size="sm" onClick={() => setModalDigitar(true)} disabled={anyBusy}>Marcar digitada</Button>
          </>
        )}
        {c.estado === 'digitada' && (
          <>
            <Button size="sm" variant="outline" onClick={onDesmarcarDigitada} disabled={anyBusy}>Desmarcar digitada</Button>
            <Button size="sm" onClick={onCerrar} disabled={anyBusy}>Cerrar</Button>
          </>
        )}
        {(c.estado === 'confirmada' || c.estado === 'digitada') && (
          <Button size="sm" variant="secondary" onClick={abrirModalPedidoBc} disabled={anyBusy}>Crear Pedido BC</Button>
        )}
        {c.estado !== 'anulada' && (
          <Button size="sm" variant="outline" onClick={abrirModalObra} disabled={anyBusy}>Asignar obra</Button>
        )}
        {esAdmin && (c.estado === 'sugerida' || c.estado === 'confirmada' || c.estado === 'digitada') && (
          <Button size="sm" variant="danger" onClick={() => setModalAnular(true)} disabled={anyBusy}>Anular</Button>
        )}
        {esAdmin && c.estado === 'anulada' && (
          <Button size="sm" variant="outline" onClick={onDesanular} disabled={anyBusy}>Desanular</Button>
        )}
      </div>

      {/* Header de la colada */}
      <div className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 p-5">
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

      {/* Batches */}
      <section className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 overflow-hidden">
        <div className="px-5 py-3 bg-ds-gray-100 border-b border-ds-gray-200 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-ds bg-black flex items-center justify-center shrink-0">
            <Icon name="list" size="sm" color="currentColor" className="text-brand" />
          </div>
          <h2 className="font-bold text-ds-ink text-sm">Batches ({data.batches.length})</h2>
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
                  {batchesEditables && <th className="px-4 py-2.5 text-right">Acción</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-ds-gray-100">
                {data.batches.map((b) => (
                  <tr key={b.id_batch} className={b.excluido ? 'opacity-50' : ''}>
                    <td className="px-4 py-2.5 font-semibold text-ds-ink">{b.record_no}</td>
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
                    {batchesEditables && (
                      <td className="px-4 py-2.5 text-right">
                        {b.excluido ? (
                          <Button size="xs" variant="outline" onClick={() => onRestaurarBatch(b.id_batch)} disabled={anyBusy}>Restaurar</Button>
                        ) : (
                          <Button size="xs" variant="ghost" onClick={() => { setModalExcluir(b.id_batch); setMotivoExcluir(''); }} disabled={anyBusy}>Excluir</Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Cilindros (laboratorio de campo de la colada) */}
      <section className="bg-ds-surface rounded-ds-lg border border-ds-gray-200 shadow-ds-01 overflow-hidden">
        <div className="px-5 py-3 bg-ds-gray-100 border-b border-ds-gray-200 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-ds bg-black flex items-center justify-center shrink-0">
            <Icon name="boleta" size="sm" color="currentColor" className="text-brand" />
          </div>
          <h2 className="font-bold text-ds-ink text-sm">Cilindros ({data.cilindros.length})</h2>
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
                    <td className="px-4 py-2.5 font-semibold text-ds-ink">{cil.numero_serie}</td>
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

      {/* ─── Modal: Marcar digitada ─── */}
      <Modal
        open={modalDigitar}
        onClose={() => setModalDigitar(false)}
        title="Marcar como digitada"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setModalDigitar(false)}>Cancelar</Button>
            <Button size="sm" onClick={onMarcarDigitada} disabled={anyBusy || !numPedido.trim()}>Confirmar</Button>
          </>
        }
      >
        <p className="text-sm text-ds-gray-500 mb-3">Ingresá el N° de Pedido de Ensamblado BC con el que se digitó la colada.</p>
        <Input
          label="N° Pedido Ensamblado BC"
          value={numPedido}
          maxLength={50}
          onChange={(e) => setNumPedido(e.target.value)}
          placeholder="Ej: PE-000123"
        />
      </Modal>

      {/* ─── Modal: Anular ─── */}
      <Modal
        open={modalAnular}
        onClose={() => setModalAnular(false)}
        title="Anular colada"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setModalAnular(false)}>Cancelar</Button>
            <Button variant="danger" size="sm" onClick={onAnular} disabled={anyBusy || !motivoAnular.trim()}>Anular</Button>
          </>
        }
      >
        <p className="text-sm text-ds-gray-500 mb-3">Esta acción marca la colada como anulada. Indicá el motivo.</p>
        <Input
          label="Motivo de anulación"
          value={motivoAnular}
          maxLength={2000}
          onChange={(e) => setMotivoAnular(e.target.value)}
          placeholder="Motivo…"
        />
      </Modal>

      {/* ─── Modal: Excluir batch ─── */}
      <Modal
        open={modalExcluir !== null}
        onClose={() => setModalExcluir(null)}
        title="Excluir batch"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setModalExcluir(null)}>Cancelar</Button>
            <Button variant="danger" size="sm" onClick={onExcluirBatch} disabled={anyBusy || !motivoExcluir.trim()}>Excluir</Button>
          </>
        }
      >
        <p className="text-sm text-ds-gray-500 mb-3">El batch queda fuera del agregado de la colada (huérfano, reasignable). Indicá el motivo.</p>
        <Input
          label="Motivo de exclusión"
          value={motivoExcluir}
          maxLength={500}
          onChange={(e) => setMotivoExcluir(e.target.value)}
          placeholder="Motivo…"
        />
      </Modal>

      {/* ─── Modal: Asignar obra ─── */}
      <Modal
        open={modalObra}
        onClose={() => setModalObra(false)}
        title="Asignar obra"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setModalObra(false)}>Cancelar</Button>
            {c.obra_works_no && (
              <Button variant="ghost" size="sm" onClick={() => onAsignarObra(null)} disabled={anyBusy}>Quitar obra</Button>
            )}
            <Button size="sm" onClick={() => onAsignarObra(obraSel || null)} disabled={anyBusy || !obraSel}>Asignar</Button>
          </>
        }
      >
        {obrasCargando ? (
          <Skeleton className="h-11 w-full" />
        ) : (
          <Combobox
            label="Obra (pro_bi.dim_obra)"
            value={obraSel}
            onChange={setObraSel}
            options={obras.map<ComboOption>((o) => ({
              value: o.works_no,
              label: `${o.works_no} ${o.display_name ?? ''}`,
              parts: [
                { text: o.works_no, weight: 'bold' },
                ...(o.display_name ? [{ text: o.display_name, weight: 'normal' as const }] : []),
              ],
              search: `${o.works_no} ${o.display_name ?? ''} ${o.description ?? ''}`,
            }))}
            placeholder="Buscar obra…"
            emptyText="Sin obras"
          />
        )}
      </Modal>

      {/* ─── Modal: Crear Pedido BC ─── */}
      <Modal
        open={modalPedidoBc}
        onClose={() => setModalPedidoBc(false)}
        title="Crear Pedido de Ensamblado BC"
        size="lg"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setModalPedidoBc(false)}>Cancelar</Button>
            <Button size="sm" onClick={onConfirmarPedidoBc} disabled={anyBusy || pedidoCargando || !pedidoLineas}>Confirmar y crear</Button>
          </>
        }
      >
        {pedidoCargando ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : !pedidoLineas || pedidoLineas.length === 0 ? (
          <p className="text-sm text-ds-gray-400 text-center py-4">Sin líneas para el pedido.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-ds-gray-400 border-b border-ds-gray-100">
                  <th className="px-3 py-2">Recurso BC</th>
                  <th className="px-3 py-2">Descripción</th>
                  <th className="px-3 py-2 text-right">Cantidad</th>
                  <th className="px-3 py-2">Unidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ds-gray-100">
                {pedidoLineas.map((l, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-ds-gray-500">{l.codigo_recurso_bc ?? '—'}</td>
                    <td className="px-3 py-2 text-ds-ink">{l.descripcion}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{num(l.cantidad, 3)}</td>
                    <td className="px-3 py-2 text-ds-gray-500">{l.unidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </PageShell>
  );
}
