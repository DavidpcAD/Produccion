import { redirect } from 'next/navigation';

// Crear colaborador se movió a Recursos Humanos. Se redirige al aviso de /usuarios.
export default function CrearColaboradorMovidoPage() {
  redirect('/usuarios');
}
