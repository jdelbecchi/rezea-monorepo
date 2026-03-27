# REZEA - SaaS Multi-tenant pour Associations Sportives

## Architecture

- **Backend**: FastAPI + PostgreSQL 15 avec Row-Level Security
- **Frontend**: Next.js 14 (Static Export) + Shadcn/UI
- **Infrastructure**: Docker Compose sur VPS unique
- **Budget**: ~10€/mois

## Démarrage Rapide

```bash
# Installation
make setup

# Lancer l'environnement de développement
make dev

# Accès
- Frontend: http://localhost:3000
- API: http://localhost:8000
- API Docs: http://localhost:8000/docs
```

## Structure du Projet

```
rezea-monorepo/
├── apps/
│   ├── api/          # Backend FastAPI
│   └── web/          # Frontend Next.js
├── infra/            # Docker & Nginx
├── packages/         # Code partagé
└── Makefile          # Commandes
```

## Commandes Principales

- `make setup`: Installation initiale
- `make dev`: Lancer le dev
- `make test`: Tests
- `make build`: Build production
- `make deploy`: Déploiement
