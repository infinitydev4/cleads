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

  async headers() {
    return [
      {
        source: '/(.*)',
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
    ];
  },
};

export default nextConfig;
