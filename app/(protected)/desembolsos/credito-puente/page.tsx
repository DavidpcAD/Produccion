'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Table } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { formatCRC } from '@/lib/utilidades/format';
import type {
  BancoOpcion,
  CreditoPuenteEstado,
  CreditoPuenteLote,
  CreditoPuenteResumen,
  MovimientoCreditoPuente,
} from '@/lib/desembolsos/credito-puente';

/**
 * Crédito Puente — captura admin (portado de adelante-flujo-desembolsos
 * `CreditoPuentePantalla.tsx`). El fuente usa shadcn/MSAL/react-query; aquí se
 * reemplaza por el Design System + fetch + getSession. Cubre: cabecera del
 * crédito (crear/editar/eliminar), KPIs de cobertura, lotes (solo lectura) y
 * movimientos (crear/editar/anular/eliminar).
 */

// ----------------------------------------------------------------------- helpers
const hoy = () => new Date().toISOString().slice(0, 10);

interface FormCabecera {
  IDBan: string;
  Codigo: string;
  MontoTotal_CRC: string;
  GastosFormalizacion_CRC: string;
  TasaAnual: string;
  FechaAprobacion: string;
  FechaVencimiento: string;
  Estado: CreditoPuenteEstado;
  Notas: string;
}
const formVacio: FormCabecera = {
  IDBan: '',
  Codigo: '',
  MontoTotal_CRC: '',
  GastosFormalizacion_CRC: '',
  TasaAnual: '',
  FechaAprobacion: '',
  FechaVencimiento: '',
  Estado: 'ACTIVO',
  Notas: '',
};

function estadoBadge(estado: CreditoPuenteEstado) {
  return estado === 'ACTIVO' ? (
    <Badge variant="green" dot>
      Activo
    </Badge>
  ) : (
    <Badge variant="gray" dot>
      Cancelado
    </Badge>
  );
}

