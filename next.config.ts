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
  // Content Security Policy — bloquea contenido mixto (HTTP)
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://*.blob.core.windows.net",
      "connect-src 'self' https://login.microsoftonline.com https://api.businesscentral.dynamics.com",
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
