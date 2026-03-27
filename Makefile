.PHONY: setup dev up down build test clean deploy

# Installation initiale
setup:
	@echo "🔧 Installation des dépendances..."
	cd apps/api && pip install -r requirements.txt
	cd apps/web && npm install
	@echo "✅ Setup terminé"

# Développement local
dev:
	@echo "🚀 Démarrage de l'environnement de développement..."
	docker-compose -f infra/docker-compose.dev.yml up -d
	@echo "✅ Environnement démarré:"
	@echo "   - Frontend: http://localhost:3000"
	@echo "   - API: http://localhost:8000"
	@echo "   - API Docs: http://localhost:8000/docs"

# Démarrage production
up:
	docker-compose -f infra/docker-compose.yml up -d

# Arrêt
down:
	docker-compose -f infra/docker-compose.yml down

# Build
build:
	docker-compose -f infra/docker-compose.yml build

# Tests
test:
	cd apps/api && pytest
	cd apps/web && npm test

# Nettoyage
clean:
	docker-compose -f infra/docker-compose.yml down -v
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type d -name "node_modules" -exec rm -rf {} +

# Migration DB
migrate:
	cd apps/api && alembic upgrade head

# Création migration
migration:
	cd apps/api && alembic revision --autogenerate -m "$(msg)"

# Déploiement
deploy:
	@echo "🚀 Déploiement en production..."
	git pull
	docker-compose -f infra/docker-compose.yml up -d --build
