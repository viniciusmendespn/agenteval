# AgentEval

Plataforma de avaliação contínua de agentes de IA. Permite testar agentes ao vivo e avaliar histórico de conversas usando LLM como juiz das respostas.

## Funcionalidades

- Cadastro de agentes HTTP/SSE e perfis de avaliação
- Execução de casos de teste com avaliação automática via DeepEval
- Importação de datasets (JSON, JSONL, JSONL.GZ) com mapeamento de campos via IA
- Dashboard com KPIs, tendências e comparação A/B entre execuções
- Suporte a métricas: answer relevancy, faithfulness, hallucination, toxicity, bias e outras

## Stack

- **Backend**: Python 3.11+ · FastAPI · SQLAlchemy · SQLite · DeepEval
- **Frontend**: Next.js 14 · React 18 · Tailwind CSS · Recharts

---

## Início rápido

Após clonar o repositório, um único comando sobe backend e frontend:

```bash
# Windows
start.bat

# Linux / macOS
chmod +x start.sh && ./start.sh
```

O script:
1. Copia `.env.example` → `.env` (na primeira execução, edite o arquivo com suas credenciais)
2. Cria o virtualenv Python e instala as dependências
3. Sobe o backend em `http://localhost:8000`
4. Instala as dependências Node e sobe o frontend em `http://localhost:3000`

---

## Pré-requisitos

| Ferramenta | Versão mínima |
|---|---|
| Python | 3.11 |
| Node.js | 18 |
| npm | 9 |

---

## Instalação

### 1. Clone o repositório

```bash
git clone https://github.com/viniciusmendespn/agenteval.git
cd agenteval
```

### 2. Backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# Linux / macOS
source .venv/bin/activate

pip install -r requirements.txt
```

#### Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas credenciais:

```ini
# LLM Judge — Azure OpenAI compatível (recomendado)
JUDGE_BASE_URL=https://seu-endpoint-aqui
JUDGE_API_KEY=sua-chave-aqui
JUDGE_MODEL=gpt-4o
JUDGE_API_VERSION=2025-03-01-preview

# Alternativa: OpenAI direto (se JUDGE_BASE_URL não estiver definido)
# OPENAI_API_KEY=sk-...

# Banco de dados (SQLite, padrão)
DATABASE_URL=sqlite:///./agenteval.db
```

#### Iniciar o servidor

```bash
uvicorn app.main:app --reload --port 8000
```

A API ficará disponível em `http://localhost:8000`. Documentação interativa em `http://localhost:8000/docs`.

#### (Opcional) Carregar dados de demonstração

```bash
python seed_demo.py
```

---

### 3. Frontend

Em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

O frontend ficará disponível em `http://localhost:3000`.

---

## Estrutura do projeto

```
agenteval/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app, CORS, migrações
│   │   ├── models.py        # SQLAlchemy ORM (8 tabelas)
│   │   ├── schemas.py       # Pydantic schemas
│   │   ├── database.py      # Conexão SQLite / DATABASE_URL
│   │   ├── routers/         # agents, test_cases, profiles, runs,
│   │   │                    # datasets, dataset_evaluations, imports, analytics
│   │   └── services/
│   │       ├── agent_caller.py  # Chama agentes HTTP/SSE
│   │       ├── evaluator.py     # DeepEval + tradução PT-BR
│   │       ├── judge_llm.py     # Custom Azure OpenAI judge
│   │       ├── importer.py      # Parse JSON/JSONL/GZ
│   │       └── field_mapper.py  # IA sugere mapeamento de campos
│   ├── requirements.txt
│   ├── seed_demo.py
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── app/             # Páginas Next.js App Router
    │   ├── components/      # Sidebar, ScoreDetail, ProfileForm, DeleteButton
    │   └── lib/
    │       ├── api.ts       # Tipos TypeScript + funções fetch
    │       ├── metrics.ts   # Normalização de scores (100% = ótimo)
    │       └── cn.ts        # Utility clsx
    ├── package.json
    └── next.config.js
```

---

## Páginas

| Rota | Descrição |
|---|---|
| `/` | Dashboard com KPIs e tendências |
| `/evolution` | Timeline de evolução por agente ou dataset |
| `/runs/compare` | Comparação A/B entre execuções |
| `/agents` | CRUD de agentes |
| `/profiles` | CRUD de perfis de avaliação |
| `/test-cases` | CRUD de casos de teste |
| `/runs` | Histórico de execuções |
| `/datasets` | Lista de datasets importados |
| `/datasets/import` | Wizard de importação em 4 etapas |
| `/evaluations` | Todas as avaliações de datasets |

---

## Atualizando o sistema

### Em uma nova máquina (após clonar)

Execute uma única vez para instalar os git hooks locais:

```bash
bash setup-hooks.sh
```

### Recebendo atualizações do repositório

Execute o script de update na raiz do projeto (Git Bash no Windows):

```bash
bash update.sh
```

O script:
1. Baixa as alterações com `git pull`
2. Reinstala os git hooks nesta máquina
3. Instala dependências Python e Node atualizadas
4. Exibe a versão atual
5. Instrui a reiniciar os serviços

Após rodar `update.sh`, reinicie o backend e o frontend para que as mudanças entrem em vigor.

### Aviso automático de nova versão

Quando alguém fizer um commit e você tiver o sistema aberto em outra aba ou máquina, o frontend detecta automaticamente a mudança de versão a cada 3 minutos e exibe um banner amarelo no topo:

> **Nova versão disponível (v1.0.X build N). Recarregue a página para aplicar as atualizações.**

Clique em **Recarregar agora** ou simplesmente atualize a página manualmente.

### Versionamento automático por commit

O projeto usa versionamento semântico (`MAJOR.MINOR.PATCH`) com um número de build incremental.
O hook `pre-commit` **incrementa o patch automaticamente** a cada `git commit`.

Para bumpar versão minor ou major manualmente antes de commitar:

```bash
python scripts/bump_version.py minor   # 1.0.x → 1.1.0
python scripts/bump_version.py major   # 1.x.x → 2.0.0
```

A versão atual fica visível no rodapé da sidebar do sistema.

---

## Observações

- O banco SQLite é criado automaticamente na primeira execução em `backend/agenteval.db`.
- Migrações incrementais são aplicadas automaticamente pelo `main.py` — não é necessário rodar comandos separados.
- No Windows, se precisar reiniciar o backend, encerre processos Python anteriores com:
  ```bash
  taskkill /F /IM python.exe
  ```