// ======================================================================== page
export default function CreditoPuentePage() {
  const { toast } = useToast();
  const confirm = useConfirm();

  const [creditos, setCreditos] = useState<CreditoPuenteResumen[]>([]);
  const [bancos, setBancos] = useState<BancoOpcion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [selId, setSelId] = useState<number | null>(null);

  // Modal cabecera (crear/editar)
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormCabecera>(formVacio);
  const [guardando, setGuardando] = useState(false);

  const cargarLista = useCallback(() => {
    setCargando(true);
    fetch('/api/desembolsos/credito-puente')
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => {
        setCreditos(d.creditos ?? []);
        setBancos(d.bancos ?? []);
        setSelId((prev) => prev ?? d.creditos?.[0]?.IDCreditoPuente ?? null);
      })
      .catch(() => toast('No se pudieron cargar los créditos puente.', 'error'))
      .finally(() => setCargando(false));
  }, [toast]);

  useEffect(cargarLista, [cargarLista]);

  const sel = creditos.find((c) => c.IDCreditoPuente === selId) ?? null;

  function abrirNuevo() {
    setEditId(null);
    setForm(formVacio);
    setModalOpen(true);
  }
  function abrirEditar(c: CreditoPuenteResumen) {
    setEditId(c.IDCreditoPuente);
    setForm({
      IDBan: String(c.IDBan),
      Codigo: c.Codigo ?? '',
      MontoTotal_CRC: String(c.MontoTotal_CRC),
      GastosFormalizacion_CRC: c.GastosFormalizacion_CRC != null ? String(c.GastosFormalizacion_CRC) : '',
      TasaAnual: c.TasaAnual != null ? String(c.TasaAnual) : '',
      FechaAprobacion: c.FechaAprobacion ?? '',
      FechaVencimiento: c.FechaVencimiento ?? '',
      Estado: c.Estado,
      Notas: c.Notas ?? '',
    });
    setModalOpen(true);
  }

  async function guardarCabecera() {
    if (!form.IDBan) return toast('Elegí el banco.', 'error');
    if (!(Number(form.MontoTotal_CRC) > 0)) return toast('El monto total debe ser mayor a 0.', 'error');
    setGuardando(true);
    const payload = {
      IDBan: Number(form.IDBan),
      Codigo: form.Codigo.trim() || null,
      MontoTotal_CRC: Number(form.MontoTotal_CRC),
      GastosFormalizacion_CRC: form.GastosFormalizacion_CRC ? Number(form.GastosFormalizacion_CRC) : null,
      TasaAnual: form.TasaAnual ? Number(form.TasaAnual) : null,
      FechaAprobacion: form.FechaAprobacion || null,
      FechaVencimiento: form.FechaVencimiento || null,
      Estado: form.Estado,
      Notas: form.Notas.trim() || null,
    };
    try {
      const url = editId
        ? `/api/desembolsos/credito-puente/${editId}`
        : '/api/desembolsos/credito-puente';
      const r = await fetch(url, {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || 'Error');
      toast(editId ? 'Crédito actualizado.' : 'Crédito creado.', 'success');
      setModalOpen(false);
      if (!editId && d.IDCreditoPuente) setSelId(d.IDCreditoPuente);
      cargarLista();
    } catch (e) {
      toast(`No se pudo guardar: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarCredito(c: CreditoPuenteResumen) {
    const ok = await confirm({
      title: 'Eliminar crédito puente',
      message: `¿Eliminar ${c.Codigo ?? `crédito #${c.IDCreditoPuente}`}? Solo se puede si no tiene lotes asociados.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await fetch(`/api/desembolsos/credito-puente/${c.IDCreditoPuente}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || 'Error');
      toast('Crédito eliminado.', 'success');
      if (selId === c.IDCreditoPuente) setSelId(null);
      cargarLista();
    } catch (e) {
      toast(`No se pudo eliminar: ${e instanceof Error ? e.message : e}`, 'error');
    }
  }

  return (
    <main className="page mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-heading font-bold">Crédito Puente</h1>
          <p className="text-ds-gray-500">
            Créditos puente con los bancos, cobertura por lotes y movimientos del crédito.
          </p>
        </div>
        <Button onClick={abrirNuevo}>+ Nuevo crédito</Button>
      </div>

      {/* Lista de créditos */}
      <div className="mb-6">
        <Table<CreditoPuenteResumen>
          columns={[
            { key: 'Codigo', header: 'Código', render: (c) => c.Codigo ?? `#${c.IDCreditoPuente}` },
            { key: 'AbrevBanco', header: 'Banco', render: (c) => c.AbrevBanco || '—' },
            { key: 'MontoTotal_CRC', header: 'Monto total', render: (c) => formatCRC(c.MontoTotal_CRC) },
            {
              key: 'MontoSinAsignar_CRC',
              header: 'Sin asignar',
              render: (c) => formatCRC(c.MontoSinAsignar_CRC),
            },
            { key: 'CantidadLotes', header: 'Lotes', render: (c) => String(c.CantidadLotes) },
            { key: 'Estado', header: 'Estado', render: (c) => estadoBadge(c.Estado) },
            {
              key: 'IDCreditoPuente',
              header: '',
              render: (c) => (
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    className="text-sm text-black hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      abrirEditar(c);
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="text-sm text-ds-red hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      eliminarCredito(c);
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              ),
            },
          ]}
          data={creditos}
          keyField="IDCreditoPuente"
          loading={cargando}
          emptyMessage="Aún no hay créditos puente. Creá el primero."
          onRowClick={(c) => setSelId(c.IDCreditoPuente)}
        />
      </div>

      {sel && (
        <section className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sub-sm font-bold">
              {sel.Codigo ?? `Crédito #${sel.IDCreditoPuente}`} · {sel.NombreBanco}
            </h2>
            {estadoBadge(sel.Estado)}
            {sel.TasaAnual != null && (
              <span className="text-sm text-ds-gray-500">Tasa {sel.TasaAnual}%</span>
            )}
          </div>

          {/* KPIs de cobertura */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Monto total" valor={sel.MontoTotal_CRC} />
            <Kpi label="Asignado a lotes" valor={sel.MontoAsignadoLotes_CRC} />
            <Kpi label="Sin asignar" valor={sel.MontoSinAsignar_CRC} />
            <Kpi label="Pendiente de cobertura" valor={sel.MontoPendienteCobertura_CRC} />
          </div>

          <LotesPanel idCp={sel.IDCreditoPuente} />
          <MovimientosPanel idCp={sel.IDCreditoPuente} />
        </section>
      )}

      {/* Modal cabecera */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Editar crédito puente' : 'Nuevo crédito puente'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={guardarCabecera} loading={guardando}>
              {editId ? 'Guardar cambios' : 'Crear crédito'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Banco"
            required
            value={form.IDBan}
            onChange={(e) => setForm((f) => ({ ...f, IDBan: e.target.value }))}
            options={bancos.map((b) => ({ value: b.IDBan, label: `${b.Abreviatura} — ${b.NombreEntidad}` }))}
            placeholder="Elegí el banco…"
          />
          <Input
            label="Código"
            value={form.Codigo}
            placeholder="MPC-03"
            onChange={(e) => setForm((f) => ({ ...f, Codigo: e.target.value }))}
          />
          <Input
            label="Monto total (₡)"
            type="number"
            min={0}
            required
            value={form.MontoTotal_CRC}
            hint={form.MontoTotal_CRC ? formatCRC(Number(form.MontoTotal_CRC)) : undefined}
            onChange={(e) => setForm((f) => ({ ...f, MontoTotal_CRC: e.target.value }))}
          />
          <Input
            label="Gastos formalización (₡)"
            type="number"
            min={0}
            value={form.GastosFormalizacion_CRC}
            hint={form.GastosFormalizacion_CRC ? formatCRC(Number(form.GastosFormalizacion_CRC)) : undefined}
            onChange={(e) => setForm((f) => ({ ...f, GastosFormalizacion_CRC: e.target.value }))}
          />
          <Input
            label="Tasa anual (%)"
            type="number"
            min={0}
            step="0.01"
            value={form.TasaAnual}
            onChange={(e) => setForm((f) => ({ ...f, TasaAnual: e.target.value }))}
          />
          <Select
            label="Estado"
            value={form.Estado}
            onChange={(e) => setForm((f) => ({ ...f, Estado: e.target.value as CreditoPuenteEstado }))}
            options={[
              { value: 'ACTIVO', label: 'Activo' },
              { value: 'CANCELADO', label: 'Cancelado' },
            ]}
          />
          <Input
            label="Fecha aprobación"
            type="date"
            value={form.FechaAprobacion}
            onChange={(e) => setForm((f) => ({ ...f, FechaAprobacion: e.target.value }))}
          />
          <Input
            label="Fecha vencimiento"
            type="date"
            value={form.FechaVencimiento}
            onChange={(e) => setForm((f) => ({ ...f, FechaVencimiento: e.target.value }))}
          />
          <div className="sm:col-span-2">
            <Input
              label="Notas"
              value={form.Notas}
              onChange={(e) => setForm((f) => ({ ...f, Notas: e.target.value }))}
            />
          </div>
        </div>
      </Modal>
    </main>
  );
}

// ------------------------------------------------------------------------ KPI
function Kpi({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="rounded-ds border border-ds-gray-200 p-4">
      <p className="text-xs text-ds-gray-500">{label}</p>
      <p className="mt-1 text-sub-sm font-bold">{formatCRC(valor)}</p>
    </div>
  );
}

// -------------------------------------------------------------------- Lotes
function LotesPanel({ idCp }: { idCp: number }) {
  const { toast } = useToast();
  const [lotes, setLotes] = useState<CreditoPuenteLote[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    fetch(`/api/desembolsos/credito-puente/${idCp}`)
      .then((r) => (r.ok ? r.json() : { lotes: [] }))
      .then((d) => setLotes(d.lotes ?? []))
      .catch(() => toast('No se pudieron cargar los lotes.', 'error'))
      .finally(() => setCargando(false));
  }, [idCp, toast]);

  const estadoLote = (e: CreditoPuenteLote['EstadoLoteCP']) =>
    e === 'PENDIENTE' ? (
      <Badge variant="blue">Pendiente</Badge>
    ) : e === 'CANCELACION_PROGRAMADA' ? (
      <Badge variant="yellow" dot>
        Cancelación programada
      </Badge>
    ) : (
      <Badge variant="green" dot>
        Cancelación confirmada
      </Badge>
    );

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ds-gray-500">
        Lotes del crédito
      </h3>
      <Table<CreditoPuenteLote>
        columns={[
          { key: 'AbreviaturaProyecto', header: 'Proyecto' },
          { key: 'CodigoLote', header: 'Lote' },
          {
            key: 'MontoResponsabilidadTeorica_CRC',
            header: 'Responsabilidad',
            render: (l) => formatCRC(l.MontoResponsabilidadTeorica_CRC),
          },
          {
            key: 'FechaCancelacionAlBanco',
            header: 'Fecha cancelación',
            render: (l) => l.FechaCancelacionAlBanco ?? '—',
          },
          { key: 'EstadoLoteCP', header: 'Estado', render: (l) => estadoLote(l.EstadoLoteCP) },
        ]}
        data={lotes}
        keyField="IDCreditoPuenteLote"
        loading={cargando}
        emptyMessage="Este crédito no tiene lotes asociados."
      />
      <p className="mt-1 text-xs text-ds-gray-400">
        Los lotes se administran en la matriz de desembolsos (solo lectura acá).
      </p>
    </div>
  );
}

// -------------------------------------------------------------- Movimientos
interface FormMov {
  FechaMovimiento: string;
  MontoColones: string;
  Concepto: string;
  NumeroComprobante: string;
  Notas: string;
}
const movVacio: FormMov = {
  FechaMovimiento: hoy(),
  MontoColones: '',
  Concepto: '',
  NumeroComprobante: '',
  Notas: '',
};

function MovimientosPanel({ idCp }: { idCp: number }) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [movs, setMovs] = useState<MovimientoCreditoPuente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormMov>(movVacio);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    setCargando(true);
    fetch(`/api/desembolsos/credito-puente/${idCp}/movimientos`)
      .then((r) => (r.ok ? r.json() : { movimientos: [] }))
      .then((d) => setMovs(d.movimientos ?? []))
      .catch(() => toast('No se pudieron cargar los movimientos.', 'error'))
      .finally(() => setCargando(false));
  }, [idCp, toast]);

  useEffect(cargar, [cargar]);

  const total = useMemo(
    () => movs.filter((m) => m.Estado === 'REGISTRADO').reduce((a, m) => a + m.MontoMovimiento_CRC, 0),
    [movs],
  );

  function abrirNuevo() {
    setEditId(null);
    setForm(movVacio);
    setModalOpen(true);
  }
  function abrirEditar(m: MovimientoCreditoPuente) {
    setEditId(m.IDMovCP);
    setForm({
      FechaMovimiento: m.FechaMovimiento,
      MontoColones: String(m.MontoMovimiento_CRC),
      Concepto: m.Concepto ?? '',
      NumeroComprobante: m.NumeroComprobante ?? '',
      Notas: m.Notas ?? '',
    });
    setModalOpen(true);
  }

  async function guardar() {
    if (!(Number(form.MontoColones) > 0)) return toast('El monto debe ser mayor a 0.', 'error');
    if (!form.FechaMovimiento) return toast('Indicá la fecha.', 'error');
    setGuardando(true);
    const payload = {
      FechaMovimiento: form.FechaMovimiento,
      MontoColones: Number(form.MontoColones),
      Concepto: form.Concepto.trim() || null,
      NumeroComprobante: form.NumeroComprobante.trim() || null,
      Notas: form.Notas.trim() || null,
    };
    try {
      const url = editId
        ? `/api/desembolsos/credito-puente/${idCp}/movimientos/${editId}`
        : `/api/desembolsos/credito-puente/${idCp}/movimientos`;
      const r = await fetch(url, {
        method: editId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editId ? { ...payload, Estado: 'REGISTRADO' } : payload),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || 'Error');
      toast(editId ? 'Movimiento actualizado.' : 'Movimiento agregado.', 'success');
      setModalOpen(false);
      cargar();
    } catch (e) {
      toast(`No se pudo guardar: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function anular(m: MovimientoCreditoPuente) {
    const ok = await confirm({
      title: 'Anular movimiento',
      message: `¿Anular el movimiento de ${formatCRC(m.MontoMovimiento_CRC)} del ${m.FechaMovimiento}?`,
      confirmLabel: 'Anular',
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await fetch(`/api/desembolsos/credito-puente/${idCp}/movimientos/${m.IDMovCP}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          FechaMovimiento: m.FechaMovimiento,
          MontoColones: m.MontoMovimiento_CRC,
          Concepto: m.Concepto,
          NumeroComprobante: m.NumeroComprobante,
          Notas: m.Notas,
          Estado: 'ANULADO',
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || 'Error');
      toast('Movimiento anulado.', 'success');
      cargar();
    } catch (e) {
      toast(`No se pudo anular: ${e instanceof Error ? e.message : e}`, 'error');
    }
  }

  async function eliminar(m: MovimientoCreditoPuente) {
    const ok = await confirm({
      title: 'Eliminar movimiento',
      message: `¿Eliminar definitivamente el movimiento de ${formatCRC(m.MontoMovimiento_CRC)}?`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await fetch(`/api/desembolsos/credito-puente/${idCp}/movimientos/${m.IDMovCP}`, {
        method: 'DELETE',
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || 'Error');
      toast('Movimiento eliminado.', 'success');
      cargar();
    } catch (e) {
      toast(`No se pudo eliminar: ${e instanceof Error ? e.message : e}`, 'error');
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ds-gray-500">
          Movimientos del crédito
        </h3>
        <Button size="sm" variant="outline" onClick={abrirNuevo}>
          + Movimiento
        </Button>
      </div>

      <Table<MovimientoCreditoPuente>
        columns={[
          { key: 'FechaMovimiento', header: 'Fecha' },
          { key: 'Concepto', header: 'Concepto', render: (m) => m.Concepto ?? '—' },
          { key: 'NumeroComprobante', header: 'Comprobante', render: (m) => m.NumeroComprobante ?? '—' },
          { key: 'MontoMovimiento_CRC', header: 'Monto', render: (m) => formatCRC(m.MontoMovimiento_CRC) },
          {
            key: 'Estado',
            header: 'Estado',
            render: (m) =>
              m.Estado === 'REGISTRADO' ? (
                <Badge variant="green" dot>
                  Registrado
                </Badge>
              ) : (
                <Badge variant="red">Anulado</Badge>
              ),
          },
          {
            key: 'IDMovCP',
            header: '',
            render: (m) => (
              <div className="flex justify-end gap-3">
                {m.Estado === 'REGISTRADO' && (
                  <>
                    <button
                      type="button"
                      className="text-sm text-black hover:underline"
                      onClick={() => abrirEditar(m)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="text-sm text-ds-gray-500 hover:underline"
                      onClick={() => anular(m)}
                    >
                      Anular
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="text-sm text-ds-red hover:underline"
                  onClick={() => eliminar(m)}
                >
                  Eliminar
                </button>
              </div>
            ),
          },
        ]}
        data={movs}
        keyField="IDMovCP"
        loading={cargando}
        emptyMessage="Sin movimientos para este crédito."
      />
      <p className="mt-1 text-right text-sm text-ds-gray-500">
        Total registrado: <strong>{formatCRC(total)}</strong>
      </p>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Editar movimiento' : 'Nuevo movimiento'}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar} loading={guardando}>
              {editId ? 'Guardar' : 'Agregar'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Fecha del movimiento"
            type="date"
            required
            value={form.FechaMovimiento}
            onChange={(e) => setForm((f) => ({ ...f, FechaMovimiento: e.target.value }))}
          />
          <Input
            label="Monto (₡)"
            type="number"
            min={0}
            required
            value={form.MontoColones}
            hint={form.MontoColones ? formatCRC(Number(form.MontoColones)) : undefined}
            onChange={(e) => setForm((f) => ({ ...f, MontoColones: e.target.value }))}
          />
          <Input
            label="Concepto"
            value={form.Concepto}
            onChange={(e) => setForm((f) => ({ ...f, Concepto: e.target.value }))}
          />
          <Input
            label="N.º comprobante"
            value={form.NumeroComprobante}
            onChange={(e) => setForm((f) => ({ ...f, NumeroComprobante: e.target.value }))}
          />
          <Input
            label="Notas"
            value={form.Notas}
            onChange={(e) => setForm((f) => ({ ...f, Notas: e.target.value }))}
          />
        </div>
      </Modal>
    </div>
  );
}
