"use client";
import { useSession } from "@/hooks/useSession";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/compras/store";
import type { Role, Notificacion } from "@/lib/compras/types";
import {
  IconList, IconOptions, IconDuplicate, IconMatrix, IconTrack,
  IconReceipt, IconCheck, IconDelivery, IconFolder, IconPlus,
  IconBox, IconWarning, IconDashboard, IconEdit,
} from "@/components/compras/icons";

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Ícono por tipo de notificación (el color lo da la clase notif-item__icon--<tipo>).
const NOTIF_ICON: Record<Notificacion["tipo"], React.ReactNode> = {
  pedido: <IconList size={18} />,
  orden: <IconBox size={18} />,
  factura: <IconReceipt size={18} />,
  devuelto: <IconWarning size={18} />,
};

type IconCmp = React.ComponentType<{ size?: number }>;
// alt: rutas extra que activan esta pestaña. Prefijo por defecto; sufijo "$" = ruta exacta.
type NavItem = { href: string; label: string; icon: IconCmp; alt?: string[] };
type RoleAction = { href: string; label: string };

const ROLE_META: Record<Role, { label: string; persona: string; home: string; nav: NavItem[]; action?: RoleAction; color: string }> = {
  ingenieria: {
    label: "Ingeniería", persona: "Laura", home: "/compras/ingenieria", color: "var(--ds-color-green-100)",
    nav: [
      { href: "/compras/ingenieria", label: "Mis solicitudes", icon: IconList },
      { href: "/compras/ingenieria/devoluciones", label: "Devoluciones", icon: IconWarning },
      { href: "/compras/ingenieria/matriz", label: "Matriz", icon: IconMatrix },
      { href: "/compras/ingenieria/seguimiento", label: "Seguimiento", icon: IconTrack },
      { href: "/compras/ingenieria/clasificaciones", label: "Clasificaciones", icon: IconOptions },
      { href: "/compras/ingenieria/plantillas", label: "Plantillas", icon: IconDuplicate },
      { href: "/compras/ingenieria/inventarios", label: "Inventarios", icon: IconBox },
    ],
  },
  proveeduria: {
    label: "Proveeduría", persona: "Angie", home: "/compras/proveeduria/dashboard", color: "var(--ds-color-yellow)",
    action: { href: "/compras/proveeduria/directa", label: "Compra directa" },
    nav: [
      // Órdenes y Solicitudes son un mismo concepto cada uno, con dos vistas
      // (por documento / por línea) que se alternan con un toggle dentro de la página.
      { href: "/compras/proveeduria/dashboard", label: "Dashboard", icon: IconDashboard },
      { href: "/compras/proveeduria/solicitudes", label: "Solicitudes", icon: IconList, alt: ["/compras/proveeduria$"] },
      { href: "/compras/proveeduria/ordenes", label: "Órdenes", icon: IconReceipt, alt: ["/compras/proveeduria/pedidas", "/compras/proveeduria/nueva", "/compras/proveeduria/directa"] },
      { href: "/compras/proveeduria/devoluciones", label: "Devoluciones", icon: IconWarning },
      { href: "/compras/proveeduria/inventarios", label: "Inventarios", icon: IconBox },
    ],
  },
  aprobacion: {
    label: "Aprobación", persona: "Luis Roberto", home: "/compras/aprobacion", color: "var(--ds-color-green-200)",
    nav: [
      // A Aprobación nadie le devuelve: el flujo de devoluciones es
      // Aprobación → Proveeduría → Ingeniería, así que no lleva pestaña "Devoluciones".
      { href: "/compras/aprobacion", label: "Por aprobar", icon: IconCheck },
      { href: "/compras/aprobacion/todas", label: "Todas las órdenes", icon: IconReceipt },
    ],
  },
  facturacion: {
    // Bodega (ej. Pedro): recibe el material. Interfaz mínima — solo lo por recibir.
    label: "Bodega", persona: "Pedro", home: "/compras/facturacion", color: "var(--ds-color-red-100)",
    nav: [
      { href: "/compras/facturacion", label: "Órdenes por recibir", icon: IconDelivery },
      { href: "/compras/facturacion/recibidas", label: "Recibidas", icon: IconCheck },
    ],
  },
  contabilidad: {
    // Contabilidad (ej. Kathya): notas de crédito, cargos de tercero, consulta y archivo.
    label: "Contabilidad", persona: "Kattya", home: "/compras/facturacion/notas-credito", color: "var(--ds-color-gray-300)",
    nav: [
      { href: "/compras/facturacion/notas-credito", label: "Notas de crédito", icon: IconEdit },
      { href: "/compras/facturacion/cargo", label: "Cargo sobre factura", icon: IconPlus },
      { href: "/compras/facturacion/todas", label: "Todas las órdenes", icon: IconReceipt },
      { href: "/compras/facturacion/archivo", label: "Archivo", icon: IconFolder },
    ],
  },
};

