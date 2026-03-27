import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-2xl w-full space-y-8 text-center">
        <div>
          <h1 className="text-6xl font-bold text-gray-900 mb-4">
            REZEA
          </h1>
          <p className="text-2xl text-gray-600 mb-8">
            Gestion de réservations pour établissements sportifs
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-xl p-8 space-y-6">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-gray-800">
              Fonctionnalités
            </h2>
            <ul className="text-left space-y-3 text-gray-600">
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Planning en temps réel des séances sportives</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Système de crédits FIFO</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Liste d'attente automatique</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Paiement sécurisé (HelloAsso/Stripe)</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">✓</span>
                <span>Application PWA pour mobile</span>
              </li>
            </ul>
          </div>

          <div className="flex gap-4 justify-center pt-4">
            <Link
              href="/login"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Se connecter
            </Link>
            <Link
              href="/register"
              className="px-6 py-3 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors font-medium"
            >
              S'inscrire
            </Link>
          </div>
        </div>

        <div className="text-sm text-gray-500">
          <p>Architecture low-cost optimisée (~10€/mois)</p>
          <p className="mt-1">Multi-tenant • RLS PostgreSQL • Static Export</p>
        </div>
      </div>
    </main>
  );
}
