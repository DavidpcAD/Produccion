"use client";

// NOT-IN-DS: tile de métrica para el dashboard. Compone Icon del DS sobre un
// panel con los tokens semánticos — no hay componente de tarjeta de
// estadística en el DS todavía.

import { Icon } from "@/components/mantenimiento/ds/Icon/Icon";
import type { IconName } from "@/components/mantenimiento/ds/Icon/Icon";

type Tono = "black" | "green" | "red" | "yellow";

const TONOS: Record<Tono, string> = {
  black: "var(--ds-text)",
  green: "var(--ds-color-green-200)",
  red: "var(--ds-color-red-200)",
  yellow: "var(--ds-color-yellow)"
};

export function StatTile({ label, value, icon, tone = "black" }: { label: string; value: string | number; icon?: IconName; tone?: Tono }) {
  const color = TONOS[tone] || TONOS.black;
  return (
    <div
      style={{
        background: "var(--ds-surface)",
        borderRadius: "var(--ds-radius-lg)",
        boxShadow: "var(--ds-shadow-01)",
        padding: "var(--ds-space-5)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--ds-space-2)",
        minWidth: 180,
        flex: 1
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-2)", color }}>
        {icon && <Icon name={icon} size="md" color={color} />}
        <span style={{ fontSize: "var(--ds-font-size-body-sm)", color: "var(--ds-color-gray-500)" }}>{label}</span>
      </div>
      <div style={{ fontSize: "var(--ds-font-size-heading)", fontWeight: "var(--ds-font-weight-semibold)" }}>{value}</div>
    </div>
  );
}
