'use client';
import { useEffect } from 'react';
import { descripcionDetalle, SEMANAS, TICKS, type Kpi } from './kpis';
import { TrendChart } from './charts';
import { IconChevronLeft } from './icons';

export function KpiDetail({ kpi, onVolver }: { kpi: Kpi; onVolver: () => void }) {
  // Escape vuelve al tablero.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onVolver(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onVolver]);

  return (
    <div className="kpi-detail">
      <header className="kpi-detail__slab">
        <span className="kpi-detail__chip">{kpi.fuente} • {kpi.obra}</span>
        <div className="kpi-detail__name">{kpi.nombre}</div>
        <div className="kpi-num kpi-detail__value">{kpi.valor}</div>
        <div className="kpi-detail__unit">{kpi.unidad}</div>
        <div className="kpi-detail__stats">
          <Stat label="Meta" valor={kpi.meta} />
          <Stat label="Sem. anterior" valor={kpi.semAnterior} />
          <Stat label="Prom. 12 sem." valor={kpi.prom12} />
        </div>
      </header>

      <div className="kpi-detail__body">
        <section className="kpi-section">
          <div className="kpi-section__head">
            <h3 className="kpi-section__title">Tendencia</h3>
            <span className="kpi-section__note">Últimas 12 semanas</span>
          </div>
          <TrendChart serie={kpi.serie} metaNum={kpi.metaNum} meta={kpi.meta} valor={kpi.valor} nombre={kpi.nombre} />
          <div className="kpi-axis">
            {TICKS.map((i) => <span key={i}>{SEMANAS[i]}</span>)}
          </div>
        </section>

        <section className="kpi-section">
          <div className="kpi-section__head">
            <h3 className="kpi-section__title">{kpi.desgloseTitulo}</h3>
            <span className="kpi-section__note">vs. semana anterior</span>
          </div>
          <div className="kpi-break">
            {kpi.desglose.map((d) => (
              <div className="kpi-break__row" key={d.etiqueta}>
                <span className="kpi-break__label">{d.etiqueta}</span>
                <span className="kpi-break__val">{d.valor}</span>
                <span className="kpi-break__delta" data-sent={d.sent}>{d.delta}</span>
              </div>
            ))}
          </div>
        </section>

        <p className="kpi-detail__desc">{descripcionDetalle(kpi)}</p>
      </div>

      <button type="button" className="kpi-detail__back" onClick={onVolver}>
        <IconChevronLeft /> Volver
      </button>
    </div>
  );
}

function Stat({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="kpi-stat">
      <div className="kpi-stat__label">{label}</div>
      <div className="kpi-num kpi-stat__value">{valor}</div>
    </div>
  );
}
