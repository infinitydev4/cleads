// E23: the Studio Web's previews have their own host (features/studio/link.ts); every address on it is a preview.
const studioPreviewHost = process.env.STUDIO_PREVIEW_HOST || 'apercu.cleads.fr';

/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  transpilePackages: ['sonner'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cleads.s3.eu-north-1.amazonaws.com',
        port: '',
        pathname: '/**',
      },
    ],
    minimumCacheTTL: 60,
    formats: ['image/webp', 'image/avif'],
  },

  // Former marketing pages: permanent redirects keep the links already indexed.
  async redirects() {
    return [
      { source: '/tarifs', destination: '/#offres', permanent: true },
      { source: '/services', destination: '/', permanent: true },
      { source: '/services/:path*', destination: '/', permanent: true },
      { source: '/about', destination: '/', permanent: true },
      { source: '/realisations', destination: '/', permanent: true },
      { source: '/contact', destination: '/', permanent: true },
      { source: '/ebook', destination: '/', permanent: true },
      { source: '/plan-du-site', destination: '/', permanent: true },
      { source: '/blog', destination: '/', permanent: true },
      { source: '/blog/:path*', destination: '/', permanent: true },
      // Client portal removed: the accounts now go through the single login page.
      { source: '/client/:path*', destination: '/auth/login', permanent: false },
    ];
  },

  async rewrites() {
    return {
      // Netlify may have rewritten the address already (netlify.toml): app/apercu reads /apercu/apercu/… the same way.
      beforeFiles: [{ source: '/:path*', has: [{ type: 'host', value: studioPreviewHost }], destination: '/apercu/:path*' }],
    };
  },

  async headers() {
    return [
      {
        // Previews set their own, stricter headers (no referrer at all): features/studio/preview.ts.
        source: '/((?!apercu/).*)',
        missing: [{ type: 'host', value: studioPreviewHost }],
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        // Private areas are never indexed, whatever robots.txt says.
        source: '/(dashboard|auth|api)/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        // E29 lot 2: sign-in and consent pages are never framed by another site (clickjacking on « Autoriser »).
        source: '/auth/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
