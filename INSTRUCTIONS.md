# 🎯 REZEA - Instructions d'Installation et Démarrage

## ✨ Qu'est-ce que REZEA ?

REZEA est une application SaaS multi-tenant complète pour la gestion de réservations sportives, développée selon les spécifications techniques définies dans le document "6a_DEV_SPEC_VF.docx".

### Caractéristiques principales
- 🏢 **Multi-tenant** avec isolation stricte (Row-Level Security)
- 💳 **Gestion de crédits FIFO** pour les réservations
- 📅 **Planning en temps réel** des séances sportives
- 🔐 **Sécurité bancaire** (JWT, RLS PostgreSQL, bcrypt)
- 💰 **Architecture low-cost** (~10€/mois sur VPS)
- 📱 **PWA** pour installation mobile
- 🚀 **Performance optimisée** (Next.js static export, indexes DB)

## 🏗️ Architecture Technique

### Backend
- **Framework**: FastAPI (Python 3.11)
- **Base de données**: PostgreSQL 15 avec Row-Level Security
- **Authentification**: JWT avec bcrypt
- **Validation**: Pydantic V2
- **Logs**: Structlog (JSON)

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Mode**: Static Export (pas de serveur Node.js)
- **State Management**: TanStack Query + Zustand
- **UI**: Tailwind CSS + Shadcn/UI
- **PWA**: Service Worker + Manifest

### Infrastructure
- **Orchestration**: Docker Compose
- **Reverse Proxy**: Nginx
- **Hébergement**: VPS unique (OVH recommandé)
- **SSL**: Let's Encrypt (via Certbot)
- **Backup**: Scripts automatisés PostgreSQL

## 📦 Structure du Projet

```
rezea-monorepo/
├── apps/
│   ├── api/              # Backend FastAPI
│   │   ├── app/
│   │   │   ├── api/      # Routes API
│   │   │   ├── core/     # Configuration & Sécurité
│   │   │   ├── db/       # Session & Base SQLAlchemy
│   │   │   ├── models/   # Modèles SQLAlchemy avec RLS
│   │   │   ├── schemas/  # Schémas Pydantic
│   │   │   └── main.py   # Point d'entrée FastAPI
│   │   ├── alembic/      # Migrations SQL
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   │
│   └── web/              # Frontend Next.js
│       ├── src/
│       │   ├── app/      # Pages (App Router)
│       │   ├── components/ # Composants UI
│       │   ├── lib/      # API client & utils
│       │   └── hooks/    # Custom hooks
│       ├── public/       # Assets statiques + PWA
│       ├── next.config.js # Config export statique
│       └── package.json
│
├── infra/                # Infrastructure Docker
│   ├── docker-compose.yml      # Production
│   ├── docker-compose.dev.yml  # Développement
│   ├── nginx/           # Configuration Nginx
│   │   └── default.conf
│   └── postgres/        # Scripts init DB + RLS
│       └── init-scripts/
│           └── 01_rls_setup.sql
│
├── Makefile             # Commandes pratiques
├── README.md            # Documentation principale
├── DEPLOYMENT.md        # Guide de déploiement détaillé
├── QUICKSTART.md        # Exemples d'API
└── INSTRUCTIONS.md      # Ce fichier
```

## 🚀 Installation Rapide (5 minutes)

### Prérequis
- Docker & Docker Compose installés
- 4 Go RAM minimum
- Git

### Étapes

#### 1. Cloner le projet
```bash
git clone <votre-repository-url>
cd rezea-monorepo
```

#### 2. Configuration Backend
```bash
cd apps/api
cp .env.example .env

# Éditer .env avec vos valeurs:
# - SECRET_KEY: générer avec `openssl rand -hex 32`
# - DATABASE_URL: laisser par défaut pour dev local
# - MAILERSEND_API_KEY: optionnel pour dev
```

#### 3. Configuration Frontend
```bash
cd ../web
cp .env.local.example .env.local

# Éditer .env.local:
# - NEXT_PUBLIC_API_URL: http://localhost:8000 (dev local)
```

#### 4. Lancer l'environnement
```bash
# Retour à la racine
cd ../..

# Démarrage avec Make
make dev

# OU manuellement
docker-compose -f infra/docker-compose.dev.yml up -d

# Vérifier les logs
docker-compose -f infra/docker-compose.dev.yml logs -f
```

#### 5. Accéder à l'application
- **Frontend**: http://localhost:3000
- **API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **PostgreSQL**: localhost:5432 (user: rezea, password: rezea_password)

## 🧪 Premier Test

### 1. Créer un tenant (association) via l'API Docs
```
http://localhost:8000/docs
→ POST /api/tenants
{
  "name": "Mon Club",
  "slug": "mon-club",
  "description": "Description optionnelle"
}
```

