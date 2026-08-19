import { redirect } from "next/navigation";

// La pantalla completa de "nueva solicitud" ya no existe: el pedido se crea en el
// drawer de la lista ("+ Nueva solicitud"). Esta ruta queda solo para que los
// enlaces viejos caigan en la lista y no en el "Pedido no encontrado" de /[id]
// (que es la ruta que atrapaba /nuevo al borrar esta pantalla).
export default function NuevaSolicitudRedirect() {
  redirect("/compras/ingenieria");
}
