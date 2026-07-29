import { Icon, type IconName } from '@/components/ds/Icon/Icon';

// Placeholder para secciones de Concreto aún en portado (se reemplaza al
// completar cada fase). Mantiene el submenú del Sidebar navegable sin 404.
export function Proximamente({
  titulo, descripcion, icon = 'traslado',
}: { titulo: string; descripcion: string; icon?: IconName }) {
  return (
    <div className="p-6 max-w-[1600px] mx-auto animate-fade-in">
      <h1 className="text-heading font-bold text-black">{titulo}</h1>
      <div className="mt-8 flex flex-col items-center justify-center text-center gap-3 py-20 bg-white rounded-ds-lg border border-ds-gray-200">
        <div className="w-14 h-14 rounded-full bg-ds-gray-100 flex items-center justify-center text-ds-gray-400">
          <Icon name={icon} size="lg" color="currentColor" />
        </div>
        <p className="text-black font-semibold">En portado</p>
        <p className="text-ds-gray-400 text-body-sm max-w-md">{descripcion}</p>
      </div>
    </div>
  );
}
