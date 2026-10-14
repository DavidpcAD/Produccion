"use client";

// El estado real del tema vive en <html data-theme>, no en React — este hook
// solo lo LEE y lo ALTERNA. Así el script anti-parpadeo de app/layout.tsx
// (que corre antes de que React exista) y este hook nunca pueden pisarse.

import { useEffect, useState } from "react";
import type { Tema } from "./types";

export function useTheme(): { tema: Tema; alternarTema: () => void } {
  const [tema, setTema] = useState<Tema>("light");

  useEffect(() => {
    const actual = document.documentElement.getAttribute("data-theme");
    setTema(actual === "dark" ? "dark" : "light");
  }, []);

  function alternarTema() {
    const siguiente: Tema = tema === "dark" ? "light" : "dark";
    setTema(siguiente);
    document.documentElement.setAttribute("data-theme", siguiente);
    try {
      localStorage.setItem("app_theme", siguiente);
    } catch {
      // localStorage puede fallar en navegación privada — el tema simplemente no se recuerda.
    }
  }

  return { tema, alternarTema };
}
