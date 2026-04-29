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
    echo "[1/6] Criando .env a partir do .env.example..."
    cp .env.example .env
    echo ""
    echo " ============================================================"
    echo "  ATENÇÃO: Configure suas credenciais antes de continuar."
    echo ""
    echo "  Edite o arquivo:  backend/.env"
    echo "  Preencha:         JUDGE_API_KEY=seu_token_pessoal"
    echo ""
    echo "  Obtenha seu token em: https://fusion-llm.brq.com"
    echo " ============================================================"
    echo ""
    read -rp "Pressione Enter após editar o .env para continuar..."
fi

# Valida se JUDGE_API_KEY foi configurado
if grep -q "JUDGE_API_KEY=CONFIGURAR_SEU_TOKEN_AQUI" .env; then
    echo ""
    echo " ERRO: JUDGE_API_KEY ainda não foi configurado!"
    echo " Edite backend/.env e substitua CONFIGURAR_SEU_TOKEN_AQUI pelo seu token."
    echo ""
    exit 1
fi

KEY_VAL=$(grep "^JUDGE_API_KEY=" .env | cut -d= -f2-)
if [ -z "$KEY_VAL" ]; then
    echo ""
    echo " ERRO: JUDGE_API_KEY está vazio em backend/.env!"
    echo " Preencha com seu token pessoal antes de continuar."
    echo ""
    exit 1
fi

if [ ! -d ".venv" ]; then
    echo "[2/6] Criando ambiente virtual Python..."
    python3 -m venv .venv
else
    echo "[2/6] Ambiente virtual já existe."
fi

echo "[3/6] Instalando dependências Python..."
source .venv/bin/activate
pip install -r requirements.txt -q

echo "[4/6] Verificando banco de dados..."
if [ ! -f "agenteval.db" ]; then
    echo "      Banco não encontrado. Criando dados de demonstração..."
    python seed_demo.py
    echo "      Banco de dados populado com sucesso!"
else
    echo "      Banco de dados já existe."
fi

echo "[5/6] Iniciando backend na porta 8000..."
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!

# ---- Frontend ----
cd "$ROOT/frontend"

if [ ! -d "node_modules" ]; then
    echo "[6/6] Instalando dependências Node..."
    npm install
else
    echo "[6/6] node_modules já existe."
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
