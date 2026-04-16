const nextConfig = {
  // Désactiver l'optimisation d'images
  images: {
    unoptimized: true,
  },

  // Pas de trailing slash
  trailingSlash: false,

  // Public environment variables
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  },

  // Redirects to handle the migration from /dashboard
  async redirects() {
    return [
      {
        source: '/:slug/dashboard/:path*',
        destination: '/:slug/:path*',
        permanent: true,
      },
      {
        source: '/:slug/dashboard',
        destination: '/:slug/home',
        permanent: true,
      },
    ]
  },
}

module.exports = nextConfig
