'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { formatCRC } from '@/lib/utilidades/format';
import type { Banco } from '@/lib/desembolsos/dashboard';
import type {
  EstadoVinculacion,
  HitoVinculable,
  MovimientoCaso,
  RespuestaMovimientosCaso,
} from '@/lib/desembolsos/movimientos';
import { EstadoCuentaModal } from '../EstadoCuentaModal';

/**
 * Movimientos de Flujo de Desembolsos — portado (read-only) de
 * MovimientosPantalla. Lista global con filtros + detalle por caso (movimientos,
 * hitos y sus vínculos) + acceso al estado de cuenta del cliente.
 *
 * La (des)vinculación y la captura/edición de movimientos dependen de stored
 * procedures que NO están desplegados en AdelanteDB, así que esta pantalla es de
 * consulta/monitoreo; no muta datos.
 */

const ESTADOS: { value: EstadoVinculacion; label: string }[] = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'VINCULADOS', label: 'Vinculados' },
  { value: 'SIN_VINCULAR', label: 'Sin vincular' },
];

const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ds-gray-500';
const td = 'px-3 py-2 text-sm text-black';

export default function DesembolsosMovimientosPage() {
  const { toast } = useToast();
  const [movs, setMovs] = useState<MovimientoCaso[]>([]);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [cargando, setCargando] = useState(false);

  const [busqueda, setBusqueda] = useState('');
  const [busquedaDeb, setBusquedaDeb] = useState('');
  const [idBanco, setIdBanco] = useState<number | null>(null);
  const [clasificacion, setClasificacion] = useState('');
  const [estado, setEstado] = useState<EstadoVinculacion>('TODOS');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const [casoDetalle, setCasoDetalle] = useState<number | null>(null);
  const [casoEstadoCuenta, setCasoEstadoCuenta] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBusquedaDeb(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  useEffect(() => {
    fetch('/api/desembolsos/bancos')
      .then((r) => (r.ok ? r.json() : { bancos: [] }))
      .then((d) => setBancos(d.bancos ?? []))
      .catch(() => setBancos([]));
  }, []);

  useEffect(() => {
    setCargando(true);
    const params = new URLSearchParams();
    if (busquedaDeb) params.set('q', busquedaDeb);
    if (idBanco) params.set('idBanco', String(idBanco));
    if (clasificacion) params.set('clasificacion', clasificacion);
    if (estado !== 'TODOS') params.set('estadoVinculacion', estado);
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);
    fetch(`/api/desembolsos/movimientos?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : { movimientos: [] }))
      .then((d) => setMovs(d.movimientos ?? []))
      .catch(() => toast('No se pudieron cargar los movimientos.', 'error'))
      .finally(() => setCargando(false));
  }, [busquedaDeb, idBanco, clasificacion, estado, desde, hasta, toast]);

  const totalMonto = useMemo(() => movs.reduce((a, m) => a + m.MontoColones, 0), [movs]);

  return (
    <main className="page mx-auto w-full max-w-6xl px-4 py-6">
      <EstadoCuentaModal idCaso={casoEstadoCuenta} onClose={() => setCasoEstadoCuenta(null)} />
      {casoDetalle != null && (
        <CasoDetalleModal
          idCaso={casoDetalle}
          onClose={() => setCasoDetalle(null)}
          onEstadoCuenta={() => {
            const id = casoDetalle;
            setCasoDetalle(null);
            setCasoEstadoCuenta(id);
          }}
        />
      )}

      <div className="mb-2">
        <h1 className="text-3xl font-bold">Movimientos</h1>
        <p className="text-ds-gray-500">
          Movimientos de la cartera y su vinculación a hitos de desembolso. Consulta (máx. 500).
        </p>
      </div>

      {/* Filtros */}
      <div className="my-4 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Input placeholder="Caso, cliente, lote…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <Select
          value={idBanco ?? ''}
          onChange={(e) => setIdBanco(Number(e.target.value) || null)}
          options={bancos.map((b) => ({ value: b.IDBan, label: b.Abreviatura }))}
          placeholder="Todos los bancos"
        />
        <Select
          value={clasificacion}
          onChange={(e) => setClasificacion(e.target.value)}
          options={[
            { value: 'BANCO', label: 'Banco' },
            { value: 'CLIENTE', label: 'Cliente' },
          ]}
          placeholder="Clasificación"
        />
        <Select
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoVinculacion)}
          options={ESTADOS.map((x) => ({ value: x.value, label: x.label }))}
        />
        <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} hint="Desde" />
        <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} hint="Hasta" />
      </div>

      <div className="mb-2 flex items-center justify-between text-sm text-ds-gray-500">
        <span>{movs.length} movimiento(s)</span>
        <span>
          Total ₡ mostrado: <strong>{formatCRC(totalMonto)}</strong>
        </span>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-ds-lg border border-ds-gray-200 bg-white shadow-ds-01">
        <table className="w-full">
          <thead>
            <tr className="border-b border-ds-gray-200 bg-ds-gray-100">
              <th className={th}>Fecha</th>
              <th className={th}>Caso · Cliente</th>
              <th className={th}>Proyecto · Lote</th>
              <th className={th}>Tipo</th>
              <th className={`${th} text-right`}>Monto ₡</th>
              <th className={th}>Depositante</th>
              <th className={th}>Vinculación</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {cargando && movs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-ds-gray-400">Cargando…</td>
              </tr>
            ) : movs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center italic text-ds-gray-400">Sin movimientos con esos filtros.</td>
              </tr>
            ) : (
              movs.map((m) => (
                <tr key={m.IDMovimiento} className="border-b border-ds-gray-100 last:border-0">
                  <td className={`${td} text-ds-gray-500`}>{m.FechaRealizado ?? '—'}</td>
                  <td className={td}>
                    <div className="font-medium">{m.Cliente ?? `Caso ${m.IDCaso}`}</div>
                    <div className="text-[10px] text-ds-gray-400">{m.CodigoCaso ?? `#${m.IDCaso}`}</div>
                  </td>
                  <td className={`${td} text-ds-gray-500`}>
                    {m.AbreviaturaProyecto ?? '—'} · {m.CodigoLote ?? '—'}
                  </td>
                  <td className={td}>
                    <span title={m.NombreTipo}>{m.AbreviaturaTipo}</span>
                    <div className="text-[10px] text-ds-gray-400">{m.CategoriaTipo}</div>
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{formatCRC(m.MontoColones)}</td>
                  <td className={`${td} text-ds-gray-500`}>{m.Depositante || '—'}</td>
                  <td className={td}>
                    <BadgeVinc m={m} />
                  </td>
                  <td className={`${td} text-right`}>
                    {m.IDCaso != null && (
                      <button
                        type="button"
                        className="text-brand-dark hover:underline"
                        onClick={() => setCasoDetalle(m.IDCaso!)}
                      >
                        Ver caso
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function BadgeVinc({ m }: { m: MovimientoCaso }) {
  if (m.EstaVinculado) {
    return (
      <span className="rounded-full bg-brand/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-dark">
        {m.NumHitosVinculados} hito(s)
      </span>
    );
  }
  if (m.MontoSinVincular_CRC > 0.01) {
    return (
      <span className="rounded-full bg-ds-yellow/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-black">
        Sin vincular
      </span>
    );
  }
  return <span className="text-[10px] text-ds-gray-400">—</span>;
}

// ------------------------------------------------------- Detalle por caso

function CasoDetalleModal({
  idCaso,
  onClose,
  onEstadoCuenta,
}: {
  idCaso: number;
  onClose: () => void;
  onEstadoCuenta: () => void;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<RespuestaMovimientosCaso | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    fetch(`/api/desembolsos/casos/${idCaso}/movimientos`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
        return r.json();
      })
      .then((d) => setData(d as RespuestaMovimientosCaso))
      .catch(() => toast('No se pudo cargar el detalle del caso.', 'error'))
      .finally(() => setCargando(false));
  }, [idCaso, toast]);

  const cliente = data?.movimientos[0]?.Cliente ?? `Caso ${idCaso}`;

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`Caso ${idCaso} · ${cliente}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          <Button onClick={onEstadoCuenta}>Estado de cuenta</Button>
        </>
      }
    >
      {cargando && !data ? (
        <p className="text-ds-gray-400">Cargando…</p>
      ) : data ? (
        <div className="space-y-6">
          {/* Hitos */}
          <section className="rounded-ds-lg border border-ds-gray-200">
            <div className="border-b border-ds-gray-200 bg-ds-gray-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-ds-gray-500">
              Hitos de desembolso
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ds-gray-200">
                    <th className={th}>Hito</th>
                    <th className={`${th} text-right`}>%</th>
                    <th className={`${th} text-right`}>Esperado</th>
                    <th className={`${th} text-right`}>Aplicado</th>
                    <th className={th}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.hitos.map((h) => (
                    <HitoRow key={`${h.IDHito}-${h.IDCasoHito ?? 'x'}`} h={h} />
                  ))}
                  {data.hitos.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center italic text-ds-gray-400">
                        Sin hitos configurados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Movimientos del caso */}
          <section className="rounded-ds-lg border border-ds-gray-200">
            <div className="border-b border-ds-gray-200 bg-ds-gray-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-ds-gray-500">
              Movimientos del caso
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ds-gray-200">
                    <th className={th}>Fecha</th>
                    <th className={th}>Tipo</th>
                    <th className={`${th} text-right`}>Monto ₡</th>
                    <th className={`${th} text-right`}>Vinculado</th>
                    <th className={`${th} text-right`}>Sin vincular</th>
                  </tr>
                </thead>
                <tbody>
                  {data.movimientos.map((m) => (
                    <tr key={m.IDMovimiento} className="border-b border-ds-gray-100 last:border-0">
                      <td className={`${td} text-ds-gray-500`}>{m.FechaRealizado ?? '—'}</td>
                      <td className={td}>{m.AbreviaturaTipo}</td>
                      <td className={`${td} text-right tabular-nums`}>{formatCRC(m.MontoColones)}</td>
                      <td className={`${td} text-right tabular-nums`}>{formatCRC(m.MontoVinculado_CRC)}</td>
                      <td className={`${td} text-right tabular-nums ${m.MontoSinVincular_CRC > 0.01 ? 'text-ds-yellow' : 'text-ds-gray-400'}`}>
                        {formatCRC(m.MontoSinVincular_CRC)}
                      </td>
                    </tr>
                  ))}
                  {data.movimientos.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center italic text-ds-gray-400">
                        Sin movimientos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </Modal>
  );
}

function HitoRow({ h }: { h: HitoVinculable }) {
  return (
    <>
      <tr className="border-b border-ds-gray-100">
        <td className={td}>
          <span className="inline-flex items-center gap-2">
            {h.ColorHito && <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: h.ColorHito }} />}
            {h.CodigoHito} · {h.NombreHito}
            {h.EsHuerfano === 1 && <span className="text-[10px] text-ds-yellow">(huérfano)</span>}
          </span>
        </td>
        <td className={`${td} text-right tabular-nums`}>{h.PorcentajeHito.toFixed(1)}%</td>
        <td className={`${td} text-right tabular-nums`}>{h.MontoEsperado_CRC != null ? formatCRC(h.MontoEsperado_CRC) : '—'}</td>
        <td className={`${td} text-right tabular-nums`}>{formatCRC(h.TotalAplicado_CRC)}</td>
        <td className={td}>
          {h.EstaCubierto ? (
            <span className="rounded-full bg-brand/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-dark">
              {h.NumPagos} pago(s)
            </span>
          ) : (
            <span className="text-[10px] text-ds-gray-400">Pendiente</span>
          )}
        </td>
      </tr>
      {h.Links.map((lk) => (
        <tr key={lk.IDLink} className="border-b border-ds-gray-50 bg-ds-gray-100/40">
          <td className={`${td} pl-8 text-xs text-ds-gray-500`} colSpan={2}>
            ↳ Mov #{lk.IDMovimiento} · {lk.AbreviaturaTipo} · {lk.FechaRealizado ?? '—'}
          </td>
          <td />
          <td className={`${td} text-right text-xs tabular-nums text-ds-gray-500`}>{formatCRC(lk.MontoAplicado_CRC)}</td>
          <td />
        </tr>
      ))}
    </>
  );
}
