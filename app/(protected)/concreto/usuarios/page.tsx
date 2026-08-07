'use client';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { PageShell, PageHeader } from '@/components/layout/Page';
import { useSession } from '@/hooks/useSession';
import { ROLES_APP, type RolApp, type UsuarioConRoles } from '@/lib/concreto/tipos-deps';

// Gestión de roles de usuarios del módulo Concreto (Microsoft Graph / Entra ID).
// No está en el submenú del sidebar; se llega por URL /concreto/usuarios.
// Requiere admin. Si Graph no está configurado, el GET devuelve 501 y se
// muestra un aviso claro.

export default function ConcretoUsuariosPage() {
  const session = useSession();
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const esAdmin = !!session && session.nivelAdmin >= 4;

  const [usuarios, setUsuarios] = useState<UsuarioConRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [noConfig, setNoConfig] = useState<string | null>(null);
  const [accionando, setAccionando] = useState<string | null>(null);

  const cargar = useCallback(async (texto?: string) => {
    setLoading(true);
    setNoConfig(null);
    try {
      const params = new URLSearchParams();
      if (texto && texto.trim()) params.set('q', texto.trim());
      const res = await fetch(`/api/concreto/usuarios?${params}`);
      const data = await res.json();
      if (res.status === 501) {
        setNoConfig(data.error ?? 'La gestión de usuarios no está configurada.');
        setUsuarios([]);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? 'Error cargando usuarios');
      setUsuarios(data.usuarios ?? []);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error cargando usuarios', 'error');
      setUsuarios([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (mounted && esAdmin) cargar();
  }, [mounted, esAdmin, cargar]);

  const asignar = async (u: UsuarioConRoles, rol: RolApp) => {
    setAccionando(`${u.oid}:${rol}`);
    try {
      const res = await fetch(`/api/concreto/usuarios/${u.oid}/asignar-rol`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rol }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo asignar el rol');
      toast(data.yaExistia ? `El usuario ya tenía el rol ${rol}` : `Rol ${rol} asignado`, 'success');
      await cargar(q);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error asignando rol', 'error');
    } finally {
      setAccionando(null);
    }
  };

  const quitar = async (u: UsuarioConRoles, rol: RolApp, assignmentId: string) => {
    setAccionando(`${u.oid}:${assignmentId}`);
    try {
      const res = await fetch(`/api/concreto/usuarios/${u.oid}/asignaciones/${assignmentId}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'No se pudo quitar el rol');
      toast(`Rol ${rol} quitado`, 'success');
      await cargar(q);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error quitando rol', 'error');
    } finally {
      setAccionando(null);
    }
  };

  if (mounted && !esAdmin) {
    return (
      <PageShell>
        <h1 className="text-heading font-bold text-ds-ink">Gestión de usuarios</h1>
        <p className="mt-4 text-ds-gray-400 text-body-sm">Necesitás permisos de administrador para ver esta página.</p>
      </PageShell>
    );
  }

  return (
    <PageShell width="narrow">
      <PageHeader
        title="Gestión de roles — Concreto"
        subtitle="Asigná o quitá roles de la app (Admin, Operador, Laboratorio, Ingeniería) a usuarios del tenant."
      />

      <form
        className="flex gap-3 mb-6"
        onSubmit={(e) => { e.preventDefault(); cargar(q); }}
      >
        <div className="flex-1">
          <Input
            placeholder="Buscar por nombre o correo (vacío = usuarios con rol asignado)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button type="submit" loading={loading}>Buscar</Button>
      </form>

      {noConfig && (
        <div className="rounded-ds-lg border-2 border-ds-yellow bg-transparent p-4 mb-6">
          <p className="text-sm font-medium text-ds-yellow-ink">Gestión de usuarios no configurada</p>
          <p className="mt-1 text-sm text-ds-gray-500">{noConfig}</p>
        </div>
      )}

      {loading && <p className="text-ds-gray-400">Cargando…</p>}

      {!loading && !noConfig && usuarios.length === 0 && (
        <p className="text-ds-gray-400">No hay usuarios para mostrar.</p>
      )}

      <ul className="flex flex-col gap-3">
        {usuarios.map((u) => {
          const rolesAsignados = new Set(u.roles.map((r) => r.rol));
          return (
            <li key={u.oid} className="rounded-ds-lg border border-ds-gray-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-ds-ink truncate">{u.nombre || '(sin nombre)'}</p>
                  <p className="text-sm text-ds-gray-400 truncate">{u.email || u.oid}</p>
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  {u.roles.length === 0 && <span className="text-sm text-ds-gray-300">Sin roles</span>}
                  {u.roles.map((r) => (
                    <button
                      key={r.assignmentId}
                      type="button"
                      title="Quitar rol"
                      disabled={accionando === `${u.oid}:${r.assignmentId}`}
                      onClick={() => quitar(u, r.rol, r.assignmentId)}
                      className="disabled:opacity-50"
                    >
                      <Badge variant="black">{r.rol} ✕</Badge>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 border-t border-ds-gray-100 pt-3">
                <span className="text-xs text-ds-gray-400 self-center mr-1">Asignar:</span>
                {ROLES_APP.filter((rol) => !rolesAsignados.has(rol)).map((rol) => (
                  <Button
                    key={rol}
                    size="xs"
                    variant="outline"
                    loading={accionando === `${u.oid}:${rol}`}
                    onClick={() => asignar(u, rol)}
                  >
                    + {rol}
                  </Button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </PageShell>
  );
}
