#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo " ============================================"
echo "  AgentEval | Iniciando..."
echo " ============================================"
echo ""

# ---- Backend ----
cd "$ROOT/backend"

if [ ! -f ".env" ]; then
    echo "[1/5] Criando .env a partir do .env.example..."
    cp .env.example .env
    echo "      ATENÇÃO: edite backend/.env com suas credenciais antes de continuar."
    echo ""
    read -rp "Pressione Enter para continuar após editar o .env..."
fi

if [ ! -d ".venv" ]; then
    echo "[2/5] Criando ambiente virtual Python..."
    python3 -m venv .venv
else
    echo "[2/5] Ambiente virtual já existe."
fi

echo "[3/5] Instalando dependências Python..."
source .venv/bin/activate
pip install -r requirements.txt -q

echo "[4/5] Iniciando backend na porta 8000..."
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!

# ---- Frontend ----
cd "$ROOT/frontend"

if [ ! -d "node_modules" ]; then
    echo "[5/5] Instalando dependências Node..."
    npm install
else
    echo "[5/5] node_modules já existe."
fi

echo ""
echo " Backend : http://localhost:8000"
echo " API Docs: http://localhost:8000/docs"
echo " Frontend: http://localhost:3000"
echo ""
echo "Pressione Ctrl+C para encerrar tudo."
echo ""

# Encerra o backend ao sair
trap "kill $BACKEND_PID 2>/dev/null; exit" SIGINT SIGTERM

npm run dev
