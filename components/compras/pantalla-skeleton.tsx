"use client";

import { useEffect, useState } from "react";
import { Card, Skeleton } from "@/components/compras/ui";

// Cuando la espera se estira, decirlo. Un esqueleto quieto por veinte segundos se
// lee como "la app es lenta"; casi siempre es que el servidor se está reiniciando
// por una publicación, y con eso basta: esperar un momento y recargar.
function AvisoLento() {
  const [seg, setSeg] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeg((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (seg < 8) return null;
  const mucho = seg >= 20;
  return (
    <div className={`oc-espera${mucho ? " is-mucho" : ""}`} role="status">
      <span className="oc-espera__punto" aria-hidden />
      <span className="oc-espera__txt">
        {mucho ? (
          <>
            <span className="ds-strong">Esto no debería tardar tanto.</span>{" "}
            Puede que el equipo de TI esté publicando una actualización: el sistema se
            reinicia unos segundos. Esperá un momento y recargá.
          </>
        ) : (
          <>Está tardando más de lo normal. Seguimos cargando…</>
        )}
      </span>
      {mucho && (
        <button type="button" className="oc-espera__btn" onClick={() => window.location.reload()}>
          Recargar
        </button>
      )}
    </div>
  );
}

// Esqueleto de una pantalla de Compras mientras llegan los datos.
//
// Antes acá había un "Cargando…" centrado en una página en blanco: además de feo,
// no decía nada de lo que venía y hacía saltar todo el contenido de golpe al llegar.
// Este esqueleto dibuja la MISMA geometría de la pantalla real —encabezado, tarjetas
// de resumen, barra de la tabla y filas— así que lo que ocurre al cargar es que las
// barras se llenan, no que la página se rearma.
export function PantallaSkeleton({
  tiles = 5,
  filas = 8,
  conTabs = false,
  forma = "tabla",
}: {
  /** Cuántas tarjetas de resumen (KPI) tiene la pantalla. 0 = no lleva. */
  tiles?: number;
  filas?: number;
  /** La fila de pestañas del módulo (Proveeduría, Bodega…). Ingeniería no la lleva. */
  conTabs?: boolean;
  /** Qué va DEBAJO de las tarjetas: la tabla de una lista, los paneles del Resumen o
   *  la bandeja de Aprobación (lista de tarjetas + riel al lado). Con la forma
   *  equivocada el esqueleto deja de servir: promete una cosa y aparece otra, que es
   *  justo el salto que se quería evitar. */
  forma?: "tabla" | "paneles" | "bandeja";
}) {
  if (forma === "bandeja") {
    return (
      <div className="px-4 py-6 sm:px-6 md:px-8" role="status" aria-label="Cargando…">
        <div className="oc-bandeja">
          <div className="oc-bandeja__lista">
            <AvisoLento />
            <div className="oc-bandeja__head" style={{ display: "grid", gap: 10 }}>
              <Skeleton width="min(420px, 80%)" height={30} />
              <Skeleton width="min(620px, 100%)" height={13} radius="var(--ds-radius-sm)" />
            </div>

            {/* Fichas de estado + Filtros y orden, en su misma fila. */}
            <div className="oc-barra">
              <div className="oc-fichas">
                {[124, 168, 140].map((w, i) => (
                  <Skeleton key={i} width={w} height={40} pill />
                ))}
              </div>
              <div className="oc-barra__acciones">
                <Skeleton width={104} height={44} pill />
                <Skeleton width={180} height={48} pill />
              </div>
            </div>

            <div className="oc-bandeja__filas">
              {Array.from({ length: filas }).map((_, f) => (
                <article key={f} className="oc-fila">
                  <div className="oc-fila__top">
                    <Skeleton width={20} height={20} radius="var(--ds-radius-sm)" style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 6 }}>
                      <Skeleton width={`${34 - (f % 3) * 4}%`} height={14} radius="var(--ds-radius-sm)" />
                      <Skeleton width={`${62 - (f % 4) * 6}%`} height={12} radius="var(--ds-radius-sm)" />
                      <Skeleton width={`${44 - (f % 3) * 5}%`} height={10} radius="var(--ds-radius-sm)" />
                    </div>
                    <Skeleton width={128} height={18} radius="var(--ds-radius-sm)" style={{ flexShrink: 0 }} />
                    <Skeleton width={26} height={26} radius="var(--ds-radius-md)" style={{ flexShrink: 0 }} />
                  </div>
                </article>
              ))}
            </div>
          </div>

          {/* El riel de la derecha: mientras no hay orden elegida, es el mismo hueco. */}
          <aside className="oc-riel">
            <div className="oc-riel__vacio" style={{ gap: 12 }}>
              <Skeleton width={160} height={16} radius="var(--ds-radius-sm)" />
              <Skeleton width="min(260px, 80%)" height={12} radius="var(--ds-radius-sm)" />
              <Skeleton width="min(220px, 70%)" height={12} radius="var(--ds-radius-sm)" />
            </div>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 md:px-8" role="status" aria-label="Cargando…">
      {conTabs && (
        <div className="mb-6 flex flex-wrap items-center gap-1.5 rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-1 w-fit">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} width={96} height={26} radius="var(--ds-radius-md)" />
          ))}
        </div>
      )}

      <main className="page page--wide">
        <AvisoLento />
        <div className="page__head">
          <div className="page__title" style={{ flex: 1, minWidth: 0, display: "grid", gap: 10 }}>
            <Skeleton width="min(320px, 70%)" height={26} />
            <Skeleton width="min(560px, 100%)" height={13} radius="var(--ds-radius-sm)" />
          </div>
          <Skeleton width={150} height={38} radius="var(--ds-radius-md)" style={{ flexShrink: 0 }} />
        </div>

        {tiles > 0 && (
          <div className="tiles mt-2">
            {Array.from({ length: tiles }).map((_, i) => (
              <Card key={i} style={{ display: "grid", gap: 8 }}>
                <Skeleton width={56} height={28} />
                <Skeleton width="72%" height={12} radius="var(--ds-radius-sm)" />
              </Card>
            ))}
          </div>
        )}

        {forma === "paneles" ? (
          <div className="resumen__grid">
            {[0, 1, 2].map((i) => (
              <Card key={i} style={{ display: "grid", gap: 14 }}>
                <Skeleton width="min(240px, 60%)" height={16} />
                <Skeleton width="min(340px, 85%)" height={11} radius="var(--ds-radius-sm)" />
                {Array.from({ length: 5 }).map((_, f) => (
                  <div key={f} className="row gap-3" style={{ alignItems: "center" }}>
                    <Skeleton width={3} height={30} radius={2} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, display: "grid", gap: 6 }}>
                      <Skeleton width={`${70 - f * 6}%`} height={11} radius="var(--ds-radius-sm)" />
                      <Skeleton width={`${52 - f * 4}%`} height={9} radius="var(--ds-radius-sm)" />
                    </div>
                    <Skeleton width={48} height={14} radius="var(--ds-radius-sm)" style={{ flexShrink: 0 }} />
                  </div>
                ))}
              </Card>
            ))}
            <Card className="panel--ancho" style={{ display: "grid", gap: 14 }}>
              <Skeleton width="min(240px, 40%)" height={16} />
              <Skeleton width="100%" height={180} radius="var(--ds-radius-lg)" />
            </Card>
          </div>
        ) : (
        <div className="mt-6">
          {/* Barra de la tabla: buscador + acciones, como en DataTable. */}
          <div className="row row--between wrap gap-3" style={{ marginBottom: 14, alignItems: "center" }}>
            <Skeleton width="min(280px, 60%)" height={34} radius="var(--ds-radius-md)" />
            <div className="row gap-2" style={{ alignItems: "center" }}>
              <Skeleton width={72} height={30} radius="var(--ds-radius-md)" />
              <Skeleton width={110} height={30} radius="var(--ds-radius-md)" />
            </div>
          </div>

          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "grid", gap: 1, background: "var(--ds-color-gray-100)" }}>
              {/* Encabezado */}
              <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 16, padding: "14px 16px", background: "var(--ds-color-gray-50, var(--ds-surface))" }}>
                {ANCHOS_TITULO.map((w, i) => (
                  <Skeleton key={i} width={w} height={11} radius="var(--ds-radius-sm)" />
                ))}
              </div>
              {Array.from({ length: filas }).map((_, f) => (
                <div key={f} style={{ display: "grid", gridTemplateColumns: COLS, gap: 16, padding: "15px 16px", background: "var(--ds-surface)", alignItems: "center" }}>
                  {ANCHOS_CELDA.map((w, i) => (
                    <Skeleton key={i} width={w} height={12} radius="var(--ds-radius-sm)" />
                  ))}
                </div>
              ))}
            </div>
          </Card>
        </div>
        )}
      </main>
    </div>
  );
}

// Anchos desparejos a propósito: una grilla de barras todas iguales se lee como una
// tabla vacía de verdad, no como algo que está cargando.
const COLS = "80px minmax(90px, 1fr) 110px minmax(160px, 1.4fr) minmax(120px, 1.6fr) 120px 90px";
const ANCHOS_TITULO = ["70%", "60%", "55%", "50%", "65%", "58%", "62%"];
const ANCHOS_CELDA = ["64%", "78%", "70%", "88%", "92%", "72%", "56%"];