export function AppShell({ role, children }: { role: Role; children: React.ReactNode }) {
  const { role: current, setRole, usuario, setUsuario, notificaciones, marcarNotifsLeidas, marcarNotifLeida, hydrated } = useStore();
  const router = useRouter();
  const pathname = usePathname();
  const [notifOpen, setNotifOpen] = useState(false);
  // Notificaciones relevantes para este rol (o sin rol específico).
  const notifsRol = notificaciones.filter((n) => !n.rol || n.rol === role);
  const noLeidas = notifsRol.filter((n) => !n.leida).length;
  function toggleNotif() {
    // Abrir el panel NO marca leídas: cada notificación queda resaltada (no leída)
    // hasta que el usuario la abre (clic) o usa "Marcar todas como leídas".
    setNotifOpen((o) => !o);
  }

  // Embebido en Produccion: el acceso ya lo controla el layout (protected) de la base
  // (sesión JWT + roles). En vez de rebotar al login propio de OC, ADOPTAMOS el rol que
  // pide la página actual y tomamos el nombre de usuario de la sesión de la base.
  const baseSession = useSession();
  useEffect(() => {
    if (!hydrated) return;
    if (current !== role) setRole(role);
    // El usuario del store debe reflejar SIEMPRE al de la sesión actual, no un valor
    // viejo cacheado en localStorage de otro login (si no, los pedidos/movimientos
    // salen atribuidos a la persona anterior — p.ej. "creado por" equivocado).
    if (baseSession?.nombre && usuario !== baseSession.nombre) setUsuario(baseSession.nombre);
  }, [current, role, hydrated, setRole, usuario, setUsuario, baseSession]);

  if (!hydrated || current !== role) {
    return <div className="page"><div className="empty">Cargando…</div></div>;
  }

  const meta = ROLE_META[role];
  // Ingeniería muestra su navegación como submenú en el sidebar de la base
  // (Órdenes de Compra), así que acá no repetimos los tabs de arriba.
  const hasNav = meta.nav.length > 1 && role !== 'ingenieria';
  // Cuál item del nav está activo (match más largo por href/alt).
  const activeHref = meta.nav
    .map((n) => {
      let len = pathname.startsWith(n.href) ? n.href.length : 0;
      for (const a of n.alt ?? []) {
        if (a.endsWith("$")) { if (pathname === a.slice(0, -1)) len = Math.max(len, 1000); }
        else if (pathname.startsWith(a)) len = Math.max(len, a.length);
      }
      return { href: n.href, len };
    })
    .filter((x) => x.len > 0)
    .sort((a, b) => b.len - a.len)[0]?.href ?? "";  // sin match → no se marca ninguna (no cae al home)

  // Embebido en Produccion: NO renderizamos chrome propio (topbar/barra oscura) para no
  // duplicar el del shell de la base. Solo una fila de tabs (sub-navegación del módulo)
  // con el estilo del Design System, y el contenido.
  return (
    <div className="px-4 py-6 sm:px-6 md:px-8">
      {hasNav && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-1.5 rounded-ds-lg border border-ds-gray-200 bg-ds-surface p-1 w-fit">
            {meta.nav.map((n) => {
              const active = activeHref === n.href;
              return (
                <button
                  key={n.href}
                  type="button"
                  onClick={() => router.push(n.href)}
                  aria-current={active ? "page" : undefined}
                  className={
                    "rounded-ds px-3.5 py-1.5 text-label font-semibold transition-colors " +
                    (active
                      ? "bg-black text-white"
                      : "text-ds-gray-500 hover:bg-ds-gray-100 hover:text-ds-ink")
                  }
                >
                  {n.label}
                </button>
              );
            })}
          </div>
          {meta.action && (
            <button
              type="button"
              onClick={() => router.push(meta.action!.href)}
              className="ml-auto inline-flex items-center gap-1 rounded-ds bg-brand px-3.5 py-1.5 text-label font-semibold text-black transition-colors"
            >
              <IconPlus size={18} /> {meta.action.label}
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

export { ROLE_META };