### 2. S'inscrire
```
→ POST /api/auth/register
{
  "email": "test@example.com",
  "password": "TestPass123",
  "first_name": "Jean",
  "last_name": "Dupont",
  "tenant_slug": "mon-club"
}
```

### 3. Se connecter sur le frontend
- Aller sur http://localhost:3000/login
- Utiliser les identifiants créés
- Explorer le dashboard

## 📚 Documentation Complète

### Pour le développement
- **QUICKSTART.md**: Exemples d'API et commandes curl
- **DEPLOYMENT.md**: Guide de déploiement production
- **API Docs**: http://localhost:8000/docs (Swagger UI)

### Fichiers clés à consulter
- `apps/api/app/main.py`: Point d'entrée backend
- `apps/api/app/models/models.py`: Schéma de base de données
- `apps/web/src/lib/api.ts`: Client API TypeScript
- `infra/postgres/init-scripts/01_rls_setup.sql`: Configuration RLS

## 🔑 Fonctionnalités Implémentées

### Backend API ✅
- [x] Authentification JWT avec multi-tenant
- [x] Row-Level Security PostgreSQL
- [x] CRUD Utilisateurs
- [x] CRUD Séances (Planning)
- [x] Système de réservations
- [x] Gestion crédits FIFO (stored procedure)
- [x] Annulation avec remboursement automatique
- [x] Validation Pydantic stricte
- [x] Logging structuré (JSON)
- [x] Health check endpoint

### Frontend Web ✅
- [x] Pages authentification (Login/Register)
- [x] Page d'accueil
- [x] Layout responsive
- [x] API client TypeScript
- [x] TanStack Query (cache & revalidation)
- [x] Tailwind CSS + Design system
- [x] PWA manifest
- [x] Configuration static export

### Infrastructure ✅
- [x] Docker Compose dev & prod
- [x] PostgreSQL 15 avec tuning low-cost
- [x] Nginx reverse proxy + static files
- [x] Scripts init DB + RLS
- [x] Configuration SSL ready
- [x] Health checks
- [x] Volumes persistants

## 🎯 Prochaines Étapes (TODO)

### Priorité 1 (MVP)
- [ ] Compléter les pages frontend dashboard
- [ ] Intégration paiement HelloAsso
- [ ] Service Worker pour mode offline
- [ ] Tests unitaires backend (pytest)
- [ ] Tests e2e frontend (Playwright)

### Priorité 2 (Post-MVP)
- [ ] Liste d'attente automatique
- [ ] Notifications email (MailerSend)
- [ ] Push notifications PWA
- [ ] Export CSV des données
- [ ] Analytics (PostHog)
- [ ] Monitoring (Sentry)

### Priorité 3 (Futur)
- [ ] Module de facturation
- [ ] Statistiques avancées
- [ ] Application mobile native (React Native)
- [ ] API publique pour partenaires

## 🐛 Problèmes Courants

### Le backend ne démarre pas
```bash
# Vérifier les logs
docker-compose -f infra/docker-compose.dev.yml logs api

# Problème commun: PostgreSQL pas prêt
# Solution: attendre 10s et relancer
docker-compose -f infra/docker-compose.dev.yml restart api
```

### Le frontend ne trouve pas l'API
```bash
# Vérifier NEXT_PUBLIC_API_URL dans apps/web/.env.local
# Doit être: http://localhost:8000

# Reconstruire le frontend
cd apps/web
rm -rf .next
npm run dev
```

### Erreur "Token invalide"
```bash
# Vérifier que SECRET_KEY est identique backend/frontend
# Dans apps/api/.env
# Doit être la même clé partout
```

### Base de données "tenant_id not found"
```bash
# Les politiques RLS bloquent l'accès
# Vérifier que le JWT contient bien tenant_id
# Voir le payload dans http://localhost:8000/docs
```

## 🧪 Tests

### Backend
```bash
cd apps/api
pip install pytest pytest-asyncio pytest-cov
pytest
pytest --cov=app tests/
```

### Frontend
```bash
cd apps/web
npm test
```

## 📞 Support & Contribution

### Obtenir de l'aide
1. Consulter DEPLOYMENT.md et QUICKSTART.md
2. Vérifier les logs: `docker-compose logs -f`
3. Ouvrir une issue GitHub

### Contribuer
1. Fork le projet
2. Créer une branche: `git checkout -b feature/ma-feature`
3. Commit: `git commit -m 'Add ma-feature'`
4. Push: `git push origin feature/ma-feature`
5. Ouvrir une Pull Request

## 📄 Licence

Ce projet est sous licence MIT - voir le fichier LICENSE pour plus de détails.

## 🙏 Remerciements

Développé selon les spécifications du document "6a_DEV_SPEC_VF.docx" avec:
- Architecture low-cost optimisée
- Sécurité de niveau bancaire
- Performance et scalabilité
- Best practices Python & TypeScript

---

**Bon développement ! 🚀**
