import { redirect } from 'next/navigation';

// El Kanban se fusionó en el dashboard de Avance como una vista más
// (/avance con el toggle Lista/Matriz/Kanban). Esta ruta se conserva como
// enlace directo y redirige a esa vista.
export default function KanbanRedirect() {
  redirect('/avance?vista=kanban');
}
