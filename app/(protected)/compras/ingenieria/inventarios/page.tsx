"use client";

import { AppShell } from "@/components/compras/shell";
import { InventariosView } from "@/components/compras/inventarios-view";

export default function InventariosPage() {
  return (
    <AppShell role="ingenieria">
      <InventariosView tablaKey="inventarios-ing" />
    </AppShell>
  );
}
