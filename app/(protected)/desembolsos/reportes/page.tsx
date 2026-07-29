'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { DatePicker } from '@/components/ui/DatePicker';
import { useToast } from '@/components/ui/Toast';
import type { CarteraRow, LiquidacionRow, MovimientoRow, FlujoResultado } from '@/lib/desembolsos/reportes';

/**
 * Reportes / Exports de Desembolsos. Portado de ReportesPantalla.tsx
 * (adelante-flujo-desembolsos). Cuatro exports a Excel: Cartera, Flujo
 * proyectado, Liquidación de lote y Movimientos. El endpoint devuelve datos;
 * el archivo se arma en el cliente con `xlsx` (patrón loadXLSX de compras/avance).
 */

async function loadXLSX(): Promise<typeof import('xlsx')> {
  const m = await import('xlsx');
  return ((m as unknown as { default?: typeof import('xlsx') }).default ?? m) as typeof import('xlsx');
}

interface ProyectoOpcion { IDProyecto: number; AbreviaturaProyecto: string; Nombre: string }
interface BancoOpcion { IDBan: number; Abreviatura: string }

function hoyISO(): string { return new Date().toISOString().slice(0, 10); }
function inicioMes(): string { const h = new Date(); return new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), 1)).toISOString().slice(0, 10); }

async function descargar(aoa: unknown[][], hoja: string, archivo: string) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, hoja.slice(0, 31));
  XLSX.writeFile(wb, archivo);
}

