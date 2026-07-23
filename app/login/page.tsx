'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ds/Icon/Icon';
import { Input } from '@/components/ui/Input';
import { Combobox } from '@/components/ui/Combobox';
import { useToast } from '@/components/ui/Toast';
import { Eye, EyeSlash, Wrench } from '@phosphor-icons/react';

interface DevUser {
  idUsuario: number;
  username: string;
  nombre: string;
  cedula: string;
  nivelAdmin: number;
  roles: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [cedula, setCedula] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  // Dev-login (solo aparece si el endpoint /api/auth/dev-users responde)
  const [devUsers, setDevUsers] = useState<DevUser[]>([]);
  const [devUserId, setDevUserId] = useState('');
  const [devLoading, setDevLoading] = useState(false);

  useEffect(() => {
    fetch('/api/auth/dev-users')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.data?.length) setDevUsers(d.data); })
      .catch(() => {});
  }, []);

  async function handleDevLogin() {
    if (!devUserId) { toast('Elegí un usuario', 'warning'); return; }
    setDevLoading(true);
    try {
      const res = await fetch('/api/auth/dev-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idUsuario: Number(devUserId) }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'No se pudo entrar', 'error'); return; }
      toast(`Sesión dev: ${data.usuario?.nombre ?? ''}`, 'success');
      router.push('/');
    } finally {
      setDevLoading(false);
    }
  }

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cedula, password }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Credenciales inválidas', 'error'); return; }
      toast('¡Bienvenido!', 'success');
      router.push('/');
    } finally {
      setLoading(false);
    }
  }

  const features = [
    { icon: 'user',   text: 'Gestión de colaboradores y roles' },
    { icon: 'folder', text: 'Proyectos sincronizados con Business Central' },
    { icon: 'rol',    text: 'Acceso seguro al sistema interno' },
  ];

  return (
    <div className="min-h-screen flex bg-ds-bg">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[560px] flex-col bg-black relative overflow-hidden shrink-0">
        {/* Brand glow */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-brand/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-brand/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col justify-between h-full p-12">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-ds-lg bg-brand flex items-center justify-center shadow-ds-02">
              <Icon name="folder" size="lg" color="currentColor" className="text-black" />
            </div>
            <div>
              <p className="text-white font-bold text-base leading-tight">Adelante</p>
              <p className="text-white/40 text-xs">Desarrollos</p>
            </div>
          </div>

          {/* Heading */}
          <div>
            <p className="text-brand text-sm font-semibold uppercase tracking-widest mb-3">Sistema Interno</p>
            <h1 className="text-5xl font-bold text-white mb-4 leading-tight">
              Control de<br />
              <span className="text-brand">Usuarios</span>
            </h1>
            <p className="text-white/50 text-lg mb-10 leading-relaxed">
              Gestión centralizada de colaboradores,<br />proyectos y cuadrillas de trabajo.
            </p>

            <div className="flex flex-col gap-3">
              {features.map(({ icon, text }) => (
                <div key={text} className="flex items-center gap-3 border border-white/10 bg-white/5 rounded-ds-lg px-4 py-3">
                  <div className="w-8 h-8 rounded-ds bg-brand/20 flex items-center justify-center shrink-0">
                    <Icon name={icon} size="sm" color="currentColor" className="text-brand" />
                  </div>
                  <span className="text-white/70 text-sm font-medium">{text}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-white/20 text-xs">
            © {new Date().getFullYear()} Adelante Desarrollos
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <div className="w-9 h-9 rounded-ds-lg bg-black flex items-center justify-center">
              <Icon name="folder" size="md" color="currentColor" className="text-brand" />
            </div>
            <span className="font-bold text-black">Adelante Desarrollos</span>
          </div>

          <div className="animate-fade-in">
            <div className="mb-8">
              <h2 className="text-heading font-bold text-black mb-1">Iniciar sesión</h2>
              <p className="text-ds-gray-400 text-sm">Ingresa tu usuario y contraseña para continuar</p>
            </div>

            <form onSubmit={handleCredentials} className="space-y-4">
              <Input
                label="Usuario"
                type="text"
                placeholder="usuario"
                value={cedula}
                onChange={e => setCedula(e.target.value)}
                required
                autoFocus
                leftIcon={<Icon name="user" size="md" color="currentColor" />}
              />
              <Input
                label="Contraseña"
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                leftIcon={<Icon name="rol" size="md" color="currentColor" />}
                rightElement={
                  <button type="button" onClick={() => setShowPass(!showPass)} className="text-ds-gray-400 hover:text-black transition-colors">
                    {showPass ? <EyeSlash size={18} weight="bold" /> : <Eye size={18} weight="bold" />}
                  </button>
                }
              />
              <div className="pt-1">
                <Button type="submit" className="w-full" size="lg" loading={loading}>
                  Iniciar sesión
                </Button>
              </div>
            </form>

            {/* Acceso de desarrollo — sin contraseña. Solo visible en local. */}
            {devUsers.length > 0 && (
              <div className="mt-8 pt-6 border-t border-dashed border-ds-gray-200">
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-ds bg-amber-100 text-amber-700 text-xs font-bold uppercase tracking-wide">
                    <Wrench size={12} weight="bold" /> Dev
                  </span>
                  <span className="text-xs text-ds-gray-400">Acceso rápido sin contraseña (AdelanteSBX)</span>
                </div>
                <div className="space-y-3">
                  <Combobox
                    label="Entrar como…"
                    value={devUserId}
                    onChange={setDevUserId}
                    placeholder={`Seleccionar usuario (${devUsers.length})`}
                    options={devUsers.map(u => ({
                      value: String(u.idUsuario),
                      label: `${u.nombre} ${u.username} ${u.roles} ${u.nivelAdmin}`,
                      parts: [
                        { text: u.nombre, weight: 'bold' as const },
                        { text: `@${u.username}`, weight: 'normal' as const },
                        ...(u.roles ? [{ text: u.roles, weight: 'light' as const }] : []),
                      ],
                    }))}
                  />
                  <Button type="button" variant="outline" className="w-full" loading={devLoading} onClick={handleDevLogin}>
                    Entrar (dev)
                  </Button>
                </div>
              </div>
            )}
          </div>

          <p className="mt-10 text-center text-xs text-ds-gray-300">
            Sistema interno · Adelante Desarrollos · {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}
