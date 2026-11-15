import type { NextConfig } from 'next';

const EN_DESARROLLO = process.env.NODE_ENV === 'development';
const TURNSTILE = 'https://challenges.cloudflare.com';

// Spec 2: CSP fija. Una CSP con nonce obligaría a renderizar cada página por petición (incompatible con el
// prerender de cacheComponents); esta limita los orígenes a la propia web y a Cloudflare Turnstile. El navegador
// solo habla con la API a través del proxy /api/* (connect-src 'self').
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${TURNSTILE}${EN_DESARROLLO ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `frame-src ${TURNSTILE}`,
  `connect-src 'self'${EN_DESARROLLO ? ' ws:' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// Cabeceras de seguridad (rules/web/security).
const CABECERAS_SEGURIDAD = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: CABECERAS_SEGURIDAD }];
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
