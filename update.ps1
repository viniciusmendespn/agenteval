#!/usr/bin/env pwsh
# Script de atualização do AgentEval — Windows PowerShell
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " AgentEval — Atualizando..."             -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Baixar alterações do git
Write-Host "-> Baixando atualizacoes do repositorio..." -ForegroundColor Yellow
git pull

# 2. Dependências Python
Write-Host ""
Write-Host "-> Instalando dependencias Python..." -ForegroundColor Yellow
pip install -r backend/requirements.txt -q

# 3. Dependências Node
Write-Host ""
Write-Host "-> Instalando dependencias Node..." -ForegroundColor Yellow
Push-Location frontend
npm install --silent
Pop-Location

# 4. Mostrar versão atual
Write-Host ""
Write-Host "-> Versao atual:" -ForegroundColor Yellow
$version = python -c @"
import json
d = json.load(open('version.json', encoding='utf-8'))
print(f"  {d['version']} (build {d['build']}) -- {d['updated_at']}")
"@
Write-Host $version

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " REINICIE OS SERVICOS para aplicar:"     -ForegroundColor Cyan
Write-Host ""
Write-Host "  Backend:  uvicorn app.main:app --reload --port 8000"
Write-Host "            (execute dentro de backend/ com o venv ativo)"
Write-Host ""
Write-Host "  Frontend: npm run dev"
Write-Host "            (execute dentro de frontend/)"
Write-Host ""
Write-Host "  Encerrar backend anterior:"
Write-Host "  taskkill /F /IM python.exe"
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
