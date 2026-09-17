import type { NextConfig } from "next";

const securityHeaders = [
  // Forzar HTTPS — cualquier recurso debe cargarse sobre HTTPS
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  // Sólo permite frames del mismo origen (evita clickjacking)
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  },
  // Evita MIME-type sniffing
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  // Información de referer sólo al mismo origen
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  // Deshabilita funcionalidades del navegador que no se usan
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  // Content Security Policy.
  //
  // `unsafe-eval` solo se habilita en desarrollo: React lo usa para reconstruir
  // los stacks de error en el navegador. En producción ni React ni Next lo
  // necesitan (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md),
  // así que ahí va fuera y se cierra esa puerta.
  //
  // `unsafe-inline` en script-src SIGUE ABIERTO, y conviene saber por qué: para
  // sacarlo hay que firmar los scripts con un nonce por request, y el nonce
  // obliga a renderizar TODAS las páginas de forma dinámica (Next lo inyecta
  // durante el render del servidor; una página prerenderizada no tiene request
  // del cual sacarlo). Hoy el build prerenderiza 108 páginas. Cambiar eso es un
  // cambio de arquitectura, no un ajuste de cabeceras: se hace aparte y con
  // pruebas, no de arrastre en un cambio de seguridad.
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://*.blob.core.windows.net",
      "connect-src 'self' https://login.microsoftonline.com https://api.businesscentral.dynamics.com",
      // Nada de <object>/<embed>: no se usan y son vector clásico de inyección.
      "object-src 'none'",
      // Que un HTML inyectado no pueda cambiar la base de las URLs relativas.
      "base-uri 'self'",
      // Un formulario de esta app solo puede enviar a esta app: si alguien logra
      // inyectar un <form>, no puede mandarse las credenciales a otro dominio.
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.blob.core.windows.net',
      },
    ],
  },
  serverExternalPackages: ['mssql'],
  // Tree-shake barrels grandes (íconos, motion, tabla) → menos JS en el first load.
  experimental: {
    optimizePackageImports: ['@phosphor-icons/react', 'motion', '@tanstack/react-table'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
