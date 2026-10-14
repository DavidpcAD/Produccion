"use client";

// NOT-IN-DS: gráfico de barras minimalista (sin librería), igual que el
// original en public/app.html — solo divs con altura proporcional, para no
// sumar una dependencia de charts a un design system que tampoco la trae.

export function MiniBarChart<T extends Record<string, unknown>>({
  data,
  valueKey,
  labelKey,
  tone = "green"
}: {
  data: T[];
  valueKey: keyof T;
  labelKey: keyof T;
  tone?: "green" | "black";
}) {
  const valores = data.map((d) => Number(d[valueKey]) || 0);
  const max = Math.max(1, ...valores);
  // "black" usa --ds-text (no el literal --ds-color-black): una barra
  // literalmente negra sería casi invisible sobre el fondo oscuro del tema.
  const color = tone === "green" ? "var(--ds-color-green-100)" : "var(--ds-text)";
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "var(--ds-space-3)", height: 160, padding: "var(--ds-space-2) 0" }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, gap: "var(--ds-space-1)" }}>
          <div style={{ fontSize: "var(--ds-font-size-body-sm)", color: "var(--ds-color-gray-500)" }}>{String(d[valueKey])}</div>
          <div
            style={{
              width: "100%",
              maxWidth: 36,
              height: Math.max(4, (Number(d[valueKey]) / max) * 110),
              borderRadius: "var(--ds-radius-sm)",
              background: color
            }}
          />
          <div style={{ fontSize: "var(--ds-font-size-body-sm)", color: "var(--ds-color-gray-400)" }}>{String(d[labelKey])}</div>
        </div>
      ))}
    </div>
  );
}
