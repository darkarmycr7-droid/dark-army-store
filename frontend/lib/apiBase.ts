/**
 * Resolve the backend API base URL.
 *
 * Priority:
 *  1. NEXT_PUBLIC_API_URL if explicitly set (e.g. production / custom host).
 *  2. In the browser: same hostname the page was opened with, port 4000.
 *     This makes LAN sharing "just work" — open http://192.168.x.x:3200 on any
 *     device and it calls http://192.168.x.x:4000 automatically.
 *  3. Server-side rendering / fallback: localhost:4000 (backend is on the host).
 */
export function apiBase(): string {
  const explicit = process.env.NEXT_PUBLIC_API_URL;
  if (explicit) return explicit;
  // Browser: same-origin path, proxied to the backend by next.config rewrites.
  // Works identically over localhost, LAN, or a public tunnel — one port.
  if (typeof window !== 'undefined') return '/api';
  // Server-side rendering runs on the host: talk to the backend directly.
  return 'http://localhost:4000/api';
}
