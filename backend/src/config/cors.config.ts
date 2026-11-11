/**
 * Configuración centralizada de CORS para API REST y WebSockets
 */

export function getAllowedCorsOrigins(): string[] {
  const envOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const defaultOrigins = [
    'https://casestudio.duckdns.org',
    'https://julioficctcr7.github.io',
    'http://localhost:4200',
    'http://127.0.0.1:4200',
  ];

  return Array.from(new Set([...envOrigins, ...defaultOrigins]));
}

export function isOriginAllowed(origin?: string): boolean {
  if (!origin) return true;
  const allowed = getAllowedCorsOrigins();
  return allowed.includes('*') || allowed.includes(origin);
}
