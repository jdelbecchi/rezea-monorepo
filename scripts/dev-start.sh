#!/bin/bash
# ============================================================
# REZEA - Script de démarrage en développement
# Usage: bash scripts/dev-start.sh
# ============================================================

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$ROOT_DIR/apps/api"

echo "🔧 REZEA Dev Startup"
echo "===================="

# --- 1. Vérifier PostgreSQL ---
echo -n "📦 PostgreSQL... "
if pg_isready -q 2>/dev/null; then
    echo "✅ OK"
else
    echo "❌ PostgreSQL n'est pas démarré. Lance-le avec: sudo systemctl start postgresql"
    exit 1
fi

# --- 2. Tuer les anciens processus uvicorn ---
echo -n "🧹 Nettoyage... "
pkill -f "uvicorn app.main:app" 2>/dev/null && echo "ancien processus tué" || echo "rien à nettoyer"
sleep 1

# --- 3. Lancer le backend ---
echo -n "🚀 Démarrage du backend (port 8000)... "
cd "$API_DIR"
source venv/bin/activate
nohup python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > nohup.out 2>&1 &
BACKEND_PID=$!
echo "PID=$BACKEND_PID"

# --- 4. Attendre que le backend soit prêt ---
echo -n "⏳ Attente du healthcheck... "
for i in $(seq 1 15); do
    if curl -s --max-time 2 http://localhost:8000/health > /dev/null 2>&1; then
        echo "✅ Backend prêt !"
        break
    fi
    if [ $i -eq 15 ]; then
        echo "❌ Le backend n'a pas démarré. Vérifier: tail -20 $API_DIR/nohup.out"
        exit 1
    fi
    sleep 1
    echo -n "."
done

# --- 5. Vérifier la santé complète ---
HEALTH=$(curl -s http://localhost:8000/health)
echo "   Health: $HEALTH"

echo ""
echo "✅ REZEA backend opérationnel sur http://localhost:8000"
echo "   Logs: tail -f $API_DIR/nohup.out"
echo "   Frontend: cd apps/web && npm run dev"
