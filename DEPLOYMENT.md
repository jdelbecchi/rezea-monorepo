# Guide de Déploiement et d'Utilisation - REZEA

## 📋 Prérequis

### Développement Local
- Docker & Docker Compose
- Node.js 20+ (pour le frontend)
- Python 3.11+ (pour le backend)
- PostgreSQL 15 (via Docker)

### Production (VPS)
- Ubuntu 22.04 LTS
- Docker & Docker Compose
- Nom de domaine avec DNS configuré
- Certificat SSL (Let's Encrypt recommandé)

## 🚀 Installation Locale

### 1. Cloner le projet
```bash
git clone <repository-url>
cd rezea-monorepo
```

### 2. Configuration Backend
```bash
cd apps/api
cp .env.example .env
# Éditer .env avec vos valeurs
```

### 3. Configuration Frontend
```bash
cd apps/web
cp .env.local.example .env.local
# Éditer .env.local avec l'URL de l'API
```

### 4. Lancer l'environnement de développement
```bash
# Depuis la racine du projet
make dev

# Ou manuellement
docker-compose -f infra/docker-compose.dev.yml up -d
```

### 5. Accéder aux services
- Frontend: http://localhost:3000
- API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- PostgreSQL: localhost:5432

## 🏗️ Architecture

```
┌─────────────┐
│   Nginx     │ ← Reverse Proxy + Static Files
│   :80/443   │
└──────┬──────┘
       │
       ├─→ Frontend (Next.js Static Export)
       │   /usr/share/nginx/html
       │
       └─→ Backend API (FastAPI)
           /api/* → http://api:8000
           
           ┌──────────────┐
           │ PostgreSQL   │ ← Database avec RLS
           │    :5432     │
           └──────────────┘
```

## 📦 Structure du Projet

```
rezea-monorepo/
├── apps/
│   ├── api/                    # Backend FastAPI
│   │   ├── app/
│   │   │   ├── api/           # Routes API
│   │   │   ├── core/          # Config & Security
│   │   │   ├── db/            # Database
│   │   │   ├── models/        # SQLAlchemy Models
│   │   │   ├── schemas/       # Pydantic Schemas
│   │   │   └── main.py        # Entry point
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   │
│   └── web/                   # Frontend Next.js
│       ├── src/
│       │   ├── app/          # Pages (App Router)
│       │   ├── components/   # Composants React
│       │   └── lib/          # Utilitaires
│       ├── next.config.js
│       └── package.json
│
├── infra/                     # Infrastructure
│   ├── docker-compose.yml    # Production
│   ├── docker-compose.dev.yml # Development
│   ├── nginx/                # Config Nginx
│   └── postgres/             # Init scripts
│
└── Makefile                   # Commandes CLI
```

## 🔐 Sécurité Multi-tenant

### Row-Level Security (RLS)
Toutes les tables avec `tenant_id` ont des politiques RLS:

```sql
-- Exemple de politique
CREATE POLICY users_tenant_isolation_select ON users
FOR SELECT
USING (tenant_id = current_tenant_id());
```

### Injection du Contexte Tenant
Le middleware FastAPI injecte automatiquement le `tenant_id`:

```python
@app.middleware("http")
async def inject_tenant_context(request: Request, call_next):
    # Extrait le tenant_id du JWT
    request.state.tenant_id = payload.get("tenant_id")
    # PostgreSQL utilise cette valeur pour RLS
```

## 💳 Gestion des Crédits FIFO

### Logique de Consommation
```sql
-- Stored procedure PostgreSQL
CREATE FUNCTION consume_credits_fifo(
    p_tenant_id UUID,
    p_user_id UUID,
    p_amount INTEGER
) RETURNS UUID
```

### Garanties
- **Atomicité**: Transaction complète ou rollback
- **Isolation**: FOR UPDATE SKIP LOCKED
- **Cohérence**: Balance toujours >= 0
- **Durabilité**: Historique complet des transactions

## 🌐 Déploiement Production

### 1. Préparer le VPS
```bash
# Sur le VPS
sudo apt update && sudo apt upgrade -y
sudo apt install docker.io docker-compose git -y
sudo systemctl enable docker
sudo usermod -aG docker $USER
```

### 2. Cloner et configurer
```bash
git clone <repository-url>
cd rezea-monorepo
cp apps/api/.env.example apps/api/.env
# Éditer avec les vraies valeurs de production
```

### 3. Variables d'environnement production
```bash
# Dans apps/api/.env
DATABASE_URL=postgresql+asyncpg://rezea:STRONG_PASSWORD@postgres:5432/rezea
SECRET_KEY=<générer avec: openssl rand -hex 32>
ENVIRONMENT=production
DEBUG=false
CORS_ORIGINS='["https://votre-domaine.com"]'
MAILERSEND_API_KEY=<votre clé>
HELLOASSO_CLIENT_ID=<votre ID>
HELLOASSO_CLIENT_SECRET=<votre secret>
```

### 4. Build et déploiement
```bash
# Build du frontend
cd apps/web
npm install
npm run build  # Génère le dossier /out

# Retour à la racine et déploiement
cd ../..
make deploy

# Ou manuellement
docker-compose -f infra/docker-compose.yml up -d --build
```

### 5. Configuration SSL (Let's Encrypt)
```bash
# Installer certbot
sudo apt install certbot python3-certbot-nginx

# Obtenir le certificat
sudo certbot --nginx -d votre-domaine.com

# Redémarrer Nginx
docker-compose -f infra/docker-compose.yml restart nginx
```

## 🔧 Maintenance

### Logs
```bash
# Tous les services
docker-compose -f infra/docker-compose.yml logs -f

# Un service spécifique
docker-compose -f infra/docker-compose.yml logs -f api
```

### Backup Base de Données
```bash
# Backup manuel
docker exec rezea_postgres_prod pg_dump -U rezea rezea > backup_$(date +%Y%m%d).sql

# Restauration
docker exec -i rezea_postgres_prod psql -U rezea rezea < backup_20240130.sql
```

### Migrations
```bash
# Créer une migration
cd apps/api
alembic revision --autogenerate -m "Description"

# Appliquer les migrations
alembic upgrade head
```

### Mise à jour
```bash
git pull
docker-compose -f infra/docker-compose.yml up -d --build
```

## 📊 Monitoring

### Health Check
```bash
# API
curl http://localhost:8000/health

# Via Nginx
curl http://votre-domaine.com/health
```

### Métriques PostgreSQL
```sql
-- Connexions actives
SELECT count(*) FROM pg_stat_activity;

-- Taille de la base
SELECT pg_size_pretty(pg_database_size('rezea'));

-- Tables les plus volumineuses
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## 🧪 Tests

### Backend
```bash
cd apps/api
pytest
pytest --cov=app tests/
```

### Frontend
```bash
cd apps/web
npm test
npm run test:e2e
```

## 📱 PWA (Progressive Web App)

Le frontend est configuré comme une PWA:
- `manifest.json` dans `/public`
- Service Worker pour cache offline
- Installation sur écran d'accueil mobile

## 💰 Optimisations Low-Cost

### Réductions de RAM
- PostgreSQL: `shared_buffers=512MB, max_connections=50`
- Gunicorn: `--workers 2` (au lieu de 4+)
- Next.js: Export statique (pas de serveur Node.js)

### Cache Nginx
- Assets statiques: 1 an
- HTML: No-cache (pour les mises à jour)
- API: Pas de cache (données dynamiques)

## 🐛 Troubleshooting

### Problème: "Token invalide"
- Vérifier que le SECRET_KEY est le même backend/frontend
- Vérifier les CORS_ORIGINS

### Problème: "Cannot connect to database"
- Vérifier que PostgreSQL est démarré
- Vérifier la DATABASE_URL
- Vérifier les credentials

### Problème: "Crédits insuffisants"
- Vérifier le solde: `SELECT * FROM credit_accounts WHERE user_id = '...'`
- Vérifier les transactions: `SELECT * FROM credit_transactions WHERE account_id = '...'`

## 📝 Licence

Ce projet est sous licence MIT.

## 👥 Contribution

1. Fork le projet
2. Créer une branche (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 📧 Support

Pour toute question: support@rezea.app
