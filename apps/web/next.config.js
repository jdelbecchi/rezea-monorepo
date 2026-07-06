const nextConfig = {
  // Configurer l'export statique
  output: 'export',

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
}

module.exports = nextConfig
