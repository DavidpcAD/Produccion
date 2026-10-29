'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KPI_POR_ID, SLOTS, SLOT_NOMBRE, DEFAULT_SLOTS, WEEK, type Kpi, type SlotSize,
} from './kpis';
import { Sparkline } from './charts';
import { KpiPicker } from './KpiPicker';
import { KpiDetail } from './KpiDetail';
import {
  IconInicio, IconFlujo, IconPersonal, IconCostos, IconAlertas, IconPlus,
} from './icons';

// ─────────────────────────────────────────────────────────────────────────
// Tablero de Gerencia (app "KPI Adelante" de Marcos, portada nativa).
//   · Tocar una tarjeta → detalle del KPI.
//   · Mantener presionada una tarjeta → selector para cambiar ese KPI.
//   · Tocar (o mantener) un "+" → selector para agregar un KPI a ese espacio.
// 8 espacios fijos (ver SLOTS). El tablero de cada persona se guarda en ESTE
// navegador (se limpia al salir, ver lib/sesion-local.ts). Datos de ejemplo.
// ─────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'adelante_kpi_tablero_v1';

function cargar(): (string | null)[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (Array.isArray(saved) && saved.length === SLOTS.length &&
        saved.every((k) => k === null || KPI_POR_ID[k])) {
      return saved as (string | null)[];
    }
  } catch { /* ignore */ }
  return DEFAULT_SLOTS.slice();
}

type Tab = 'inicio' | 'flujo' | 'personal' | 'costos' | 'alertas';
const TABS: { id: Tab; label: string; Icon: typeof IconInicio }[] = [
  { id: 'inicio', label: 'Inicio', Icon: IconInicio },
  { id: 'flujo', label: 'Flujo', Icon: IconFlujo },
  { id: 'personal', label: 'Personal', Icon: IconPersonal },
  { id: 'costos', label: 'Costos', Icon: IconCostos },
  { id: 'alertas', label: 'Alertas', Icon: IconAlertas },
];

export function KpiApp() {
  const [slots, setSlots] = useState<(string | null)[]>(() => DEFAULT_SLOTS.slice());
  const [pickSlot, setPickSlot] = useState<number | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('inicio');
  const hidratado = useRef(false);

  // Hidratar desde el navegador DESPUÉS del primer render (evita desajuste SSR).
  useEffect(() => { setSlots(cargar()); hidratado.current = true; }, []);
  useEffect(() => {
    if (!hidratado.current) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(slots)); } catch { /* ignore */ }
  }, [slots]);

  const enTablero = useMemo(
    () => new Set(slots.filter((k): k is string => !!k)),
    [slots],
  );

  // Elegir KPI k para el espacio pickSlot. Si k ya estaba en pantalla, intercambia
  // lugares (igual que la app original); si el espacio estaba vacío, lo mueve.
  const elegir = (k: string) => {
    if (pickSlot === null) return;
    const i = pickSlot;
    setSlots((prev) => {
      const j = prev.indexOf(k);
      if (j === i) return prev;
      const next = prev.slice();
      if (j >= 0) next[j] = next[i];
      next[i] = k;
      return next;
    });
    setPickSlot(null);
  };
  const quitar = () => {
    if (pickSlot === null) return;
    const i = pickSlot;
    setSlots((prev) => { const next = prev.slice(); next[i] = null; return next; });
    setPickSlot(null);
  };

  const detalle = detalleId ? KPI_POR_ID[detalleId] : null;
  if (detalle) {
    return <KpiDetail kpi={detalle} onVolver={() => setDetalleId(null)} />;
  }

  const pickSize: SlotSize | null = pickSlot !== null ? SLOTS[pickSlot] : null;
  const pickActual = pickSlot !== null ? slots[pickSlot] : null;

  return (
    <>
      <div className="kpi-screen">
        <div className="kpi-col">
          <header className="kpi-head">
            <div className="kpi-brand"><b>Adelante</b><span>Gerencia</span></div>
            <span className="kpi-chip-ejemplo">Datos de ejemplo</span>
          </header>

          {tab === 'inicio' ? (
            <>
              <h1 className="kpi-h1">Esta semana</h1>
              <p className="kpi-subtitle" suppressHydrationWarning>Semana {WEEK} · Ciudad del Valle</p>
              <div className="kpi-grid">
                {SLOTS.map((size, i) => {
                  const kpi = slots[i] ? KPI_POR_ID[slots[i] as string] : null;
                  return kpi ? (
                    <KpiCard
                      key={i} kpi={kpi} size={size}
                      onTap={() => setDetalleId(kpi.id)}
                      onHold={() => setPickSlot(i)}
                    />
                  ) : (
                    <AddCard key={i} size={size} onOpen={() => setPickSlot(i)} />
                  );
                })}
              </div>
            </>
          ) : (
            <Placeholder label={TABS.find((t) => t.id === tab)?.label ?? ''} />
          )}
        </div>
      </div>

      <nav className="kpi-nav" aria-label="Secciones">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} type="button"
            className={`kpi-nav__btn${tab === id ? ' is-active' : ''}`}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => setTab(id)}>
            <span className="kpi-nav__ic"><Icon /></span>
            {label}
          </button>
        ))}
      </nav>

      {pickSize && (
        <KpiPicker
          size={pickSize}
          enTablero={enTablero}
          actual={pickActual}
          onElegir={elegir}
          onQuitar={pickActual ? quitar : undefined}
          onCerrar={() => setPickSlot(null)}
        />
      )}
    </>
  );
}

