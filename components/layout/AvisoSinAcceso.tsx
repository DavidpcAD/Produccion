'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Aviso } from '@/components/ui/Aviso';

// ─── "Esa pantalla no es tuya" ───────────────────────────────────────────────
//
// Cuando alguien escribe a mano —o abre un link viejo de— una ruta que su rol no
// abre, `proxy.ts` la rebota a la pantalla de entrada. Hasta ahora el rebote era
// MUDO: Ana (Ingeniería) escribía /desembolsos/dashboard y aparecía en Cuadrillas
// sin que nada le dijera por qué. Desde su lado eso no se lee como "no tenés
// permiso" sino como "la app está rota" o "el link está malo", y termina en una
// consulta a TI por algo que está funcionando bien.
//
// El proxy manda el nombre del módulo en `?sinacceso=`; acá se dice y se limpia
// la dirección (replace, no push: el botón de atrás no tiene que devolver al
// aviso). Se cierra solo: no hay nada que hacer ni nada que se esté perdiendo
// —a diferencia del aviso de sesión vencida, que se queda hasta que la persona
// decida, porque ahí sí hay trabajo escrito en riesgo.
// 15 s y no menos: la pantalla donde aterriza tarda unos segundos en cargar sus
// datos, y mientras tanto la atención está en el contenido, no en la franja.
const SEGUNDOS = 15;

export function AvisoSinAcceso() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const crudo = params.get('sinacceso');

  // El aviso tiene que SOBREVIVIR a que se limpie la dirección, así que el valor
  // se copia a estado. Se hace durante el render y no en un efecto: en el efecto
  // sería un render de más y, peor, un parpadeo entre que el parámetro se va y el
  // aviso aparece. `visto` es el espejo del último valor del parámetro —incluido
  // el null de después de limpiar—, para que el mismo módulo pueda volver a
  // avisar si la rebotan otra vez.
  const [visto, setVisto] = useState<string | null>(crudo);
  const [modulo, setModulo] = useState<string | null>(crudo);
  if (crudo !== visto) {
    setVisto(crudo);
    if (crudo) setModulo(crudo);
  }

  // Limpiar la dirección: si recarga o comparte el link, el aviso no vuelve.
  useEffect(() => {
    if (crudo) router.replace(pathname);
  }, [crudo, pathname, router]);

  // Y se va solo.
  useEffect(() => {
    if (!modulo) return;
    const t = setTimeout(() => setModulo(null), SEGUNDOS * 1000);
    return () => clearTimeout(t);
  }, [modulo]);

  if (!modulo) return null;

  return (
    <div className="mx-4 mt-4 sm:mx-6">
      <Aviso
        accion={
          <button
            type="button"
            onClick={() => setModulo(null)}
            className="shrink-0 self-center rounded-ds px-2 py-0.5 text-body-sm font-semibold text-ds-yellow-ink underline underline-offset-2 hover:opacity-70"
          >
            Entendido
          </button>
        }
      >
        <strong className="font-semibold">Tu rol no abre {modulo}.</strong> Te dejamos en la
        primera pantalla que sí podés usar. Si necesitás entrar ahí, pedí el permiso en
        rh.adelante.cr.
      </Aviso>
    </div>
  );
}
