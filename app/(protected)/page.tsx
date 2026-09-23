import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { rutaDeEntrada } from '@/lib/permissions';
import { PageShell } from '@/components/layout/Page';
import { Icon } from '@/components/ds/Icon/Icon';

// LA RAÍZ YA NO ES UNA PANTALLA: es la puerta.
//
// Acá vivía el Dashboard (tarjetas de métricas, acciones rápidas y la lista de obras).
// Se quitó por pedido de David: era un rodeo entre abrir la app y ponerse a trabajar, y
// para llegar a él había que correr media docena de consultas contra tres bases —obras,
// H4, utilidades, cuadrillas, presupuesto, concreto, desembolsos— antes de pintar nada.
//
// Ahora se entra directo a la primera pantalla del menú que la persona puede abrir
// (Proyectos para casi todos; ver `rutaDeEntrada`). La raíz se conserva como ruta
// porque medio sistema apunta a ella: el logo del menú, los "Volver al inicio" de las
// pantallas de administración, el `volver` del login y los rebotes del proxy y del
// layout cuando alguien escribe a mano una ruta que no le toca.
export const dynamic = 'force-dynamic';

export default async function Entrada() {
  const session = await getSession();
  const destino = rutaDeEntrada(session?.modules, session?.nivelAdmin ?? 0);

  if (destino) redirect(destino);

  // Sin ninguna pantalla asignada. Se DICE, en vez de rebotarla de una ruta a otra:
  // el rebote se vería como una app rota y no como un permiso que falta.
  return (
    <PageShell>
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Icon name="rol" size="lg" color="currentColor" className="mb-3 text-ds-gray-300" />
        <h1 className="text-sub font-bold text-ds-ink">Tu rol todavía no tiene pantallas asignadas</h1>
        <p className="mt-1.5 max-w-md text-body-sm text-ds-gray-400">
          Entraste bien, pero el rol de Producción de tu cuenta no habilita ningún módulo.
          Pedile a TI que te asigne uno en rh.adelante.cr.
        </p>
      </div>
    </PageShell>
  );
}