// ── Tarjeta de KPI ──────────────────────────────────────────────────────────
function flecha(dir: 'up' | 'down' | 'flat') {
  return dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■';
}

function KpiCard({ kpi, size, onTap, onHold }: { kpi: Kpi; size: SlotSize; onTap: () => void; onHold: () => void }) {
  const { pressing, handlers } = useLongPress(onTap, onHold);
  return (
    <button type="button"
      className={`kpi-card kpi-card--${size}${pressing ? ' is-pressing' : ''}`}
      aria-label={`${kpi.nombre}: ${kpi.valor}. Toque para ver detalle; mantenga presionado para cambiar.`}
      {...handlers}>
      <span className="kpi-card__top">
        <span className="kpi-card__name">{kpi.nombre}</span>
        <span className="kpi-card__src">{kpi.fuente}</span>
      </span>
      {size === 'hero' && <Sparkline serie={kpi.serie} stroke="var(--kpi-ink)" />}
      {size === 'wide' && <Sparkline serie={kpi.serie} stroke="var(--kpi-lime)" />}
      <span className="kpi-num kpi-card__value">{kpi.valor}</span>
      <span className="kpi-card__unit">{kpi.unidad}</span>
      <span className="kpi-card__foot">
        <span className="kpi-trend" data-sent={kpi.trend.sent}>
          <span className="kpi-trend__arrow">{flecha(kpi.trend.dir)}</span>{kpi.trend.delta}
        </span>
      </span>
    </button>
  );
}

function AddCard({ size, onOpen }: { size: SlotSize; onOpen: () => void }) {
  // En blanco: tocar o mantener presionado hacen lo mismo (abrir el selector).
  const { pressing, handlers } = useLongPress(onOpen, onOpen);
  return (
    <button type="button"
      className={`kpi-add kpi-add--${size}${pressing ? ' is-pressing' : ''}`}
      aria-label={`Agregar KPI al ${SLOT_NOMBRE[size]}`}
      {...handlers}>
      <IconPlus />
      {size === 'hero' && <span className="kpi-add__hint">Agregar KPI</span>}
    </button>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '72px 0 40px' }}>
      <div className="kpi-eyebrow" style={{ color: 'var(--kpi-muted)' }}>{label}</div>
      <h1 className="kpi-h1" style={{ marginTop: 10 }}>Próximamente</h1>
      <p className="kpi-subtitle" style={{ marginBottom: 0 }}>Esta sección es parte del prototipo.</p>
    </div>
  );
}

// ── Toque vs. mantener presionado ────────────────────────────────────────────
function useLongPress(onTap: () => void, onHold: () => void, delay = 440) {
  const [pressing, setPressing] = useState(false);
  const held = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inicio = useRef<{ x: number; y: number } | null>(null);

  const limpiar = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== undefined && e.button !== 0) return;
    held.current = false;
    inicio.current = { x: e.clientX, y: e.clientY };
    setPressing(true);
    timer.current = setTimeout(() => { held.current = true; setPressing(false); onHold(); }, delay);
  };
  const onPointerUp = () => {
    limpiar();
    setPressing(false);
    if (!held.current) onTap();
  };
  const cancelar = () => { limpiar(); setPressing(false); held.current = false; };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!inicio.current) return;
    if (Math.abs(e.clientX - inicio.current.x) > 10 || Math.abs(e.clientY - inicio.current.y) > 10) {
      limpiar(); setPressing(false);
    }
  };
  // Tras un "hold", el navegador dispara un click fantasma: lo bloqueamos.
  const onClick = (e: React.MouseEvent) => { if (held.current) { e.preventDefault(); e.stopPropagation(); } };
  const onContextMenu = (e: React.MouseEvent) => e.preventDefault();

  return {
    pressing,
    handlers: { onPointerDown, onPointerUp, onPointerLeave: cancelar, onPointerCancel: cancelar, onPointerMove, onClick, onContextMenu },
  };
}
