# Guide Rapide - REZEA API

## 🚀 Démarrage Rapide

### 1. Premier lancement
```bash
# Cloner le projet
git clone <repo-url>
cd rezea-monorepo

# Copier les fichiers d'environnement
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local

# Lancer avec Docker Compose
make dev

# Ou manuellement
docker-compose -f infra/docker-compose.dev.yml up -d
```

### 2. Créer un tenant (association)
```bash
# Via l'API ou directement en DB
curl -X POST http://localhost:8000/api/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mon Club de Tennis",
    "slug": "tennis-club",
    "description": "Club de tennis municipal"
  }'
```

### 3. S'inscrire
```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "Password123",
    "first_name": "Jean",
    "last_name": "Dupont",
    "tenant_slug": "tennis-club"
  }'
```

### 4. Se connecter
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "Password123",
    "tenant_slug": "tennis-club"
  }'

# Réponse:
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer",
  "user_id": "uuid",
  "tenant_id": "uuid",
  "role": "member"
}
```

## 📋 Exemples de Requêtes API

### Authentication

#### Login
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "Password123",
  "tenant_slug": "tennis-club"
}
```

#### Register
```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "newuser@example.com",
  "password": "SecurePass123",
  "first_name": "Marie",
  "last_name": "Martin",
  "tenant_slug": "tennis-club",
  "phone": "0612345678"
}
```

### Planning

#### Lister les séances
```bash
GET /api/planning?start_date=2024-01-30T00:00:00&end_date=2024-02-06T23:59:59
Authorization: Bearer <token>

# Filtres optionnels:
# - activity_type: "tennis", "yoga", etc.
# - available_only: true (seulement séances avec places)
```

#### Créer une séance (admin/manager)
```bash
POST /api/planning
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Tennis - Cours débutants",
  "description": "Cours pour débutants sur court couvert",
  "activity_type": "tennis",
  "start_time": "2024-02-01T18:00:00",
  "end_time": "2024-02-01T19:30:00",
  "max_participants": 8,
  "credits_required": 2,
  "allow_waitlist": true
}
```

#### Détails d'une séance
```bash
GET /api/planning/{session_id}
Authorization: Bearer <token>
```

### Réservations

#### Créer une réservation
```bash
POST /api/bookings
Authorization: Bearer <token>
Content-Type: application/json

{
  "session_id": "uuid-de-la-seance",
  "notes": "Je viens avec mon partenaire"
}

# Réponse si succès:
{
  "id": "booking-uuid",
  "session_id": "session-uuid",
  "status": "confirmed",
  "credits_used": 2,
  "created_at": "2024-01-30T10:30:00"
}

# Erreur si plus de crédits:
{
  "detail": "Crédits insuffisants (requis: 2, disponibles: 0)"
}
```

#### Lister mes réservations
```bash
GET /api/bookings
Authorization: Bearer <token>

# Filtrer par statut (optionnel):
GET /api/bookings?status_filter=confirmed
```

#### Annuler une réservation
```bash
DELETE /api/bookings/{booking_id}
Authorization: Bearer <token>

# Les crédits sont automatiquement remboursés
```

### Crédits

#### Voir mon compte de crédits
```bash
GET /api/credits/account
Authorization: Bearer <token>

# Réponse:
{
  "id": "account-uuid",
  "user_id": "user-uuid",
  "balance": 10,
  "total_purchased": 20,
  "total_used": 10,
  "created_at": "2024-01-15T10:00:00"
}
```

#### Historique des transactions
```bash
GET /api/credits/transactions
Authorization: Bearer <token>

# Réponse: liste des transactions (achats, utilisations, remboursements)
```

#### Acheter des crédits
```bash
POST /api/credits/purchase
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 10,
  "payment_provider": "helloasso"
}

# Réponse:
{
  "transaction_id": "uuid",
  "amount": 10,
  "payment_url": "https://...",
  "payment_id": "payment-ref"
}
```

### Utilisateur

#### Mon profil
```bash
GET /api/users/me
Authorization: Bearer <token>

# Réponse:
{
  "id": "user-uuid",
  "email": "user@example.com",
  "first_name": "Jean",
  "last_name": "Dupont",
  "role": "member",
  "tenant_id": "tenant-uuid",
  "is_active": true,
  "email_verified": false,
  "created_at": "2024-01-15T10:00:00"
}
```

#### Mettre à jour mon profil
```bash
PATCH /api/users/me
Authorization: Bearer <token>
Content-Type: application/json

{
  "first_name": "Jean",
  "last_name": "Dupont-Martin",
  "phone": "0612345678"
}
```

