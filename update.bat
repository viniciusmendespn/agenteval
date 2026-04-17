@echo off
setlocal

echo.
echo  ============================================
echo   AgentEval ^| Atualizando...
echo  ============================================
echo.

:: Garante execucao a partir da raiz do projeto
cd /d "%~dp0"

:: 1. Baixar atualizacoes
echo [1/3] Baixando atualizacoes do repositorio...
git pull
if errorlevel 1 (
    echo.
    echo  ERRO: git pull falhou. Verifique sua conexao ou conflitos pendentes.
    echo.
    pause
    exit /b 1
)

:: 2. Dependencias Python
echo.
echo [2/3] Instalando dependencias Python...
cd /d "%~dp0backend"
call .venv\Scripts\activate.bat
pip install -r requirements.txt -q

:: 3. Dependencias Node
echo.
echo [3/3] Instalando dependencias Node...
cd /d "%~dp0frontend"
npm install --silent

:: Versao atual
echo.
cd /d "%~dp0"
for /f "delims=" %%V in ('python -c "import json; d=json.load(open('version.json',encoding='utf-8')); print(f\"  {d['version']} (build {d['build']}) -- {d['updated_at']}\")"') do echo Versao atual: %%V

echo.
echo  ============================================
echo   REINICIE OS SERVICOS para aplicar:
echo.
echo   Execute novamente: start.bat
echo.
echo   Ou manualmente:
echo     Backend : cd backend ^&^& uvicorn app.main:app --reload --port 8000
echo     Frontend: cd frontend ^&^& npm run dev
echo.
echo   Encerrar backend anterior:
echo     taskkill /F /IM python.exe
echo  ============================================
echo.
pause
