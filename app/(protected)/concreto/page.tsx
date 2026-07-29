import { redirect } from 'next/navigation';

// El índice del módulo Concreto redirige al Dashboard. La navegación entre
// secciones (Coladas, Batches, Laboratorio, etc.) vive en el submenú del
// Sidebar (patrón de "Órdenes de Compra").
export default function ConcretoIndex() {
  redirect('/concreto/dashboard');
}
