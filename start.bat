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
    echo [1/6] Criando .env a partir do .env.example...
    copy .env.example .env >nul
    echo.
    echo  ============================================================
    echo   ATENCAO: Configure suas credenciais antes de continuar.
    echo.
    echo   Edite o arquivo:  backend\.env
    echo   Preencha:         JUDGE_API_KEY=seu_token_pessoal
    echo.
    echo   Obtenha seu token em: https://fusion-llm.brq.com
    echo  ============================================================
    echo.
    pause
)

:: Valida se JUDGE_API_KEY foi configurado
findstr /C:"JUDGE_API_KEY=CONFIGURAR_SEU_TOKEN_AQUI" .env >nul 2>&1
if not errorlevel 1 (
    echo.
    echo  ERRO: JUDGE_API_KEY ainda nao foi configurado!
    echo  Edite backend\.env e substitua CONFIGURAR_SEU_TOKEN_AQUI pelo seu token.
    echo.
    pause
    exit /b 1
)
findstr /C:"JUDGE_API_KEY=" .env | findstr /V /C:"JUDGE_API_KEY=#" >nul 2>&1
for /f "tokens=2 delims==" %%A in ('findstr /C:"JUDGE_API_KEY=" .env') do set KEY_VAL=%%A
if "%KEY_VAL%"=="" (
    echo.
    echo  ERRO: JUDGE_API_KEY esta vazio em backend\.env!
    echo  Preencha com seu token pessoal antes de continuar.
    echo.
    pause
    exit /b 1
)

if not exist ".venv\Scripts\activate.bat" (
    echo [2/6] Criando ambiente virtual Python...
    python -m venv .venv
) else (
    echo [2/6] Ambiente virtual ja existe.
)

echo [3/6] Instalando dependencias Python...
call .venv\Scripts\activate.bat
pip install -r requirements.txt -q

echo [4/6] Verificando banco de dados...
if not exist "agenteval.db" (
    echo       Banco nao encontrado. Criando dados de demonstracao...
    python seed_demo.py
    echo       Banco de dados populado com sucesso!
) else (
    echo       Banco de dados ja existe.
)

echo [5/6] Iniciando backend na porta 8000...
start "AgentEval Backend" cmd /k "cd /d "%~dp0backend" && .venv\Scripts\activate.bat && uvicorn app.main:app --reload --port 8000"

:: ---- Frontend ----
cd /d "%~dp0frontend"

if not exist "node_modules" (
    echo [6/6] Instalando dependencias Node...
    npm install
) else (
    echo [6/6] node_modules ja existe.
)

echo.
echo  Backend : http://localhost:8000
echo  API Docs: http://localhost:8000/docs
echo  Frontend: http://localhost:3000
echo.
echo Iniciando frontend...
npm run dev
