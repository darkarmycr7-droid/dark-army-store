/** @type {import('next').NextConfig} */
const BACKEND = process.env.BACKEND_ORIGIN || 'http://localhost:4000';

const nextConfig = {
  reactStrictMode: true,
  // Self-contained server build for Docker (small runtime image)
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'fastly.picsum.photos' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
  // Same-origin proxy: the browser only ever talks to this Next server, which
  // forwards /api and /uploads to the backend. Keeps everything on one port so
  // LAN sharing + a single tunnel (Cloudflare/ngrok) expose the whole app.
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${BACKEND}/api/:path*` },
      { source: '/uploads/:path*', destination: `${BACKEND}/uploads/:path*` },
    ];
  },
};
module.exports = nextConfig;
