'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { formatCRC } from '@/lib/utilidades/format';
import type { EstadoCuentaData } from '@/lib/desembolsos/estado-cuenta';

/**
 * Modal de Estado de cuenta del cliente. Portado de ModalEstadoCuenta de
 * adelante-flujo-desembolsos, adaptado al DS. Muestra precio, extras, pagos del
 * banco (movs vinculados a hitos), pagos del cliente y el resumen de saldo.
 */

const CONCEPTO_LABEL: Record<string, string> = {
  PRIMA: 'Prima',
  EXTRA: 'Extra',
  GASTO_ADICIONAL: 'Gasto adicional',
  CUOTA: 'Cuota',
  LOTE: 'Lote',
};

function estadoLabel(id: number): string {
  return id === 1 ? 'Entregado' : id === 2 ? 'Formalizado' : id === 4 ? 'Reservado' : `Estado ${id}`;
}

const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ds-gray-500';
const td = 'px-3 py-2 text-sm text-black';

export function EstadoCuentaModal({ idCaso, onClose }: { idCaso: number | null; onClose: () => void }) {
  const [data, setData] = useState<EstadoCuentaData | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!idCaso) return;
    setData(null);
    setError(null);
    setCargando(true);
    fetch(`/api/desembolsos/estado-cuenta?caso=${idCaso}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Error');
        return r.json();
      })
      .then((d) => setData(d as EstadoCuentaData))
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar el estado de cuenta.'))
      .finally(() => setCargando(false));
  }, [idCaso]);

  const c = data?.cabecera;
  const t = data?.totales;
  const esContado = (c?.AbrevBanco ?? '').toLowerCase() === 'contado';

  return (
    <Modal
      open={idCaso != null}
      onClose={onClose}
      size="xl"
      title={c ? `Estado de cuenta · ${c.Cliente}` : 'Estado de cuenta'}
    >
      {cargando && !data ? (
        <p className="text-ds-gray-400">Cargando estado de cuenta…</p>
      ) : error ? (
        <p className="rounded-ds border border-ds-red bg-ds-red/5 px-4 py-3 text-sm text-ds-red">{error}</p>
      ) : data && c && t ? (
        <div className="space-y-6">
          {/* Datos del caso */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <Dato label="Caso" valor={String(c.CodigoCaso ?? c.IDCaso)} />
            <Dato label="Proyecto" valor={c.NombreProyecto ?? '—'} />
            <Dato
              label="Lote"
              valor={`${c.AbreviaturaProyecto ?? ''} ${c.NombreBloque ? c.NombreBloque + ' ' : ''}${c.CodigoLote}${
                c.AreaLote_m2 ? ` · ${c.AreaLote_m2} m²` : ''
              }`}
            />
            <Dato label="Modelo" valor={c.NombreModelo ?? '—'} />
            <Dato label="Financiamiento" valor={esContado ? 'Contado' : c.NombreBanco ?? '—'} />
            <Dato label="Estado" valor={estadoLabel(c.IDEstado)} />
            <Dato label="Fecha reserva" valor={c.FechaReserva ?? '—'} />
            <Dato label="Fecha formalización" valor={c.FechaFormalizacion ?? '—'} />
          </div>

          {/* Precio */}
          <Seccion titulo="Precio">
            <FilaMonto label="Precio venta contractual" monto={t.PrecioVentaContractual_CRC} />
            {t.TotalExtras_CRC > 0 && <FilaMonto label="(+) Extras aprobados" monto={t.TotalExtras_CRC} />}
            {t.TotalDescuentos_CRC > 0 && (
              <FilaMonto label="(−) Descuentos aprobados" monto={-t.TotalDescuentos_CRC} />
            )}
            <FilaMonto label="Precio venta actual" monto={t.PrecioVentaActual_CRC} bold />
          </Seccion>

          {/* Extras */}
          {data.extras.length > 0 && (
            <Seccion titulo="Detalle de extras y descuentos aprobados">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ds-gray-200">
                    <th className={th}>Fecha</th>
                    <th className={th}>Tipo</th>
                    <th className={th}>Descripción</th>
                    <th className={`${th} text-right`}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {data.extras.map((e) => (
                    <tr key={e.IDExtra} className="border-b border-ds-gray-100 last:border-0">
                      <td className={`${td} text-ds-gray-500`}>{e.FechaAprobacion ?? e.FechaCotizacion ?? '—'}</td>
                      <td className={td}>{e.Tipo}</td>
                      <td className={td}>{e.Descripcion}</td>
                      <td className={`${td} text-right tabular-nums`}>
                        {formatCRC(e.Tipo === 'DESCUENTO' ? -e.MontoAjuste_CRC : e.MontoAjuste_CRC)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Seccion>
          )}

          {/* Pagos del banco */}
          {!esContado && t.MontoFinanciaBanco_CRC > 0 && (
            <Seccion titulo={`Pagos del banco · ${c.NombreBanco ?? ''}`}>
              <p className="mb-2 text-xs italic text-ds-gray-500">
                El banco financia {formatCRC(t.MontoFinanciaBanco_CRC)} del precio.
              </p>
              {data.pagosBanco.length === 0 ? (
                <p className="text-sm italic text-ds-gray-400">
                  Aún no hay desembolsos del banco vinculados a hitos.
                </p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-ds-gray-200">
                      <th className={th}>Fecha pago</th>
                      <th className={th}>Hito</th>
                      <th className={th}>Tipo mov</th>
                      <th className={`${th} text-right`}>Monto aplicado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pagosBanco.map((p) => (
                      <tr key={p.IDLink} className="border-b border-ds-gray-100 last:border-0">
                        <td className={`${td} text-ds-gray-500`}>{p.FechaMovimiento ?? '—'}</td>
                        <td className={td}>
                          {p.CodigoHito} · {p.NombreHito}
                        </td>
                        <td className={`${td} text-ds-gray-500`}>{p.AbreviaturaTipo ?? '—'}</td>
                        <td className={`${td} text-right tabular-nums`}>{formatCRC(p.MontoAplicado_CRC)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-ds-gray-200">
                      <td className={`${td} font-semibold`} colSpan={3}>
                        Total pagado por el banco
                      </td>
                      <td className={`${td} text-right font-semibold tabular-nums`}>
                        {formatCRC(t.TotalPagadoBanco_CRC)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </Seccion>
          )}

          {/* Pagos del cliente */}
          <Seccion titulo="Pagos del cliente">
            {data.pagos.length === 0 ? (
              <p className="text-sm italic text-ds-gray-400">No hay pagos del cliente capturados.</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ds-gray-200">
                    <th className={th}>Concepto</th>
                    <th className={th}>Fecha planeada</th>
                    <th className={`${th} text-right`}>Monto planeado</th>
                    <th className={th}>Fecha real</th>
                    <th className={`${th} text-right`}>Monto pagado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pagos.map((p) => (
                    <tr key={p.IDPago} className="border-b border-ds-gray-100 last:border-0">
                      <td className={td}>{CONCEPTO_LABEL[p.Concepto] ?? p.Concepto}</td>
                      <td className={`${td} text-ds-gray-500`}>{p.FechaPlaneada ?? '—'}</td>
                      <td className={`${td} text-right tabular-nums`}>{formatCRC(p.MontoPlaneado_CRC)}</td>
                      <td className={`${td} text-ds-gray-500`}>{p.FechaReal ?? '—'}</td>
                      <td className={`${td} text-right tabular-nums`}>
                        {p.MontoAplicado_CRC > 0 ? formatCRC(p.MontoAplicado_CRC) : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-ds-gray-200">
                    <td className={`${td} font-semibold`} colSpan={2}>
                      Totales
                    </td>
                    <td className={`${td} text-right font-semibold tabular-nums`}>
                      {formatCRC(t.TotalPlaneadoCliente_CRC)}
                    </td>
                    <td />
                    <td className={`${td} text-right font-semibold tabular-nums`}>
                      {formatCRC(t.TotalPagadoCliente_CRC)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </Seccion>

          {/* Resumen */}
          <Seccion titulo="Resumen">
            <FilaMonto label="Precio venta actual" monto={t.PrecioVentaActual_CRC} />
            {!esContado && (
              <FilaMonto label={`Pagado por el banco · ${c.AbrevBanco ?? ''}`} monto={t.TotalPagadoBanco_CRC} />
            )}
            <FilaMonto label="Pagado por el cliente" monto={t.TotalPagadoCliente_CRC} />
            <FilaMonto label="Total cubierto (banco + cliente)" monto={t.TotalCubierto_CRC} bold />
            <FilaMonto label="Saldo pendiente del caso" monto={t.SaldoTotalCaso_CRC} bold />
          </Seccion>
        </div>
      ) : null}
    </Modal>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-ds-gray-400">{label}</p>
      <p className="text-black break-words">{valor}</p>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-ds-lg border border-ds-gray-200 bg-white">
      <div className="border-b border-ds-gray-200 bg-ds-gray-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-ds-gray-500">
        {titulo}
      </div>
      <div className="overflow-x-auto p-3">{children}</div>
    </section>
  );
}

function FilaMonto({ label, monto, bold }: { label: string; monto: number; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 ${bold ? 'font-semibold text-black' : 'text-ds-gray-500'}`}>
      <span className="text-sm">{label}</span>
      <span className="font-mono text-sm tabular-nums text-black">{formatCRC(monto)}</span>
    </div>
  );
}
