#!/bin/bash
# Script de atualização do AgentEval.
# Execute a partir da raiz do repositório (Git Bash no Windows).
set -e

echo ""
echo "========================================="
echo " AgentEval — Atualizando..."
echo "========================================="
echo ""

# 1. Baixar alterações do git
echo "→ Baixando atualizações do repositório..."
git pull

# 2. Garantir que os hooks estão instalados nesta máquina
bash setup-hooks.sh

# 3. Dependências Python
echo ""
echo "→ Instalando dependências Python..."
pip install -r backend/requirements.txt -q

# 4. Dependências Node
echo ""
echo "→ Instalando dependências Node..."
(cd frontend && npm install --silent)

# 5. Mostrar versão atual
echo ""
echo "→ Versão atual:"
python -c "
import json
d = json.load(open('version.json', encoding='utf-8'))
print(f\"  {d['version']} (build {d['build']}) — {d['updated_at']}\")
" 2>/dev/null || python3 -c "
import json
d = json.load(open('version.json', encoding='utf-8'))
print(f\"  {d['version']} (build {d['build']}) — {d['updated_at']}\")
"

echo ""
echo "========================================="
echo " REINICIE OS SERVIÇOS para aplicar:"
echo ""
echo "  Backend:  uvicorn app.main:app --reload --port 8000"
echo "            (execute dentro de backend/ com o venv ativo)"
echo ""
echo "  Frontend: npm run dev"
echo "            (execute dentro de frontend/)"
echo ""
echo "  Windows — encerrar backend anterior:"
echo "  taskkill /F /IM python.exe"
echo "========================================="
echo ""
