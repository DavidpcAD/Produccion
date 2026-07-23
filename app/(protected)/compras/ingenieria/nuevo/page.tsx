"use client";

import { useRouter } from "next/navigation";
import { AppShell } from "@/components/compras/shell";
import { useToast } from "@/components/compras/ui";
import { SolicitudForm } from "@/components/compras/solicitud-form";
import { useStore } from "@/lib/compras/store";

export default function NuevaSolicitudPage() {
  const router = useRouter();
  const toast = useToast();
  const { addPedido } = useStore();

  return (
    <AppShell role="ingenieria">
      <main className="page">
        <div className="back-link" onClick={() => router.push("/compras/ingenieria")}>Volver a solicitudes</div>
        <div className="page__head">
          <div className="page__title">
            <h1 className="ds-heading">Nueva solicitud</h1>
            <p className="ds-muted">Indicá el destino y agregá los materiales que necesitás.</p>
          </div>
        </div>
        <SolicitudForm
          textoBoton="Guardar solicitud"
          onCancelar={() => router.push("/compras/ingenieria")}
          guardar={async (input) => {
            const p = await addPedido(input);
            toast(`Solicitud ${p.numero} creada`, "success");
            router.push(`/compras/ingenieria/${p.id}`);
          }}
        />
      </main>
    </AppShell>
  );
}
