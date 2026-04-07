@echo off
setlocal

echo.
echo  ============================================
echo   AgentEval ^| Iniciando...
echo  ============================================
echo.

:: ---- Backend ----
cd /d "%~dp0backend"

if not exist ".env" (
    echo [1/5] Criando .env a partir do .env.example...
    copy .env.example .env >nul
    echo       ATENCAO: edite backend\.env com suas credenciais antes de continuar.
    echo.
    pause
)

if not exist ".venv\Scripts\activate.bat" (
    echo [2/5] Criando ambiente virtual Python...
    python -m venv .venv
) else (
    echo [2/5] Ambiente virtual ja existe.
)

echo [3/5] Instalando dependencias Python...
call .venv\Scripts\activate.bat
pip install -r requirements.txt -q

echo [4/5] Iniciando backend na porta 8000...
start "AgentEval Backend" cmd /k "cd /d "%~dp0backend" && .venv\Scripts\activate.bat && uvicorn app.main:app --reload --port 8000"

:: ---- Frontend ----
cd /d "%~dp0frontend"

if not exist "node_modules" (
    echo [5/5] Instalando dependencias Node...
    npm install
) else (
    echo [5/5] node_modules ja existe.
)

echo.
echo  Backend : http://localhost:8000
echo  API Docs: http://localhost:8000/docs
echo  Frontend: http://localhost:3000
echo.
echo Iniciando frontend...
npm run dev
