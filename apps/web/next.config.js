const nextConfig = {
  // Désactiver l'optimisation d'images
  images: {
    unoptimized: true,
  },

  // Pas de trailing slash
  trailingSlash: false,

  // Variables d'environnement publiques
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  },
}

module.exports = nextConfig
