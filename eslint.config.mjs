import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Lo de abajo NO es codigo fuente y estaba entrando igual, porque los
    // patrones de arriba cuelgan de la raiz: `.next/**` no tapa un `.next`
    // anidado. El 2026-10-01 `npm run lint` reportaba 112.150 problemas, de los
    // cuales 103.000 salian de aca; el numero real del repo es ~22.500. Un lint
    // que miente asi no se puede poner de guardia en CI, que es justo lo que
    // falta (ver la auditoria de seguridad).
    "deploy-package/**",   // salida del build para el pase a produccion (56 MB)
    // Copias enteras del repo, una por tarea que se lanza desde el escritorio.
    // Hoy habia tres y pesaban 3,4 GB: cada archivo del proyecto se linteaba
    // cuatro veces y los hallazgos salian repetidos.
    ".claude/**",
  ]),
]);

export default eslintConfig;
