"use client";

import { AppShell } from "@/components/compras/shell";
import { InventariosView } from "@/components/compras/inventarios-view";

export default function ProveeduriaInventariosPage() {
  return (
    <AppShell role="proveeduria">
      <InventariosView tablaKey="inventarios-prov" />
    </AppShell>
  );
}