export default function ReportesDesembolsosPage() {
  const { toast } = useToast();
  const [proyectos, setProyectos] = useState<ProyectoOpcion[]>([]);
  const [bancos, setBancos] = useState<BancoOpcion[]>([]);
  const [idProyecto, setIdProyecto] = useState<number | ''>('');
  const [idBanco, setIdBanco] = useState<number | ''>('');
  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState(hoyISO());
  const [vista, setVista] = useState<'bruto' | 'netoAD'>('bruto');
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/desembolsos/reportes/proyectos').then((r) => (r.ok ? r.json() : { proyectos: [] })).then((d) => setProyectos(d.proyectos ?? [])).catch(() => {});
    fetch('/api/desembolsos/bancos').then((r) => (r.ok ? r.json() : { bancos: [] })).then((d) => setBancos(d.bancos ?? [])).catch(() => {});
  }, []);

  function qs(extra: Record<string, string> = {}): string {
    const sp = new URLSearchParams(extra);
    if (idProyecto) sp.set('idProyecto', String(idProyecto));
    if (idBanco) sp.set('idBanco', String(idBanco));
    return sp.toString();
  }

  async function run(nombre: string, fn: () => Promise<void>) {
    setOcupado(nombre);
    try { await fn(); toast('Excel generado.', 'success'); }
    catch (e) { toast(`No se pudo exportar: ${e instanceof Error ? e.message : e}`, 'error'); }
    finally { setOcupado(null); }
  }

  async function exportCartera() {
    const r = await fetch(`/api/desembolsos/exports/cartera?${qs()}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
    const { filas } = await r.json() as { filas: CarteraRow[] };
    const ESTADO: Record<number, string> = { 1: 'Entregado', 2: 'Formalizado', 4: 'Reservado' };
    const head = ['Estado', 'Banco', 'Proyecto', 'Lote', 'Modelo', 'Área m²', 'Cliente', 'F. reserva', 'F. formaliz.', 'Precio contractual', 'Precio actual', 'Monto banco', 'Pagos cliente', 'Pagado real', 'Pendiente', '% avance', 'Hitos', 'Sobrecobro'];
    const body = filas.map((c) => [ESTADO[c.IDEstado] ?? c.IDEstado, c.AbrevBanco, c.AbreviaturaProyecto, c.CodigoLote, c.NombreModelo ?? '', c.AreaLote_m2 ?? '', c.Cliente, c.FechaReserva ?? '', c.FechaFormalizacion ?? '', c.PrecioVentaContractual_CRC, c.PrecioVenta_CRC, c.MontoBanco_CRC ?? '', c.PagoCliente_CRC, c.PagadoReal_CRC, c.Pendiente_CRC, c.PorcentajeAvance ?? '', `${c.HitosCubiertos}/${c.TotalHitos}`, c.TieneSobrecobro === 1 ? 'Sí' : '']);
    await descargar([head, ...body], 'Cartera', `cartera-${hoyISO()}.xlsx`);
  }

  async function exportLiquidacion() {
    const r = await fetch(`/api/desembolsos/exports/liquidacion-lote?${qs({ desde, hasta })}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
    const { filas } = await r.json() as { filas: LiquidacionRow[] };
    const head = ['F. mov', 'ID Mov', 'Caso', 'Cliente', 'Lote', 'Proy.', 'Banco', 'Origen', 'Bruto?', 'Monto bruto', 'Aplicado lote', 'Entidad', '% entidad', 'Lote interno', 'Exclusividad', 'Override?', 'Monto entidad'];
    const body = filas.map((f) => [f.FechaMovimiento ?? '', f.IDMovimiento, f.CodigoCaso ?? '', f.Cliente ?? '', f.CodigoLote ?? '', f.AbreviaturaProyecto ?? '', f.AbrevBanco ?? '', f.Origen, f.EsCapturaBruta ? 'Sí' : '', f.MontoMovBruto_CRC, f.MontoAplicadoLote_CRC, f.CodigoEntidad, f.PctEntidad, f.LoteInterno_CRC, f.Exclusividad_CRC, f.TieneOverride ? 'Sí' : '', f.MontoEntidad_CRC]);
    await descargar([head, ...body], 'Liquidación', `liquidacion-lote-${hoyISO()}.xlsx`);
  }

  async function exportMovimientos() {
    const r = await fetch(`/api/desembolsos/exports/movimientos?${qs({ desde, hasta })}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
    const { filas } = await r.json() as { filas: MovimientoRow[] };
    const head = ['Fecha', 'Tipo', 'Categoría', 'Caso', 'Lote', 'Cliente', 'Banco', 'Proyecto', 'Moneda', 'TC', 'Monto CRC', 'Monto USD', 'Depositante', 'Clasif.', 'Vinculado', 'Sin vincular', 'Detalle'];
    const body = filas.map((m) => [m.FechaRealizado ?? '', m.AbreviaturaTipo ?? '', m.CategoriaTipo ?? '', m.CodigoCaso ?? '', m.CodigoLote ?? '', m.Cliente ?? '', m.AbrevBanco ?? '', m.AbreviaturaProyecto ?? '', m.Moneda ?? '', m.TipoCambio ?? '', m.MontoColones, m.MontoDolares ?? '', m.Depositante ?? '', m.Clasificacion ?? '', m.EstaVinculado ? 'Sí' : 'No', m.MontoSinVincular_CRC, m.DetalleTransferencia ?? '']);
    await descargar([head, ...body], 'Movimientos', `movimientos-${hoyISO()}.xlsx`);
  }

  async function exportFlujo() {
    const r = await fetch(`/api/desembolsos/exports/flujo-proyectado?${qs({ desde, hasta, vista })}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
    const flujo = await r.json() as FlujoResultado;
    const semHead = flujo.semanas.map((s) => `Sem ${s.numero} (${s.etiqueta})`);
    const head = ['Sección', ...semHead, 'TOTAL'];
    const fila = (label: string, semanas: number[], total: number) => [label, ...semanas, total];
    const aoa: unknown[][] = [head];
    aoa.push(['BANCOS']);
    for (const f of flujo.bancos) aoa.push(fila(f.etiqueta, f.semanas, f.total));
    aoa.push(['CRÉDITO PUENTE']);
    for (const f of flujo.creditoPuente) aoa.push(fila(f.etiqueta, f.semanas, f.total));
    aoa.push(fila(flujo.cliente.etiqueta, flujo.cliente.semanas, flujo.cliente.total));
    aoa.push([`LOTES (distribución, informativo · vista ${flujo.vista})`]);
    for (const f of flujo.lotes) aoa.push(fila(f.etiqueta, f.semanas, f.total));
    aoa.push(fila('TOTAL GENERAL', flujo.totalGeneral.semanas, flujo.totalGeneral.total));
    await descargar(aoa, 'Flujo proyectado', `flujo-proyectado-${hoyISO()}.xlsx`);
  }

  return (
    <main className="page mx-auto w-full max-w-4xl px-4 py-6">
      <div className="mb-4">
        <h1 className="text-heading font-bold">Reportes de desembolsos</h1>
        <p className="text-ds-gray-500">Exportá a Excel la cartera, el flujo proyectado, la liquidación de lote y los movimientos.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Select label="Proyecto" value={idProyecto} onChange={(e) => setIdProyecto(Number(e.target.value) || '')}
          options={proyectos.map((p) => ({ value: p.IDProyecto, label: p.AbreviaturaProyecto }))} placeholder="Todos" />
        <Select label="Banco" value={idBanco} onChange={(e) => setIdBanco(Number(e.target.value) || '')}
          options={bancos.map((b) => ({ value: b.IDBan, label: b.Abreviatura }))} placeholder="Todos" />
        <Select label="Vista (flujo)" value={vista} onChange={(e) => setVista(e.target.value as 'bruto' | 'netoAD')}
          options={[{ value: 'bruto', label: 'Bruto' }, { value: 'netoAD', label: 'Neto AD' }]} />
        <DatePicker label="Desde" value={desde} onChange={setDesde} />
        <DatePicker label="Hasta" value={hasta} onChange={setHasta} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ReporteCard titulo="Cartera por caso" desc="Lista plana de casos con precios, montos y avance (filtra por proyecto/banco)."
          loading={ocupado === 'cartera'} onClick={() => run('cartera', exportCartera)} />
        <ReporteCard titulo="Flujo proyectado" desc="Matriz banco × semana (usa el rango de fechas y la vista)."
          loading={ocupado === 'flujo'} onClick={() => run('flujo', exportFlujo)} />
        <ReporteCard titulo="Liquidación de lote" desc="Reparto QFI/GM/AD por movimiento en el rango (filtra por proyecto)."
          loading={ocupado === 'liquidacion'} onClick={() => run('liquidacion', exportLiquidacion)} />
        <ReporteCard titulo="Movimientos" desc="Movimientos bancarios con vinculación en el rango (filtra por proyecto/banco)."
          loading={ocupado === 'movimientos'} onClick={() => run('movimientos', exportMovimientos)} />
      </div>
    </main>
  );
}

function ReporteCard({ titulo, desc, loading, onClick }: { titulo: string; desc: string; loading: boolean; onClick: () => void }) {
  return (
    <div className="rounded-ds-lg border border-ds-gray-200 bg-white p-5 shadow-ds-01">
      <h2 className="text-sub-sm font-semibold">{titulo}</h2>
      <p className="mt-1 mb-4 text-sm text-ds-gray-500">{desc}</p>
      <Button onClick={onClick} loading={loading}>Exportar a Excel</Button>
    </div>
  );
}
