import { redirect } from 'next/navigation';

// El detalle/edición de colaboradores se movió a Recursos Humanos.
// Se redirige al aviso de /usuarios.
export default function ColaboradorDetalleMovidoPage() {
  redirect('/usuarios');
}