## 🧪 Tests avec curl

### Script de test complet
```bash
#!/bin/bash

# Variables
API_URL="http://localhost:8000"
TENANT_SLUG="test-club"
EMAIL="test@example.com"
PASSWORD="TestPass123"

# 1. Inscription
echo "1. Inscription..."
REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\",
    \"first_name\": \"Test\",
    \"last_name\": \"User\",
    \"tenant_slug\": \"$TENANT_SLUG\"
  }")
echo $REGISTER_RESPONSE | jq

# 2. Connexion
echo "\n2. Connexion..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"$PASSWORD\",
    \"tenant_slug\": \"$TENANT_SLUG\"
  }")
TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.access_token')
echo "Token: $TOKEN"

# 3. Mon profil
echo "\n3. Mon profil..."
curl -s -X GET "$API_URL/api/users/me" \
  -H "Authorization: Bearer $TOKEN" | jq

# 4. Planning
echo "\n4. Planning..."
curl -s -X GET "$API_URL/api/planning" \
  -H "Authorization: Bearer $TOKEN" | jq

# 5. Mes crédits
echo "\n5. Mes crédits..."
curl -s -X GET "$API_URL/api/credits/account" \
  -H "Authorization: Bearer $TOKEN" | jq
```

## 🔑 Codes d'Erreur

### Authentification
- `401 Unauthorized`: Token manquant ou invalide
- `403 Forbidden`: Accès refusé (rôle insuffisant)

### Ressources
- `404 Not Found`: Ressource non trouvée
- `409 Conflict`: Conflit (ex: séance complète, réservation existe déjà)

### Validation
- `400 Bad Request`: Données invalides
- `422 Unprocessable Entity`: Erreur de validation Pydantic

### Serveur
- `500 Internal Server Error`: Erreur serveur
- `503 Service Unavailable`: Service temporairement indisponible

## 📊 Données de Test

### Créer des données de test
```sql
-- Directement en DB
INSERT INTO tenants (id, name, slug) VALUES
  (gen_random_uuid(), 'Club de Test', 'test-club');

INSERT INTO sessions (id, tenant_id, title, start_time, end_time, max_participants, credits_required)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE slug = 'test-club'),
  'Test Session',
  NOW() + INTERVAL '1 day',
  NOW() + INTERVAL '1 day' + INTERVAL '2 hours',
  10,
  1
);
```

## 🔒 Sécurité

### JWT Token
- Durée de vie: 24h (configurable)
- Algorithme: HS256
- Payload: user_id, tenant_id, role

### Mot de passe
- Minimum 8 caractères
- Au moins 1 majuscule
- Au moins 1 chiffre
- Hash: bcrypt

### RLS (Row-Level Security)
Toutes les requêtes sont automatiquement filtrées par tenant_id via PostgreSQL RLS.

## 📱 Frontend (Next.js)

### Installation
```bash
cd apps/web
npm install
npm run dev
# → http://localhost:3000
```

### Build Production
```bash
npm run build
# Génère le dossier /out avec les fichiers statiques
```

### Structure
```
src/
├── app/              # Pages (App Router)
│   ├── page.tsx     # Page d'accueil
│   ├── login/       # Connexion
│   ├── register/    # Inscription
│   └── dashboard/   # Dashboard (protégé)
├── components/       # Composants réutilisables
├── lib/             # Utilitaires (API client)
└── hooks/           # Custom hooks React
```

## 🎯 Prochaines Étapes

1. ✅ Backend API fonctionnel
2. ✅ Frontend de base
3. 🔄 Intégration HelloAsso/Stripe
4. 🔄 Service Worker pour offline
5. 🔄 Push notifications
6. 🔄 Tests e2e
7. 🔄 CI/CD GitHub Actions
8. 🔄 Monitoring (Sentry, PostHog)

## 🐛 Debug

### Logs backend
```bash
docker-compose -f infra/docker-compose.dev.yml logs -f api
```

### Logs frontend
```bash
docker-compose -f infra/docker-compose.dev.yml logs -f web
```

### Accès direct PostgreSQL
```bash
docker exec -it rezea_postgres psql -U rezea
```

### Vérifier RLS
```sql
-- Se connecter en tant qu'utilisateur spécifique
SET app.current_tenant = 'tenant-uuid';

-- Requêtes normales (filtrées par RLS)
SELECT * FROM sessions;
```

## 📞 Support

Pour toute question ou problème:
- Documentation: /DEPLOYMENT.md
- Issues GitHub: <repo-url>/issues
- Email: support@rezea.app
